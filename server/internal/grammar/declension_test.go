package grammar

import "testing"

// Склонение существительных проверяется примерами из первой сотни слов любого
// учебника: именно на них ошибка заметна человеку, который только учится.
func TestNounDeclension(t *testing.T) {
	cases := []struct {
		lemma, gender, number, caseKey, want string
	}{
		// Первая врста — она работала и раньше, поэтому здесь защита от регресса.
		{"kuća", "Fem", "Sing", "Gen", "kuće"},
		{"kuća", "Fem", "Sing", "Dat", "kući"},
		{"kuća", "Fem", "Sing", "Ins", "kućom"},
		{"knjiga", "Fem", "Sing", "Dat", "knjizi"},
		{"kuća", "Fem", "Plur", "Dat", "kućama"},

		// Третья врста: раньше весь класс возвращал пустоту.
		{"noć", "Fem", "Sing", "Gen", "noći"},
		{"noć", "Fem", "Sing", "Acc", "noć"},
		{"noć", "Fem", "Sing", "Ins", "noću / noći"},
		{"noć", "Fem", "Plur", "Dat", "noćima"},
		{"ljubav", "Fem", "Sing", "Ins", "ljubavlju / ljubavi"},
		{"kost", "Fem", "Sing", "Ins", "košću / kosti"},
		{"smrt", "Fem", "Sing", "Ins", "smrću / smrti"},
		// После «р» йотования нет — остаётся только форма на -i.
		{"stvar", "Fem", "Sing", "Ins", "stvari"},
		{"stvar", "Fem", "Sing", "Gen", "stvari"},

		// Мужской род на -a склоняется по женскому типу.
		{"tata", "Masc", "Sing", "Gen", "tate"},
		{"tata", "Masc", "Sing", "Ins", "tatom"},
		{"sudija", "Masc", "Sing", "Acc", "sudiju"},
		{"sudija", "Masc", "Plur", "Nom", "sudije"},

		// Средний род с расширением основы.
		{"ime", "Neut", "Sing", "Gen", "imena"},
		{"ime", "Neut", "Sing", "Ins", "imenom"},
		{"ime", "Neut", "Plur", "Nom", "imena"},
		{"ime", "Neut", "Plur", "Dat", "imenima"},
		{"vreme", "Neut", "Sing", "Gen", "vremena"},
		{"dete", "Neut", "Sing", "Gen", "deteta"},
		{"dugme", "Neut", "Sing", "Gen", "dugmeta"},
		// Средний род без расширения не должен его получить.
		{"selo", "Neut", "Sing", "Gen", "sela"},
		{"selo", "Neut", "Plur", "Nom", "sela"},
		{"polje", "Neut", "Sing", "Ins", "poljem"},

		// Беглое «а».
		{"otac", "Masc", "Sing", "Gen", "oca"},
		{"otac", "Masc", "Sing", "Voc", "oče"},
		{"otac", "Masc", "Sing", "Ins", "ocem"},
		{"pas", "Masc", "Sing", "Gen", "psa"},
		{"momak", "Masc", "Sing", "Gen", "momka"},
		{"momak", "Masc", "Sing", "Voc", "momče"},
		{"momak", "Masc", "Plur", "Nom", "momci"},
		{"starac", "Masc", "Sing", "Gen", "starca"},
		{"starac", "Masc", "Sing", "Voc", "starče"},
		{"starac", "Masc", "Plur", "Nom", "starci"},
		// Родительный множественного — единственное место, где «а» возвращается.
		{"momak", "Masc", "Plur", "Gen", "momaka"},
		{"starac", "Masc", "Plur", "Gen", "staraca"},
		// Односложное «-ak» беглого «а» не имеет.
		{"znak", "Masc", "Sing", "Gen", "znaka"},

		// Множественное мужского рода: слоги, а не буквы.
		{"grad", "Masc", "Plur", "Nom", "gradovi"},
		{"sport", "Masc", "Plur", "Nom", "sportovi"},
		{"front", "Masc", "Plur", "Nom", "frontovi"},
		{"muž", "Masc", "Plur", "Nom", "muževi"},
		{"ključ", "Masc", "Plur", "Nom", "ključevi"},
		{"prozor", "Masc", "Plur", "Nom", "prozori"},
		{"student", "Masc", "Plur", "Nom", "studenti"},
		// Слоговое «р» — слог: «vrt» односложное и берёт -ov-.
		{"vrt", "Masc", "Plur", "Nom", "vrtovi"},
		// Исключения из правила «односложное → длинное множественное».
		{"dan", "Masc", "Plur", "Nom", "dani"},
		{"zub", "Masc", "Plur", "Nom", "zubi"},
		{"gost", "Masc", "Plur", "Nom", "gosti"},
		{"konj", "Masc", "Plur", "Nom", "konji"},
		{"prst", "Masc", "Plur", "Nom", "prsti"},
		{"vuk", "Masc", "Plur", "Nom", "vuci"},

		// Остальной мужской род — защита от регресса.
		{"čovek", "Masc", "Sing", "Voc", "čoveče"},
		{"grad", "Masc", "Sing", "Ins", "gradom"},
		{"konj", "Masc", "Sing", "Ins", "konjem"},
		{"konj", "Masc", "Sing", "Voc", "konju"},
		{"grad", "Masc", "Sing", "Acc", "grad / grada"},
		{"čovek", "Masc", "Plur", "Nom", "ljudi"},
	}

	for _, c := range cases {
		got := declension(c.lemma, c.gender, c.number, c.caseKey)
		if got != c.want {
			t.Errorf("%s (%s, %s, %s) = %q, ожидалось %q",
				c.lemma, c.gender, c.number, c.caseKey, got, c.want)
		}
	}
}

