package api

import (
	"encoding/json"
	"strings"
	"testing"

	"github.com/citavuk/server/internal/store"
)

// Страница урока отдаётся одинаковой человеку и роботу: разделять их по
// User-Agent нельзя, за это поисковики наказывают. Поэтому проверяем, что в
// заготовку сайта подставились настоящие заголовок, описание и текст, а
// приложение при этом осталось работоспособным.

const testShell = `<!doctype html><html><head>` +
	`<title>Читавук: сербский через чтение</title>` +
	`<meta name="description" content="общее описание" />` +
	`<meta property="og:title" content="Читавук" />` +
	`<meta property="og:description" content="общее описание" />` +
	`<meta property="og:url" content="https://citavuk.ru/" />` +
	`<link rel="canonical" href="https://citavuk.ru/" />` +
	`</head><body><div id="root"></div><script src="/assets/index-abc123.js"></script></body></html>`

func testPage() lessonPageMeta {
	return lessonPageMeta{
		Title:       "Падежи в сербском — Читавук",
		Description: "Разбираем семь падежей на примерах.",
		Canonical:   "https://citavuk.ru/lessons/padezi-abc12345",
		Body:        `<article><h1>Падежи в сербском</h1></article>`,
	}
}

func TestRenderShellReplacesMeta(t *testing.T) {
	out := string(renderShell([]byte(testShell), testPage()))

	if !strings.Contains(out, "<title>Падежи в сербском — Читавук</title>") {
		t.Error("заголовок не подставлен")
	}
	if strings.Contains(out, "Читавук: сербский через чтение") {
		t.Error("остался общий заголовок сайта")
	}
	if !strings.Contains(out, `content="Разбираем семь падежей на примерах."`) {
		t.Error("описание не подставлено")
	}
	if strings.Contains(out, "общее описание") {
		t.Error("осталось общее описание сайта")
	}
	if !strings.Contains(out, `<link rel="canonical" href="https://citavuk.ru/lessons/padezi-abc12345" />`) {
		t.Error("нет канонического адреса — робот сочтёт страницу дублем главной")
	}
	// Двух канонических адресов быть не должно: поисковик не сможет выбрать и
	// проигнорирует оба. В заготовке сайта тег уже есть — его надо переписать,
	// а не добавить свой рядом.
	if got := strings.Count(out, `rel="canonical"`); got != 1 {
		t.Errorf("канонических адресов на странице %d, должен быть 1", got)
	}
	if strings.Contains(out, `<link rel="canonical" href="https://citavuk.ru/" />`) {
		t.Error("остался канонический адрес главной страницы")
	}
	if !strings.Contains(out, `content="https://citavuk.ru/lessons/padezi-abc12345"`) {
		t.Error("og:url не подставлен")
	}
}

func TestRenderShellKeepsAppRunnable(t *testing.T) {
	out := string(renderShell([]byte(testShell), testPage()))

	// Ссылка на бандл обязана уцелеть: иначе страница откроется мёртвой.
	if !strings.Contains(out, `<script src="/assets/index-abc123.js">`) {
		t.Error("потеряна ссылка на бандл приложения")
	}
	// Текст кладётся ВНУТРЬ #root, чтобы приложение перерисовало его при
	// старте, а не оставило дубль рядом.
	if !strings.Contains(out, `<div id="root"><article>`) {
		t.Error("текст урока положен не внутрь #root")
	}
}

func TestRenderShellEscapes(t *testing.T) {
	page := testPage()
	page.Title = `Кавычки "и" <теги>`
	out := string(renderShell([]byte(testShell), page))

	if strings.Contains(out, `<title>Кавычки "и" <теги></title>`) {
		t.Error("заголовок не экранирован — разметка ломается")
	}
	if !strings.Contains(out, "&lt;теги&gt;") {
		t.Error("угловые скобки не экранированы")
	}
}

func TestLessonDescriptionFallsBack(t *testing.T) {
	withSummary := &store.Lesson{Summary: "Своё описание урока."}
	if got := lessonDescription(withSummary); got != "Своё описание урока." {
		t.Errorf("описание автора заменено: %q", got)
	}

	// Без описания страница не должна оставаться без него вовсе.
	bare := &store.Lesson{Topic: "падежи", Level: "B1", AuthorName: "Денис"}
	got := lessonDescription(bare)
	for _, want := range []string{"падежи", "B1", "Денис"} {
		if !strings.Contains(got, want) {
			t.Errorf("в запасном описании нет %q: %q", want, got)
		}
	}
}

func TestLessonDescriptionIsBounded(t *testing.T) {
	long := &store.Lesson{Summary: strings.Repeat("слово ", 200)}
	if got := []rune(lessonDescription(long)); len(got) > 301 {
		t.Errorf("описание длиной %d — поисковик обрежет его сам", len(got))
	}
}

func TestTheoryTextExtractsParagraphs(t *testing.T) {
	content := json.RawMessage(`{"theory":[
        {"type":"paragraph","text":"Первый абзац."},
        {"type":"image","url":"https://example.org/a.png"},
        {"type":"paragraph","text":"  Второй абзац.  "},
        {"type":"paragraph","text":"   "}]}`)

	got := theoryText(content)
	if len(got) != 2 {
		t.Fatalf("абзацев %d, ожидалось 2: %v", len(got), got)
	}
	if got[1] != "Второй абзац." {
		t.Errorf("пробелы не срезаны: %q", got[1])
	}
}

func TestTheoryTextSurvivesGarbage(t *testing.T) {
	// Содержимое приходит из базы, и падать на нём нельзя: страница обязана
	// открыться хотя бы с заголовком.
	for _, raw := range []string{``, `{}`, `[]`, `{"theory":"строка"}`, `не json`} {
		if got := theoryText(json.RawMessage(raw)); got == nil && raw != `` {
			continue // пустой результат — допустимо
		} else if len(got) > 0 {
			t.Errorf("%q: неожиданный текст %v", raw, got)
		}
	}
}

func TestLessonBodyIncludesTitleAndText(t *testing.T) {
	lesson := &store.Lesson{
		Title:      "Падежи",
		Summary:    "Кратко",
		Level:      "B1",
		Topic:      "грамматика",
		AuthorName: "Денис",
		Content:    json.RawMessage(`{"theory":[{"type":"paragraph","text":"Именительный падеж."}]}`),
	}
	body := lessonReadableBody(lesson)
	for _, want := range []string{"<h1>Падежи</h1>", "Кратко", "B1", "грамматика", "Денис", "Именительный падеж."} {
		if !strings.Contains(body, want) {
			t.Errorf("в разметке нет %q", want)
		}
	}
}
