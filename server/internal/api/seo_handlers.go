package api

import (
	"encoding/json"
	"encoding/xml"
	"html"
	"log/slog"
	"net/http"
	"os"
	"path/filepath"
	"strings"
	"sync"
	"time"
	"unicode/utf8"

	"github.com/citavuk/server/internal/store"
)

// Поисковая выдача для страниц, которых нет в статической сборке.
//
// Статические разделы сайта отрисовываются на сборке (web/scripts/prerender.mjs)
// и лежат готовыми файлами. Уроки преподавателей так не получится: они
// появляются после модерации, между выкладками сайта, и пересобирать сайт на
// каждую публикацию нельзя. Поэтому карту и разметку для них отдаёт сервер —
// он и так знает про них всё.
//
// Ответ одинаков для человека и для робота. Разделять их по User-Agent нельзя:
// это клоакинг, и поисковики за него наказывают.

// lessonSitemapTTL — как долго держим готовую карту. Уроки публикуются редко,
// а робот ходит часто; собирать XML на каждый запрос незачем.
const lessonSitemapTTL = 10 * time.Minute

type sitemapURL struct {
	Loc     string `xml:"loc"`
	LastMod string `xml:"lastmod,omitempty"`
}

type sitemapSet struct {
	XMLName xml.Name     `xml:"urlset"`
	Xmlns   string       `xml:"xmlns,attr"`
	URLs    []sitemapURL `xml:"url"`
}

type cachedSitemap struct {
	mu   sync.Mutex
	body []byte
	at   time.Time
}

var lessonSitemap cachedSitemap

// handleLessonSitemap отдаёт карту опубликованных уроков преподавателей.
func (s *Server) handleLessonSitemap(w http.ResponseWriter, r *http.Request) {
	lessonSitemap.mu.Lock()
	defer lessonSitemap.mu.Unlock()

	if lessonSitemap.body != nil && time.Since(lessonSitemap.at) < lessonSitemapTTL {
		writeXML(w, lessonSitemap.body)
		return
	}

	items, err := s.store.PublicLessonSitemap(r.Context())
	if err != nil {
		slog.Error("handleLessonSitemap", "err", err)
		writeError(w, http.StatusInternalServerError, codeInternal, "Не удалось собрать карту уроков.")
		return
	}

	base := strings.TrimRight(s.cfg.WebURL, "/")
	set := sitemapSet{Xmlns: "http://www.sitemaps.org/schemas/sitemap/0.9"}
	for _, item := range items {
		set.URLs = append(set.URLs, sitemapURL{
			Loc:     base + "/lessons/" + item.Slug,
			LastMod: item.UpdatedAt.UTC().Format("2006-01-02"),
		})
	}

	body, err := xml.MarshalIndent(set, "", "  ")
	if err != nil {
		slog.Error("handleLessonSitemap", "err", err)
		writeError(w, http.StatusInternalServerError, codeInternal, "Не удалось собрать карту уроков.")
		return
	}
	body = append([]byte(xml.Header), body...)

	lessonSitemap.body = body
	lessonSitemap.at = time.Now()
	writeXML(w, body)
}

func writeXML(w http.ResponseWriter, body []byte) {
	w.Header().Set("Content-Type", "application/xml; charset=utf-8")
	w.Header().Set("Cache-Control", "public, max-age=600")
	w.WriteHeader(http.StatusOK)
	_, _ = w.Write(body)
}

// handleLessonPage отдаёт страницу урока с готовой разметкой.
//
// Берётся собранный index.html сайта и в него подставляются заголовок,
// описание, канонический адрес и текст урока. Приложение при этом стартует как
// обычно и содержимое перерисовывает — робот же получает страницу, даже если
// JavaScript не исполняет.
func (s *Server) handleLessonPage(w http.ResponseWriter, r *http.Request) {
	slug := r.PathValue("slug")
	shell, err := s.siteShell()
	if err != nil {
		// Заготовки нет — отдавать нечего. Пусть nginx покажет обычный сайт.
		slog.Warn("handleLessonPage: нет заготовки сайта", "err", err)
		http.NotFound(w, r)
		return
	}

	lesson, err := s.store.PublicLesson(r.Context(), slug)
	if err != nil {
		// Несуществующий урок обязан отвечать 404, а не 200 с пустой
		// страницей: иначе поисковик наберёт «мягких 404» и потеряет доверие
		// к разделу целиком.
		w.Header().Set("Content-Type", "text/html; charset=utf-8")
		w.WriteHeader(http.StatusNotFound)
		_, _ = w.Write(shell)
		return
	}

	page := lessonPageMeta{
		Title:       lesson.Title + " — Читавук",
		Description: lessonDescription(lesson),
		Canonical:   strings.TrimRight(s.cfg.WebURL, "/") + "/lessons/" + lesson.Slug,
		Body:        lessonReadableBody(lesson),
	}

	w.Header().Set("Content-Type", "text/html; charset=utf-8")
	w.Header().Set("Cache-Control", "no-cache, must-revalidate")
	w.WriteHeader(http.StatusOK)
	_, _ = w.Write(renderShell(shell, page))
}

type lessonPageMeta struct {
	Title       string
	Description string
	Canonical   string
	Body        string
}

// siteShell читает собранный index.html сайта.
//
// Файл лежит рядом на диске и заменяется при каждой выкладке сайта, поэтому
// перечитываем его по времени изменения, а не держим с запуска: иначе после
// выкладки сервер отдавал бы ссылки на удалённые бандлы.
type shellCache struct {
	mu      sync.Mutex
	body    []byte
	modTime time.Time
}

var shell shellCache

