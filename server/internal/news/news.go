package news

import (
	"context"
	"crypto/sha256"
	"encoding/hex"
	"encoding/xml"
	"errors"
	"fmt"
	"html"
	"io"
	"net/http"
	"regexp"
	"sort"
	"strings"
	"sync"
	"time"
	"unicode"

	"golang.org/x/net/html/charset"
	"golang.org/x/sync/singleflight"
)

const (
	// IssueTTL — как часто выходит новый номер.
	IssueTTL = time.Hour
	// freshAfter — раньше этого срока номер по кнопке не перепечатывается:
	// десяток нажатий подряд не должен превращаться в десяток обходов лент.
	freshAfter = 5 * time.Minute
	// perSection — заметок на полосе: передовица и шесть колонок.
	perSection = 7
	userAgent  = "CitavukNews/1.0 (+https://citavuk.ru/about)"
)

// Video — ролик при заметке.
type Video struct {
	// YouTube — идентификатор ролика YouTube.
	YouTube string `json:"youtube,omitempty"`
	// File — прямой адрес видеофайла на сайте издания. Браузер обращается к
	// нему только тогда, когда человек сам нажимает «смотреть».
	File string `json:"file,omitempty"`
}

// Story — заметка на полосе.
type Story struct {
	ID        string     `json:"id"`
	Title     string     `json:"title"`
	Summary   string     `json:"summary"`
	Link      string     `json:"link"`
	Source    string     `json:"source"`
	Image     string     `json:"image,omitempty"`
	Video     *Video     `json:"video,omitempty"`
	Published *time.Time `json:"published,omitempty"`
}

// Page — полоса номера.
type Page struct {
	Code    string  `json:"code"`
	Title   string  `json:"title"`
	Stories []Story `json:"stories"`
}

// Issue — номер газеты.
type Issue struct {
	PrintedAt time.Time `json:"printedAt"`
	NextIssue time.Time `json:"nextIssue"`
	Sections  []Page    `json:"sections"`
	Sources   []string  `json:"sources"`
}

// Service хранит текущий номер, тексты открытых заметок и адреса картинок.
type Service struct {
	client *http.Client
	now    func() time.Time

	mu     sync.Mutex
	issue  *Issue
	images map[string]string
	order  []string

	articles *articleCache
	videos   *videoCache
	flight   singleflight.Group
}

// New собирает службу новостей.
func New() *Service {
	client := &http.Client{
		Timeout: 15 * time.Second,
		CheckRedirect: func(req *http.Request, via []*http.Request) error {
			if len(via) >= 4 {
				return errors.New("слишком много перенаправлений")
			}
			if req.URL.Scheme != "https" {
				return errors.New("перенаправление без https")
			}
			return nil
		},
	}
	return &Service{
		client:   client,
		now:      time.Now,
		images:   map[string]string{},
		articles: newArticleCache(300),
		videos:   newVideoCache(),
	}
}

// Issue отдаёт текущий номер. fresh просит перепечатать его, если номер
// старше нескольких минут.
func (s *Service) Issue(ctx context.Context, fresh bool) (*Issue, error) {
	s.mu.Lock()
	current := s.issue
	s.mu.Unlock()
	if current != nil {
		age := s.now().Sub(current.PrintedAt)
		if age < IssueTTL && (!fresh || age < freshAfter) {
			return current, nil
		}
	}
	result, err, _ := s.flight.Do("issue", func() (any, error) {
		// Обход лент не должен обрываться вместе с запросом, который его начал:
		// номер нужен и всем следующим читателям.
		printCtx, cancel := context.WithTimeout(context.WithoutCancel(ctx), 40*time.Second)
		defer cancel()
		return s.print(printCtx)
	})
	if err != nil {
		if current != nil {
			// Свежий номер не вышел — показываем вчерашний, а не пустую газету.
			return current, nil
		}
		return nil, err
	}
	return result.(*Issue), nil
}

func (s *Service) print(ctx context.Context) (*Issue, error) {
	type fetched struct {
		section int
		stories []Story
	}
	var wg sync.WaitGroup
	results := make(chan fetched, 32)
	for index, section := range Sections {
		for _, feed := range section.Feeds {
			wg.Add(1)
			go func(index int, feed Feed) {
				defer wg.Done()
				stories, err := s.fetchFeed(ctx, feed)
				if err == nil {
					results <- fetched{index, stories}
				}
			}(index, feed)
		}
	}
	wg.Wait()
	close(results)

	bySection := make([][]Story, len(Sections))
	for result := range results {
		bySection[result.section] = append(bySection[result.section], result.stories...)
	}
	issue := &Issue{PrintedAt: s.now().UTC(), Sections: []Page{}}
	issue.NextIssue = issue.PrintedAt.Add(IssueTTL)
	sources := map[string]bool{}
	seen := map[string]bool{}
	for index, section := range Sections {
		stories := pickStories(bySection[index], seen)
		if len(stories) == 0 {
			continue
		}
		for i := range stories {
			sources[stories[i].Source] = true
			if stories[i].Image != "" {
				stories[i].Image = s.register(stories[i].Image)
			}
		}
		issue.Sections = append(issue.Sections, Page{Code: section.Code, Title: section.Title, Stories: stories})
	}
	if len(issue.Sections) == 0 {
		return nil, errors.New("ни одна лента не ответила")
	}
	for source := range sources {
		issue.Sources = append(issue.Sources, source)
	}
	sort.Strings(issue.Sources)
	s.mu.Lock()
	s.issue = issue
	s.mu.Unlock()
	return issue, nil
}

