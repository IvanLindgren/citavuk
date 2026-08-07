package feed

import (
	"context"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"encoding/xml"
	"errors"
	"fmt"
	"io"
	"net/http"
	"net/url"
	"strings"
	"time"
	"unicode"

	"github.com/citavuk/server/internal/store"
	"github.com/google/uuid"
	"golang.org/x/net/html"
)

var ErrSourceNotSupported = errors.New("источник микро-ленты не поддерживается")

type SourceFetcher struct {
	client *http.Client
}

func NewSourceFetcher() *SourceFetcher {
	return &SourceFetcher{client: &http.Client{
		Timeout: 25 * time.Second,
		CheckRedirect: func(req *http.Request, via []*http.Request) error {
			if len(via) >= 4 {
				return errors.New("слишком много перенаправлений")
			}
			return allowedSourceURL(req.URL)
		},
	}}
}

var sourceHosts = map[string]bool{
	"rts.rs":                true,
	"www.rts.rs":            true,
	"sr.wikipedia.org":      true,
	"simple.wikipedia.org":  true,
	"poljska.rs":            true,
	"www.poljska.rs":        true,
	"putuj.rs":              true,
	"www.putuj.rs":          true,
	"putriota.rs":           true,
	"www.putriota.rs":       true,
	"rokselana.com":         true,
	"www.rokselana.com":     true,
	"hranauoblacima.rs":     true,
	"www.hranauoblacima.rs": true,
	"srcesrbije.rs":         true,
	"www.srcesrbije.rs":     true,
	"gradnja.rs":            true,
	"www.gradnja.rs":        true,
	"kulturizam.com":        true,
	"www.kulturizam.com":    true,
	"danubeogradu.rs":       true,
	"www.danubeogradu.rs":   true,
}

func allowedSourceURL(parsed *url.URL) error {
	if parsed == nil || parsed.Scheme != "https" || !sourceHosts[strings.ToLower(parsed.Hostname())] {
		return errors.New("адрес источника не входит в серверный список")
	}
	return nil
}

func (f *SourceFetcher) Fetch(
	ctx context.Context,
	source *store.MicroFeedSource,
	limit int,
) ([]store.MicroFeedImport, error) {
	if source == nil || !source.Enabled {
		return nil, ErrSourceNotSupported
	}
	if limit <= 0 || limit > 200 {
		limit = 20
	}
	parsed, err := url.Parse(source.SourceURL)
	if err != nil || allowedSourceURL(parsed) != nil {
		return nil, ErrSourceNotSupported
	}

	switch source.SourceKind {
	case "rss":
		return f.fetchRSS(ctx, source, limit)
	case "mediawiki":
		return f.fetchMediaWiki(ctx, source, limit)
	default:
		return nil, ErrSourceNotSupported
	}
}

func (f *SourceFetcher) get(ctx context.Context, rawURL string) ([]byte, error) {
	request, err := http.NewRequestWithContext(ctx, http.MethodGet, rawURL, nil)
	if err != nil {
		return nil, err
	}
	request.Header.Set("Accept", "application/json, application/rss+xml, application/xml;q=0.9")
	request.Header.Set("User-Agent", "CitavukMicroFeed/1.0 (+https://citavuk.ru/about)")
	response, err := f.client.Do(request)
	if err != nil {
		return nil, err
	}
	defer response.Body.Close()
	if response.StatusCode < 200 || response.StatusCode >= 300 {
		return nil, fmt.Errorf("источник ответил кодом %d", response.StatusCode)
	}
	return io.ReadAll(io.LimitReader(response.Body, 5<<20))
}

// mediaRef — общая форма ссылки на вложение в RSS.
//
// Лента может назвать картинку четырьмя разными способами, и какой из них
// выберет конкретное издание, заранее неизвестно: RTS кладёт enclosure,
// Википедия — thumbnail, кто-то вставляет <img> прямо в описание. Разбираем
// все и берём первое подходящее.
type mediaRef struct {
	URL    string `xml:"url,attr"`
	Type   string `xml:"type,attr"`
	Medium string `xml:"medium,attr"`
}

