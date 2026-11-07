package news

import (
	"bytes"
	"context"
	"errors"
	"net/url"
	"regexp"
	"strings"
	"sync"
	"time"

	"golang.org/x/net/html"
	"golang.org/x/net/html/charset"
)

// ErrForeignArticle — ссылка ведёт не на издание из списка.
var ErrForeignArticle = errors.New("заметка не из газетного списка")

// Block — кусок заметки в порядке вёрстки.
type Block struct {
	// Kind: p — абзац, h — подзаголовок, img — картинка, youtube, video.
	Kind    string `json:"kind"`
	Text    string `json:"text,omitempty"`
	Image   string `json:"image,omitempty"`
	YouTube string `json:"youtube,omitempty"`
	File    string `json:"file,omitempty"`
}

// Article — заметка целиком.
type Article struct {
	Link      string     `json:"link"`
	Title     string     `json:"title"`
	Source    string     `json:"source"`
	Image     string     `json:"image,omitempty"`
	Published *time.Time `json:"published,omitempty"`
	Blocks    []Block    `json:"blocks"`
}

type articleEntry struct {
	article *Article
	at      time.Time
}

type articleCache struct {
	mu      sync.Mutex
	limit   int
	entries map[string]articleEntry
}

func newArticleCache(limit int) *articleCache {
	return &articleCache{limit: limit, entries: map[string]articleEntry{}}
}

func (c *articleCache) get(link string, now time.Time) (*Article, bool) {
	c.mu.Lock()
	defer c.mu.Unlock()
	entry, ok := c.entries[link]
	if !ok || now.Sub(entry.at) > 6*time.Hour {
		return nil, false
	}
	return entry.article, true
}

func (c *articleCache) put(link string, article *Article, now time.Time) {
	c.mu.Lock()
	defer c.mu.Unlock()
	if len(c.entries) >= c.limit {
		oldest, oldestAt := "", now
		for key, entry := range c.entries {
			if entry.at.Before(oldestAt) {
				oldest, oldestAt = key, entry.at
			}
		}
		delete(c.entries, oldest)
	}
	c.entries[link] = articleEntry{article: article, at: now}
}

// Article забирает заметку целиком и раскладывает её на абзацы.
func (s *Service) Article(ctx context.Context, link string) (*Article, error) {
	link = strings.TrimSpace(link)
	if !AllowedArticle(link) {
		return nil, ErrForeignArticle
	}
	if cached, ok := s.articles.get(link, s.now()); ok {
		return cached, nil
	}
	result, err, _ := s.flight.Do("article:"+link, func() (any, error) {
		fetchCtx, cancel := context.WithTimeout(context.WithoutCancel(ctx), 20*time.Second)
		defer cancel()
		raw, contentType, err := s.get(fetchCtx, link, "text/html,application/xhtml+xml", 4<<20)
		if err != nil {
			return nil, err
		}
		article, err := extractArticle(raw, contentType, link)
		if err != nil {
			return nil, err
		}
		article.Source = sourceOf(link)
		if article.Image != "" {
			article.Image = s.register(article.Image)
		}
		for i := range article.Blocks {
			if article.Blocks[i].Kind == "img" {
				article.Blocks[i].Image = s.register(article.Blocks[i].Image)
			}
		}
		s.articles.put(link, article, s.now())
		return article, nil
	})
	if err != nil {
		return nil, err
	}
	return result.(*Article), nil
}

// sources — подпись издания по адресу заметки. Адрес ленты и адрес заметки
// у части изданий на разных хостах (лента BBC — feeds.bbci.co.uk, заметки —
// www.bbc.com), поэтому подпись берётся из отдельной таблицы.
var sources = map[string]string{
	"n1info.rs": "N1", "www.rts.rs": "RTS", "rts.rs": "RTS", "www.bbc.com": "BBC na srpskom",
	"www.danas.rs": "Danas", "danas.rs": "Danas", "nova.rs": "Nova", "www.b92.net": "B92",
	"b92.net": "B92", "startit.rs": "Startit", "sportklub.rs": "Sport Klub", "sportklub.n1info.rs": "Sport Klub",
}

func sourceOf(link string) string {
	parsed, err := url.Parse(link)
	if err != nil {
		return ""
	}
	return sources[strings.ToLower(parsed.Hostname())]
}

var errNoText = errors.New("в заметке не нашлось текста")

