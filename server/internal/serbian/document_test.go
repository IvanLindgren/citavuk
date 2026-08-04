package serbian

import "testing"

// Определение языка документа решает, предложат ли человеку перевод. Ошибка в
// любую сторону заметна: лишний вопрос на сербской книге раздражает, а молчание
// на английском учебнике оставляет без той единственной возможности, ради
// которой всё и сделано.

var serbianBook = []string{
	"Ово је прича о вуку који је волео да чита књиге сваког јутра.",
	"Сваког дана он би отворио књигу и читао све до вечери, док не падне мрак.",
	"Књиге су биле његови најбољи пријатељи и он их је чувао као највеће благо.",
	"Једног дана вук је срео орла који је волео да слуша приче о далеким земљама.",
	"Заједно су провели много сати: један је читао наглас, а други је слушао.",
	"Тако су обојица научили нешто ново о свету који их окружује.",
}

var serbianLatin = []string{
	"Ovo je priča o vuku koji je voleo da čita knjige svakog jutra.",
	"Svakog dana on bi otvorio knjigu i čitao sve do večeri, dok ne padne mrak.",
	"Knjige su bile njegovi najbolji prijatelji i čuvao ih je kao najveće blago.",
	"Jednog dana vuk je sreo orla koji je voleo da sluša priče o dalekim zemljama.",
	"Zajedno su proveli mnogo sati: jedan je čitao naglas, a drugi je slušao.",
	"Tako su obojica naučili nešto novo o svetu koji ih okružuje.",
}

var russianBook = []string{
	"Это история о волке, который очень любил читать книги каждое утро.",
	"Каждый день он открывал книгу и читал до самого вечера, пока не стемнеет.",
	"Книги были его лучшими друзьями, и он берёг их как самое большое сокровище.",
	"Однажды волк встретил орла, который любил слушать истории о дальних странах.",
	"Вместе они провели много часов: один читал вслух, а другой слушал.",
	"Так оба научились чему-то новому о мире, который их окружает.",
}

var englishBook = []string{
	"This is a story about a wolf who loved to read books every single morning.",
	"Every day he would open a book and read until the evening, until it got dark.",
	"Books were his best friends and he kept them as the greatest treasure of all.",
	"One day the wolf met an eagle who loved to listen to stories of distant lands.",
	"Together they spent many hours: one was reading aloud, and the other listened.",
	"So both of them learned something new about the world that surrounds them.",
}

func TestCheckDocumentAcceptsSerbian(t *testing.T) {
	for name, doc := range map[string][]string{
		"кириллица": serbianBook,
		"латиница":  serbianLatin,
	} {
		verdict := CheckDocument(doc)
		if !verdict.Serbian {
			t.Errorf("%s: сербский текст принят за чужой (доля словаря %.2f)",
				name, verdict.Share)
		}
		if verdict.Language != "sr" {
			t.Errorf("%s: язык определён как %q", name, verdict.Language)
		}
	}
}

func TestCheckDocumentRejectsForeign(t *testing.T) {
	for name, doc := range map[string][]string{
		"русский":    russianBook,
		"английский": englishBook,
	} {
		verdict := CheckDocument(doc)
		if verdict.Serbian {
			t.Errorf("%s: чужой текст принят за сербский (доля словаря %.2f)",
				name, verdict.Share)
		}
	}
}

func TestCheckDocumentNamesLanguage(t *testing.T) {
	if got := CheckDocument(russianBook).Language; got != "ru" {
		t.Errorf("русский документ определён как %q", got)
	}
	if got := CheckDocument(englishBook).Language; got != "en" {
		t.Errorf("английский документ определён как %q", got)
	}
}

// Сербская книга вправе цитировать пару строк по-русски, и из-за цитаты весь
// перевод предлагать не надо.
func TestCheckDocumentSurvivesForeignQuote(t *testing.T) {
	doc := append(append([]string{}, serbianBook...),
		"Он је волео да понавља: «Это моя любимая книга».")
	doc = append(doc, serbianBook...)

	if !CheckDocument(doc).Serbian {
		t.Error("одна русская цитата сделала сербскую книгу иностранной")
	}
}

// Русский документ с сербским эпиграфом остаётся русским: решает большинство.
func TestCheckDocumentSurvivesSerbianEpigraph(t *testing.T) {
	doc := append([]string{"Ово је мото ове књиге о читању."}, russianBook...)
	doc = append(doc, russianBook...)

	if CheckDocument(doc).Serbian {
		t.Error("сербский эпиграф сделал русскую книгу сербской")
	}
}

// Слишком короткий текст не даёт судить о языке. Молча предложить перевод
// подписи к картинке хуже, чем не предложить ничего.
func TestCheckDocumentIgnoresTooShort(t *testing.T) {
	for _, doc := range [][]string{
		nil,
		{},
		{"Hello"},
		{"Глава 1"},
	} {
		if !CheckDocument(doc).Serbian {
			t.Errorf("%v: короткий текст вызвал предложение перевода", doc)
		}
	}
}

// Выборка обязана доставать слова со всего документа, а не только с начала:
// именно начало врёт чаще всего — там выходные данные издательства на языке
// оригинала и иноязычное предисловие.
//
// Документ здесь заведомо длиннее выборки, поэтому обход обязан оборваться на
// середине. Проверяется, что к этому моменту он успел заглянуть в каждую
// четверть книги.
func TestSampleWordsSpansWholeDocument(t *testing.T) {
	const quarters = 4
	doc := make([]string, 400)
	marks := [quarters]string{"первая", "вторая", "третья", "четвёртая"}
	for i := range doc {
		doc[i] = marks[i*quarters/len(doc)] + " prva druga"
	}

	sample := sampleWords(doc, 200)
	if len(sample) > 200 {
		t.Fatalf("выборка длиной %d при пределе 200", len(sample))
	}

	seen := map[string]bool{}
	for _, word := range sample {
		seen[word] = true
	}
	for _, mark := range marks {
		if !seen[mark] {
			t.Errorf("четверть %q не попала в выборку", mark)
		}
	}
}

// Английский учебник сербского — тот самый случай, ради которого всё сделано:
// текст английский, но сербских слов в нём заметно больше обычного.
func TestCheckDocumentRejectsEnglishTextbook(t *testing.T) {
	doc := []string{
		"In this lesson we will learn how to use the verb biti in the present tense.",
		"The Serbian word for house is kuca, and the word for book is knjiga.",
		"Notice that the article does not exist in Serbian at all, which is helpful.",
		"When you want to say I am a student, you say ja sam student in Serbian.",
		"Practice these sentences aloud and then write them down in your notebook.",
		"The next chapter explains the accusative case and when it should be used.",
	}
	if CheckDocument(doc).Serbian {
		t.Error("английский учебник сербского принят за сербскую книгу")
	}
}
