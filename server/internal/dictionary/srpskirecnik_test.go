package dictionary

import (
	"context"
	"errors"
	"net/http"
	"net/http/httptest"
	"strings"
	"sync/atomic"
	"testing"
	"time"
)

// Ответы взяты с настоящего API и урезаны до используемых полей.
const (
	searchJSON = `[{"_id":"69c8","form":{"lemma":"нихилизам","accented_lemma":"нихилѝзам"}}]`
	entryJSON  = `{
      "_id":"69c8",
      "form":{"lemma":"нихилизам","accented_lemma":"нихилѝзам"},
      "accent":"нихилѝзам",
      "gramGrp":{"raw":"м","etymology":"Latin"},
      "source":{"volume":3,"page":796},
      "senses":[{"num":null,"definition":"потпуно одрицање свих друштвених норми",
        "examples":[{"text":"Говор би даље био о нихилизму","source":"Шим."}]}]
    }`
)

func testClient(t *testing.T, handler http.HandlerFunc) *Client {
	t.Helper()
	server := httptest.NewServer(handler)
	t.Cleanup(server.Close)
	client := New(time.Minute)
	client.base = server.URL
	return client
}

func dictionaryHandler(queries *[]string) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		switch {
		case strings.HasPrefix(r.URL.Path, "/api/entries/id/"):
			_, _ = w.Write([]byte(entryJSON))
		case r.URL.Path == "/api/entries":
			query := r.URL.Query().Get("q")
			if queries != nil {
				*queries = append(*queries, query)
			}
			if query == "нихилизам" {
				_, _ = w.Write([]byte(searchJSON))
				return
			}
			_, _ = w.Write([]byte(`[]`))
		default:
			http.NotFound(w, r)
		}
	}
}

// Латиница переводится в кириллицу — на этом держится вся затея: словарь
// ведётся кириллицей, а книги у нас чаще латиницей.
func TestLookupTransliteratesLatin(t *testing.T) {
	var queries []string
	client := testClient(t, dictionaryHandler(&queries))

	entry, err := client.Lookup(context.Background(), "nihilizam")
	if err != nil {
		t.Fatalf("Lookup: %v", err)
	}
	if len(queries) != 1 || queries[0] != "нихилизам" {
		t.Fatalf("в словарь ушло %q, ожидалась кириллица", queries)
	}
	if entry.Headword != "нихилѝзам" {
		t.Errorf("Headword = %q", entry.Headword)
	}
	if entry.Grammar != "м" || entry.Etymology != "Latin" {
		t.Errorf("пометы: %q, %q", entry.Grammar, entry.Etymology)
	}
	if len(entry.Senses) != 1 ||
		entry.Senses[0].Definition != "потпуно одрицање свих друштвених норми" {
		t.Fatalf("значения: %+v", entry.Senses)
	}
	if len(entry.Senses[0].Examples) != 1 ||
		entry.Senses[0].Examples[0].Source != "Шим." {
		t.Errorf("примеры: %+v", entry.Senses[0].Examples)
	}
}

// Начальная форма возвратного глагола у нас идёт с частицей — «vratiti se», —
// а словарь ведёт такие глаголы голыми. Без снятия частицы карточки толкования
// не было бы ни у одного возвратного глагола.
func TestLookupStripsReflexiveParticle(t *testing.T) {
	var queries []string
	client := testClient(t, func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		switch {
		case strings.HasPrefix(r.URL.Path, "/api/entries/id/"):
			_, _ = w.Write([]byte(entryJSON))
		case r.URL.Path == "/api/entries":
			query := r.URL.Query().Get("q")
			queries = append(queries, query)
			if query == "вратити" {
				_, _ = w.Write([]byte(`[{"_id":"1","form":{"lemma":"вратити"}}]`))
				return
			}
			_, _ = w.Write([]byte(`[]`))
		default:
			http.NotFound(w, r)
		}
	})

	if _, err := client.Lookup(context.Background(), "vratiti se"); err != nil {
		t.Fatalf("Lookup: %v", err)
	}
	if len(queries) != 1 || queries[0] != "вратити" {
		t.Fatalf("в словарь ушло %q, ожидалось [вратити]", queries)
	}
}

