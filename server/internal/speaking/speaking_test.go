package speaking

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

func TestCatalog(t *testing.T) {
	c, err := Load()
	if err != nil {
		t.Fatal(err)
	}
	if len(c.Topics) != 150 || len(c.Genres) != 15 {
		t.Fatalf("тем %d, жанров %d", len(c.Topics), len(c.Genres))
	}
	perGenre := map[string]int{}
	for _, topic := range c.Topics {
		perGenre[topic.Genre]++
		if len(topic.Words) != 3 {
			t.Errorf("%s: слов %d", topic.ID, len(topic.Words))
		}
	}
	for genre, n := range perGenre {
		if n != 10 {
			t.Errorf("жанр %s: тем %d", genre, n)
		}
	}
	if topic, ok := c.Topic("politika-01"); !ok || topic.SR == "" {
		t.Fatal("тема по id не находится")
	}
	if _, ok := c.Topic("net-takoj"); ok {
		t.Fatal("несуществующая тема найдена")
	}
}

func TestGenreArt(t *testing.T) {
	c, err := Load()
	if err != nil {
		t.Fatal(err)
	}
	for _, g := range c.Genres {
		if !strings.Contains(g.Art, "<") {
			t.Errorf("%s: нет значка", g.ID)
		}
	}
	for _, bad := range []string{
		`<script>alert(1)</script>`,
		`<path d="M0 0" onload="x()"/>`,
		`<path d="M0 0"onload="x()"/>`,
		`<path xlink:href="#x" d="M0 0"/>`,
		`<image href="https://example.com/x.png"/>`,
		`<a href="javascript:x"><path d="M0 0"/></a>`,
		`<path style="fill:url(#x)" d="M0 0"/>`,
		``,
	} {
		if validArt(bad) == nil {
			t.Errorf("пропущен опасный значок %q", bad)
		}
	}
	if err := validArt(`<path d="M1 1h2"/> <circle cx="3" cy="3" r="1"/>`); err != nil {
		t.Errorf("отклонён простой значок: %v", err)
	}
}

func TestCleanText(t *testing.T) {
	got, err := CleanText("  Ja   volim\n\nBeograd,  to je moj grad. ")
	if err != nil || got != "Ja volim Beograd, to je moj grad." {
		t.Fatalf("%q %v", got, err)
	}
	if _, err := CleanText("Ja volim"); !errors.Is(err, ErrBadText) {
		t.Fatalf("короткий текст принят: %v", err)
	}
	if _, err := CleanText(strings.Repeat("reč ", 2000)); !errors.Is(err, ErrBadText) {
		t.Fatalf("длинный текст принят: %v", err)
	}
}

const sampleText = "Ja volim Beograd jer je on veliki grad i tamo imam prijatelje."

func TestParseReviewKeepsOnlyRealMistakes(t *testing.T) {
	answer := `Вот разбор: {"language":"sr","level":"a2","onTopic":true,"summary":"Хорошо!",
	"strengths":["Связный рассказ"],
	"mistakes":[
	 {"original":"Ja volim Beograd","fixed":"Volim Beograd","kind":"word_order","explanation":"Можно без местоимения."},
	 {"original":"nema takvog","fixed":"x","kind":"case","explanation":"выдумано"},
	 {"original":"grad","fixed":"grad","kind":"case","explanation":"без изменений"},
	 {"original":"tamo imam","fixed":"tamo imam","kind":"nepoznato","explanation":"тот же"},
	 {"original":"veliki grad","fixed":"velik grad","kind":"nepoznato","explanation":"странный вид"}
	],
	"polished":"Volim Beograd.","tips":["Больше говорить"],"words":[{"sr":"prestonica","ru":"столица"}]}`
	review, err := parseReview(answer, sampleText)
	if err != nil {
		t.Fatal(err)
	}
	if review.Level != "A2" {
		t.Errorf("уровень %q", review.Level)
	}
	if len(review.Mistakes) != 2 {
		t.Fatalf("ошибок %d: %+v", len(review.Mistakes), review.Mistakes)
	}
	if review.Mistakes[0].Label != "Порядок слов" {
		t.Errorf("подпись %q", review.Mistakes[0].Label)
	}
	if review.Mistakes[1].Kind != "other" || review.Mistakes[1].Label != "Другое" {
		t.Errorf("неизвестный вид не сведён к other: %+v", review.Mistakes[1])
	}
	if len(review.Words) != 1 || review.Words[0].SR != "prestonica" {
		t.Errorf("слова %+v", review.Words)
	}
}

func TestParseReviewRejects(t *testing.T) {
	if _, err := parseReview(`{"language":"other"}`, sampleText); !errors.Is(err, ErrNotSerbian) {
		t.Errorf("не сербский: %v", err)
	}
	if _, err := parseReview(`не json`, sampleText); !errors.Is(err, ErrBadAnswer) {
		t.Errorf("мусор: %v", err)
	}
	if _, err := parseReview(`{"language":"sr","summary":""}`, sampleText); !errors.Is(err, ErrBadAnswer) {
		t.Errorf("пустой итог: %v", err)
	}
	review, err := parseReview(`{"language":"sr","level":"Z9","summary":"ok"}`, sampleText)
	if err != nil || review.Level != "" || review.Mistakes == nil || review.Words == nil {
		t.Errorf("пустые поля должны быть массивами и без уровня: %+v %v", review, err)
	}
}

func fakeModel(t *testing.T, replies []string, seen *[]string) *httptest.Server {
	t.Helper()
	calls := 0
	return httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		body, _ := io.ReadAll(r.Body)
		if seen != nil {
			*seen = append(*seen, string(body))
		}
		if r.Header.Get("Authorization") != "Bearer key" {
			w.WriteHeader(http.StatusUnauthorized)
			return
		}
		reply := replies[min(calls, len(replies)-1)]
		calls++
		_ = json.NewEncoder(w).Encode(map[string]any{
			"choices": []any{map[string]any{"message": map[string]string{"content": reply}}},
		})
	}))
}

func TestReviewRetriesAndUsesServerTopic(t *testing.T) {
	var seen []string
	server := fakeModel(t, []string{"мусор", `{"language":"sr","summary":"Хорошо","level":"B1"}`}, &seen)
	defer server.Close()
	reviewer := NewReviewer("key", "model", server.URL, "low")
	topic := &Topic{ID: "x", SR: "Tema iz kataloga", RU: "Тема из каталога"}
	review, err := reviewer.Review(context.Background(), topic, sampleText, SourceVoice)
	if err != nil {
		t.Fatal(err)
	}
	if review.Level != "B1" || len(seen) != 2 {
		t.Fatalf("уровень %q, обращений %d", review.Level, len(seen))
	}
	if !strings.Contains(seen[0], "Tema iz kataloga") || !strings.Contains(seen[0], "расшифровк") {
		t.Errorf("в запросе нет темы или пометки о речи: %s", seen[0])
	}
	if !strings.Contains(seen[0], `"effort":"low"`) {
		t.Errorf("не передан reasoning: %s", seen[0])
	}
}

func TestReviewDisabled(t *testing.T) {
	reviewer := NewReviewer("", "", "", "")
	if reviewer.Enabled() {
		t.Fatal("без ключа разбор включён")
	}
	if _, err := reviewer.Review(context.Background(), &Topic{}, sampleText, SourceText); !errors.Is(err, ErrNotConfigured) {
		t.Fatalf("%v", err)
	}
}
