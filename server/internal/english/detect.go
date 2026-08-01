package english

import (
	"regexp"
	"strings"
	"unicode"
)

// Буквы и сочетания, невозможные в сербской латинице. Сербский алфавит не
// знает q, w, x, y, а «th», «ck», «ph», «gh» не встречаются даже в
// заимствованиях: сербский пишет как слышит.
var englishOnly = regexp.MustCompile(`[qwxy]|th|ck|ph|gh|wh|'`)

// HasEnglishOrthography сообщает, что слово написано невозможным для сербского
// образом. Такой признак решает сам по себе.
func HasEnglishOrthography(word string) bool {
	return englishOnly.MatchString(strings.ToLower(word))
}

// LooksSerbian сообщает, что в слове есть буквы, которых в английском нет:
// сербские диакритики или кириллица.
func LooksSerbian(word string) bool {
	for _, r := range word {
		switch r {
		case 'š', 'đ', 'ž', 'č', 'ć', 'Š', 'Đ', 'Ž', 'Č', 'Ć':
			return true
		}
		if unicode.Is(unicode.Cyrillic, r) {
			return true
		}
	}
	return false
}

var wordRe = regexp.MustCompile(`[\p{L}']+`)

// Words режет предложение на слова — тем же правилом, что токенизатор клиента.
func Words(sentence string) []string {
	matches := wordRe.FindAllString(sentence, maxTokens)
	out := make([]string, 0, len(matches))
	for _, m := range matches {
		out = append(out, strings.ToLower(m))
	}
	return out
}

// Сколько слов предложения учитывать. Длинная фраза ничего не уточняет, зато
// стоит лишних просмотров словаря.
const maxTokens = 40

// minEnglishScore — порог уверенности для смешанного текста.
const minEnglishScore = 2

// SerbianLookup сообщает, знает ли сербский словарь такую форму.
//
// Строки с `upos = "X"` не считаются: это иноязычные вставки из трибанка (там
// лежит и «the»), и принимать их за сербские слова нельзя — иначе английский
// текст никогда не опознался бы английским.
type SerbianLookup func(word string) bool

// IsEnglish решает, английское ли слово, ПО ПРЕДЛОЖЕНИЮ вокруг него.
//
// Иначе работать не может: в сербской латинице «on», «to», «no», «most»,
// «sam», «list», «bar» — обычные сербские слова, и все они одновременно
// английские. В отрыве от фразы такое слово неразличимо в принципе, а внутри
// фразы почти всегда однозначно: «on je došao» против «on the table».
//
// Пустое [sentence] означает одиночное слово (подпись, заголовок) — тогда
// решает словарь и орфография.
func (l *Lexicon) IsEnglish(word, sentence string, knownSerbian SerbianLookup) bool {
	low := strings.ToLower(strings.TrimSpace(word))
	if low == "" || LooksSerbian(low) {
		return false
	}
	// Нечего показывать — разбирать как английское незачем.
	if l.Analyze(low) == nil {
		return false
	}

	wordIsSerbian := knownSerbian != nil && knownSerbian(low)
	if HasEnglishOrthography(low) && !wordIsSerbian {
		return true
	}

	tokens := Words(sentence)
	if len(tokens) == 0 {
		tokens = []string{low}
	}

	en, sr := 0, 0
	for _, token := range tokens {
		if LooksSerbian(token) {
			sr += 2
			continue
		}
		serbian := knownSerbian != nil && knownSerbian(token)
		english := l.Knows(token)
		switch {
		case HasEnglishOrthography(token):
			en += 2
		case english && !serbian:
			en++
		case serbian && !english:
			sr++
		}
		// Слово, известное обоим языкам, не голосует: именно из-за таких слов
		// счёт и ведётся.
	}

	if en >= minEnglishScore && en > sr {
		return true
	}
	// Одиночное слово вне фразы: сербский словарь его не знает, а английский
	// знает — считаем английским.
	return !wordIsSerbian && sr == 0 && l.Knows(low)
}
