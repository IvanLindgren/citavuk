// Package moderation отсекает грубость в комментариях до записи в базу.
//
// Apple требует от приложения с пользовательскими комментариями фильтр того,
// что нельзя публиковать (App Review 1.2). Список короткий и грубый намеренно:
// он ловит мат и оскорбления, а не спорные слова. Сравнивается начало слова,
// поэтому «употреблять» не попадается на «бля», а «хуёвый» попадается на «хуё».
package moderation

import (
	"strings"
	"unicode"
)

// Корни, с которых начинается недопустимое слово. Латиница — в двух видах:
// с сербскими диакритиками и без них, как пишут на телефоне.
var roots = []string{
	// русский мат
	"хуй", "хуе", "хуё", "хуя", "хуи", "пизд", "ебат", "ебан", "ебал", "ебло", "ебну", "ебуч",
	"выеб", "заеб", "наеб", "отъеб", "уеба", "уебо", "доеб", "съеб", "бляд", "блят", "мудак", "мудил",
	"пидор", "пидар", "пидр", "залуп", "шлюх", "манда",
	// сербская брань
	"јебе", "јебо", "јеби", "јеба", "jebe", "jebo", "jebi", "jeba", "pičk", "pick", "пичк",
	"kurac", "kurc", "курац", "курц", "peder", "педер", "drolj", "дроль", "kurv", "курв",
	// английский
	"fuck", "cunt", "nigger", "nigga", "faggot", "motherfuck",
}

// Слова, которые начинаются как недопустимые, но сами в порядке.
var allowed = map[string]bool{
	"pick": true, "picks": true, "picked": true, "picking": true, "picker": true,
	"pickle": true, "pickles": true, "pickup": true, "picky": true,
}

// Reason — текст отказа, его человек увидит целиком.
const Reason = "В комментарии есть грубые слова. Перепиши, пожалуйста, без них."

// Clean сообщает, можно ли публиковать текст.
func Clean(text string) bool {
	for _, word := range strings.FieldsFunc(strings.ToLower(text), notLetter) {
		if allowed[word] {
			continue
		}
		for _, root := range roots {
			if strings.HasPrefix(word, root) {
				return false
			}
		}
	}
	return true
}

func notLetter(r rune) bool { return !unicode.IsLetter(r) }
