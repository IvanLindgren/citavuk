package grammar

import (
	"strings"
	"testing"
)

// verbsInTests — «глагольность» для тестов: настоящий список форм лежит в
// лексиконе, и тянуть его в модуль грамматики только ради тестов незачем.
func verbsInTests(word string) bool {
	switch strings.ToLower(word) {
	case "zove", "vratio", "vrati", "smeju", "čita", "ostao", "bližila", "zovem":
		return true
	}
	return false
}

// at возвращает байтовые границы слова во фразе.
func at(sentence, word string) (int, int) {
	i := strings.Index(sentence, word)
	if i < 0 {
		panic("нет слова " + word + " во фразе " + sentence)
	}
	return i, i + len(word)
}

func TestAttachSeFindsParticleAcrossWords(t *testing.T) {
	cases := []struct {
		name     string
		sentence string
		word     string
		lemma    string
		before   bool
		adjacent bool
		phrase   string
	}{
		{
			name:     "частица перед глаголом",
			sentence: "On se zove Marko.",
			word:     "zove",
			lemma:    "zvati",
			before:   true,
			adjacent: true,
			phrase:   "zove se",
		},
		{
			name:     "глагол открывает фразу",
			sentence: "Zove se Marko.",
			word:     "Zove",
			lemma:    "zvati",
			before:   false,
			adjacent: true,
			phrase:   "Zove se",
		},
		{
			name:     "частица оторвана от глагола",
			sentence: "Moj stariji brat se sinoć vratio kući.",
			word:     "vratio",
			lemma:    "vratiti",
			before:   true,
			adjacent: false,
			phrase:   "vratio se",
		},
		{
			name:     "кириллица",
			sentence: "Он се зове Марко.",
			word:     "зове",
			lemma:    "звати",
			before:   true,
			adjacent: true,
			phrase:   "зове се",
		},
	}

	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			start, end := at(tc.sentence, tc.word)
			got := AttachSe(tc.sentence, start, end, tc.word, tc.lemma, verbsInTests)
			if got == nil {
				t.Fatal("частица не найдена")
			}
			if got.Before != tc.before {
				t.Errorf("Before = %v, ожидалось %v", got.Before, tc.before)
			}
			if got.Adjacent != tc.adjacent {
				t.Errorf("Adjacent = %v, ожидалось %v", got.Adjacent, tc.adjacent)
			}
			if got.Phrase != tc.phrase {
				t.Errorf("Phrase = %q, ожидалось %q", got.Phrase, tc.phrase)
			}
			if got.Why == "" || got.Meaning == "" {
				t.Error("объяснение пустое")
			}
		})
	}
}

// Частица принадлежит своей части предложения: приписать её глаголу из соседней
// значило бы разобрать не ту фразу.
func TestAttachSeStaysInsideClause(t *testing.T) {
	sentence := "Vratio se kući, a brat je ostao na poslu."
	start, end := at(sentence, "ostao")
	if got := AttachSe(sentence, start, end, "ostao", "ostati", verbsInTests); got != nil {
		t.Fatalf("частица приписана чужому глаголу: %+v", got)
	}

	start, end = at(sentence, "Vratio")
	if got := AttachSe(sentence, start, end, "Vratio", "vratiti", verbsInTests); got == nil {
		t.Fatal("частица своего глагола потеряна")
	}
}

func TestAttachSeSubordinateClause(t *testing.T) {
	sentence := "Rekao je da se vrati do mraka."
	start, end := at(sentence, "vrati")
	got := AttachSe(sentence, start, end, "vrati", "vratiti", verbsInTests)
	if got == nil {
		t.Fatal("частица не найдена в придаточном")
	}
	if !got.Adjacent || !got.Before {
		t.Errorf("ожидалась частица вплотную слева, получено %+v", got)
	}
	// Частица вторая после союза «da», и объяснение должно называть именно его.
	if !strings.Contains(got.Why, "«da»") {
		t.Errorf("объяснение не называет первое слово части: %q", got.Why)
	}
}

