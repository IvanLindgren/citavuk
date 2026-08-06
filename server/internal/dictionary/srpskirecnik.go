// Package dictionary отдаёт толкование сербского слова на сербском языке.
//
// Источник — srpskirecnik.com, оцифровка «Речника српскохрватскога књижевног
// језика» (Матица српска). Статьи забираются по одной, по запросу читателя, и
// показываются как цитата: с названием словаря, томом, страницей и ссылкой на
// саму статью. Копии словаря у нас не заводится — кеш живёт ограниченное время
// и нужен только чтобы не дёргать чужой сервер на каждое нажатие слова.
package dictionary

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"net/http"
	"net/url"
	"strings"
	"sync"
	"time"

	"github.com/citavuk/server/internal/lexicon"
)

// ErrNotFound — слова в словаре нет. Это обычный исход, а не сбой: словарь
// толковый и словоформы, имена и заимствования в нём есть далеко не все.
var ErrNotFound = errors.New("dictionary: слово не найдено")

const (
	baseURL     = "https://srpskirecnik.com"
	sourceTitle = "Речник српскохрватскога књижевног језика"
	// Своё имя в User-Agent: чужой сервер должен видеть, кто к нему ходит, и
	// иметь возможность нас позвать или заблокировать адресно.
	userAgent = "CitavukBot/1.0 (+https://citavuk.ru)"
)

// Example — цитата из литературы при значении.
type Example struct {
	Text   string `json:"text"`
	Source string `json:"source,omitempty"`
}

// Sense — одно значение слова.
type Sense struct {
	Number     string    `json:"number,omitempty"`
	Domain     string    `json:"domain,omitempty"`
	Register   string    `json:"register,omitempty"`
	Definition string    `json:"definition"`
	Examples   []Example `json:"examples,omitempty"`
}

// Entry — словарная статья.
type Entry struct {
	// Заглавное слово с ударением, как в словаре: «нихилѝзам».
	Headword string `json:"headword"`
	// Грамматическая помета словаря как есть: «м», «ж», «прил.».
	Grammar   string  `json:"grammar,omitempty"`
	Etymology string  `json:"etymology,omitempty"`
	Senses    []Sense `json:"senses"`
	// Откуда взято — показывается читателю и обязательно к показу.
	SourceTitle string `json:"sourceTitle"`
	Volume      int    `json:"volume,omitempty"`
	Page        int    `json:"page,omitempty"`
	URL         string `json:"url"`
}

// Client ходит в srpskirecnik.com и помнит ответы.
type Client struct {
	http *http.Client
	// Адрес вынесен в поле, чтобы тесты работали против своего сервера, а не
	// против чужого: сетевые тесты ломаются от чужих выкаток и без интернета.
	base  string
	ttl   time.Duration
	mu    sync.Mutex
	cache map[string]cached
}

type cached struct {
	entry *Entry
	err   error
	until time.Time
}

// New создаёт клиента. ttl <= 0 — час.
func New(ttl time.Duration) *Client {
	if ttl <= 0 {
		ttl = time.Hour
	}
	return &Client{
		http:  &http.Client{Timeout: 8 * time.Second},
		base:  baseURL,
		ttl:   ttl,
		cache: make(map[string]cached),
	}
}

// Lookup ищет толкование. Слово можно давать в любом письме: словарь ведётся
// кириллицей, латиница переводится.
func (c *Client) Lookup(ctx context.Context, word string) (*Entry, error) {
	key := strings.ToLower(strings.TrimSpace(word))
	if key == "" {
		return nil, ErrNotFound
	}
	if entry, err, ok := c.fromCache(key); ok {
		return entry, err
	}

	entry, err := c.fetch(ctx, key)
	// Кешируется и отсутствие статьи: «этого слова в словаре нет» — такой же
	// ответ, и повторять поход за ним на каждое нажатие незачем. Сетевые сбои
	// не кешируются: они проходят сами.
	if err == nil || errors.Is(err, ErrNotFound) {
		c.store(key, entry, err)
	}
	return entry, err
}

func (c *Client) fromCache(key string) (*Entry, error, bool) {
	c.mu.Lock()
	defer c.mu.Unlock()
	item, ok := c.cache[key]
	if !ok || time.Now().After(item.until) {
		return nil, nil, false
	}
	return item.entry, item.err, true
}

func (c *Client) store(key string, entry *Entry, err error) {
	c.mu.Lock()
	defer c.mu.Unlock()
	// Кеш в памяти процесса и без вытеснения по размеру: словарные статьи
	// маленькие, живут час, а слов, которые успеют спросить за час, немного.
	if len(c.cache) > 5000 {
		c.cache = make(map[string]cached)
	}
	c.cache[key] = cached{entry: entry, err: err, until: time.Now().Add(c.ttl)}
}

// candidates — как имеет смысл спросить слово у этого словаря.
//
// Возвратные глаголы он ведёт без частицы: «вратити» в нём есть, «вратити се»
// нет. У нас же начальная форма хранится вместе с частицей — «vratiti» и
// «vratiti se» разные слова, и в своём словаре мы держим именно вторую. Для
// поиска частицу снимаем.
func candidates(word string) []string {
	bare := strings.TrimSpace(
		strings.TrimSuffix(strings.TrimSuffix(word, " se"), " се"))
	if bare != "" && bare != word {
		word = bare
	}
	return lexicon.CyrillicVariants(word)
}

func (c *Client) fetch(ctx context.Context, word string) (*Entry, error) {
	for _, variant := range candidates(word) {
		hits, err := c.search(ctx, variant)
		if err != nil {
			return nil, err
		}
		if len(hits) == 0 {
			continue
		}
		return c.entry(ctx, hits[0])
	}
	return nil, ErrNotFound
}

