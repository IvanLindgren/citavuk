package level

import (
	"regexp"
	"sort"
	"strings"
	"unicode"

	"github.com/citavuk/server/internal/lexicon"
	"github.com/citavuk/server/internal/serbian"
	"github.com/citavuk/server/internal/store"
)

// Оценка сложности сербского текста.
//
// Мера одна — редкость слов. Это сознательно узкая модель: длина предложений и
// синтаксис тоже влияют на трудность, но измеряются шумно, а словарь измеряется
// прямо. Читателю на чужом языке трудным текст делает именно то, что он не
// понимает слов; разобрать длинную фразу из знакомых слов он может со словарём
// в голове, а короткую из незнакомых — нет.
//
// Ранги берутся из srLex (см. tools/build_frequency.py): лемма, стоящая в
// корпусе тысячной, знакома уже на A1; стоящая двадцатитысячной не знакома
// почти никому из учащихся.

// bands — граница частотного списка для каждой ступени.
//
// Числа подобраны по опорным текстам, составленным из словаря нужной ступени
// (см. text_test.go), а НЕ по меткам публичной библиотеки. Метки там ставил
// редактор, и означают они литературную трудность — архаику, диалект, длину
// периода, — которая с редкостью слов связана слабо: «Страдија» с меткой B2
// набирает лучшее покрытие во всём каталоге. Подгонка под них выдала бы шкалу,
// не измеряющую ничего.
//
// Отсюда и честные пределы точности: шкала различает простое и сложное, но не
// соседние ступени. Поэтому предупреждение и срабатывает при разрыве в две
// ступени, а не в одну (см. TooHardFor).
var bands = []struct {
	level string
	rank  int
}{
	{"A1", 1500},
	{"A2", 3000},
	{"B1", 6000},
	{"B2", 12000},
}

// hardestBand — ступень для текста, не покрытого ни одной полосой.
//
// C1, а не верх шкалы: шкала доходит до C2 (столько же, сколько заявка
// преподавателя), а мера редкости слов такой разницы не различает.
const hardestBand = "C1"

// coverage — доля слов текста, которая должна укладываться в словарь ступени,
// чтобы текст считался посильным на ней.
//
// Не единица: в любом тексте есть слова вне словаря читателя, и пара незнакомых
// на абзац — нормальное чтение, а не непосильное. Девяносто процентов — это
// примерно одно незнакомое слово на строку.
const coverage = 0.90

// minWords — короче этого о сложности судить нечего.
const minWords = 30

// maxSampleWords — сколько слов достаточно для оценки. Больше не даёт точности,
// а словарь опрашивается на каждое слово.
const maxSampleWords = 1200

// TextLevel — насколько труден текст.
type TextLevel struct {
	// Level — ступень, на которой текст читается. Пусто, если слов не хватило
	// для суждения: молчание честнее выдуманного уровня.
	Level string `json:"level"`
	// Words — сколько слов вошло в выборку.
	Words int `json:"words"`
	// Coverage — доля слов выборки, знакомых на итоговой ступени.
	Coverage float64 `json:"coverage"`
	// HardWords — самые редкие слова текста, до десяти. Показываются человеку:
	// «книга трудная» без примеров звучит как приговор без объяснения.
	HardWords []string `json:"hardWords"`
	// Source — указание источника частот, обязательное по лицензии CC BY-SA.
	Source string `json:"source"`
}

// Известно сообщает, что оценка состоялась.
func (t TextLevel) Known() bool { return t.Level != "" }

// TooHardFor решает, стоит ли предупредить читателя.
//
// Порог — две ступени, а не одна: на ступень выше своего уровня читать как раз
// и полезно, и предупреждать об этом значит отговаривать от единственного
// способа вырасти. Предупреждение уместно, когда разрыв такой, что чтение
// превратится в перевод слово за словом.
func (t TextLevel) TooHardFor(reader string) bool {
	readerAt := store.SerbianLevelIndex(reader)
	textAt := store.SerbianLevelIndex(t.Level)
	return readerAt > 0 && textAt > 0 && textAt-readerAt >= 2
}

// wordPattern — слово сербской латиницы или кириллицы. Цифры и знаки не слова.
var wordPattern = regexp.MustCompile(`[\p{L}][\p{L}'’-]*`)

