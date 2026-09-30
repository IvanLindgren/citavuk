package feed

import (
	"fmt"
	"regexp"
	"strings"
	"unicode"

	"github.com/citavuk/server/internal/aioutput"
	"github.com/citavuk/server/internal/lexicon"
	"github.com/citavuk/server/internal/store"
)

var editorialTokens = regexp.MustCompile(`[\p{L}\p{M}]+`)

// Только подтверждённые повреждения старой генерации, а НЕ все неизвестные
// словарю слова. Имена, реальные термины и редкие формы не запрещаются.
var malformedWords = strings.Fields(`poluloteža poluloteže poluloteži poluteže poluteži
polulisure polutežere polutasci polutasca polutesci tesalas telas domasni ćelutke
ćelutskih kletočne kletočnih dvadesetogo dvenaestog devetdesetih preminio službio
zbuljujuće obedinjuje gregoryanski gregoryanskom glorijanski glorijanskom
odbočkaarka odboškarka odbolkarstva odbočkarstva nebođer nebođera slisač slisači slisaču nezaposlednost delomira našego`)

func checkEditorialText(text string) error {
	for _, word := range editorialTokens.FindAllString(text, -1) {
		latin, cyrillic := false, false
		for _, r := range word {
			latin = latin || unicode.Is(unicode.Latin, r)
			if unicode.Is(unicode.Cyrillic, r) {
				cyrillic = true
				if !strings.ContainsRune("абвгдђежзијклљмнњопрстћуфхцчџш", unicode.ToLower(r)) {
					return fmt.Errorf("несербская кириллическая буква в слове %q", word)
				}
			}
			// Греческие буквы допустимы в химических/математических обозначениях.
			if unicode.IsLetter(r) && !unicode.Is(unicode.Latin, r) && !unicode.Is(unicode.Cyrillic, r) && !unicode.Is(unicode.Greek, r) {
				return fmt.Errorf("посторонний алфавит в слове %q", word)
			}
		}
		if latin && cyrillic {
			return fmt.Errorf("смешение алфавитов внутри слова %q", word)
		}
		key := lexicon.Normalize(word)
		for _, damaged := range malformedWords {
			if key == damaged {
				return fmt.Errorf("искажённое слово %q: нужна редакторская проверка предложения", word)
			}
		}
	}
	return nil
}

// CanonicalEditorial проверяет единственный первичный текст и получает латиницу
// из кириллицы без второго сочинения моделью. Направление однозначно, в отличие
// от Latin → Cyrillic с неоднозначными nj/lj/dž. Бренды/цитаты остаются как есть.
func CanonicalEditorial(title, body string, words []store.DifficultWord) (string, string, error) {
	for _, text := range []string{title, body} {
		if err := checkEditorialText(text); err != nil {
			return "", "", err
		}
	}
	letters, cyrillic := 0, 0
	for _, r := range body {
		if unicode.IsLetter(r) {
			letters++
			if unicode.Is(unicode.Cyrillic, r) {
				cyrillic++
			}
		}
	}
	if letters == 0 || cyrillic*2 < letters {
		return "", "", fmt.Errorf("первичный текст должен быть на сербской кириллице")
	}
	if len(words) != 3 {
		return "", "", fmt.Errorf("нужны три сложных слова")
	}
	seen := map[string]bool{}
	bodyKeys := map[string]bool{}
	for _, token := range editorialTokens.FindAllString(body, -1) {
		bodyKeys[lexicon.Normalize(token)] = true
	}
	for _, word := range words {
		for _, text := range []string{word.Word, word.Lemma} {
			if strings.TrimSpace(text) == "" {
				return "", "", fmt.Errorf("у сложного слова нет начальной формы")
			}
			if err := checkEditorialText(text); err != nil {
				return "", "", err
			}
		}
		key := lexicon.Normalize(word.Word)
		if !bodyKeys[key] || seen[key] {
			return "", "", fmt.Errorf("сложное слово %q отсутствует в тексте или повторяется", word.Word)
		}
		seen[key] = true
		if !aioutput.Russian(word.TranslationRU) {
			return "", "", fmt.Errorf("перевод сложного слова должен быть русским")
		}
	}
	return lexicon.ToLatin(title), lexicon.ToLatin(body), nil
}