type rssDocument struct {
	Channel struct {
		Items []struct {
			Title        string     `xml:"title"`
			Link         string     `xml:"link"`
			GUID         string     `xml:"guid"`
			Description  string     `xml:"description"`
			Content      string     `xml:"encoded"`
			PubDate      string     `xml:"pubDate"`
			Enclosures   []mediaRef `xml:"enclosure"`
			Thumbnails   []mediaRef `xml:"thumbnail"`
			MediaContent []mediaRef `xml:"content"`
		} `xml:"item"`
	} `xml:"channel"`
	Entries []struct {
		ID         string     `xml:"id"`
		Title      string     `xml:"title"`
		Summary    string     `xml:"summary"`
		Content    string     `xml:"content"`
		Updated    string     `xml:"updated"`
		Thumbnails []mediaRef `xml:"thumbnail"`
		Links      []struct {
			Href string `xml:"href,attr"`
			Rel  string `xml:"rel,attr"`
			Type string `xml:"type,attr"`
		} `xml:"link"`
	} `xml:"entry"`
}

func (f *SourceFetcher) fetchRSS(
	ctx context.Context,
	source *store.MicroFeedSource,
	limit int,
) ([]store.MicroFeedImport, error) {
	items := make([]store.MicroFeedImport, 0, limit)
	seen := make(map[string]bool, limit)
	for page := 1; page <= 25 && len(items) < limit; page++ {
		pageURL := source.SourceURL
		if page > 1 {
			pageURL = rssPageURL(source.SourceURL, page)
		}
		raw, err := f.get(ctx, pageURL)
		if err != nil {
			if page == 1 {
				return nil, err
			}
			break
		}
		pageItems, err := parseRSS(raw)
		if err != nil {
			if page == 1 {
				return nil, err
			}
			break
		}
		added := 0
		for _, item := range pageItems {
			if seen[item.ExternalID] {
				continue
			}
			seen[item.ExternalID] = true
			items = append(items, item)
			added++
			if len(items) == limit {
				break
			}
		}
		if page > 1 && added == 0 {
			break
		}
	}
	return items, nil
}

func rssPageURL(rawURL string, page int) string {
	parsed, err := url.Parse(rawURL)
	if err != nil || page <= 1 {
		return rawURL
	}
	query := parsed.Query()
	query.Set("paged", strconvInt(page))
	parsed.RawQuery = query.Encode()
	return parsed.String()
}

func parseRSS(raw []byte) ([]store.MicroFeedImport, error) {
	var document rssDocument
	if err := xml.Unmarshal(raw, &document); err != nil {
		return nil, fmt.Errorf("разбор RSS: %w", err)
	}
	items := make([]store.MicroFeedImport, 0, len(document.Channel.Items)+len(document.Entries))
	for _, entry := range document.Channel.Items {
		body := cleanHTML(firstNonEmpty(entry.Content, entry.Description))
		title := cleanText(entry.Title)
		link := strings.TrimSpace(entry.Link)
		if title == "" || len([]rune(body)) < 120 || !validPublicURL(link) {
			continue
		}
		key := firstNonEmpty(strings.TrimSpace(entry.GUID), link, title)
		items = append(items, store.MicroFeedImport{
			ID: uuid.New(), ExternalID: stableID(key), Title: title,
			SourceURL: link, RawText: limitRunes(body, 24000),
			SourcePublishedAt: parseFeedTime(entry.PubDate),
			ImageURL: pickImage(
				append(append(entry.Enclosures, entry.Thumbnails...), entry.MediaContent...),
				entry.Content, entry.Description,
			),
		})
	}
	for _, entry := range document.Entries {
		link := ""
		for _, candidate := range entry.Links {
			if candidate.Rel == "" || candidate.Rel == "alternate" {
				link = candidate.Href
				break
			}
		}
		body := cleanHTML(firstNonEmpty(entry.Content, entry.Summary))
		title := cleanText(entry.Title)
		if title == "" || len([]rune(body)) < 120 || !validPublicURL(link) {
			continue
		}
		enclosures := make([]mediaRef, 0, len(entry.Links))
		for _, candidate := range entry.Links {
			if candidate.Rel == "enclosure" {
				enclosures = append(enclosures, mediaRef{URL: candidate.Href, Type: candidate.Type})
			}
		}
		items = append(items, store.MicroFeedImport{
			ID: uuid.New(), ExternalID: stableID(firstNonEmpty(entry.ID, link, title)),
			Title: title, SourceURL: link, RawText: limitRunes(body, 24000),
			SourcePublishedAt: parseFeedTime(entry.Updated),
			ImageURL: pickImage(
				append(enclosures, entry.Thumbnails...), entry.Content, entry.Summary,
			),
		})
	}
	return items, nil
}