type searchHit struct {
	ID   string `json:"_id"`
	Form struct {
		Lemma string `json:"lemma"`
	} `json:"form"`
}

func (c *Client) search(ctx context.Context, word string) ([]searchHit, error) {
	var hits []searchHit
	err := c.get(ctx, c.base+"/api/entries?q="+url.QueryEscape(word), &hits)
	if err != nil {
		return nil, err
	}
	// Ищем точное совпадение заглавного слова: поиск отвечает и на однокоренные,
	// а «нихилист» вместо «нихилизам» — уже другое слово.
	//
	// Регистр важен. По запросу «кућа» словарь отдаёт первой статью «Кућа» с
	// большой буквы — это брак распознавания, где в заголовок попала строка из
	// цитаты; нужное слово идёт вторым. Заглавная буква здесь означает имя
	// собственное или ошибку, а нарицательное слово всегда строчное.
	exact := make([]searchHit, 0, len(hits))
	var loose []searchHit
	for _, hit := range hits {
		lemma := strings.TrimSpace(hit.Form.Lemma)
		switch {
		case lemma == word:
			exact = append(exact, hit)
		case strings.EqualFold(lemma, word):
			loose = append(loose, hit)
		}
	}
	if len(exact) > 0 {
		return exact, nil
	}
	return loose, nil
}

type apiEntry struct {
	ID   string `json:"_id"`
	Form struct {
		Lemma         string `json:"lemma"`
		AccentedLemma string `json:"accented_lemma"`
	} `json:"form"`
	Accent  string `json:"accent"`
	GramGrp struct {
		Raw       string `json:"raw"`
		Etymology string `json:"etymology"`
	} `json:"gramGrp"`
	Source struct {
		Volume int `json:"volume"`
		Page   int `json:"page"`
	} `json:"source"`
	Senses []struct {
		Num        any    `json:"num"`
		Domain     string `json:"domain"`
		Register   string `json:"register"`
		Definition string `json:"definition"`
		Examples   []struct {
			Text   string `json:"text"`
			Source string `json:"source"`
			Kind   string `json:"kind"`
		} `json:"examples"`
	} `json:"senses"`
}

func (c *Client) entry(ctx context.Context, hit searchHit) (*Entry, error) {
	var raw apiEntry
	if err := c.get(ctx, c.base+"/api/entries/id/"+url.PathEscape(hit.ID), &raw); err != nil {
		return nil, err
	}

	headword := firstNonEmpty(raw.Accent, raw.Form.AccentedLemma, raw.Form.Lemma)
	entry := &Entry{
		Headword:    headword,
		Grammar:     strings.TrimSpace(raw.GramGrp.Raw),
		Etymology:   strings.TrimSpace(raw.GramGrp.Etymology),
		SourceTitle: sourceTitle,
		Volume:      raw.Source.Volume,
		Page:        raw.Source.Page,
		// Ссылка всегда на настоящий сайт: она уходит читателю, а не в тест.
		URL: fmt.Sprintf("%s/odrednica/%s/%s",
			baseURL, url.PathEscape(raw.Form.Lemma), url.PathEscape(raw.ID)),
	}
	for _, sense := range raw.Senses {
		definition := strings.TrimSpace(sense.Definition)
		// Распознавание иногда роняет в толкование помету вместо текста: у
		// «море» там оказывается одна буква «с» — средний род. Толкование из
		// одного-двух знаков ничего не объясняет, и карточка с ним выглядит
		// поломкой; лучше не показывать её вовсе.
		if len([]rune(definition)) < 3 {
			continue
		}
		out := Sense{
			Number:     numberOf(sense.Num),
			Domain:     strings.TrimSpace(sense.Domain),
			Register:   strings.TrimSpace(sense.Register),
			Definition: definition,
		}
		for _, example := range sense.Examples {
			text := strings.TrimSpace(example.Text)
			if text == "" {
				continue
			}
			out.Examples = append(out.Examples, Example{
				Text:   text,
				Source: strings.TrimSpace(example.Source),
			})
		}
		entry.Senses = append(entry.Senses, out)
	}
	if len(entry.Senses) == 0 {
		// Статья есть, но распознанного текста в ней нет: показывать пустую
		// карточку хуже, чем не показывать никакой.
		return nil, ErrNotFound
	}
	return entry, nil
}

func (c *Client) get(ctx context.Context, endpoint string, out any) error {
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, endpoint, nil)
	if err != nil {
		return err
	}
	req.Header.Set("User-Agent", userAgent)
	req.Header.Set("Accept", "application/json")

	resp, err := c.http.Do(req)
	if err != nil {
		return err
	}
	defer resp.Body.Close()

	if resp.StatusCode == http.StatusNotFound {
		return ErrNotFound
	}
	if resp.StatusCode != http.StatusOK {
		return fmt.Errorf("dictionary: %s ответил %d", endpoint, resp.StatusCode)
	}
	return json.NewDecoder(resp.Body).Decode(out)
}

// numberOf приводит номер значения к строке: в ответе он бывает и числом, и
// строкой («1», «1а»), и отсутствует вовсе.
func numberOf(value any) string {
	switch v := value.(type) {
	case string:
		return strings.TrimSpace(v)
	case float64:
		return fmt.Sprintf("%g", v)
	default:
		return ""
	}
}

func firstNonEmpty(values ...string) string {
	for _, value := range values {
		if trimmed := strings.TrimSpace(value); trimmed != "" {
			return trimmed
		}
	}
	return ""
}