func TestAttachSeIgnoresMissingParticle(t *testing.T) {
	sentence := "Marko čita knjigu."
	start, end := at(sentence, "čita")
	if got := AttachSe(sentence, start, end, "čita", "čitati", verbsInTests); got != nil {
		t.Fatalf("частица выдумана: %+v", got)
	}
}

// Нажатие по самой частице ведёт к её глаголу: «se» в отрыве от глагола — это
// местоимение «sebe», и такой ответ читателю бесполезен.
func TestAttachSeFromParticleFindsVerb(t *testing.T) {
	cases := []struct {
		name     string
		sentence string
		verb     string
		before   bool
	}{
		{"глагол справа", "On se zove Marko.", "zove", false},
		{"глагол слева", "Bližila se ponoć, a on je ležao.", "Bližila", true},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			start, end := at(tc.sentence, "se")
			got := AttachSe(tc.sentence, start, end, "se", "", verbsInTests)
			if got == nil {
				t.Fatal("глагол для частицы не найден")
			}
			if !got.OnParticle {
				t.Error("нажатие по частице не отмечено")
			}
			if got.Verb != tc.verb {
				t.Errorf("глагол = %q, ожидался %q", got.Verb, tc.verb)
			}
			// Клиент подсвечивает спутника по написанию и стороне.
			if got.Companion != tc.verb || got.Before != tc.before {
				t.Errorf("спутник = %q, before = %v", got.Companion, got.Before)
			}
			if got.Phrase != tc.verb+" se" {
				t.Errorf("фраза = %q", got.Phrase)
			}
		})
	}
}

// Частица без глагола во фразе не привязывается ни к чему.
func TestAttachSeFromParticleWithoutVerb(t *testing.T) {
	sentence := "Ne znam se."
	start, end := at(sentence, "se")
	if got := AttachSe(sentence, start, end, "se", "", verbsInTests); got != nil {
		t.Fatalf("частица привязана к неглаголу: %+v", got)
	}
}

// Перевод одиночной частицы спрашивается о паре: «se» отдельно переводится
// случайным словом.
func TestSeSpanFromParticle(t *testing.T) {
	sentence := "Bližila se ponoć."
	start, end := at(sentence, "se")
	gotStart, gotEnd, ok := SeSpan(sentence, start, end, verbsInTests)
	if !ok {
		t.Fatal("пара не собрана")
	}
	if sentence[gotStart:gotEnd] != "Bližila se" {
		t.Errorf("получено %q, ожидалось %q", sentence[gotStart:gotEnd], "Bližila se")
	}
}

func TestSeTantumMeaning(t *testing.T) {
	sentence := "Deca se smeju glasno."
	start, end := at(sentence, "smeju")
	got := AttachSe(sentence, start, end, "smeju", "smejati", verbsInTests)
	if got == nil {
		t.Fatal("частица не найдена")
	}
	if !strings.Contains(got.Meaning, "без «se» не бывает") {
		t.Errorf("глагол smejati должен быть помечен как se-tantum: %q", got.Meaning)
	}
	if got.Lemma != "smejati se" {
		t.Errorf("Lemma = %q, ожидалось %q", got.Lemma, "smejati se")
	}
}

func TestSeSpanExtendsOnlyWhenAdjacent(t *testing.T) {
	sentence := "On se zove Marko."
	start, end := at(sentence, "zove")
	gotStart, gotEnd, ok := SeSpan(sentence, start, end, verbsInTests)
	if !ok {
		t.Fatal("пара «se zove» не собрана")
	}
	if sentence[gotStart:gotEnd] != "se zove" {
		t.Errorf("получено %q, ожидалось %q", sentence[gotStart:gotEnd], "se zove")
	}

	far := "Moj stariji brat se sinoć vratio kući."
	start, end = at(far, "vratio")
	gotStart, gotEnd, ok = SeSpan(far, start, end, verbsInTests)
	if ok {
		t.Errorf("частица через слово не должна захватываться: %q", far[gotStart:gotEnd])
	}
	if gotStart != start || gotEnd != end {
		t.Error("границы слова изменены при отказе")
	}
}