type mediaWikiResponse struct {
	Query struct {
		Pages []struct {
			PageID    int64  `json:"pageid"`
			Title     string `json:"title"`
			Extract   string `json:"extract"`
			FullURL   string `json:"fullurl"`
			Thumbnail struct {
				Source string `json:"source"`
			} `json:"thumbnail"`
		} `json:"pages"`
	} `json:"query"`
}

func (f *SourceFetcher) fetchMediaWiki(
	ctx context.Context,
	source *store.MicroFeedSource,
	limit int,
) ([]store.MicroFeedImport, error) {
	endpoint, _ := url.Parse(source.SourceURL)
	query := endpoint.Query()
	query.Set("action", "query")
	query.Set("generator", "random")
	query.Set("grnnamespace", "0")
	query.Set("grnlimit", strconvInt(limit*2))
	// pageimages добавляет заглавную картинку статьи. Ширина ограничена здесь,
	// а не в вёрстке: тащить оригинал в несколько мегабайт ради карточки
	// высотой в треть экрана — расход трафика читателя ни за что.
	query.Set("prop", "extracts|info|pageimages")
	query.Set("piprop", "thumbnail")
	query.Set("pithumbsize", "1024")
	query.Set("inprop", "url")
	query.Set("explaintext", "1")
	query.Set("exintro", "1")
	query.Set("exsectionformat", "plain")
	query.Set("format", "json")
	query.Set("formatversion", "2")
	endpoint.RawQuery = query.Encode()
	raw, err := f.get(ctx, endpoint.String())
	if err != nil {
		return nil, err
	}
	items, err := parseMediaWiki(raw)
	if err != nil {
		return nil, err
	}
	if len(items) > limit {
		items = items[:limit]
	}
	return items, nil
}

func parseMediaWiki(raw []byte) ([]store.MicroFeedImport, error) {
	var response mediaWikiResponse
	if err := json.Unmarshal(raw, &response); err != nil {
		return nil, fmt.Errorf("разбор MediaWiki: %w", err)
	}
	items := make([]store.MicroFeedImport, 0, len(response.Query.Pages))
	for _, page := range response.Query.Pages {
		text := cleanText(page.Extract)
		lower := strings.ToLower(text)
		if len([]rune(text)) < 350 || !validPublicURL(page.FullURL) ||
			strings.Contains(lower, "може да се односи на") ||
			strings.Contains(lower, "may refer to") {
			continue
		}
		image := strings.TrimSpace(page.Thumbnail.Source)
		if !AllowedImageURL(image) {
			image = ""
		}
		items = append(items, store.MicroFeedImport{
			ID: uuid.New(), ExternalID: fmt.Sprintf("page:%d", page.PageID),
			Title: cleanText(page.Title), SourceURL: page.FullURL,
			RawText: limitRunes(text, 24000), ImageURL: image,
		})
	}
	return items, nil
}

func cleanHTML(value string) string {
	tokenizer := html.NewTokenizer(strings.NewReader(value))
	var b strings.Builder
	skip := 0
	for {
		typeOfToken := tokenizer.Next()
		switch typeOfToken {
		case html.ErrorToken:
			return cleanText(b.String())
		case html.StartTagToken:
			name, _ := tokenizer.TagName()
			if string(name) == "script" || string(name) == "style" {
				skip++
			}
			if skip == 0 && isBlockTag(string(name)) {
				b.WriteByte(' ')
			}
		case html.EndTagToken:
			name, _ := tokenizer.TagName()
			if (string(name) == "script" || string(name) == "style") && skip > 0 {
				skip--
			}
			if skip == 0 && isBlockTag(string(name)) {
				b.WriteByte(' ')
			}
		case html.TextToken:
			if skip == 0 {
				b.Write(tokenizer.Text())
				b.WriteByte(' ')
			}
		}
	}
}

func isBlockTag(name string) bool {
	switch name {
	case "p", "div", "br", "li", "h1", "h2", "h3", "h4", "blockquote":
		return true
	default:
		return false
	}
}

func cleanText(value string) string {
	return strings.Join(strings.FieldsFunc(value, func(r rune) bool {
		return unicode.IsSpace(r) || unicode.IsControl(r)
	}), " ")
}

func parseFeedTime(value string) *time.Time {
	value = strings.TrimSpace(value)
	for _, layout := range []string{time.RFC1123Z, time.RFC1123, time.RFC3339, time.RFC822Z, time.RFC822} {
		if parsed, err := time.Parse(layout, value); err == nil {
			return &parsed
		}
	}
	return nil
}

func validPublicURL(value string) bool {
	parsed, err := url.Parse(strings.TrimSpace(value))
	return err == nil && parsed.Scheme == "https" && parsed.Hostname() != ""
}

