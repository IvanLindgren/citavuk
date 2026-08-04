package translate

import (
	"context"
	"strings"
	"unicode"
	"unicode/utf8"
)

// Перевод целого документа.
//
// Главное ограничение здесь не техническое, а бюджетное. У DeepL Free пятьсот
// тысяч знаков в месяц НА ВСЁ ПРИЛОЖЕНИЕ, а книга на двести страниц — это
// примерно четыреста тысяч. Один перевод книги съел бы месячную квоту, и в
// читалке перестали бы переводиться слова: та же квота обслуживает разбор слова
// в предложении, ради которого DeepL и подключён.
//
// Поэтому провайдер выбирается по объёму: короткий документ (статья, глава,
// раздаточный материал) идёт в DeepL, где качество заметно выше, а книга — в
// запасной бесплатный провайдер. Выбор делается один раз на документ и не
// меняется от куска к куску: переводчики по-разному передают имена и термины, и
// смена посреди книги видна невооружённым глазом.

// Пределы объёма документа.
const (
	// DeepLDocumentRunes — до какого размера документ переводится DeepL.
	// Двадцать тысяч знаков — это статья или глава: таких за месяц можно
	// перевести два десятка, не мешая читалке.
	DeepLDocumentRunes = 20_000
	// MaxDocumentRunes — предел на один документ. Сто пятьдесят тысяч знаков
	// это примерно семьдесят страниц: больше за один раз не переводим, чтобы
	// одна книга не занимала запасной провайдер на четверть часа.
	MaxDocumentRunes = 150_000
)

// Имена провайдеров, они же значения поля Provider.
const (
	ProviderDeepL  = "deepl"
	ProviderGoogle = "google"
)

// PickProvider выбирает переводчика под объём документа.
//
// Пустая строка означает, что перевести документ нечем.
func (s *Service) PickProvider(runes int) string {
	if s == nil {
		return ""
	}
	if s.deepl != nil && runes <= DeepLDocumentRunes {
		return ProviderDeepL
	}
	if s.words != nil {
		return ProviderGoogle
	}
	// DeepL есть, запасного нет: длинный документ приходится вести им же —
	// иначе перевода не будет вовсе.
	if s.deepl != nil {
		return ProviderDeepL
	}
	return ""
}

// Paragraphs переводит абзацы, сохраняя их количество и порядок.
//
// Соответствие один к одному обязательно: клиент собирает книгу, подставляя
// перевод на место оригинала, и потеря даже одного абзаца сдвинула бы весь
// остаток текста относительно картинок и таблиц.
func (s *Service) Paragraphs(
	ctx context.Context,
	texts []string,
	source, target, provider string,
) ([]string, error) {
	out := make([]string, len(texts))

	// Абзацы без букв — номера страниц, разделители, служебные пометки — не
	// переводятся и не тратят квоту. Переводчик на них всё равно возвращает
	// вход как есть, но платный запрос уже сделан.
	payload := make([]string, 0, len(texts))
	index := make([]int, 0, len(texts))
	for i, text := range texts {
		if !hasLetters(text) {
			out[i] = text
			continue
		}
		payload = append(payload, text)
		index = append(index, i)
	}
	if len(payload) == 0 {
		return out, nil
	}

	var translated []string
	var err error
	switch provider {
	case ProviderDeepL:
		if s.deepl == nil {
			return nil, ErrNoProvider
		}
		// Пустой источник означает «определи сам»: DeepL делает это, когда поле
		// source_lang просто не отправлено.
		translated, err = translateWithDeepL(ctx, s.deepl, payload, source, target)
	case ProviderGoogle:
		if s.words == nil {
			return nil, ErrNoProvider
		}
		translated, err = translateWithFallback(ctx, s.words, payload, autoSource(source), target)
	default:
		return nil, ErrNoProvider
	}
	if err != nil {
		return nil, err
	}

	for n, position := range index {
		// Пустой перевод — это потеря абзаца. Оригинал в таком месте честнее
		// пустоты: читатель увидит непереведённую строку и поймёт, что произошло.
		if strings.TrimSpace(translated[n]) == "" {
			out[position] = payload[n]
			continue
		}
		out[position] = translated[n]
	}
	return out, nil
}

// Ограничения одного запроса к DeepL: не больше пятидесяти фрагментов и
// 128 КиБ тела. Берём с запасом — при превышении API отвечает отказом на весь
// запрос, а не переводит часть.
const (
	deeplBatchTexts = 40
	deeplBatchBytes = 90 << 10
)

