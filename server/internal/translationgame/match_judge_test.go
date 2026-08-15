package translationgame

import (
	"context"
	"encoding/json"
	"errors"
	"io"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
)

func matchEntries() []MatchEntry {
	return []MatchEntry{{
		Source: "Danas je hladno, ali sunčano.",
		Answers: []MatchAnswer{
			{Ref: "a1", Text: "Сегодня холодно, но солнечно."},
			{Ref: "b2", Text: "Сегодня холодный, но солнечный."},
		},
	}}
}

func TestMatchEntriesAreChecked(t *testing.T) {
	single := matchEntries()
	single[0].Answers = single[0].Answers[:1]

	empty := matchEntries()
	empty[0].Answers[1].Text = "   "

	twins := matchEntries()
	twins[0].Answers[1].Ref = twins[0].Answers[0].Ref

	cases := map[string][]MatchEntry{
		"без фраз":            {},
		"один перевод":        single,
		"пустой перевод":      empty,
		"метки повторяются":   twins,
		"фраза без исходника": {{Source: " ", Answers: matchEntries()[0].Answers}},
	}
	for name, entries := range cases {
		t.Run(name, func(t *testing.T) {
			if err := validateMatchEntries(entries); !errors.Is(err, ErrInvalidEntries) {
				t.Fatalf("проверка пропустила такой набор: %v", err)
			}
		})
	}
	if err := validateMatchEntries(matchEntries()); err != nil {
		t.Fatalf("годный набор не прошёл: %v", err)
	}
}

func TestParseMatchResultRejectsStrangeAnswers(t *testing.T) {
	entries := matchEntries()
	cases := map[string]string{
		"не JSON":            "судья задумался",
		"нет вердиктов":      `{"verdicts":[]}`,
		"чужая метка":        `{"verdicts":[{"index":0,"best":["c3"],"scores":{"a1":8}}]}`,
		"оценка вне шкалы":   `{"verdicts":[{"index":0,"best":["a1"],"scores":{"a1":42}}]}`,
		"оценка чужой метке": `{"verdicts":[{"index":0,"best":["a1"],"scores":{"c3":8}}]}`,
		"нет лучшего":        `{"verdicts":[{"index":0,"best":[],"scores":{"a1":8}}]}`,
		"метка дважды":       `{"verdicts":[{"index":0,"best":["a1","a1"],"scores":{"a1":8}}]}`,
		"фраза не та":        `{"verdicts":[{"index":3,"best":["a1"],"scores":{"a1":8}}]}`,
	}
	for name, content := range cases {
		t.Run(name, func(t *testing.T) {
			if _, err := parseMatchResult(content, entries); !errors.Is(err, ErrBadAnswer) {
				t.Fatalf("разбор принял такой ответ: %v", err)
			}
		})
	}
}

func TestParseMatchResultKeepsTieAndTrimsFeedback(t *testing.T) {
	entries := matchEntries()
	long := strings.Repeat("я", 400)
	content := `{"verdicts":[{"index":0,"best":["a1","b2"],"scores":{"a1":8,"b2":8},
        "feedback":"` + long + `"}],"summary":"Ничья"}`

	result, err := parseMatchResult(content, entries)
	if err != nil {
		t.Fatalf("годный ответ не разобрался: %v", err)
	}
	if len(result.Verdicts[0].Best) != 2 {
		t.Fatalf("равенство потерялось: %+v", result.Verdicts[0])
	}
	if got := len([]rune(result.Verdicts[0].Feedback)); got != 300 {
		t.Fatalf("объяснение длиной %d знаков", got)
	}
}

func TestEvaluateMatchHidesAuthorsFromJudge(t *testing.T) {
	var sent string
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		body, _ := io.ReadAll(r.Body)
		sent = string(body)
		answer := map[string]any{"choices": []map[string]any{{"message": map[string]string{
			"content": `{"verdicts":[{"index":0,"best":["a1"],"scores":{"a1":9,"b2":6},
                "feedback":"Второй перевод путает род."}],"summary":"Раунд взял первый."}`,
		}}}}
		json.NewEncoder(w).Encode(answer)
	}))
	defer server.Close()

	judge := NewJudge("key", "gemma", server.URL)
	entries := matchEntries()
	result, err := judge.EvaluateMatch(context.Background(), entries, DirectionSrRu)
	if err != nil {
		t.Fatalf("судья не ответил: %v", err)
	}
	if len(result.Verdicts[0].Best) != 1 || result.Verdicts[0].Best[0] != "a1" {
		t.Fatalf("победитель разобран неверно: %+v", result.Verdicts[0])
	}
	// В запрос уходят метки и тексты — ни имён игроков, ни признака машины.
	for _, leak := range []string{"deepl", "DeepL", "google", "machine", "player"} {
		if strings.Contains(sent, leak) {
			t.Fatalf("судье видно %q: %s", leak, sent)
		}
	}
}

func TestEvaluateMatchNeedsConfiguredJudge(t *testing.T) {
	judge := NewJudge("", "", "")
	if _, err := judge.EvaluateMatch(context.Background(), matchEntries(), DirectionSrRu); !errors.Is(err, ErrNotConfigured) {
		t.Fatalf("ненастроенный судья ответил: %v", err)
	}
}