func stableID(value string) string {
	sum := sha256.Sum256([]byte(strings.TrimSpace(value)))
	return hex.EncodeToString(sum[:])
}

func firstNonEmpty(values ...string) string {
	for _, value := range values {
		if strings.TrimSpace(value) != "" {
			return value
		}
	}
	return ""
}

func limitRunes(value string, limit int) string {
	runes := []rune(value)
	if len(runes) <= limit {
		return value
	}
	return strings.TrimSpace(string(runes[:limit]))
}

func strconvInt(value int) string { return fmt.Sprintf("%d", value) }

// --- Картинка из источника ------------------------------------------------
//
// Поле картинки у карточки было с самого начала, но заполнять его было нечем:
// разбор адрес не доставал вовсе, и лента оставалась стеной текста.
//
// Адрес только запоминается. Забирает картинку сам сервер, по требованию и
// через собственную ручку (см. handleMicroFeedImage): отдавать браузеру прямую
// ссылку на чужой сайт значит рассказывать этому сайту, кто именно из наших
// читателей открыл карточку.

// imageHosts — где мы согласны брать картинки.
//
// Список отдельный от sourceHosts и намеренно узкий. Ссылка на картинку
// приходит из чужого XML, то есть это данные, которым нельзя верить: без
// списка сервер по первой же подсунутой ссылке пошёл бы хоть в свою локальную
// сеть, хоть в облачные метаданные.
var imageHosts = map[string]bool{
	"upload.wikimedia.org":  true,
	"rts.rs":                true,
	"www.rts.rs":            true,
	"img.rts.rs":            true,
	"static.rts.rs":         true,
	"poljska.rs":            true,
	"www.poljska.rs":        true,
	"putuj.rs":              true,
	"www.putuj.rs":          true,
	"putriota.rs":           true,
	"www.putriota.rs":       true,
	"rokselana.com":         true,
	"www.rokselana.com":     true,
	"hranauoblacima.rs":     true,
	"www.hranauoblacima.rs": true,
	"srcesrbije.rs":         true,
	"www.srcesrbije.rs":     true,
	"gradnja.rs":            true,
	"www.gradnja.rs":        true,
	"kulturizam.com":        true,
	"www.kulturizam.com":    true,
	"danubeogradu.rs":       true,
	"www.danubeogradu.rs":   true,
}

// AllowedImageURL проверяет, что по адресу можно идти за картинкой.
func AllowedImageURL(raw string) bool {
	parsed, err := url.Parse(strings.TrimSpace(raw))
	if err != nil || parsed.Scheme != "https" {
		return false
	}
	return imageHosts[strings.ToLower(parsed.Hostname())]
}

// pickImage выбирает картинку: сначала явные вложения, затем первая картинка
// внутри самого текста.
func pickImage(refs []mediaRef, htmlParts ...string) string {
	for _, ref := range refs {
		candidate := strings.TrimSpace(ref.URL)
		if candidate == "" || !AllowedImageURL(candidate) {
			continue
		}
		// Тип указан не всегда. Когда указан — верим ему: enclosure в RSS
		// сплошь и рядом оказывается аудио или видео, и ставить в карточку
		// mp3 вместо картинки было бы хуже, чем не ставить ничего.
		if ref.Type != "" && !strings.HasPrefix(strings.ToLower(ref.Type), "image/") {
			continue
		}
		if ref.Medium != "" && strings.ToLower(ref.Medium) != "image" {
			continue
		}
		return candidate
	}
	for _, part := range htmlParts {
		if found := firstHTMLImage(part); found != "" {
			return found
		}
	}
	return ""
}

// firstHTMLImage достаёт адрес первой картинки из куска HTML.
func firstHTMLImage(value string) string {
	if !strings.Contains(strings.ToLower(value), "<img") {
		return ""
	}
	tokenizer := html.NewTokenizer(strings.NewReader(value))
	for {
		switch tokenizer.Next() {
		case html.ErrorToken:
			return ""
		case html.StartTagToken, html.SelfClosingTagToken:
			name, hasAttr := tokenizer.TagName()
			if string(name) != "img" {
				continue
			}
			for hasAttr {
				var key, value []byte
				key, value, hasAttr = tokenizer.TagAttr()
				if string(key) != "src" {
					continue
				}
				candidate := strings.TrimSpace(string(value))
				if AllowedImageURL(candidate) {
					return candidate
				}
			}
		}
	}
}
