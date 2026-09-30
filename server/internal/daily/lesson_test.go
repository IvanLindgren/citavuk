package daily

import (
	"context"
	"encoding/json"
	"errors"
	"net/http"
	"net/http/httptest"
	"os"
	"testing"
	"time"
)

func TestComposeRetriesInvalidFormat(t *testing.T) {
	calls := 0
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		calls++
		var req chatRequest
		if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
			t.Error(err)
		}
		if req.MaxTokens < 4096 || req.Reasoning["effort"] != "low" {
			t.Error("неверные ограничения генерации")
		}
		content := `{"title":"Јутро","text":"Ана чита књигу.","exercises":[]}`
		if calls == 1 {
			content = "invalid"
		}
		json.NewEncoder(w).Encode(map[string]any{"choices": []any{map[string]any{"finish_reason": "stop", "message": map[string]string{"content": content}}}})
	}))
	defer srv.Close()
	result, err := NewGenerator("test", "test", srv.URL).Compose(t.Context(), "A1", []Word{{Lemma: "књига"}})
	if err != nil || result == nil || calls != 2 {
		t.Fatalf("calls=%d err=%v", calls, err)
	}
}

func TestComposeRejectsTruncatedJSONAndBoundsRetries(t *testing.T) {
	calls := 0
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		calls++
		json.NewEncoder(w).Encode(map[string]any{"choices": []any{map[string]any{"finish_reason": "length", "message": map[string]string{"content": `{"text":"обрезано"}`}}}})
	}))
	defer srv.Close()
	_, err := NewGenerator("test", "test", srv.URL).Compose(t.Context(), "A1", []Word{{Lemma: "књига"}})
	if !errors.Is(err, ErrBadAnswer) || calls != 3 {
		t.Fatalf("calls=%d err=%v", calls, err)
	}
}

func TestDailyLunaLive(t *testing.T) {
	key := os.Getenv("CITAVUK_DAILY_LIVE_KEY")
	if key == "" {
		t.Skip("явный ключ для платной проверки не задан")
	}
	ctx, cancel := context.WithTimeout(t.Context(), 200*time.Second)
	defer cancel()
	words := []Word{{Lemma: "кућа"}, {Lemma: "књига"}, {Lemma: "вода"}, {Lemma: "дан"}, {Lemma: "град"}, {Lemma: "хлеб"}, {Lemma: "читати"}, {Lemma: "добар"}, {Lemma: "друг"}, {Lemma: "школа"}}
	lesson, err := NewGenerator(key, "openai/gpt-6-luna", "https://api.polza.ai/api/v1/chat/completions").Compose(ctx, "A1", words)
	if err != nil {
		t.Fatal(err)
	}
	if len(lesson.Exercises) != 4 {
		t.Fatalf("заданий: %d", len(lesson.Exercises))
	}
	t.Logf("валидный урок: %d символов, %d упражнений", len([]rune(lesson.Text)), len(lesson.Exercises))
}

func TestParseLessonAcceptsFencedJSON(t *testing.T) {
	// Модель просили отвечать чистым JSON, но она регулярно оборачивает его в
	// ```json и предваряет вежливой фразой.
	answer := "Ево текста!\n```json\n" + `{
        "title":"Јутро",
        "text":"Ана иде у пекару. Купује бурек и јогурт.",
        "exercises":[
          {"kind":"choice","question":"Куда иде Ана?","options":["у пекару","у школу"],"answer":"у пекару"}
        ]}` + "\n```"

	lesson, err := ParseLesson(answer)
	if err != nil {
		t.Fatalf("урок не разобран: %v", err)
	}
	if lesson.Title != "Јутро" {
		t.Fatalf("заголовок потерян: %q", lesson.Title)
	}
	if len(lesson.Exercises) != 1 {
		t.Fatalf("ожидалось одно задание, получено %d", len(lesson.Exercises))
	}
}

func TestParseLessonRejectsEmptyText(t *testing.T) {
	// Текст — весь смысл окна. Пустой означает, что модель не справилась, и
	// показывать человеку нечего.
	if _, err := ParseLesson(`{"title":"Без текста","text":"   "}`); err == nil {
		t.Fatal("пустой текст должен считаться ошибкой")
	}
	if _, err := ParseLesson("модель извинилась и ничего не прислала"); err == nil {
		t.Fatal("ответ без JSON должен считаться ошибкой")
	}
}

func TestValidExercisesDropsUnanswerable(t *testing.T) {
	got := ValidExercises([]Exercise{
		{Kind: "choice", Question: "Куда?", Options: []string{"у пекару", "у школу"}, Answer: "у пекару"},
		// Верного варианта нет среди предложенных: проверить ответ нечем.
		{Kind: "choice", Question: "Шта?", Options: []string{"хлеб", "млеко"}, Answer: "бурек"},
		// Без ответа задание нерешаемо — человек решит, а проверить себя не
		// сможет.
		{Kind: "fill", Question: "Ана ___ у пекару.", Answer: "  "},
		// Выбор без вариантов — не выбор, но вопрос осмысленный: превращается
		// в перевод, а не выбрасывается.
		{Kind: "choice", Question: "Переведи: она идёт", Answer: "она иде"},
	})

	if len(got) != 2 {
		t.Fatalf("ожидались два годных задания, получено %d", len(got))
	}
	if got[1].Kind != "translate" || got[1].Options != nil {
		t.Fatalf("выбор без вариантов должен стать переводом: %+v", got[1])
	}
}

func TestValidExercisesKeepsFive(t *testing.T) {
	many := make([]Exercise, 0, 9)
	for i := 0; i < 9; i++ {
		many = append(many, Exercise{Kind: "translate", Question: "вопрос", Answer: "ответ"})
	}
	if got := len(ValidExercises(many)); got != maxExercises {
		t.Fatalf("окно на каждый день не должно выглядеть контрольной: %d заданий", got)
	}
}

func TestComposeWithoutKeyDisabled(t *testing.T) {
	generator := NewGenerator("", "model", "https://example.invalid")
	if generator.Enabled() {
		t.Fatal("без ключа генератор обязан считаться выключенным")
	}
	if _, err := generator.Compose(t.Context(), "A2", []Word{{Lemma: "хлеб"}}); err != ErrNotConfigured {
		t.Fatalf("ожидалась ошибка настройки, получено %v", err)
	}
}
