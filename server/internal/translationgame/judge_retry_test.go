package translationgame

import (
	"context"
	"encoding/json"
	"errors"
	"net/http"
	"net/http/httptest"
	"sync/atomic"
	"testing"
	"time"
)

func answerWith(w http.ResponseWriter, content string) {
	_ = json.NewEncoder(w).Encode(map[string]any{
		"choices": []map[string]any{{"message": map[string]string{"content": content}}},
	})
}

const goodVerdicts = `{"verdicts":[
  {"index":0,"winner":"user","userScore":8,"translatorScore":7,"feedback":"Точнее по смыслу."},
  {"index":1,"winner":"tie","userScore":7,"translatorScore":7,"feedback":"Равнозначно."},
  {"index":2,"winner":"user","userScore":9,"translatorScore":6,"feedback":"Естественнее."},
  {"index":3,"winner":"translator","userScore":5,"translatorScore":8,"feedback":"Пропущено слово."},
  {"index":4,"winner":"user","userScore":8,"translatorScore":7,"feedback":"Верное время."}
],"summary":"Раунд за учеником."}`

func fiveEntries() []Entry {
	entries := make([]Entry, 5)
	for i := range entries {
		entries[i] = Entry{
			Source:                "Данас пада киша.",
			UserTranslation:       "Сегодня идёт дождь.",
			TranslatorTranslation: "Сегодня падает дождь.",
		}
	}
	return entries
}

func TestJudgeAsksAgainAfterGibberish(t *testing.T) {
	// Модель изредка отвечает пояснением вместо JSON. Раньше игрок получал 502
	// посреди матча, хотя со второй попытки оценка приходит нормальная.
	var calls atomic.Int32
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) {
		if calls.Add(1) == 1 {
			answerWith(w, "Конечно! Сейчас оценю переводы.")
			return
		}
		answerWith(w, goodVerdicts)
	}))
	defer server.Close()

	result, err := NewJudge("key", "gemma", server.URL).
		Evaluate(context.Background(), fiveEntries(), DirectionSrRu)
	if err != nil {
		t.Fatalf("судья сдался после одного промаха: %v", err)
	}
	if len(result.Verdicts) != 5 {
		t.Fatalf("оценок %d вместо пяти", len(result.Verdicts))
	}
	if got := calls.Load(); got != 2 {
		t.Fatalf("походов к нейросети %d, ждали два", got)
	}
}

func TestJudgeGivesUpAfterThreeTries(t *testing.T) {
	var calls atomic.Int32
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) {
		calls.Add(1)
		answerWith(w, "никакого JSON тут нет")
	}))
	defer server.Close()

	_, err := NewJudge("key", "gemma", server.URL).
		Evaluate(context.Background(), fiveEntries(), DirectionSrRu)
	if !errors.Is(err, ErrBadAnswer) {
		t.Fatalf("ожидали неразборчивый ответ, получили: %v", err)
	}
	if got := calls.Load(); got != judgeAttempts {
		t.Fatalf("походов %d вместо %d", got, judgeAttempts)
	}
}

func TestJudgeRetriesOverloadButNotRefusal(t *testing.T) {
	// 429 и 5xx проходят сами, а отвергнутый ключ повторять бессмысленно:
	// три одинаковых отказа только задержат ответ игроку.
	cases := []struct {
		name  string
		code  int
		tries int32
	}{
		{"перегрузка", http.StatusTooManyRequests, judgeAttempts},
		{"поломка на той стороне", http.StatusBadGateway, judgeAttempts},
		{"ключ не принят", http.StatusUnauthorized, 1},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			var calls atomic.Int32
			server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) {
				calls.Add(1)
				w.WriteHeader(tc.code)
				_ = json.NewEncoder(w).Encode(map[string]any{
					"error": map[string]string{"message": "нет"},
				})
			}))
			defer server.Close()

			_, err := NewJudge("key", "gemma", server.URL).
				Evaluate(context.Background(), fiveEntries(), DirectionSrRu)
			if err == nil {
				t.Fatal("ошибка потерялась")
			}
			if got := calls.Load(); got != tc.tries {
				t.Fatalf("походов %d вместо %d", got, tc.tries)
			}
		})
	}
}

func TestJudgeStopsWhenPlayerLeft(t *testing.T) {
	// Повторять ради ушедшего игрока нечего: матч всё равно не покажут.
	var calls atomic.Int32
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) {
		calls.Add(1)
		answerWith(w, "мусор")
	}))
	defer server.Close()

	ctx, cancel := context.WithCancel(context.Background())
	go func() {
		time.Sleep(50 * time.Millisecond)
		cancel()
	}()
	_, err := NewJudge("key", "gemma", server.URL).
		Evaluate(ctx, fiveEntries(), DirectionSrRu)
	if err == nil {
		t.Fatal("ошибка потерялась")
	}
	if got := calls.Load(); got >= judgeAttempts {
		t.Fatalf("после ухода игрока сделано %d походов", got)
	}
}

func TestMatchJudgeAlsoAsksAgain(t *testing.T) {
	var calls atomic.Int32
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) {
		if calls.Add(1) == 1 {
			answerWith(w, "{это не json}")
			return
		}
		answerWith(w, `{"verdicts":[{"index":0,"best":["a1"],"scores":{"a1":9,"b2":6},
                        "feedback":"Второй путает род."}],"summary":"Первый взял раунд."}`)
	}))
	defer server.Close()

	result, err := NewJudge("key", "gemma", server.URL).
		EvaluateMatch(context.Background(), matchEntries(), DirectionSrRu)
	if err != nil {
		t.Fatalf("судья матча сдался после одного промаха: %v", err)
	}
	if len(result.Verdicts) != 1 || result.Verdicts[0].Best[0] != "a1" {
		t.Fatalf("оценка разобрана неверно: %+v", result.Verdicts)
	}
	if got := calls.Load(); got != 2 {
		t.Fatalf("походов %d, ждали два", got)
	}
}