// Ссылка и название словаря обязаны быть в ответе: статья показывается как
// цитата, и без указания источника её показывать нельзя.
func TestLookupKeepsAttribution(t *testing.T) {
	client := testClient(t, dictionaryHandler(nil))

	entry, err := client.Lookup(context.Background(), "нихилизам")
	if err != nil {
		t.Fatalf("Lookup: %v", err)
	}
	if entry.SourceTitle == "" || entry.Volume != 3 || entry.Page != 796 {
		t.Errorf("источник: %q, том %d, с. %d", entry.SourceTitle, entry.Volume, entry.Page)
	}
	if !strings.HasPrefix(entry.URL, "https://srpskirecnik.com/odrednica/") {
		t.Errorf("ссылка ведёт не на статью: %q", entry.URL)
	}
}

// У «море» в толковании стоит одна буква «с» — помета рода, утёкшая при
// распознавании. Карточка с таким «толкованием» выглядит поломкой.
func TestLookupSkipsMarkerInsteadOfDefinition(t *testing.T) {
	client := testClient(t, func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		switch {
		case strings.HasPrefix(r.URL.Path, "/api/entries/id/"):
			_, _ = w.Write([]byte(`{"_id":"1","form":{"lemma":"море"},
              "senses":[{"definition":"с"}]}`))
		case r.URL.Path == "/api/entries":
			_, _ = w.Write([]byte(`[{"_id":"1","form":{"lemma":"море"}}]`))
		default:
			http.NotFound(w, r)
		}
	})

	if _, err := client.Lookup(context.Background(), "more"); !errors.Is(err, ErrNotFound) {
		t.Fatalf("err = %v, ожидалось ErrNotFound", err)
	}
}

func TestLookupNotFound(t *testing.T) {
	client := testClient(t, dictionaryHandler(nil))

	_, err := client.Lookup(context.Background(), "abrakadabra")
	if !errors.Is(err, ErrNotFound) {
		t.Fatalf("err = %v, ожидалось ErrNotFound", err)
	}
}

// Повтор не должен ходить в сеть — ни за найденным словом, ни за ненайденным.
func TestLookupCaches(t *testing.T) {
	var calls atomic.Int32
	client := testClient(t, func(w http.ResponseWriter, r *http.Request) {
		calls.Add(1)
		dictionaryHandler(nil)(w, r)
	})

	for range 3 {
		if _, err := client.Lookup(context.Background(), "нихилизам"); err != nil {
			t.Fatalf("Lookup: %v", err)
		}
		if _, err := client.Lookup(context.Background(), "abrakadabra"); !errors.Is(err, ErrNotFound) {
			t.Fatalf("err = %v", err)
		}
	}
	// Первый проход: поиск + статья для найденного, поиск для ненайденного.
	if got := calls.Load(); got != 3 {
		t.Errorf("запросов к словарю: %d, ожидалось 3", got)
	}
}

// По «кућа» словарь первой отдаёт статью «Кућа» с большой буквы — брак
// распознавания, куда в заголовок попала строка из цитаты. Нужное слово идёт
// вторым, и брать надо совпадение с точностью до регистра.
func TestLookupPrefersExactCase(t *testing.T) {
	var asked string
	client := testClient(t, func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		switch {
		case strings.HasPrefix(r.URL.Path, "/api/entries/id/"):
			asked = strings.TrimPrefix(r.URL.Path, "/api/entries/id/")
			_, _ = w.Write([]byte(entryJSON))
		case r.URL.Path == "/api/entries":
			_, _ = w.Write([]byte(`[
              {"_id":"ocr","form":{"lemma":"Кућа"}},
              {"_id":"real","form":{"lemma":"кућа"}}
            ]`))
		default:
			http.NotFound(w, r)
		}
	})

	if _, err := client.Lookup(context.Background(), "kuća"); err != nil {
		t.Fatalf("Lookup: %v", err)
	}
	if asked != "real" {
		t.Errorf("взята статья %q, ожидалась строчная «кућа»", asked)
	}
}

// Поиск отвечает и на близкие слова; брать «нихилист» вместо «нихилизам» нельзя.
func TestLookupIgnoresInexactMatch(t *testing.T) {
	client := testClient(t, func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		if r.URL.Path == "/api/entries" {
			_, _ = w.Write([]byte(`[{"_id":"1","form":{"lemma":"нихилист"}}]`))
			return
		}
		http.NotFound(w, r)
	})

	if _, err := client.Lookup(context.Background(), "нихилизам"); !errors.Is(err, ErrNotFound) {
		t.Fatalf("err = %v, ожидалось ErrNotFound", err)
	}
}