// noise — слова в классах и идентификаторах обвязки страницы: «читайте
// также», кнопки соцсетей, подписка, реклама, комментарии. Сравниваются
// целые части имени («related-posts» → related), а не подстроки: классы
// вёрстки вроде «grid-cols-main-sidebar-wide» висят на обёртке всей страницы,
// и подстрока выбрасывала бы заметку целиком.
var noise = map[string]bool{
	"related": true, "share": true, "sharing": true, "social": true, "comment": true,
	"comments": true, "newsletter": true, "banner": true, "promo": true, "advert": true,
	"ads": true, "ad": true, "reklama": true, "tags": true, "breadcrumb": true,
	"breadcrumbs": true, "sidebar": true, "povezane": true, "povezano": true,
	"procitajte": true, "najcitanije": true, "subscribe": true, "widget": true,
	"recommended": true, "cta": true, "disclaimer": true, "embedded": true, "author": true,
	"cookie": true, "cookies": true, "nav": true, "menu": true, "footer": true,
}

// skipTag — элементы, где текста заметки не бывает.
func skipTag(node *html.Node) bool {
	switch node.Data {
	case "nav", "footer", "aside", "form", "script", "style", "noscript", "button", "svg", "header", "template":
		return true
	}
	return false
}

func noisy(node *html.Node) bool {
	if skipTag(node) {
		return true
	}
	for _, attr := range node.Attr {
		if attr.Key != "class" && attr.Key != "id" {
			continue
		}
		for _, token := range strings.Fields(strings.ToLower(attr.Val)) {
			for _, part := range strings.FieldsFunc(token, func(r rune) bool {
				return r == '-' || r == '_' || r == ':' || r == '/' || r == '.'
			}) {
				if noise[part] {
					return true
				}
			}
		}
	}
	return false
}

func attr(node *html.Node, name string) string {
	for _, a := range node.Attr {
		if a.Key == name {
			return a.Val
		}
	}
	return ""
}

func textOf(node *html.Node) string {
	var b strings.Builder
	var walk func(*html.Node)
	walk = func(n *html.Node) {
		if n.Type == html.TextNode {
			b.WriteString(n.Data)
			b.WriteByte(' ')
			return
		}
		if n.Type == html.ElementNode && (n.Data == "script" || n.Data == "style") {
			return
		}
		for child := n.FirstChild; child != nil; child = child.NextSibling {
			walk(child)
		}
	}
	walk(node)
	return plain(b.String())
}

func linkText(node *html.Node) int {
	total := 0
	var walk func(*html.Node)
	walk = func(n *html.Node) {
		if n.Type == html.ElementNode && n.Data == "a" {
			total += len([]rune(textOf(n)))
			return
		}
		for child := n.FirstChild; child != nil; child = child.NextSibling {
			walk(child)
		}
	}
	walk(node)
	return total
}

// extractArticle — облегчённая «читалка»: ищет узел, в котором больше всего
// абзацного текста, и берёт из него абзацы, подзаголовки, картинки и ролики.
func extractArticle(raw []byte, contentType, link string) (*Article, error) {
	reader, err := charset.NewReader(bytes.NewReader(raw), contentType)
	if err != nil {
		return nil, err
	}
	root, err := html.Parse(reader)
	if err != nil {
		return nil, err
	}
	article := &Article{Link: link, Blocks: []Block{}}

	scores := map[*html.Node]int{}
	var walk func(*html.Node, bool)
	walk = func(node *html.Node, skip bool) {
		if node.Type == html.ElementNode {
			if node.Data == "meta" {
				property := attr(node, "property")
				content := strings.TrimSpace(attr(node, "content"))
				switch property {
				case "og:title":
					article.Title = plain(content)
				case "og:image":
					if AllowedImage(content) && article.Image == "" {
						article.Image = content
					}
				case "article:published_time":
					if published, ok := parseTime(content); ok {
						article.Published = &published
					}
				}
			}
			if node.Data == "title" && article.Title == "" {
				article.Title = textOf(node)
			}
			skip = skip || skipTag(node)
			if node.Data == "p" && !skip {
				text := textOf(node)
				length := len([]rune(text))
				if length >= 40 && linkText(node)*2 < length {
					// Очки получают четыре предка с убыванием: у одних изданий
					// абзацы лежат рядом, у других (N1) — каждый в своей обёртке,
					// и общий узел заметки находится только на третьем уровне.
					ancestor := node.Parent
					for depth := 1; ancestor != nil && depth <= 4; depth++ {
						scores[ancestor] += length / depth
						ancestor = ancestor.Parent
					}
				}
			}
		}
		for child := node.FirstChild; child != nil; child = child.NextSibling {
			walk(child, skip)
		}
	}
	walk(root, false)

	var best *html.Node
	for node, score := range scores {
		if best == nil || score > scores[best] {
			best = node
		}
	}
	if best == nil || scores[best] < 150 {
		return nil, errNoText
	}

	seenVideo := map[string]bool{}
	var collect func(*html.Node)
	collect = func(node *html.Node) {
		if node.Type != html.ElementNode {
			for child := node.FirstChild; child != nil; child = child.NextSibling {
				collect(child)
			}
			return
		}
		if noisy(node) {
			return
		}
		switch node.Data {
		case "p", "blockquote":
			text := textOf(node)
			if keepParagraph(text) && linkText(node)*2 < len([]rune(text)) {
				article.Blocks = append(article.Blocks, Block{Kind: "p", Text: text})
			}
			collectMedia(node, article, seenVideo, false)
			return
		case "h2", "h3":
			if text := textOf(node); len([]rune(text)) > 3 && len([]rune(text)) < 200 {
				article.Blocks = append(article.Blocks, Block{Kind: "h", Text: text})
			}
			return
		case "iframe", "video", "img", "figure":
			collectMedia(node, article, seenVideo, true)
			return
		}
		for child := node.FirstChild; child != nil; child = child.NextSibling {
			collect(child)
		}
	}
	collect(best)

	// Ролик часто стоит не в узле с текстом, а рядом, в обёртке заметки.
	if len(seenVideo) == 0 {
		container := best.Parent
		for depth := 0; container != nil && depth < 3; depth++ {
			found := &Article{}
			collectMedia(container, found, seenVideo, false)
			for _, block := range found.Blocks {
				if block.Kind == "youtube" || block.Kind == "video" {
					article.Blocks = append([]Block{block}, article.Blocks...)
				}
			}
			if len(seenVideo) > 0 {
				break
			}
			container = container.Parent
		}
	}

	paragraphs := 0
	for _, block := range article.Blocks {
		if block.Kind == "p" {
			paragraphs++
		}
	}
	if paragraphs == 0 {
		return nil, errNoText
	}
	if len(article.Blocks) > 90 {
		article.Blocks = article.Blocks[:90]
	}
	return article, nil
}

