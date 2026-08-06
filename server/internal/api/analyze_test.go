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

// «se» — самая частая частица сербского, и в словаре она есть ещё и строкой
// имени собственного. Без учёта регистра разбор выдавал «имя собственное,
// именительный падеж» — уверенную чепуху на слове, которое видно в каждом
// втором предложении.
func TestAnalyzeSeIsReflexivePronoun(t *testing.T) {
	res := analyze(testLexicon(t), "se")

	if res.UPOS == "PROPN" {
		t.Fatalf("«se» разобрано как имя собственное: %+v", res.Feats)
	}
	if res.Lemma != "sebe" {
		t.Errorf("лемма = %q, ожидалась «sebe»", res.Lemma)
	}
}

// Глагол с частицей: клиент присылает границы слова, сервер отвечает разбором
// пары «zove se» вместе с объяснением места клитики.
func TestReflexiveOfAttachesParticle(t *testing.T) {
	const sentence = "On se zove Marko."
	res := analyze(testLexicon(t), "zove")
	start := strings.Index(sentence, "zove")

	got := reflexiveOf(testLexicon(t), &res, "zove", sentence, start, start+len("zove"))
	if got == nil {
		t.Fatal("частица не найдена")
	}
	if got.Phrase != "zove se" {
		t.Errorf("фраза = %q, ожидалась «zove se»", got.Phrase)
	}
	if !got.Before || !got.Adjacent {
		t.Errorf("ожидалась частица вплотную слева: %+v", got)
	}
}

// Существительное рядом с «se» возвратным не становится: в «kuća se prodaje»
// частица относится к глаголу, а не к дому.
func TestReflexiveOfSkipsNouns(t *testing.T) {
	const sentence = "Kuća se prodaje."
	res := analyze(testLexicon(t), "kuća")
	if got := reflexiveOf(testLexicon(t), &res, "kuća", sentence, 0, len("Kuća")); got != nil {
		t.Fatalf("частица приписана существительному: %+v", got)
	}
}

// Границы слова необязательны: старый клиент их не шлёт, и разбор всё равно
// обязан находить частицу.
func TestReflexiveOfWithoutOffsets(t *testing.T) {
	const sentence = "On se zove Marko."
	res := analyze(testLexicon(t), "zove")
	if got := reflexiveOf(testLexicon(t), &res, "zove", sentence, 0, 0); got == nil {
		t.Fatal("без смещений частица потеряна")
	}
}

// Перевод спрашивается о паре «se zove», а не об одном «zove»: отдельно это
// «зовёт», вместе — «называется».
func TestWithSeParticleExtendsRange(t *testing.T) {
	const sentence = "On se zove Marko."
	start := strings.Index(sentence, "zove")
	gotStart, gotEnd := withSeParticle(sentence, start, start+len("zove"), "sr")
	if sentence[gotStart:gotEnd] != "se zove" {
		t.Errorf("помечено %q, ожидалось «se zove»", sentence[gotStart:gotEnd])
	}
}

func TestWithSeParticleLeavesOtherLanguages(t *testing.T) {
	const sentence = "He se zove Marko."
	start := strings.Index(sentence, "zove")
	gotStart, gotEnd := withSeParticle(sentence, start, start+len("zove"), "en")
	if gotStart != start || gotEnd != start+len("zove") {
		t.Error("границы изменены для несербского исходного языка")
	}
}

// «Bližila se ponoć» — первое попавшееся предложение из книги. Глагола
// «bližiti» в своём лексиконе нет вовсе, и без списка глагольных форм из
// Викисловаря частица не находила своего глагола.
func TestReflexiveOfUsesWiktionaryVerbs(t *testing.T) {
	const sentence = "Bližila se ponoć, a on je ležao na krevetu."
	lex := testLexicon(t)
	res := analyze(lex, "Bližila")

	got := reflexiveOf(lex, &res, "Bližila", sentence, 0, len("Bližila"))
	if got == nil {
		t.Fatal("частица не найдена")
	}
	if got.Phrase != "Bližila se" {
		t.Errorf("фраза = %q, ожидалась «Bližila se»", got.Phrase)
	}
	if res.Lemma != "bližiti" {
		t.Errorf("начальная форма = %q, ожидалась «bližiti»", res.Lemma)
	}
}

// Нажатие по самой частице ведёт к её глаголу: отдельно «se» разбирается как
// местоимение «sebe» и переводится случайным словом.
func TestReflexiveOfFromParticle(t *testing.T) {
	const sentence = "Bližila se ponoć, a on je ležao na krevetu."
	lex := testLexicon(t)
	res := analyze(lex, "se")
	start := strings.Index(sentence, "se")

	got := reflexiveOf(lex, &res, "se", sentence, start, start+2)
	if got == nil {
		t.Fatal("глагол для частицы не найден")
	}
	if !got.OnParticle || got.Verb != "Bližila" {
		t.Fatalf("получено %+v", got)
	}
	if got.Lemma != "bližiti se" {
		t.Errorf("начальная форма = %q, ожидалась «bližiti se»", got.Lemma)
	}
}

func TestWithSeParticleFromParticle(t *testing.T) {
	const sentence = "Bližila se ponoć."
	start := strings.Index(sentence, "se")
	gotStart, gotEnd := withSeParticle(sentence, start, start+2, "sr")
	if sentence[gotStart:gotEnd] != "Bližila se" {
		t.Errorf("помечено %q, ожидалось «Bližila se»", sentence[gotStart:gotEnd])
	}
}

// Ударение берётся из словаря, а не достраивается: по написанию его не
// восстановить.
func TestAccentFromDictionary(t *testing.T) {
	lex := testLexicon(t)
	accent := accentOf(lex, "knjiga", "knjiga")
	if accent == nil {
		t.Fatal("ударение «knjiga» не найдено")
	}
	if accent.Written != "knjȉga" {
		t.Errorf("написание = %q, ожидалось «knjȉga»", accent.Written)
	}
	if accent.IPA == "" || accent.Source == "" {
		t.Errorf("нет транскрипции или источника: %+v", accent)
	}
}

// Кириллический текст получает кириллическое ударение: подменять азбуку в
// ответе нельзя.
func TestAccentKeepsScript(t *testing.T) {
	accent := accentOf(testLexicon(t), "књига", "књига")
	if accent == nil || accent.Written != "књи̏га" {
		t.Fatalf("получено %+v", accent)
	}
}

// Словоформы в словаре ударений нет — показывается ударение начальной формы, но
// с пометкой: по парадигме ударение переезжает.
func TestAccentFallsBackToLemma(t *testing.T) {
	accent := accentOf(testLexicon(t), "knjigama", "knjiga")
	if accent == nil {
		t.Fatal("запасное ударение не найдено")
	}
	if !accent.OfLemma || accent.Lemma != "knjȉga" {
		t.Errorf("получено %+v", accent)
	}
	if accent.Written != "" {
		t.Error("ударение начальной формы выдано за ударение словоформы")
	}
}
