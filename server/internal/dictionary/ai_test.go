package dictionary

import (
	"context"
	"encoding/json"
	"errors"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
)

// answerWith отвечает как OpenAI-совместимый провайдер.
func answerWith(w http.ResponseWriter, content string) {
	_ = json.NewEncoder(w).Encode(map[string]any{
		"choices": []map[string]any{{"message": map[string]string{"content": content}}},
	})
}

func TestExplainMarksGeneratedEntry(t *testing.T) {
	// Толкование от модели обязано называть себя: подпись словаря и ссылка на
	// статью означали бы, что текст взят из Матице српске.
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) {
		answerWith(w, `{"exists":true,"headword":"фолѝрант","grammar":"именица, мушки род",
		  "senses":[{"definition":"особа која се претвара да је нешто што није",
		             "example":"Не веруј му, он је обичан фолирант."}]}`)
	}))
	defer server.Close()

	entry, err := NewExplainer("key", "model", server.URL, "low").
		Explain(context.Background(), "фолирант")
	if err != nil {
		t.Fatalf("толкование не получено: %v", err)
	}
	if !entry.Generated {
		t.Error("не помечено как сочинённое нейросетью")
	}
	if entry.SourceTitle != GeneratedSource {
		t.Errorf("подпись источника %q", entry.SourceTitle)
	}
	if entry.URL != "" || entry.Volume != 0 || entry.Page != 0 {
		t.Errorf("у сочинённого толкования появились выходные данные: %+v", entry)
	}
	if len(entry.Senses) != 1 || entry.Senses[0].Examples[0].Text == "" {
		t.Errorf("значения разобраны неверно: %+v", entry.Senses)
	}
}

// Главная проверка: слова нет — значит нет. Слабые модели вместо отказа
// сочиняют правдоподобное объяснение, и читатель не отличит его от настоящего.
func TestExplainRefusesUnknownWord(t *testing.T) {
	for _, answer := range []string{
		`{"exists":false}`,
		// «Слово есть», но объяснить нечем — показывать пустую карточку нельзя.
		`{"exists":true,"headword":"зорњикав","senses":[]}`,
		`{"exists":true,"headword":"зорњикав","senses":[{"definition":"—"}]}`,
	} {
		server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) {
			answerWith(w, answer)
		}))
		_, err := NewExplainer("key", "model", server.URL, "").
			Explain(context.Background(), "зорњикав")
		server.Close()
		if !errors.Is(err, ErrNotFound) {
			t.Errorf("на %s ожидали «слова нет», получили: %v", answer, err)
		}
	}
}

func TestExplainTrimsLongAnswer(t *testing.T) {
	long := strings.Repeat("а", 900)
	senses := make([]map[string]string, 0, 9)
	for range 9 {
		senses = append(senses, map[string]string{"definition": long})
	}
	payload, _ := json.Marshal(map[string]any{
		"exists": true, "headword": strings.Repeat("б", 200), "senses": senses,
	})
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) {
		answerWith(w, string(payload))
	}))
	defer server.Close()

	entry, err := NewExplainer("key", "model", server.URL, "").
		Explain(context.Background(), "глава")
	if err != nil {
		t.Fatalf("толкование не получено: %v", err)
	}
	if len(entry.Senses) != maxGeneratedSenses {
		t.Errorf("значений %d, ждали не больше %d", len(entry.Senses), maxGeneratedSenses)
	}
	if n := len([]rune(entry.Senses[0].Definition)); n != maxGeneratedDefinition {
		t.Errorf("толкование длиной %d знаков", n)
	}
	if n := len([]rune(entry.Headword)); n > 80 {
		t.Errorf("заглавное слово длиной %d знаков", n)
	}
}

// Размышления вслух стоят втрое дороже ответа, поэтому просьба их сократить
// должна доезжать до провайдера. Модели, которая параметра не знает, он не
// отправляется вовсе.
func TestExplainSendsReasoningEffortOnlyWhenSet(t *testing.T) {
	for _, tc := range []struct{ effort, want string }{{"low", "low"}, {"", ""}} {
		var got string
		server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			var body struct {
				Reasoning *struct {
					Effort string `json:"effort"`
				} `json:"reasoning"`
			}
			_ = json.NewDecoder(r.Body).Decode(&body)
			if body.Reasoning != nil {
				got = body.Reasoning.Effort
			}
			answerWith(w, `{"exists":true,"headword":"кућа","senses":[{"definition":"зграда за становање"}]}`)
		}))
		if _, err := NewExplainer("key", "model", server.URL, tc.effort).
			Explain(context.Background(), "кућа"); err != nil {
			t.Fatalf("толкование не получено: %v", err)
		}
		server.Close()
		if got != tc.want {
			t.Errorf("effort=%q: ушло %q", tc.effort, got)
		}
	}
}

func TestExplainerDisabledWithoutKey(t *testing.T) {
	if NewExplainer("", "model", "https://example.com", "low").Enabled() {
		t.Error("без ключа объяснение должно быть выключено")
	}
}
