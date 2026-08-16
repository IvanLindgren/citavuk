package api

import (
	"context"
	"encoding/json"
	"errors"
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

// stubExplainer — нейросеть, которую спрашивают, когда словарь не помог.
type stubExplainer struct {
	entry *dictionary.Entry
	err   error
	calls int
}

func (s *stubExplainer) Enabled() bool { return true }

func (s *stubExplainer) Explain(_ context.Context, _ string) (*dictionary.Entry, error) {
	s.calls++
	return s.entry, s.err
}

// stubCache — сохранённые толкования, в памяти вместо базы.
type stubCache struct {
	saved map[string][]byte
}

func (c *stubCache) CachedDefinition(_ context.Context, word string) ([]byte, bool, error) {
	raw, ok := c.saved[word]
	return raw, ok, nil
}

func (c *stubCache) SaveDefinition(_ context.Context, word string, entry []byte, _ string) error {
	if c.saved == nil {
		c.saved = map[string][]byte{}
	}
	c.saved[word] = entry
	return nil
}

func definitionServer(stub *stubDictionary) *Server {
	return &Server{cfg: &config.Config{}, dictionary: stub}
}

func definitionServerWithAI(
	stub *stubDictionary, ai *stubExplainer, cache *stubCache,
) *Server {
	return &Server{cfg: &config.Config{}, dictionary: stub, explainer: ai, definitions: cache}
}

func generatedEntry() *dictionary.Entry {
	return &dictionary.Entry{
		Headword:    "фолѝрант",
		Senses:      []dictionary.Sense{{Definition: "особа која се претвара"}},
		SourceTitle: dictionary.GeneratedSource,
		Generated:   true,
	}
}

func askDefinition(s *Server, word string) *httptest.ResponseRecorder {
	rec := httptest.NewRecorder()
	s.handleDefinition(rec, httptest.NewRequest(
		http.MethodGet, "/v1/definition?word="+word, nil))
	return rec
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

// Словарь Матицы вышел в прошлом веке и разговорных слов не знает. Раньше на
// них карточка просто не появлялась, теперь слово объясняет нейросеть.
func TestDefinitionFallsBackToAI(t *testing.T) {
	ai := &stubExplainer{entry: generatedEntry()}
	rec := askDefinition(
		definitionServerWithAI(&stubDictionary{err: dictionary.ErrNotFound}, ai, &stubCache{}),
		"folirant")

	if rec.Code != http.StatusOK {
		t.Fatalf("код %d, ожидался 200", rec.Code)
	}
	var entry dictionary.Entry
	if err := json.Unmarshal(rec.Body.Bytes(), &entry); err != nil {
		t.Fatalf("ответ не разобрался: %v", err)
	}
	// Без этого признака карточка подпишется словарём, которого не открывали.
	if !entry.Generated || entry.SourceTitle != dictionary.GeneratedSource {
		t.Errorf("толкование не помечено как сочинённое: %+v", entry)
	}
}

// Те самые 502 из журнала: чужой сайт отвалился на несколько секунд. Читателю
// теперь отвечает нейросеть, а не пустая карточка.
func TestDefinitionUsesAIWhenDictionaryIsDown(t *testing.T) {
	ai := &stubExplainer{entry: generatedEntry()}
	rec := askDefinition(
		definitionServerWithAI(&stubDictionary{err: errors.New("нет связи")}, ai, &stubCache{}),
		"folirant")

	if rec.Code != http.StatusOK {
		t.Fatalf("код %d, ожидался 200", rec.Code)
	}
	if ai.calls != 1 {
		t.Errorf("походов к нейросети %d", ai.calls)
	}
}

func TestDefinitionNotFoundWhenNobodyKnowsWord(t *testing.T) {
	rec := askDefinition(definitionServerWithAI(
		&stubDictionary{err: dictionary.ErrNotFound},
		&stubExplainer{err: dictionary.ErrNotFound}, &stubCache{}), "abc")

	if rec.Code != http.StatusNotFound {
		t.Fatalf("код %d, ожидался 404", rec.Code)
	}
}

func TestDefinitionBadGatewayWhenBothFail(t *testing.T) {
	rec := askDefinition(definitionServerWithAI(
		&stubDictionary{err: errors.New("нет связи")},
		&stubExplainer{err: errors.New("нейросеть молчит")}, &stubCache{}), "folirant")

	if rec.Code != http.StatusBadGateway {
		t.Fatalf("код %d, ожидался 502", rec.Code)
	}
}

// За слово платим один раз: и за объяснение, и за ответ «такого слова нет».
func TestDefinitionAnswersFromCache(t *testing.T) {
	cases := []struct {
		name string
		ai   *stubExplainer
		code int
	}{
		{"толкование", &stubExplainer{entry: generatedEntry()}, http.StatusOK},
		{"отказ", &stubExplainer{err: dictionary.ErrNotFound}, http.StatusNotFound},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			server := definitionServerWithAI(
				&stubDictionary{err: dictionary.ErrNotFound}, tc.ai, &stubCache{})
			for i := range 2 {
				if code := askDefinition(server, "folirant").Code; code != tc.code {
					t.Fatalf("запрос %d: код %d, ожидался %d", i+1, code, tc.code)
				}
			}
			if tc.ai.calls != 1 {
				t.Errorf("нейросеть спрошена %d раза вместо одного", tc.ai.calls)
			}
		})
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
