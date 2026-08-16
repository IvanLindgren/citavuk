package api

import (
	"context"
	"encoding/json"
	"errors"
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/citavuk/server/internal/config"
	"github.com/citavuk/server/internal/formhint"
)

// Пары «подсказка модели → форма из текста» взяты из живого прогона
// TestLiveGuess: именно так модель отвечает на слова, которых нет в лексиконе.
// Здесь проверяется вторая половина — сойдётся ли догадка с грамматикой.
func TestVerifyHintAcceptsRealForms(t *testing.T) {
	cases := []struct {
		form  string
		hint  formhint.Hint
		feats map[string]string
	}{
		{"kućicama", formhint.Hint{Lemma: "kućica", UPOS: "NOUN", Gender: "Fem"},
			map[string]string{"Case": "Dat", "Number": "Plur"}},
		{"pozorišnom", formhint.Hint{Lemma: "pozorišni", UPOS: "ADJ"},
			map[string]string{"Case": "Dat", "Number": "Sing", "Gender": "Masc"}},
		{"šljakerima", formhint.Hint{Lemma: "šljaker", UPOS: "NOUN", Gender: "Masc"},
			map[string]string{"Case": "Dat", "Number": "Plur"}},
		{"izguglao", formhint.Hint{Lemma: "izguglati", UPOS: "VERB"},
			map[string]string{"VerbForm": "Part", "Tense": "Past", "Gender": "Masc"}},
	}
	for _, tc := range cases {
		reading := verifyHint(&tc.hint, tc.form)
		if reading == nil {
			t.Errorf("%s: разбор не сошёлся с движком", tc.form)
			continue
		}
		if reading.Lemma != tc.hint.Lemma || reading.UPOS != tc.hint.UPOS {
			t.Errorf("%s: разобрано как %s (%s)", tc.form, reading.Lemma, reading.UPOS)
		}
		for key, want := range tc.feats {
			if reading.Feats[key] != want {
				t.Errorf("%s: %s = %q, ожидалось %q — всё разбор: %v",
					tc.form, key, reading.Feats[key], want, reading.Feats)
			}
		}
	}
}

// Ради этого всё и затевалось: подсказка принимается, только если парадигма от
// неё даёт разбираемую форму. Модель, назвавшая правдоподобную, но чужую
// начальную форму, не должна попасть в карточку.
func TestVerifyHintRejectsWrongGuess(t *testing.T) {
	cases := []struct {
		name string
		form string
		hint formhint.Hint
	}{
		{"чужая лемма", "kućicama", formhint.Hint{Lemma: "kuća", UPOS: "NOUN", Gender: "Fem"}},
		{"не та часть речи", "kućicama", formhint.Hint{Lemma: "kućica", UPOS: "VERB"}},
		{"выдуманный глагол", "trčao", formhint.Hint{Lemma: "trčkarati", UPOS: "VERB"}},
		{"наречие не совпало с формой", "brzo", formhint.Hint{Lemma: "brz", UPOS: "ADV"}},
		{"часть речи вне проверяемых", "i", formhint.Hint{Lemma: "i", UPOS: "CCONJ"}},
	}
	for _, tc := range cases {
		if reading := verifyHint(&tc.hint, tc.form); reading != nil {
			t.Errorf("%s: принято %+v", tc.name, reading)
		}
	}
}

type stubHinter struct {
	hint  *formhint.Hint
	err   error
	calls int
}

func (s *stubHinter) Enabled() bool { return true }

func (s *stubHinter) Guess(_ context.Context, _ string) (*formhint.Hint, error) {
	s.calls++
	if s.err != nil {
		return nil, s.err
	}
	return s.hint, nil
}

type stubHintCache struct {
	saved map[string][]byte
}

func (c *stubHintCache) CachedFormHint(_ context.Context, form string) ([]byte, bool, error) {
	raw, ok := c.saved[form]
	return raw, ok, nil
}

func (c *stubHintCache) SaveFormHint(_ context.Context, form string, reading []byte, _ string) error {
	if c.saved == nil {
		c.saved = map[string][]byte{}
	}
	c.saved[form] = reading
	return nil
}

func hintServer(hinter *stubHinter, cache *stubHintCache) *Server {
	return &Server{cfg: &config.Config{}, formHint: hinter, formHints: cache}
}

func analyzeWord(t *testing.T, s *Server, word string) analyzeResponse {
	t.Helper()
	lex := testLexicon(t)
	res := analyze(lex, word)
	if res.Known {
		t.Fatalf("%q неожиданно нашлось в лексиконе — тест потерял смысл", word)
	}
	s.applyFormHint(httptest.NewRequest(http.MethodPost, "/v1/analyze", nil), lex, &res, word)
	return res
}

