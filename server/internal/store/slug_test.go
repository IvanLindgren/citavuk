package store

import (
	"regexp"
	"strings"
	"testing"
)

// Адрес урока строится из названия. Сайт про сербский, и большинство названий
// кириллические — если их выбрасывать, все уроки получают неразличимые адреса
// вида «lesson-3f2a91bc».

var slugSuffix = regexp.MustCompile(`-[0-9a-f]{8}$`)

func body(t *testing.T, title string) string {
	t.Helper()
	slug := SlugifyLessonTitle(title)
	if !slugSuffix.MatchString(slug) {
		t.Fatalf("%q: нет случайного суффикса (%q)", title, slug)
	}
	return strings.TrimSuffix(slug, slug[len(slug)-9:])
}

func TestSlugTransliteratesCyrillic(t *testing.T) {
	cases := map[string]string{
		"Читање и разговор": "citanje-i-razgovor",
		"Падежи у српском":  "padezi-u-srpskom",
		"Њива":              "njiva",
		"Ђак":               "djak",
		"Џеп":               "dzep",
		"Први час":          "prvi-cas",
	}
	for title, want := range cases {
		if got := body(t, title); got != want {
			t.Errorf("%q: адрес %q, ожидался %q", title, got, want)
		}
	}
}

func TestSlugFoldsLatinDiacritics(t *testing.T) {
	// Раньше диакритическая буква выбрасывалась целиком: «Čitanje» → «itanje».
	cases := map[string]string{
		"Čitanje":     "citanje",
		"Šuma i džep": "suma-i-dzep",
		"Ćirilica":    "cirilica",
		"Žuta kuća":   "zuta-kuca",
		"Đak":         "djak",
	}
	for title, want := range cases {
		if got := body(t, title); got != want {
			t.Errorf("%q: адрес %q, ожидался %q", title, got, want)
		}
	}
}

func TestSlugKeepsLatinAndDigits(t *testing.T) {
	if got := body(t, "Lesson 12: In corpore sano"); got != "lesson-12-in-corpore-sano" {
		t.Errorf("адрес %q", got)
	}
}

func TestSlugFallsBackWhenNothingRemains(t *testing.T) {
	// Название из одних знаков препинания или эмодзи не даёт букв вовсе.
	for _, title := range []string{"!!!", "   ", "🙂🙂", ""} {
		if got := body(t, title); got != "lesson" {
			t.Errorf("%q: адрес %q, ожидался lesson", title, got)
		}
	}
}

func TestSlugIsBounded(t *testing.T) {
	// Длинное название не должно давать бесконечный адрес.
	got := body(t, strings.Repeat("Читање ", 40))
	if len(got) > 80 {
		t.Errorf("адрес длиной %d: %q", len(got), got)
	}
	if strings.HasSuffix(got, "-") || strings.HasPrefix(got, "-") {
		t.Errorf("адрес обрезан по дефису: %q", got)
	}
}

func TestSlugIsUniquePerCall(t *testing.T) {
	// Два урока с одинаковым названием не должны конфликтовать по UNIQUE(slug).
	first := SlugifyLessonTitle("Читање")
	second := SlugifyLessonTitle("Читање")
	if first == second {
		t.Error("два вызова дали одинаковый адрес")
	}
}
