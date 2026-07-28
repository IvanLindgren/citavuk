package api

import (
	"strings"
	"testing"

	"github.com/citavuk/server/internal/lexicon"
)

func testLexicon(t *testing.T) *lexicon.Lexicon {
	t.Helper()
	lex, err := lexicon.Shared()
	if err != nil {
		t.Fatalf("лексикон не загрузился: %v", err)
	}
	return lex
}

func TestAnalyzeNoun(t *testing.T) {
	res := analyze(testLexicon(t), "zakonom")

	if !res.Known {
		t.Fatal("«zakonom» должно быть в словаре")
	}
	if res.Lemma != "zakon" {
		t.Errorf("лемма = %q, ожидалась «zakon»", res.Lemma)
	}
	if res.UPOS != "NOUN" {
		t.Errorf("часть речи = %q, ожидалось NOUN", res.UPOS)
	}
	if res.Feats["Case"] != "Ins" {
		t.Errorf("падеж = %q, ожидался Ins", res.Feats["Case"])
	}
	if res.PosFull != "существительное" {
		t.Errorf("название части речи = %q", res.PosFull)
	}
	if !strings.Contains(res.Why, "творительный") {
		t.Errorf("объяснение не называет падеж: %q", res.Why)
	}
	if len(res.Paradigms) == 0 {
		t.Fatal("склонение не построено")
	}
}

// Лексикон разрежен — на лемму приходится пара форм, поэтому пустые клетки
// таблицы должны достраиваться правилами, иначе склонение бесполезно.
func TestAnalyzeFillsParadigmGaps(t *testing.T) {
	res := analyze(testLexicon(t), "kuća")

	if len(res.Paradigms) == 0 {
		t.Fatal("склонение не построено")
	}
	forms := map[string]string{}
	for _, row := range res.Paradigms[0].Rows {
		forms[row.CaseKey] = row.Form
	}
	if forms["Nom"] != "kuća" {
		t.Errorf("именительный = %q, ожидалось «kuća»", forms["Nom"])
	}
	if forms["Ins"] != "kućom" {
		t.Errorf("творительный = %q, ожидалось «kućom» (достроенное)", forms["Ins"])
	}
	if forms["Dat"] != "kući" {
		t.Errorf("дательный = %q, ожидалось «kući»", forms["Dat"])
	}
	for key, form := range forms {
		if form == "—" {
			t.Errorf("падеж %s остался пустым", key)
		}
	}
}

// Кириллица и латиница — одно и то же слово: книги встречаются в обоих письмах.
func TestAnalyzeCyrillic(t *testing.T) {
	latin := analyze(testLexicon(t), "kuća")
	cyrillic := analyze(testLexicon(t), "кућа")

	if cyrillic.Lemma != latin.Lemma || cyrillic.UPOS != latin.UPOS {
		t.Errorf("кириллица разобрана иначе: %+v против %+v", cyrillic, latin)
	}
}

func TestAnalyzeVerbParadigm(t *testing.T) {
	res := analyze(testLexicon(t), "radim")

	if res.UPOS != "VERB" {
		t.Fatalf("часть речи = %q, ожидалось VERB", res.UPOS)
	}
	titles := make([]string, 0, len(res.Paradigms))
	for _, table := range res.Paradigms {
		titles = append(titles, table.Title)
	}
	if len(titles) == 0 {
		t.Fatal("спряжение не построено")
	}
	if !strings.Contains(strings.Join(titles, "|"), "Презент") {
		t.Errorf("нет таблицы презента, есть: %v", titles)
	}
}

// Предлог должен объяснять падеж, а не спрягаться как глагол.
func TestAnalyzePreposition(t *testing.T) {
	res := analyze(testLexicon(t), "iz")

	if len(res.Prepositions) == 0 {
		t.Fatal("управление предлога не определено")
	}
	if res.Prepositions[0].CaseKey != "Gen" {
		t.Errorf("падеж = %q, ожидался Gen", res.Prepositions[0].CaseKey)
	}
}

func TestAnalyzeUnknownWord(t *testing.T) {
	res := analyze(testLexicon(t), "zzzqqq")

	if res.Known {
		t.Error("несуществующее слово помечено известным")
	}
	if res.PosFull == "" || res.Why == "" {
		t.Error("для неизвестного слова нет ни части речи, ни объяснения")
	}
}

// Формы, которых нет в разреженном словаре, должны опознаваться достраиванием.
func TestAnalyzeResolvesMissingForm(t *testing.T) {
	res := analyze(testLexicon(t), "kućom")

	if !res.Known {
		t.Fatal("«kućom» не опознано")
	}
	if res.Lemma != "kuća" {
		t.Errorf("лемма = %q, ожидалась «kuća»", res.Lemma)
	}
	if res.Feats["Case"] != "Ins" {
		t.Errorf("падеж = %q, ожидался Ins", res.Feats["Case"])
	}
	if res.Translation != "дом" {
		t.Errorf("перевод = %q, ожидался «дом»", res.Translation)
	}
}