func TestAnalyzeUsesHintForUnknownForm(t *testing.T) {
	hinter := &stubHinter{hint: &formhint.Hint{Lemma: "šljaker", UPOS: "NOUN", Gender: "Masc"}}
	res := analyzeWord(t, hintServer(hinter, &stubHintCache{}), "šljakerima")

	if !res.Known {
		t.Fatal("разбор так и не собрался")
	}
	// Пометка обязательна: за таким разбором не стоит словарная статья.
	if !res.Generated {
		t.Error("разбор не помечен как подсказанный нейросетью")
	}
	if res.Lemma != "šljaker" || res.UPOS != "NOUN" {
		t.Errorf("начальная форма %q (%s)", res.Lemma, res.UPOS)
	}
	if res.Feats["Case"] == "" {
		t.Error("падеж не определён движком")
	}
	// Ради этого всё и делалось: у слова появляется склонение.
	if len(res.Paradigms) == 0 {
		t.Error("таблицы не построены")
	}
	if res.PosFull == "" || res.Summary == "" {
		t.Error("разбор не описан словами")
	}
}

// Подсказка, не прошедшая проверку, не должна ничего менять: лучше честное
// «разбора нет», чем выдуманный падеж.
func TestAnalyzeKeepsSilenceWhenHintFails(t *testing.T) {
	hinter := &stubHinter{hint: &formhint.Hint{Lemma: "šljaka", UPOS: "NOUN", Gender: "Fem"}}
	res := analyzeWord(t, hintServer(hinter, &stubHintCache{}), "šljakerima")

	if res.Known || res.Generated {
		t.Fatalf("непроверенный разбор попал в ответ: %+v", res)
	}
}

func TestAnalyzeAsksModelOncePerForm(t *testing.T) {
	cases := []struct {
		name    string
		hinter  *stubHinter
		wantHit bool
	}{
		{"разбор", &stubHinter{hint: &formhint.Hint{
			Lemma: "šljaker", UPOS: "NOUN", Gender: "Masc"}}, true},
		{"отказ", &stubHinter{err: formhint.ErrNoHint}, false},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			server := hintServer(tc.hinter, &stubHintCache{})
			for i := range 2 {
				res := analyzeWord(t, server, "šljakerima")
				if res.Known != tc.wantHit {
					t.Fatalf("запрос %d: known = %v", i+1, res.Known)
				}
			}
			if tc.hinter.calls != 1 {
				t.Errorf("модель спрошена %d раза вместо одного", tc.hinter.calls)
			}
		})
	}
}

// Обрыв связи кешировать нельзя: он проходит сам, а запомненный отказ остался
// бы навсегда.
func TestAnalyzeDoesNotCacheNetworkFailure(t *testing.T) {
	hinter := &stubHinter{err: errors.New("нет связи")}
	cache := &stubHintCache{}
	server := hintServer(hinter, cache)

	analyzeWord(t, server, "šljakerima")
	if len(cache.saved) != 0 {
		t.Fatalf("сбой связи попал в кеш: %v", cache.saved)
	}
	analyzeWord(t, server, "šljakerima")
	if hinter.calls != 2 {
		t.Errorf("после сбоя модель спрошена %d раз", hinter.calls)
	}
}

// Мусор к модели уходить не должен: разбор открыт без входа, и перебор
// случайных строк не может стоить нам денег.
func TestAnalyzeSkipsNonWords(t *testing.T) {
	for _, word := range []string{"12345", "a", "!!!", "слово123"} {
		hinter := &stubHinter{hint: &formhint.Hint{Lemma: "šljaker", UPOS: "NOUN"}}
		lex := testLexicon(t)
		res := analyze(lex, word)
		hintServer(hinter, &stubHintCache{}).applyFormHint(
			httptest.NewRequest(http.MethodPost, "/v1/analyze", nil), lex, &res, word)
		if hinter.calls != 0 {
			t.Errorf("%q ушло к модели", word)
		}
	}
}

// Разбор из кеша обязан быть таким же, как свежий: клиенты одинаковы для обоих.
func TestCachedHintRestoresSameReading(t *testing.T) {
	reading := storedReading{
		Lemma: "šljaker", UPOS: "NOUN",
		Feats: map[string]string{"Case": "Dat", "Number": "Plur", "Gender": "Masc"},
	}
	raw, err := json.Marshal(reading)
	if err != nil {
		t.Fatal(err)
	}
	hinter := &stubHinter{}
	server := hintServer(hinter, &stubHintCache{saved: map[string][]byte{"šljakerima": raw}})

	res := analyzeWord(t, server, "šljakerima")
	if !res.Known || !res.Generated || res.Feats["Case"] != "Dat" {
		t.Fatalf("из кеша собрался другой разбор: %+v", res)
	}
	if hinter.calls != 0 {
		t.Error("модель спрошена, хотя разбор лежал в базе")
	}
}