func (s *Server) siteShell() ([]byte, error) {
	path := filepath.Join(s.cfg.WebRoot, "index.html")
	info, err := os.Stat(path)
	if err != nil {
		return nil, err
	}

	shell.mu.Lock()
	defer shell.mu.Unlock()
	if shell.body != nil && shell.modTime.Equal(info.ModTime()) {
		return shell.body, nil
	}
	body, err := os.ReadFile(path)
	if err != nil {
		return nil, err
	}
	shell.body, shell.modTime = body, info.ModTime()
	return body, nil
}

// renderShell подставляет разметку урока в заготовку сайта.
func renderShell(shellHTML []byte, page lessonPageMeta) []byte {
	out := string(shellHTML)

	title := html.EscapeString(page.Title)
	description := html.EscapeString(page.Description)
	canonical := html.EscapeString(page.Canonical)

	out = replaceTag(out, "<title>", "</title>", title)
	out = replaceMeta(out, `name="description"`, description)
	out = replaceMeta(out, `property="og:title"`, title)
	out = replaceMeta(out, `property="og:description"`, description)
	out = replaceMeta(out, `property="og:url"`, canonical)

	out = replaceCanonical(out, canonical)

	// Содержимое кладём внутрь #root. Приложение затрёт его при первой
	// отрисовке, а робот без JavaScript увидит текст урока.
	out = strings.Replace(out, `<div id="root">`, `<div id="root">`+page.Body, 1)
	return []byte(out)
}

func replaceTag(source, open, close, value string) string {
	start := strings.Index(source, open)
	if start < 0 {
		return source
	}
	end := strings.Index(source[start:], close)
	if end < 0 {
		return source
	}
	return source[:start+len(open)] + value + source[start+end:]
}

// replaceCanonical выставляет канонический адрес страницы.
//
// Именно переписывает существующий тег, а не добавляет свой рядом: в заготовке
// сайта canonical уже есть и указывает на главную. Два канонических адреса
// хуже одного — поисковик не может выбрать и игнорирует оба.
func replaceCanonical(source, href string) string {
	tag := `<link rel="canonical" href="` + href + `" />`

	at := strings.Index(source, `rel="canonical"`)
	if at < 0 {
		return strings.Replace(source, "</head>", tag+"\n</head>", 1)
	}
	start := strings.LastIndex(source[:at], "<link")
	if start < 0 {
		return strings.Replace(source, "</head>", tag+"\n</head>", 1)
	}
	end := strings.Index(source[start:], ">")
	if end < 0 {
		return source
	}
	return source[:start] + tag + source[start+end+1:]
}

// replaceMeta переписывает content у мета-тега с заданным признаком.
func replaceMeta(source, marker, value string) string {
	at := strings.Index(source, marker)
	if at < 0 {
		return source
	}
	tagStart := strings.LastIndex(source[:at], "<meta")
	if tagStart < 0 {
		return source
	}
	tagEnd := strings.Index(source[tagStart:], ">")
	if tagEnd < 0 {
		return source
	}
	tagEnd += tagStart
	return source[:tagStart] + `<meta ` + marker + ` content="` + value + `"` + source[tagEnd:]
}

// lessonDescription собирает описание страницы: своё, если автор его написал,
// иначе — из темы и уровня, чтобы описание не пустовало.
func lessonDescription(l *store.Lesson) string {
	if summary := strings.TrimSpace(l.Summary); summary != "" {
		return trimRunes(summary, 300)
	}
	parts := []string{"Урок сербского"}
	if l.Topic != "" {
		parts = append(parts, "по теме «"+l.Topic+"»")
	}
	if l.Level != "" {
		parts = append(parts, "уровень "+l.Level)
	}
	if l.AuthorName != "" {
		parts = append(parts, "автор — "+l.AuthorName)
	}
	return strings.Join(parts, ", ") + "."
}

// lessonReadableBody собирает видимый роботу текст урока.
func lessonReadableBody(l *store.Lesson) string {
	var b strings.Builder
	b.WriteString(`<article><h1>` + html.EscapeString(l.Title) + `</h1>`)
	if l.Summary != "" {
		b.WriteString(`<p>` + html.EscapeString(l.Summary) + `</p>`)
	}
	meta := []string{}
	if l.Level != "" {
		meta = append(meta, "Уровень: "+l.Level)
	}
	if l.Topic != "" {
		meta = append(meta, "Тема: "+l.Topic)
	}
	if l.AuthorName != "" {
		meta = append(meta, "Автор: "+l.AuthorName)
	}
	if len(meta) > 0 {
		b.WriteString(`<p>` + html.EscapeString(strings.Join(meta, " · ")) + `</p>`)
	}
	for _, paragraph := range theoryText(l.Content) {
		b.WriteString(`<p>` + html.EscapeString(paragraph) + `</p>`)
	}
	b.WriteString(`</article>`)
	return b.String()
}

// theoryText вытаскивает абзацы теории из содержимого урока.
func theoryText(raw json.RawMessage) []string {
	if len(raw) == 0 {
		return nil
	}
	var root struct {
		Theory []map[string]any `json:"theory"`
	}
	if err := json.Unmarshal(raw, &root); err != nil {
		return nil
	}
	out := []string{}
	total := 0
	for _, block := range root.Theory {
		text, _ := block["text"].(string)
		text = strings.TrimSpace(text)
		if text == "" {
			continue
		}
		out = append(out, text)
		total += utf8.RuneCountInString(text)
		// Робот оценивает страницу по началу текста, а не по всему объёму;
		// дублировать весь урок в разметке незачем.
		if total > 4000 {
			break
		}
	}
	return out
}

func trimRunes(s string, limit int) string {
	if utf8.RuneCountInString(s) <= limit {
		return s
	}
	runes := []rune(s)
	return strings.TrimSpace(string(runes[:limit])) + "…"
}