// collectMedia достаёт из узла ролики и (при images) картинки.
func collectMedia(node *html.Node, article *Article, seenVideo map[string]bool, images bool) {
	var walk func(*html.Node)
	walk = func(n *html.Node) {
		if n.Type == html.ElementNode {
			switch n.Data {
			case "iframe":
				src := firstNonEmpty(attr(n, "src"), attr(n, "data-src"), attr(n, "data-lazy-src"))
				if match := youtubeID.FindStringSubmatch(src); match != nil && !seenVideo[match[1]] {
					seenVideo[match[1]] = true
					article.Blocks = append(article.Blocks, Block{Kind: "youtube", YouTube: match[1]})
				}
			case "video", "source":
				src := strings.TrimSpace(firstNonEmpty(attr(n, "src"), attr(n, "data-src")))
				if strings.HasSuffix(strings.ToLower(strings.SplitN(src, "?", 2)[0]), ".mp4") && AllowedArticle(src) && !seenVideo[src] {
					seenVideo[src] = true
					article.Blocks = append(article.Blocks, Block{Kind: "video", File: src})
				}
			case "img":
				if images {
					src := strings.TrimSpace(firstNonEmpty(attr(n, "data-src"), attr(n, "data-lazy-src"), attr(n, "src")))
					width := attr(n, "width")
					small := width != "" && len(width) < 3
					if AllowedImage(src) && !small && !strings.HasSuffix(strings.ToLower(src), ".svg") {
						caption := plain(attr(n, "alt"))
						article.Blocks = append(article.Blocks, Block{Kind: "img", Image: src, Text: caption})
						return
					}
				}
			}
		}
		for child := n.FirstChild; child != nil; child = child.NextSibling {
			walk(child)
		}
	}
	walk(node)
}

var junkStarts = []string{
	"foto:", "izvor:", "pročitajte", "procitajte", "pratite nas", "preuzmite",
	"фото:", "извор:", "прочитајте", "пратите нас", "video:", "видео:",
	"tekst je preuzet", "autor:", "аутор:", "copyright", "©",
}

// dateline — строка «субота, 07.11.2026, 13:08 -> 13:16»: время публикации,
// которое издания верстают обычным абзацем.
var dateline = regexp.MustCompile(`^[\p{L}\s,.]{0,20}\d{1,2}\.\s?\d{1,2}\.\s?\d{4}\.?[\s,]*(\d{1,2}[:.]\d{2}[\s\->→–—]*){0,2}$`)

func keepParagraph(text string) bool {
	if len([]rune(text)) < 25 || dateline.MatchString(strings.TrimSpace(text)) {
		return false
	}
	lower := strings.ToLower(text)
	for _, start := range junkStarts {
		if strings.HasPrefix(lower, start) {
			return false
		}
	}
	return true
}