// Estimate оценивает сложность текста по абзацам.
func Estimate(lex *lexicon.Lexicon, paragraphs []string) TextLevel {
	result := TextLevel{Source: lexicon.FrequencySource, HardWords: []string{}}
	if lex == nil {
		return result
	}

	ranks := make([]int, 0, maxSampleWords)
	// Редкие слова собираются с рангом, чтобы показать читателю действительно
	// самые редкие, а не первые попавшиеся.
	type rare struct {
		word string
		rank int
	}
	rarest := make([]rare, 0, 64)
	seenRare := make(map[string]bool, 64)

	for _, index := range serbian.SpreadIndexes(len(paragraphs)) {
		if len(ranks) >= maxSampleWords {
			break
		}
		for _, word := range wordPattern.FindAllString(paragraphs[index], -1) {
			if len(ranks) >= maxSampleWords {
				break
			}
			if len([]rune(word)) < 2 {
				continue
			}
			place, ok := rankOf(lex, word)
			if !ok {
				// Слово не опознано вовсе. С большой буквы — почти наверняка
				// имя: их в книге сколько угодно, но труднее она от них не
				// становится, «Милош» читается одинаково на любом уровне.
				if isCapitalized(word) {
					continue
				}
				place = beyondList
			}
			ranks = append(ranks, place)
			if key := strings.ToLower(word); place > bands[len(bands)-1].rank && !seenRare[key] {
				seenRare[key] = true
				rarest = append(rarest, rare{word: key, rank: place})
			}
		}
	}

	result.Words = len(ranks)
	if result.Words < minWords {
		return result
	}

	// Ступень — первая, чей словарь покрывает нужную долю текста. Не покрыла ни
	// одна — текст труднее всего, что различают полосы, то есть C1. Покрытие
	// тогда показывается по последней полосе: доля «в пределах бесконечности»
	// равна единице всегда и не значит ничего.
	//
	// Потолок задан здесь, а не взят как верх шкалы: шкала доходит до C2, а
	// полосы — нет, и выдавать C2 значило бы называть уровень, которого эта
	// мера не различает.
	result.Level = hardestBand
	result.Coverage = shareWithin(ranks, bands[len(bands)-1].rank)
	for _, band := range bands {
		if share := shareWithin(ranks, band.rank); share >= coverage {
			result.Level = band.level
			result.Coverage = share
			break
		}
	}

	sort.SliceStable(rarest, func(i, j int) bool { return rarest[i].rank > rarest[j].rank })
	for _, item := range rarest {
		if len(result.HardWords) == 10 {
			break
		}
		result.HardWords = append(result.HardWords, item.word)
	}
	return result
}

// beyondList — ранг слова, которого в частотном списке нет. Больше любого
// настоящего ранга, поэтому годится и как значение, и как верхняя граница.
const beyondList = 1 << 30

// rankOf находит место слова в частотном списке.
//
// Сначала таблица словоформ: она знает любую форму частой леммы и потому
// отвечает почти всегда. Морфологический словарь — запасной путь для слова, до
// которого таблица не достаёт: там свои 21 тысяча форм, но зато они разобраны.
func rankOf(lex *lexicon.Lexicon, word string) (int, bool) {
	if place, ok := lex.WordRank(word); ok {
		return place, true
	}
	lower := strings.ToLower(word)
	best, found := 0, false
	for _, row := range lex.LookupForm(lower) {
		if row.UPOS == "X" {
			continue
		}
		if place, ok := lex.Rank(row.Lemma); ok && (!found || place < best) {
			best, found = place, true
		}
	}
	if found {
		return best, true
	}
	if lemma, ok := lex.VerbLemma(lower); ok {
		if place, ok := lex.Rank(lemma); ok {
			return place, true
		}
	}
	return 0, false
}

func shareWithin(ranks []int, limit int) float64 {
	if len(ranks) == 0 {
		return 0
	}
	within := 0
	for _, place := range ranks {
		if place <= limit {
			within++
		}
	}
	return float64(within) / float64(len(ranks))
}

func isCapitalized(word string) bool {
	for _, r := range word {
		return unicode.IsUpper(r)
	}
	return false
}
