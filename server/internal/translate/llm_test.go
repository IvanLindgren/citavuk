package translate

import (
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
)

type fakeLLM struct {
	calls    []string
	word     string
	sentence string
	err      error
}

func (f *fakeLLM) TranslateInContext(_ context.Context, text, sentence, _, _ string) (string, string, error) {
	f.calls = append(f.calls, text+"|"+sentence)
	if f.err != nil {
		return "", "", f.err
	}
	return f.word, f.sentence, nil
}
func (f *fakeLLM) Name() string { return "llm" }

// Google просит подождать — слово переводит модель, причём в контексте.
func TestLLMRescuesWordWhenGoogleIsRateLimited(t *testing.T) {
	words := &fakeWords{err: ErrRateLimited}
	llm := &fakeLLM{word: "дом", sentence: "Это мой дом."}
	cache := &fakeCache{}
	service := NewService(nil, words, cache)
	service.llm = llm

	result, err := service.InContext(context.Background(), "Ovo je moja kuća.", 13, 18, "sr", "ru")
	if err != nil {
		t.Fatalf("ошибка вместо перевода: %v", err)
	}
	if result.Text != "дом" || result.Provider != "llm" || !result.Aligned || result.Sentence != "Это мой дом." {
		t.Fatalf("result = %+v", result)
	}
	if len(llm.calls) != 1 || !strings.Contains(llm.calls[0], "Ovo je moja kuća.") {
		t.Fatalf("модель не получила предложение: %v", llm.calls)
	}
	if _, ok := cache.data["kuća"]; ok {
		t.Error("перевод по одному контексту попал в общий словарь")
	}
	if cache.data["Ovo je moja kuća."] != "Это мой дом." {
		t.Error("перевод предложения не сохранён")
	}

	// Повтор в кулдауне Google снова идёт в модель, не дёргая Google.
	if _, err := service.InContext(context.Background(), "Ovo je moja kuća.", 13, 18, "sr", "ru"); err != nil {
		t.Fatal(err)
	}
	if len(words.calls) != 1 {
		t.Errorf("Google в кулдауне вызван повторно: %v", words.calls)
	}
}

// Без DeepL и Google фраза всё равно переводится.
func TestLLMTranslatesTextWithoutOtherProviders(t *testing.T) {
	llm := &fakeLLM{word: "добрый день"}
	service := NewService(nil, nil, nil)
	service.llm = llm
	if !service.Available() {
		t.Fatal("сервис с моделью считается недоступным")
	}
	result, err := service.Text(context.Background(), "dobar dan", "sr", "ru")
	if err != nil || result.Text != "добрый день" {
		t.Fatalf("result = %+v, err = %v", result, err)
	}
}

// Модель ответила английским — это не перевод на русский.
func TestLLMAnswerInWrongLanguageIsRejected(t *testing.T) {
	service := NewService(nil, &fakeWords{err: ErrRateLimited}, nil)
	service.llm = &fakeLLM{word: "house"}
	if _, err := service.Text(context.Background(), "kuća", "sr", "ru"); err == nil {
		t.Fatal("английский ответ принят за русский перевод")
	}
}

func TestLLMClientRequestAndAnswer(t *testing.T) {
	var got map[string]any
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		_ = json.NewDecoder(r.Body).Decode(&got)
		_, _ = w.Write([]byte(`{"choices":[{"message":{"content":"{\"translation\":\"дом\",\"sentence\":\"Это мой дом.\"}"}}]}`))
	}))
	defer server.Close()
	word, sentence, err := NewLLM("key", "deepseek/deepseek-v4.1-flash-1017", server.URL).
		TranslateInContext(context.Background(), "kuća", "Ovo je moja kuća.", "sr", "ru")
	if err != nil || word != "дом" || sentence != "Это мой дом." {
		t.Fatalf("word=%q sentence=%q err=%v", word, sentence, err)
	}
	if got["model"] != "deepseek/deepseek-v4.1-flash-1017" {
		t.Errorf("model = %v", got["model"])
	}
	if reasoning, _ := got["reasoning"].(map[string]any); reasoning["effort"] != "none" {
		t.Errorf("reasoning = %v", got["reasoning"])
	}

	limited := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) {
		w.WriteHeader(http.StatusTooManyRequests)
	}))
	defer limited.Close()
	if _, _, err := NewLLM("key", "m", limited.URL).TranslateInContext(context.Background(), "kuća", "", "sr", "ru"); err != ErrRateLimited {
		t.Errorf("429 → %v, want ErrRateLimited", err)
	}
}