func translateWithDeepL(
	ctx context.Context,
	deepl *DeepL,
	texts []string,
	source, target string,
) ([]string, error) {
	out := make([]string, 0, len(texts))

	for start := 0; start < len(texts); {
		end, size := start, 0
		for end < len(texts) && end-start < deeplBatchTexts {
			next := size + len(texts[end])
			if end > start && next > deeplBatchBytes {
				break
			}
			size = next
			end++
		}
		// Один абзац длиннее лимита тела: отправляем его в одиночку и пусть
		// провайдер сам решает. Иначе цикл не сдвинулся бы с места.
		if end == start {
			end = start + 1
		}

		batch, err := deepl.TranslateTexts(ctx, texts[start:end], source, target, Options{
			PreserveFormatting: true,
		})
		if err != nil {
			return nil, err
		}
		out = append(out, batch...)
		start = end
	}
	return out, nil
}

// TextProvider — запасной провайдер, умеющий переводить связный текст.
//
// Интерфейс сознательно повторяет WordProvider: у публичного endpoint Google
// одна ручка и на слово, и на абзац, разница только в длине входа.
type TextProvider interface {
	TranslateWord(ctx context.Context, text, source, target string) (string, error)
	Name() string
}

// googleChunkRunes — сколько знаков уходит в один запрос запасного провайдера.
const googleChunkRunes = 1200

// translateWithFallback переводит абзацы запасным провайдером.
//
// Абзацы склеиваются в один кусок через перевод строки: иначе на книгу ушли бы
// тысячи запросов. Разделитель переводчик обычно сохраняет, но гарантии этому
// нет никакой — поэтому результат проверяется по количеству строк, и при
// расхождении кусок переводится абзац за абзацем. Без такой проверки сбой был
// бы незаметен и катастрофичен: строки сдвинулись бы на одну, и вся оставшаяся
// книга получила бы чужой перевод.
func translateWithFallback(
	ctx context.Context,
	provider TextProvider,
	texts []string,
	source, target string,
) ([]string, error) {
	out := make([]string, 0, len(texts))

	for start := 0; start < len(texts); {
		end, size := start, 0
		for end < len(texts) {
			next := size + utf8.RuneCountInString(texts[end])
			if end > start && next > googleChunkRunes {
				break
			}
			size = next
			end++
		}
		if end == start {
			end = start + 1
		}
		chunk := texts[start:end]

		joined, err := provider.TranslateWord(ctx, strings.Join(chunk, "\n"), source, target)
		if err != nil {
			return nil, err
		}
		parts := strings.Split(joined, "\n")

		if len(chunk) == 1 || len(parts) == len(chunk) {
			if len(chunk) == 1 {
				// Один абзац мог законно получить внутренние переводы строк.
				out = append(out, joined)
			} else {
				out = append(out, parts...)
			}
			start = end
			continue
		}

		// Разделитель не пережил перевод. Переводим абзацы по одному: медленнее,
		// зато соответствие гарантировано.
		for _, text := range chunk {
			one, err := provider.TranslateWord(ctx, text, source, target)
			if err != nil {
				return nil, err
			}
			out = append(out, one)
		}
		start = end
	}
	return out, nil
}

// autoSource превращает «источник неизвестен» в явное «определи сам».
//
// Без него запасной провайдер молча подставлял бы сербский: его TranslateWord
// написан для читалки, где источник всегда сербский, и пустое значение
// заменяет на "sr". Для книги это катастрофа особого рода — не ошибка, а
// тишина: Google, которому сказали переводить с сербского на сербский,
// возвращает исходный английский текст без изменений. Человек получил бы
// непереведённую книгу, потратив на неё суточный предел.
func autoSource(source string) string {
	if strings.TrimSpace(source) == "" {
		return "auto"
	}
	return source
}

// hasLetters сообщает, есть ли в строке хоть одна буква.
func hasLetters(text string) bool {
	for _, r := range text {
		if unicode.IsLetter(r) {
			return true
		}
	}
	return false
}

// CountRunes считает объём документа в знаках — в тех же единицах, в которых
// заданы пределы и в которых провайдеры считают квоту.
func CountRunes(texts []string) int {
	total := 0
	for _, text := range texts {
		total += utf8.RuneCountInString(text)
	}
	return total
}
