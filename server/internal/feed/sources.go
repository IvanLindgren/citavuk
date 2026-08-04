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
	"rts.rs":               true,
	"www.rts.rs":           true,
	"sr.wikipedia.org":     true,
	"simple.wikipedia.org": true,
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
	if limit <= 0 || limit > 40 {
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

type rssDocument struct {
	Channel struct {
		Items []struct {
			Title       string `xml:"title"`
			Link        string `xml:"link"`
			GUID        string `xml:"guid"`
			Description string `xml:"description"`
			Content     string `xml:"encoded"`
			PubDate     string `xml:"pubDate"`
		} `xml:"item"`
	} `xml:"channel"`
	Entries []struct {
		ID      string `xml:"id"`
		Title   string `xml:"title"`
		Summary string `xml:"summary"`
		Content string `xml:"content"`
		Updated string `xml:"updated"`
		Links   []struct {
			Href string `xml:"href,attr"`
			Rel  string `xml:"rel,attr"`
		} `xml:"link"`
	} `xml:"entry"`
}

func (f *SourceFetcher) fetchRSS(
	ctx context.Context,
	source *store.MicroFeedSource,
	limit int,
) ([]store.MicroFeedImport, error) {
	raw, err := f.get(ctx, source.SourceURL)
	if err != nil {
		return nil, err
	}
	items, err := parseRSS(raw)
	if err != nil {
		return nil, err
	}
	if len(items) > limit {
		items = items[:limit]
	}
	return items, nil
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
		items = append(items, store.MicroFeedImport{
			ID: uuid.New(), ExternalID: stableID(firstNonEmpty(entry.ID, link, title)),
			Title: title, SourceURL: link, RawText: limitRunes(body, 24000),
			SourcePublishedAt: parseFeedTime(entry.Updated),
		})
	}
	return items, nil
}

type mediaWikiResponse struct {
	Query struct {
		Pages []struct {
			PageID  int64  `json:"pageid"`
			Title   string `json:"title"`
			Extract string `json:"extract"`
			FullURL string `json:"fullurl"`
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
	query.Set("prop", "extracts|info")
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
		items = append(items, store.MicroFeedImport{
			ID: uuid.New(), ExternalID: fmt.Sprintf("page:%d", page.PageID),
			Title: cleanText(page.Title), SourceURL: page.FullURL,
			RawText: limitRunes(text, 24000),
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
