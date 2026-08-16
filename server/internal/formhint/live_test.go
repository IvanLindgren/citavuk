package formhint

import (
	"context"
	"os"
	"testing"
	"time"
)

// Проверка против настоящей модели на формах, которых в лексиконе нет.
// Прогонять при смене модели:
//
//	CITAVUK_NETWORK_TESTS=1 POLZA_AI_KEY=… go test ./internal/formhint/ -run Live -v
//
// Здесь проверяется только сама подсказка. Сойдётся ли она с языком, решает
// грамматический движок — это отдельная проверка в internal/api.
func TestLiveGuess(t *testing.T) {
	if os.Getenv("CITAVUK_NETWORK_TESTS") != "1" {
		t.Skip("сетевой тест: CITAVUK_NETWORK_TESTS=1")
	}
	key := os.Getenv("POLZA_AI_KEY")
	if key == "" {
		t.Skip("нет POLZA_AI_KEY")
	}
	hinter := New(key,
		envOr("CITAVUK_FORM_HINT_AI_MODEL", "google/gemini-3.7-flash"),
		envOr("CITAVUK_FORM_HINT_AI_URL", "https://api.polza.ai/api/v1/chat/completions"),
		envOr("CITAVUK_FORM_HINT_AI_REASONING", "low"))

	cases := []struct{ form, lemma, upos string }{
		{"kućicama", "kućica", "NOUN"},
		{"pozorišnom", "pozorišni", "ADJ"},
		{"prehlađenih", "prehlađen", "ADJ"},
		{"šljakerima", "šljaker", "NOUN"},
		{"izguglao", "izguglati", "VERB"},
	}
	for _, tc := range cases {
		ctx, cancel := context.WithTimeout(context.Background(), 30*time.Second)
		hint, err := hinter.Guess(ctx, tc.form)
		cancel()
		if err != nil {
			t.Errorf("%s: подсказки нет (%v)", tc.form, err)
			continue
		}
		t.Logf("%s → %s (%s %s)", tc.form, hint.Lemma, hint.UPOS, hint.Gender)
		if hint.UPOS != tc.upos {
			t.Errorf("%s: часть речи %s, ожидалась %s", tc.form, hint.UPOS, tc.upos)
		}
	}

	// Выдуманное слово: подсказки быть не должно, иначе движок начнёт получать
	// на проверку правдоподобный мусор.
	for _, word := range []string{"krnjumpast", "pljaskoder"} {
		ctx, cancel := context.WithTimeout(context.Background(), 30*time.Second)
		hint, err := hinter.Guess(ctx, word)
		cancel()
		if err == nil {
			t.Errorf("модель разобрала выдуманное %q как %+v", word, hint)
		}
	}
}

func envOr(name, fallback string) string {
	if value := os.Getenv(name); value != "" {
		return value
	}
	return fallback
}