// Ни одна клетка таблицы не должна остаться пустой у слов, которые движок
// объявляет разобранными: прочерк там читается как «программа не знает».
func TestDeclensionFillsEveryCell(t *testing.T) {
	words := []struct{ lemma, gender string }{
		{"kuća", "Fem"}, {"noć", "Fem"}, {"stvar", "Fem"}, {"ljubav", "Fem"},
		{"grad", "Masc"}, {"otac", "Masc"}, {"momak", "Masc"}, {"konj", "Masc"},
		{"tata", "Masc"}, {"selo", "Neut"}, {"ime", "Neut"}, {"polje", "Neut"},
	}
	for _, w := range words {
		for _, number := range []string{"Sing", "Plur"} {
			for _, caseKey := range CaseOrder {
				if declension(w.lemma, w.gender, number, caseKey) == "" {
					t.Errorf("%s (%s): пустая клетка %s %s",
						w.lemma, w.gender, number, caseKey)
				}
			}
		}
	}
}

// Опознание словоформы обязано работать на тех же примерах: правило строит
// парадигму от кандидата и принимает разбор, только если форма в ней нашлась.
func TestMatchNoun(t *testing.T) {
	cases := []struct {
		lemma, gender, form, wantCase, wantNumber string
	}{
		{"kuća", "Fem", "kućom", "Ins", "Sing"},
		{"noć", "Fem", "noću", "Ins", "Sing"},
		{"noć", "Fem", "noćima", "Dat", "Plur"},
		{"ime", "Neut", "imena", "Gen", "Sing"},
		{"otac", "Masc", "oca", "Gen", "Sing"},
		{"momak", "Masc", "momci", "Nom", "Plur"},
		{"grad", "Masc", "gradovima", "Dat", "Plur"},
		// «čoveka» — это и родительный, и винительный одушевлённого. Побеждает
		// родительный: он идёт раньше в CaseOrder и встречается чаще.
		{"čovek", "Masc", "čoveka", "Gen", "Sing"},
	}
	for _, c := range cases {
		feats, ok := MatchNoun(c.lemma, c.gender, c.form)
		if !ok {
			t.Errorf("%s: форма %q не опознана", c.lemma, c.form)
			continue
		}
		if feats["Case"] != c.wantCase || feats["Number"] != c.wantNumber {
			t.Errorf("%s %q: разобрано как %s %s, ожидалось %s %s",
				c.lemma, c.form, feats["Case"], feats["Number"], c.wantCase, c.wantNumber)
		}
	}
}

// Строка для показа склеивает варианты через «/», поэтому опознание обязано
// работать со списком форм. Иначе винительный одушевлённого не нашёлся бы
// никогда — сравнение шло бы с «čovek / čoveka».
func TestAccusativeKeepsBothFormsSeparately(t *testing.T) {
	forms := declensionForms("čovek", "Masc", "Sing", "Acc")
	if len(forms) != 2 || forms[0] != "čovek" || forms[1] != "čoveka" {
		t.Fatalf("формы винительного: %q", forms)
	}
	if got := declension("čovek", "Masc", "Sing", "Acc"); got != "čovek / čoveka" {
		t.Fatalf("для показа получилось %q", got)
	}
}

func TestSyllables(t *testing.T) {
	cases := map[string]int{
		"grad": 1, "sport": 1, "prozor": 2, "student": 2,
		"prst": 1, "vrt": 1, "trg": 1, "momak": 2, "starac": 2,
	}
	for word, want := range cases {
		if got := syllables(word); got != want {
			t.Errorf("syllables(%q) = %d, ожидалось %d", word, got, want)
		}
	}
}
