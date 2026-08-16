package api

import (
	"context"
	"os"
	"testing"
	"time"

	"github.com/citavuk/server/internal/formhint"
)

// Сквозная проверка: настоящая модель, настоящий лексикон, настоящий движок.
// Показывает, сколько форм из тех, что раньше оставались без разбора, теперь
// разбирается — и не приняли ли мы при этом чужую начальную форму.
//
//	CITAVUK_NETWORK_TESTS=1 POLZA_AI_KEY=… go test ./internal/api/ -run LiveFormHint -v
func TestLiveFormHintPipeline(t *testing.T) {
	if os.Getenv("CITAVUK_NETWORK_TESTS") != "1" {
		t.Skip("сетевой тест: CITAVUK_NETWORK_TESTS=1")
	}
	key := os.Getenv("POLZA_AI_KEY")
	if key == "" {
		t.Skip("нет POLZA_AI_KEY")
	}
	hinter := formhint.New(key, envOrDefault("CITAVUK_FORM_HINT_AI_MODEL", "google/gemini-3.7-flash"),
		envOrDefault("CITAVUK_FORM_HINT_AI_URL", "https://api.polza.ai/api/v1/chat/completions"),
		envOrDefault("CITAVUK_FORM_HINT_AI_REASONING", "low"))
	lex := testLexicon(t)

	// Обычные сербские слова, которых в лексиконе нет ни одной формой.
	forms := []string{
		"prehlađenih", "izguglao", "šljakerima", "folirantima", "prepravljala",
		"nedokučivim", "šeprtljav", "otkotrljalo", "podvaljivali",
	}
	solved := 0
	for _, form := range forms {
		if res := analyze(lex, form); res.Known {
			t.Errorf("%s внезапно есть в лексиконе — форма для проверки не годится", form)
			continue
		}
		ctx, cancel := context.WithTimeout(context.Background(), 30*time.Second)
		hint, err := hinter.Guess(ctx, form)
		cancel()
		if err != nil {
			t.Logf("%-14s подсказки нет: %v", form, err)
			continue
		}
		reading := verifyHint(hint, form)
		if reading == nil {
			t.Logf("%-14s подсказка %q (%s) не прошла проверку движком",
				form, hint.Lemma, hint.UPOS)
			continue
		}
		solved++
		t.Logf("%-14s → %s (%s) %v", form, reading.Lemma, reading.UPOS, reading.Feats)
	}
	t.Logf("разобрано %d из %d", solved, len(forms))
	// Половина — это уже заметно больше, чем ничего, и ниже этого стоит
	// пересмотреть модель или промпт.
	if solved*2 < len(forms) {
		t.Errorf("разобрано только %d из %d", solved, len(forms))
	}
}

func envOrDefault(name, fallback string) string {
	if value := os.Getenv(name); value != "" {
		return value
	}
	return fallback
}
