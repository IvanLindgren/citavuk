// Package translate реализует перевод сербского текста на русский.
//
// Ключевой факт, определяющий устройство пакета: DeepL отлично переводит
// связный текст и ненадёжен на одиночных словах. Замеры на живом API:
//
//	"Ovo je velika kuća sa baštom." -> "Это большой дом с садом."   верно
//	"kuća"                          -> "собака"                     неверно
//	"кућа"                          -> "«Адвокат дьявола»"          неверно
//
// Это известное поведение нейронного перевода: на входе без синтаксиса модель
// уходит в галлюцинацию. Поэтому слово никогда не переводится в отрыве от
// предложения: если контекст есть, слово помечается тегом <w> и переводится
// вместе с фразой (DeepL переносит теги на соответствующий фрагмент перевода),
// а если контекста нет — запрос уходит к запасному провайдеру, который на
// отдельных словах ведёт себя предсказуемо.
package translate

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"net/http"
	"net/url"
	"strings"
	"time"
)

// Ошибки перевода.
var (
	ErrNoProvider  = errors.New("переводчик не настроен")
	ErrQuota       = errors.New("исчерпана квота переводчика")
	ErrRateLimited = errors.New("слишком часто: переводчик просит подождать")
	ErrEmptyText   = errors.New("пустой текст")
)

// MaxTextRunes ограничивает длину одного переводимого фрагмента.
const MaxTextRunes = 1000

// DeepL — клиент DeepL API.
type DeepL struct {
	key    string
	host   string
	client *http.Client
}

// NewDeepL создаёт клиента. Хост выбирается по ключу: ключи free-плана
// оканчиваются на ":fx" и обслуживаются отдельным доменом — обращение к
// платному домену с free-ключом возвращает 403.
func NewDeepL(key string) *DeepL {
	key = strings.TrimSpace(key)
	if key == "" {
		return nil
	}
	host := "https://api.deepl.com"
	if strings.HasSuffix(key, ":fx") {
		host = "https://api-free.deepl.com"
	}
	return &DeepL{
		key:  key,
		host: host,
		client: &http.Client{
			Timeout: 20 * time.Second,
			Transport: &http.Transport{
				MaxIdleConnsPerHost: 4,
				IdleConnTimeout:     90 * time.Second,
			},
		},
	}
}

// Name возвращает идентификатор провайдера для кеша и логов.
func (d *DeepL) Name() string { return "deepl" }

type deeplResponse struct {
	Translations []struct {
		Text     string `json:"text"`
		Detected string `json:"detected_source_language"`
	} `json:"translations"`
	Message string `json:"message"`
}

// Usage — израсходованная и доступная квота символов.
type Usage struct {
	CharacterCount int64 `json:"character_count"`
	CharacterLimit int64 `json:"character_limit"`
}

// Usage запрашивает расход квоты.
func (d *DeepL) Usage(ctx context.Context) (*Usage, error) {
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, d.host+"/v2/usage", nil)
	if err != nil {
		return nil, err
	}
	req.Header.Set("Authorization", "DeepL-Auth-Key "+d.key)

	resp, err := d.client.Do(req)
	if err != nil {
		return nil, err
	}
	defer resp.Body.Close()
	body, err := io.ReadAll(io.LimitReader(resp.Body, 1<<16))
	if err != nil {
		return nil, err
	}
	if resp.StatusCode != http.StatusOK {
		return nil, fmt.Errorf("DeepL /usage: %s", resp.Status)
	}
	var u Usage
	if err := json.Unmarshal(body, &u); err != nil {
		return nil, err
	}
	return &u, nil
}

// TranslateTexts переводит набор фрагментов за один запрос.
//
// Фрагменты не влияют друг на друга только когда каждый из них — связный текст.
// Для набора отдельных слов пакетный запрос даёт тот же неверный результат, что
// и одиночный: причина не в пакетировании, а в отсутствии синтаксиса.
func (d *DeepL) TranslateTexts(ctx context.Context, texts []string, source, target string, opts Options) ([]string, error) {
	if len(texts) == 0 {
		return nil, nil
	}
	form := url.Values{}
	for _, t := range texts {
		form.Add("text", t)
	}
	if source != "" {
		form.Set("source_lang", strings.ToUpper(source))
	}
	form.Set("target_lang", strings.ToUpper(target))
	if opts.Context != "" {
		form.Set("context", opts.Context)
	}
	if opts.XMLTags {
		form.Set("tag_handling", "xml")
	}
	if opts.PreserveFormatting {
		form.Set("preserve_formatting", "1")
	}

	out, err := d.post(ctx, form)
	if err != nil {
		return nil, err
	}
	if len(out) != len(texts) {
		return nil, fmt.Errorf("DeepL вернул %d переводов на %d фрагментов", len(out), len(texts))
	}
	return out, nil
}

// Options — необязательные параметры запроса.
type Options struct {
	// Context передаётся модели как окружение и не переводится. Влияет на выбор
	// значения многозначного слова.
	Context string
	// XMLTags включает tag_handling=xml: DeepL сохраняет теги и переносит их на
	// соответствующий фрагмент перевода. На этом построено выравнивание слова.
	XMLTags bool
	// PreserveFormatting запрещает менять пунктуацию и регистр начала строки.
	PreserveFormatting bool
}

func (d *DeepL) post(ctx context.Context, form url.Values) ([]string, error) {
	req, err := http.NewRequestWithContext(ctx, http.MethodPost,
		d.host+"/v2/translate", strings.NewReader(form.Encode()))
	if err != nil {
		return nil, err
	}
	req.Header.Set("Authorization", "DeepL-Auth-Key "+d.key)
	req.Header.Set("Content-Type", "application/x-www-form-urlencoded")

	resp, err := d.client.Do(req)
	if err != nil {
		return nil, fmt.Errorf("DeepL недоступен: %w", err)
	}
	defer resp.Body.Close()

	body, err := io.ReadAll(io.LimitReader(resp.Body, 4<<20))
	if err != nil {
		return nil, err
	}

	switch resp.StatusCode {
	case http.StatusOK:
	case http.StatusTooManyRequests:
		return nil, ErrRateLimited
	case http.StatusRequestEntityTooLarge:
		return nil, errors.New("DeepL: текст слишком велик")
	case 456: // нестандартный код DeepL: квота символов исчерпана
		return nil, ErrQuota
	default:
		var e deeplResponse
		_ = json.Unmarshal(body, &e)
		if e.Message != "" {
			return nil, fmt.Errorf("DeepL %s: %s", resp.Status, e.Message)
		}
		return nil, fmt.Errorf("DeepL %s", resp.Status)
	}

	var parsed deeplResponse
	if err := json.Unmarshal(body, &parsed); err != nil {
		return nil, fmt.Errorf("DeepL: неразбираемый ответ: %w", err)
	}
	out := make([]string, len(parsed.Translations))
	for i, t := range parsed.Translations {
		out[i] = t.Text
	}
	return out, nil
}
