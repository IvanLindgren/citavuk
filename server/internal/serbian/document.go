package serbian

import (
	"math"
	"strings"
	"unicode"

	"github.com/citavuk/server/internal/lexicon"
)

// Определение языка целого документа.
//
// Задача не та же, что у Check: там решается, годится ли короткое сообщение для
// обсуждения, и снисходительность к ошибкам — часть замысла. Здесь решается,
// предлагать ли человеку перевод книги, и цена ошибки другая. Ложное «это не
// сербский» на сербской книге раздражает лишним вопросом; ложное «это сербский»
// на английском учебнике оставляет человека без предложения, ради которого всё и
// делается. Поэтому решение принимается по выборке из всего документа, а не по
// первому абзацу: у книги на английском предисловие бывает сербским, и наоборот.

// DocumentVerdict — вывод о языке загруженного документа.
type DocumentVerdict struct {
	// Serbian означает, что документ можно читать как есть.
	Serbian bool
	// Language — предполагаемый язык оригинала: "sr", "ru", "en" либо пусто,
	// если признаков не хватило. Пустое значение — не ошибка: переводчику всё
	// равно уходит "auto", а подпись в интерфейсе просто станет обтекаемой.
	Language string
	// Share — доля слов выборки, которые знает сербский словарь. Нужна для
	// журнала и тестов: по ней видно, почему принято решение.
	Share float64
	// Words — сколько слов попало в выборку.
	Words int
}

// maxSampleWords — сколько слов достаточно для решения.
//
// Больше не даёт точности, а словарь опрашивается на каждое слово: у книги в
// сотню тысяч слов проверка заняла бы секунды на ровном месте.
const maxSampleWords = 800

// minSampleWords — короче этого документ не разобрать. Такой «документ» —
// подпись или заголовок, и предлагать перевод книги по нему нечего.
const minSampleWords = 12

// Доли, при которых признак считается решающим. Значения намеренно низкие для
// букв и высокие для словаря: сербская диакритика в русском или английском
// тексте не встречается вовсе, а вот совпадений со словарём хватает случайно —
// «to», «no», «sam», «list» есть и в английском.
const (
	diacriticShare = 0.015
	foreignShare   = 0.030
	lexiconShare   = 0.300
)

// CheckDocument решает, написан ли документ по-сербски.
func CheckDocument(paragraphs []string) DocumentVerdict {
	sample := sampleWords(paragraphs, maxSampleWords)
	verdict := DocumentVerdict{Words: len(sample)}
	if len(sample) < minSampleWords {
		// Слишком коротко для суждения. Считаем сербским: молча предложить
		// перевод подписи к картинке — худший из двух исходов.
		verdict.Serbian = true
		return verdict
	}

	shared, lexErr := lexicon.Shared()
	diacritic, foreign, known, russian, english := 0, 0, 0, 0, 0

	for _, word := range sample {
		switch {
		case hasSerbianDiacritic(word):
			diacritic++
		case hasForeignCyrillic(word):
			foreign++
		}
		if russianWords[word] {
			russian++
		}
		if englishWords[word] {
			english++
		}
		if lexErr == nil && knownSerbian(shared, word) {
			known++
		}
	}

	total := float64(len(sample))
	verdict.Share = float64(known) / total
	verdict.Language = guessLanguage(float64(foreign)/total, russian, english)

	switch {
	// Чужие буквы кириллицы решают сами: ни ы, ни э, ни щ, ни ъ в сербском
	// нет ни в одной графике. Порог, а не первое попадание: сербская книга
	// вправе цитировать русскую строчку.
	case float64(foreign)/total >= foreignShare:
		verdict.Serbian = false
	// Сербская диакритика в чужом языке не встречается — это самый надёжный
	// положительный признак, и он сильнее словаря.
	case float64(diacritic)/total >= diacriticShare:
		verdict.Serbian = true
		verdict.Language = "sr"
	default:
		verdict.Serbian = verdict.Share >= lexiconShare
		if verdict.Serbian {
			verdict.Language = "sr"
		}
	}
	return verdict
}

// knownSerbian сообщает, знает ли словарь такую форму.
//
// Строки с upos = "X" не считаются: это иноязычные вставки из трибанка, там
// лежит и «the». Без этого правила английский учебник набирал бы сербские очки
// на собственных служебных словах.
func knownSerbian(shared *lexicon.Lexicon, word string) bool {
	for _, row := range shared.LookupForm(word) {
		if row.UPOS != "X" {
			return true
		}
	}
	return false
}

func guessLanguage(foreign float64, russian, english int) string {
	if foreign >= foreignShare {
		return "ru"
	}
	if english > russian && english > 0 {
		return "en"
	}
	if russian > 0 {
		return "ru"
	}
	return ""
}

func hasSerbianDiacritic(word string) bool {
	return serbianLetters.MatchString(word) || serbianCyrillic.MatchString(word)
}

func hasForeignCyrillic(word string) bool {
	for _, r := range word {
		for _, bad := range foreignCyrillic {
			if unicode.ToLower(r) == bad {
				return true
			}
		}
	}
	return false
}

// golden — доля золотого сечения, задающая порядок обхода абзацев.
//
// Такая последовательность обладает свойством, ради которого она здесь и
// выбрана: ЛЮБОЙ её начальный отрезок равномерно покрывает весь документ. Это
// решает проблему обхода подряд и обхода с постоянным шагом — оба набирают
// нужное число слов задолго до конца книги и потому судят о языке по первым
// главам. А именно начало книги врёт чаще всего: у переводных изданий там
// выходные данные на языке оригинала, у сербских учебников — английское
// предисловие.
const golden = 0.6180339887498949

// SpreadIndexes возвращает номера абзацев в порядке, равномерно покрывающем
// весь документ (см. комментарий к golden).
//
// Экспортируется, потому что по тому же принципу отбирает слова оценка
// сложности текста: она судит о книге по всей книге ровно по той же причине —
// первые страницы врут чаще прочих.
func SpreadIndexes(count int) []int {
	if count <= 0 {
		return nil
	}
	out := make([]int, 0, count)
	seen := make([]bool, count)
	// Ограничение по числу шагов нужно потому, что последовательность может
	// повторно указать на уже осмотренный абзац.
	for n := 0; n < 8*count && len(out) < count; n++ {
		fraction := float64(n) * golden
		i := int((fraction - math.Floor(fraction)) * float64(count))
		if i >= count {
			i = count - 1
		}
		if seen[i] {
			continue
		}
		seen[i] = true
		out = append(out, i)
	}
	return out
}

// sampleWords берёт слова равномерно по всему документу.
func sampleWords(paragraphs []string, limit int) []string {
	if len(paragraphs) == 0 || limit <= 0 {
		return nil
	}

	out := make([]string, 0, limit)
	for _, i := range SpreadIndexes(len(paragraphs)) {
		if len(out) >= limit {
			break
		}
		for _, word := range words.FindAllString(strings.ToLower(paragraphs[i]), -1) {
			if len(out) >= limit {
				break
			}
			// Однобуквенные слова не несут признака языка ни в одном из трёх
			// языков, а место в выборке занимают.
			if len([]rune(word)) > 1 {
				out = append(out, word)
			}
		}
	}
	return out
}
