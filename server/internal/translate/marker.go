package translate

import (
	"fmt"
	"strings"
	"unicode/utf8"
)

// markerTag — имя тега, которым помечается интересующее слово.
//
// Тег короткий и не встречается в естественном тексте; всё остальное содержимое
// экранируется, поэтому спутать разметку с самим текстом невозможно.
const markerTag = "w"

// MarkWord вставляет теги вокруг фрагмента [start:end) исходного предложения и
// экранирует остальной текст.
//
// Смещения — в БАЙТАХ строки в UTF-8. Это важно: клиент на Dart оперирует
// единицами UTF-16, и для кириллицы эти числа не совпадают, поэтому клиент
// обязан пересчитывать смещения перед отправкой. Проверка ниже ловит ошибку
// пересчёта: смещение, попавшее внутрь многобайтового символа, разорвало бы
// букву пополам и пометило тегом не то слово.
//
// Экранирование обязательно: символы «&», «<» и «>» встречаются в текстах книг,
// и без экранирования DeepL примет их за разметку, а ответ станет неразбираемым.
func MarkWord(sentence string, start, end int) (string, error) {
	if start < 0 || end > len(sentence) || start >= end {
		return "", fmt.Errorf("границы слова [%d:%d) вне предложения длиной %d", start, end, len(sentence))
	}
	if !utf8.RuneStart(sentence[start]) || (end < len(sentence) && !utf8.RuneStart(sentence[end])) {
		return "", fmt.Errorf("границы слова [%d:%d) рассекают символ UTF-8", start, end)
	}
	var b strings.Builder
	b.Grow(len(sentence) + 16)
	b.WriteString(escapeXML(sentence[:start]))
	b.WriteString("<" + markerTag + ">")
	b.WriteString(escapeXML(sentence[start:end]))
	b.WriteString("</" + markerTag + ">")
	b.WriteString(escapeXML(sentence[end:]))
	return b.String(), nil
}

// SplitMarked разбирает перевод с тегами: возвращает предложение без разметки и
// переведённый фрагмент, который был помечен.
//
// Если тег в ответе не сохранился — так бывает, когда модель перестроила фразу
// и помеченному слову нечего сопоставить, — word будет пустым. Это не ошибка:
// вызывающий код обязан уметь показать перевод предложения без выделения слова,
// а не выдумывать соответствие.
func SplitMarked(translated string) (sentence, word string) {
	openTag := "<" + markerTag + ">"
	closeTag := "</" + markerTag + ">"

	if i := strings.Index(translated, openTag); i >= 0 {
		rest := translated[i+len(openTag):]
		if j := strings.Index(rest, closeTag); j >= 0 {
			word = strings.TrimSpace(unescapeXML(rest[:j]))
		}
	}
	clean := strings.ReplaceAll(translated, openTag, "")
	clean = strings.ReplaceAll(clean, closeTag, "")
	return strings.TrimSpace(unescapeXML(clean)), word
}

// escapeXML экранирует только то, что действительно ломает разбор.
//
// Кавычки не трогаются намеренно: в тексте они встречаются постоянно, а внутри
// содержимого элемента экранировать их не требуется. Лишнее экранирование
// испортило бы перевод — модель увидела бы «&quot;» вместо кавычки.
func escapeXML(s string) string {
	if !strings.ContainsAny(s, "&<>") {
		return s
	}
	r := strings.NewReplacer("&", "&amp;", "<", "&lt;", ">", "&gt;")
	return r.Replace(s)
}

// unescapeXML возвращает экранированные символы обратно.
//
// Порядок важен: «&amp;» разворачивается последним, иначе строка «&amp;lt;»
// превратилась бы в «<» вместо «&lt;».
func unescapeXML(s string) string {
	if !strings.Contains(s, "&") {
		return s
	}
	r := strings.NewReplacer("&lt;", "<", "&gt;", ">", "&quot;", `"`, "&#39;", "'")
	s = r.Replace(s)
	return strings.ReplaceAll(s, "&amp;", "&")
}
