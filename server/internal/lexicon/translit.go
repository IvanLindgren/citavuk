package lexicon

import (
	"strings"
	"unicode"
)

// Правила совпадают с frontend/lib/utils/transliteration.dart: лексикон хранит
// латиницу, а в книгах встречается и кириллица.
var cyrToLat = map[rune]string{
	'а': "a", 'б': "b", 'в': "v", 'г': "g", 'д': "d", 'ђ': "đ", 'е': "e",
	'ж': "ž", 'з': "z", 'и': "i", 'ј': "j", 'к': "k", 'л': "l", 'љ': "lj",
	'м': "m", 'н': "n", 'њ': "nj", 'о': "o", 'п': "p", 'р': "r", 'с': "s",
	'т': "t", 'ћ': "ć", 'у': "u", 'ф': "f", 'х': "h", 'ц': "c", 'ч': "č",
	'џ': "dž", 'ш': "š",
	'А': "A", 'Б': "B", 'В': "V", 'Г': "G", 'Д': "D", 'Ђ': "Đ", 'Е': "E",
	'Ж': "Ž", 'З': "Z", 'И': "I", 'Ј': "J", 'К': "K", 'Л': "L", 'Љ': "Lj",
	'М': "M", 'Н': "N", 'Њ': "Nj", 'О': "O", 'П': "P", 'Р': "R", 'С': "S",
	'Т': "T", 'Ћ': "Ć", 'У': "U", 'Ф': "F", 'Х': "H", 'Ц': "C", 'Ч': "Č",
	'Џ': "Dž", 'Ш': "Š",
}

// Обратное соответствие строится из cyrToLat, чтобы направления не разошлись
// при правке одной из таблиц. Диграфы (љ, њ, џ) в карту не попадают — у них
// два символа, и разбираются они отдельно.
var latToCyr = func() map[rune]rune {
	m := make(map[rune]rune, len(cyrToLat))
	for cyr, lat := range cyrToLat {
		runes := []rune(lat)
		if len(runes) == 1 {
			m[runes[0]] = cyr
		}
	}
	return m
}()

var latDigraphs = []struct {
	lat string
	cyr rune
}{
	{"lj", 'љ'}, {"nj", 'њ'}, {"dž", 'џ'},
}

// ToCyrillic переводит сербскую латиницу в кириллицу.
//
// Диграфы берутся жадно: «ljubav» → «љубав». Иногда это ошибка — в «nadživeti»
// стоят приставка «nad» и корень «živeti», а не «dž», и правильно «надживети».
// Различить их без словаря нельзя, поэтому вариант с раздельным чтением
// возвращает CyrillicVariants, а выбирает уже тот, кто ищет слово.
func ToCyrillic(text string) string {
	return toCyrillic(text, true)
}

// CyrillicVariants — все разумные кириллические записи слова, от самой
// вероятной. Второй вариант появляется только там, где есть спорный диграф.
func CyrillicVariants(text string) []string {
	greedy := toCyrillic(text, true)
	split := toCyrillic(text, false)
	if greedy == split {
		return []string{greedy}
	}
	return []string{greedy, split}
}

func toCyrillic(text string, digraphs bool) string {
	runes := []rune(text)
	var b strings.Builder
	b.Grow(len(text))
	for i := 0; i < len(runes); {
		if digraphs {
			if cyr, size, ok := matchDigraph(runes[i:]); ok {
				b.WriteRune(cyr)
				i += size
				continue
			}
		}
		if cyr, ok := latToCyr[runes[i]]; ok {
			b.WriteRune(cyr)
		} else {
			b.WriteRune(runes[i])
		}
		i++
	}
	return b.String()
}

// matchDigraph узнаёт диграф в любом регистре: «lj», «Lj» и «LJ» — одна буква.
func matchDigraph(runes []rune) (rune, int, bool) {
	for _, d := range latDigraphs {
		lat := []rune(d.lat)
		if len(runes) < len(lat) {
			continue
		}
		match := true
		for i, r := range lat {
			if unicode.ToLower(runes[i]) != r {
				match = false
				break
			}
		}
		if !match {
			continue
		}
		if unicode.IsUpper(runes[0]) {
			return unicode.ToUpper(d.cyr), len(lat), true
		}
		return d.cyr, len(lat), true
	}
	return 0, 0, false
}

// ToLatin переводит сербскую кириллицу в латиницу.
func ToLatin(text string) string {
	var b strings.Builder
	b.Grow(len(text))
	for _, r := range text {
		if lat, ok := cyrToLat[r]; ok {
			b.WriteString(lat)
			continue
		}
		b.WriteRune(r)
	}
	return b.String()
}

// Normalize приводит слово к виду ключа словаря.
func Normalize(word string) string {
	return strings.ToLower(strings.TrimSpace(ToLatin(word)))
}
