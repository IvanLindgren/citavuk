package lexicon

import "strings"

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