// pickStories отбирает заметки полосы: свежие сначала, без повторов из других
// полос, и передовицей — заметку с картинкой.
func pickStories(stories []Story, seen map[string]bool) []Story {
	sort.SliceStable(stories, func(i, j int) bool {
		a, b := stories[i].Published, stories[j].Published
		if a == nil || b == nil {
			return a != nil
		}
		return a.After(*b)
	})
	out := make([]Story, 0, perSection)
	for _, story := range stories {
		key := strings.ToLower(story.Title)
		if seen[story.Link] || seen[key] {
			continue
		}
		seen[story.Link], seen[key] = true, true
		out = append(out, story)
		if len(out) == perSection {
			break
		}
	}
	for i, story := range out {
		if story.Image != "" && len(story.Summary) > 60 {
			if i > 0 {
				out[0], out[i] = out[i], out[0]
			}
			break
		}
	}
	return out
}

// register запоминает адрес картинки и отдаёт её идентификатор. Наружу уходит
// только идентификатор: браузер получает картинку через наш сервер и не
// сообщает изданию, кто из читателей открыл газету.
func (s *Service) register(raw string) string {
	sum := sha256.Sum256([]byte(raw))
	id := hex.EncodeToString(sum[:12])
	s.mu.Lock()
	defer s.mu.Unlock()
	if _, ok := s.images[id]; !ok {
		s.images[id] = raw
		s.order = append(s.order, id)
		// Номер обновляется раз в час, и адреса старых номеров копятся.
		// Держим несколько тысяч последних — это несколько суток газеты.
		if len(s.order) > 6000 {
			drop := s.order[:1000]
			for _, old := range drop {
				delete(s.images, old)
			}
			s.order = append([]string(nil), s.order[1000:]...)
		}
	}
	return id
}

// ImageURL отдаёт адрес картинки по идентификатору.
func (s *Service) ImageURL(id string) (string, bool) {
	s.mu.Lock()
	defer s.mu.Unlock()
	raw, ok := s.images[id]
	return raw, ok && AllowedImage(raw)
}

// Client — HTTP-клиент службы для ручки картинок.
func (s *Service) Client() *http.Client { return s.client }

func (s *Service) get(ctx context.Context, raw string, accept string, limit int64) ([]byte, string, error) {
	request, err := http.NewRequestWithContext(ctx, http.MethodGet, raw, nil)
	if err != nil {
		return nil, "", err
	}
	request.Header.Set("Accept", accept)
	request.Header.Set("User-Agent", userAgent)
	response, err := s.client.Do(request)
	if err != nil {
		return nil, "", err
	}
	defer response.Body.Close()
	if response.StatusCode != http.StatusOK {
		return nil, "", fmt.Errorf("источник ответил кодом %d", response.StatusCode)
	}
	body, err := io.ReadAll(io.LimitReader(response.Body, limit))
	return body, response.Header.Get("Content-Type"), err
}

type mediaRef struct {
	URL    string `xml:"url,attr"`
	Type   string `xml:"type,attr"`
	Medium string `xml:"medium,attr"`
}

type rssDocument struct {
	Items []struct {
		Title        string     `xml:"title"`
		Link         string     `xml:"link"`
		Description  string     `xml:"description"`
		Encoded      string     `xml:"encoded"`
		PubDate      string     `xml:"pubDate"`
		Enclosures   []mediaRef `xml:"enclosure"`
		Thumbnails   []mediaRef `xml:"thumbnail"`
		MediaContent []mediaRef `xml:"content"`
	} `xml:"channel>item"`
}

func (s *Service) fetchFeed(ctx context.Context, feed Feed) ([]Story, error) {
	raw, _, err := s.get(ctx, feed.URL, "application/rss+xml, application/xml;q=0.9", 6<<20)
	if err != nil {
		return nil, err
	}
	return parseFeed(raw, feed.Source)
}

