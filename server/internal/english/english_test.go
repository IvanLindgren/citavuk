package english

import "testing"

// Правила разбора обязаны совпадать с приложением
// (`frontend/lib/services/english_engine.dart` и его тестами): словарь один и
// тот же файл, и для одного слова сайт и приложение не должны показывать
// разную начальную форму.

func lexiconFor(t *testing.T) *Lexicon {
	t.Helper()
	l, err := Shared()
	if err != nil {
		t.Fatalf("словарь не загрузился: %v", err)
	}
	return l
}

func TestLemma(t *testing.T) {
	l := lexiconFor(t)
	cases := map[string]string{
		"book": "NOUN",
		"the":  "DET",
		"of":   "ADP",
		"you":  "PRON",
		"and":  "CONJ",
	}
	for word, upos := range cases {
		got := l.Analyze(word)
		if got == nil {
			t.Fatalf("%q: разбор не получен", word)
		}
		if got.Lemma != word {
			t.Errorf("%q: лемма %q, ожидалась %q", word, got.Lemma, word)
		}
		if got.UPOS != upos {
			t.Errorf("%q: часть речи %q, ожидалась %q", word, got.UPOS, upos)
		}
		if got.FormKind != KindLemma {
			t.Errorf("%q: вид формы %q, ожидался %q", word, got.FormKind, KindLemma)
		}
	}
}

func TestModalVerbs(t *testing.T) {
	l := lexiconFor(t)
	// WordNet модальных не описывает — они добираются из корпуса. Без них не
	// разобрать ни одного составного времени.
	for _, word := range []string{"would", "should", "could", "shall", "does", "is"} {
		if l.Analyze(word) == nil {
			t.Errorf("%q: разбор не получен", word)
		}
	}
}

func TestIndefinitePronouns(t *testing.T) {
	l := lexiconFor(t)
	// WordNet их не описывает — они добираются из корпуса. Без этого шага
	// «everyone» не считался бы английским словом вовсе.
	words := []string{
		"everyone", "everybody", "everything",
		"anyone", "anybody", "anything",
		"something", "someone",
	}
	for _, word := range words {
		if l.Analyze(word) == nil {
			t.Errorf("%q: разбор не получен", word)
		}
	}
}

func TestCorpusBackfillKeepsForms(t *testing.T) {
	l := lexiconFor(t)
	// Корпус метит «states» существительным, но это множественное от «state»,
	// и добор из корпуса не должен превращать формы в отдельные леммы.
	cases := map[string]string{
		"states":   "state",
		"members":  "member",
		"problems": "problem",
		"schools":  "school",
	}
	for form, lemma := range cases {
		got := l.Analyze(form)
		if got == nil {
			t.Fatalf("%q: разбор не получен", form)
		}
		if got.Lemma != lemma {
			t.Errorf("%q: лемма %q, ожидалась %q", form, got.Lemma, lemma)
		}
	}
}

func TestRegularForms(t *testing.T) {
	l := lexiconFor(t)
	cases := []struct{ form, lemma, label string }{
		{"books", "book", "мн. ч."},
		{"cities", "city", "мн. ч."},
		{"boxes", "box", "мн. ч."},
		{"watches", "watch", "мн. ч."},
		{"making", "make", "форма -ing"},
		{"running", "run", ""},
		{"stopped", "stop", ""},
		{"studied", "study", ""},
		{"walked", "walk", "прош. вр."},
		{"reading", "read", "форма -ing"},
		{"smaller", "small", "сравн. степень"},
		{"smallest", "small", "превосх. степень"},
		{"quickly", "quick", "наречие"},
	}
	for _, c := range cases {
		got := l.Analyze(c.form)
		if got == nil {
			t.Fatalf("%q: разбор не получен", c.form)
		}
		if got.Lemma != c.lemma {
			t.Errorf("%q: лемма %q, ожидалась %q", c.form, got.Lemma, c.lemma)
		}
		if c.label != "" && got.FormLabel != c.label {
			t.Errorf("%q: форма %q, ожидалась %q", c.form, got.FormLabel, c.label)
		}
	}
}

func TestIrregularForms(t *testing.T) {
	l := lexiconFor(t)
	cases := map[string]string{
		"children": "child",
		"mice":     "mouse",
		"feet":     "foot",
		"ran":      "run",
		"went":     "go",
		"was":      "be",
		"are":      "be",
		"better":   "good",
		"best":     "good",
	}
	for form, lemma := range cases {
		got := l.Analyze(form)
		if got == nil {
			t.Fatalf("%q: разбор не получен", form)
		}
		if got.Lemma != lemma {
			t.Errorf("%q: лемма %q, ожидалась %q", form, got.Lemma, lemma)
		}
	}
}

func TestHomographIsFlagged(t *testing.T) {
	l := lexiconFor(t)
	// «saw» — и прошедшее от «see», и существительное «пила».
	got := l.Analyze("saw")
	if got == nil {
		t.Fatal("разбор не получен")
	}
	if got.Lemma != "see" {
		t.Errorf("лемма %q, ожидалась see", got.Lemma)
	}
	if !got.AlsoLemma {
		t.Error("омоним не отмечен: карточка выдаст разбор за единственно верный")
	}
}

func TestFormOrLemma(t *testing.T) {
	l := lexiconFor(t)
	// «news» не множественное от «new», «always» не форма «alway».
	for _, word := range []string{"news", "always"} {
		got := l.Analyze(word)
		if got == nil {
			t.Fatalf("%q: разбор не получен", word)
		}
		if got.Lemma != word {
			t.Errorf("%q: лемма %q, ожидалась %q", word, got.Lemma, word)
		}
	}
}

func TestNotEnglish(t *testing.T) {
	l := lexiconFor(t)
	for _, word := range []string{"kuća", "džep", "šuma", "књига", "книга", "", "123"} {
		if got := l.Analyze(word); got != nil {
			t.Errorf("%q: разобрано как английское (%q)", word, got.Lemma)
		}
	}
}

func TestOrthography(t *testing.T) {
	for _, word := range []string{"think", "what", "black", "phone", "night"} {
		if !HasEnglishOrthography(word) {
			t.Errorf("%q: английская орфография не опознана", word)
		}
	}
	// Сербская латиница таких сочетаний не даёт.
	for _, word := range []string{"kuca", "dobar", "raditi", "covek", "ulica"} {
		if HasEnglishOrthography(word) {
			t.Errorf("%q: ложное срабатывание", word)
		}
	}
}

func TestIsEnglishUsesSentence(t *testing.T) {
	l := lexiconFor(t)
	// Сербский словарь знает эти слова — как в настоящем лексиконе.
	serbian := map[string]bool{
		"on": true, "je": true, "to": true, "most": true, "sam": true,
		"list": true, "bar": true, "no": true, "dosao": true,
	}
	known := func(w string) bool { return serbian[w] }

	tests := []struct {
		name     string
		word     string
		sentence string
		want     bool
	}{
		{"сербская фраза", "on", "on je dosao", false},
		{"английская фраза", "on", "the book is on the table", true},
		{"сербское слово в сербской фразе", "most", "most je star", false},
		{"английская орфография решает сама", "think", "i think so", true},
		{"сербское слово без фразы", "sam", "", false},
		{"английское слово без фразы", "book", "", true},
	}
	for _, tc := range tests {
		t.Run(tc.name, func(t *testing.T) {
			if got := l.IsEnglish(tc.word, tc.sentence, known); got != tc.want {
				t.Errorf("IsEnglish(%q, %q) = %v, ожидалось %v",
					tc.word, tc.sentence, got, tc.want)
			}
		})
	}
}
