package api

import (
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/citavuk/server/internal/config"
	"github.com/citavuk/server/internal/dictionary"
)

type stubDictionary struct {
	entry *dictionary.Entry
	err   error
	asked string
}

func (s *stubDictionary) Lookup(_ context.Context, word string) (*dictionary.Entry, error) {
	s.asked = word
	return s.entry, s.err
}

func definitionServer(stub *stubDictionary) *Server {
	return &Server{cfg: &config.Config{}, dictionary: stub}
}

func TestHandleDefinitionReturnsEntry(t *testing.T) {
	stub := &stubDictionary{entry: &dictionary.Entry{
		Headword:    "нихилѝзам",
		Grammar:     "м",
		Senses:      []dictionary.Sense{{Definition: "потпуно одрицање"}},
		SourceTitle: "Речник српскохрватскога књижевног језика",
		URL:         "https://srpskirecnik.com/odrednica/нихилизам/69c8",
	}}
	rec := httptest.NewRecorder()
	definitionServer(stub).handleDefinition(
		rec, httptest.NewRequest(http.MethodGet, "/v1/definition?word=nihilizam", nil))

	if rec.Code != http.StatusOK {
		t.Fatalf("код %d", rec.Code)
	}
	if stub.asked != "nihilizam" {
		t.Errorf("в словарь ушло %q", stub.asked)
	}
	var entry dictionary.Entry
	if err := json.Unmarshal(rec.Body.Bytes(), &entry); err != nil {
		t.Fatalf("ответ не разобрался: %v", err)
	}
	// Источник обязан доехать до клиента: без него карточку показывать нельзя.
	if entry.SourceTitle == "" || entry.URL == "" {
		t.Errorf("источник потерялся: %+v", entry)
	}
}

// Отсутствие слова — это 404, а не ошибка сервера: толковый словарь знает
// далеко не всё, и клиент по этому коду просто не показывает карточку.
func TestHandleDefinitionNotFound(t *testing.T) {
	stub := &stubDictionary{err: dictionary.ErrNotFound}
	rec := httptest.NewRecorder()
	definitionServer(stub).handleDefinition(
		rec, httptest.NewRequest(http.MethodGet, "/v1/definition?word=abc", nil))

	if rec.Code != http.StatusNotFound {
		t.Fatalf("код %d, ожидался 404", rec.Code)
	}
}

func TestHandleDefinitionRejectsBadInput(t *testing.T) {
	long := ""
	for range 65 {
		long += "а"
	}
	for _, query := range []string{"", "word=", "word=%20%20%20", "word=" + long} {
		stub := &stubDictionary{}
		rec := httptest.NewRecorder()
		definitionServer(stub).handleDefinition(
			rec, httptest.NewRequest(http.MethodGet, "/v1/definition?"+query, nil))

		if rec.Code != http.StatusBadRequest {
			t.Errorf("%q: код %d, ожидался 400", query, rec.Code)
		}
		if stub.asked != "" {
			t.Errorf("%q: запрос всё же ушёл в словарь", query)
		}
	}
}