func parseFeed(raw []byte, source string) ([]Story, error) {
	var document rssDocument
	decoder := xml.NewDecoder(strings.NewReader(string(raw)))
	decoder.CharsetReader = charset.NewReaderLabel
	decoder.Strict = false
	if err := decoder.Decode(&document); err != nil {
		return nil, fmt.Errorf("разбор RSS: %w", err)
	}
	stories := make([]Story, 0, len(document.Items))
	for _, item := range document.Items {
		link := strings.TrimSpace(html.UnescapeString(item.Link))
		title := plain(item.Title)
		if title == "" || !AllowedArticle(link) {
			continue
		}
		summary := summarize(plain(firstNonEmpty(item.Description, item.Encoded)), title)
		story := Story{
			ID:      shortID(link),
			Title:   title,
			Summary: summary,
			Link:    link,
			Source:  source,
			Image:   pickImage(append(append(item.Enclosures, item.MediaContent...), item.Thumbnails...), item.Encoded, item.Description),
			Video:   pickVideo(item.MediaContent, item.Enclosures, item.Encoded+item.Description),
		}
		if published, ok := parseTime(item.PubDate); ok {
			story.Published = &published
		}
		stories = append(stories, story)
	}
	return stories, nil
}

func shortID(value string) string {
	sum := sha256.Sum256([]byte(value))
	return hex.EncodeToString(sum[:8])
}

func firstNonEmpty(values ...string) string {
	for _, value := range values {
		if strings.TrimSpace(value) != "" {
			return value
		}
	}
	return ""
}

var (
	tagPattern   = regexp.MustCompile(`(?s)<[^>]*>`)
	imagePattern = regexp.MustCompile(`(?i)<img[^>]+?(?:data-src|src)=["']([^"']+)["']`)
	youtubeID    = regexp.MustCompile(`(?:youtube(?:-nocookie)?\.com/(?:embed/|watch\?v=|shorts/)|youtu\.be/)([A-Za-z0-9_-]{11})`)
	// Хвосты WordPress и издательские приписки в описаниях лент.
	feedTails = regexp.MustCompile(`(?i)(the post .* appeared first on .*|\[(?:…|\.\.\.|&hellip;)\]|pročitajte (?:više|još).*|опширније.*|nastavak teksta.*)$`)
)

// plain превращает кусок HTML из ленты в чистый текст.
func plain(value string) string {
	value = tagPattern.ReplaceAllString(value, " ")
	value = html.UnescapeString(html.UnescapeString(value))
	return strings.Join(strings.FieldsFunc(value, func(r rune) bool {
		return unicode.IsSpace(r) || unicode.IsControl(r)
	}), " ")
}

// summarize обрезает описание до двух-трёх предложений по границе фразы.
func summarize(text, title string) string {
	text = strings.TrimSpace(feedTails.ReplaceAllString(text, ""))
	if strings.EqualFold(strings.TrimSpace(text), strings.TrimSpace(title)) {
		return ""
	}
	runes := []rune(text)
	if len(runes) <= 360 {
		return text
	}
	cut := string(runes[:360])
	if end := strings.LastIndexAny(cut, ".!?"); end > 120 {
		return strings.TrimSpace(cut[:end+1])
	}
	if space := strings.LastIndex(cut, " "); space > 0 {
		cut = cut[:space]
	}
	return strings.TrimSpace(cut) + "…"
}

func pickImage(refs []mediaRef, htmlParts ...string) string {
	for _, ref := range refs {
		candidate := strings.TrimSpace(html.UnescapeString(ref.URL))
		if candidate == "" || !AllowedImage(candidate) {
			continue
		}
		kind := strings.ToLower(ref.Type)
		if kind != "" && !strings.HasPrefix(kind, "image/") {
			continue
		}
		if ref.Medium != "" && strings.ToLower(ref.Medium) != "image" {
			continue
		}
		return candidate
	}
	for _, part := range htmlParts {
		for _, match := range imagePattern.FindAllStringSubmatch(part, 4) {
			candidate := strings.TrimSpace(html.UnescapeString(match[1]))
			if AllowedImage(candidate) {
				return candidate
			}
		}
	}
	return ""
}

func pickVideo(media, enclosures []mediaRef, body string) *Video {
	if match := youtubeID.FindStringSubmatch(body); match != nil {
		return &Video{YouTube: match[1]}
	}
	for _, ref := range append(media, enclosures...) {
		candidate := strings.TrimSpace(html.UnescapeString(ref.URL))
		isVideo := strings.HasPrefix(strings.ToLower(ref.Type), "video/") || strings.EqualFold(ref.Medium, "video")
		if isVideo && strings.HasSuffix(strings.ToLower(strings.SplitN(candidate, "?", 2)[0]), ".mp4") && AllowedArticle(candidate) {
			return &Video{File: candidate}
		}
	}
	return nil
}

func parseTime(value string) (time.Time, bool) {
	value = strings.TrimSpace(value)
	for _, layout := range []string{time.RFC1123Z, time.RFC1123, time.RFC3339, time.RFC822Z, time.RFC822, "Mon, 2 Jan 2006 15:04:05 -0700", "Mon, 2 Jan 2006 15:04:05 MST", "2006-01-02 15:04:05"} {
		if parsed, err := time.Parse(layout, value); err == nil {
			return parsed.UTC(), true
		}
	}
	return time.Time{}, false
}
