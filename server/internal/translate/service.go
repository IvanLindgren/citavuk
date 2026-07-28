package translate

import (
	"context"
	"errors"
	"fmt"
	"strings"
	"unicode"
	"unicode/utf8"
)

// Result — перевод и сведения о его происхождении.
type Result struct {
	// Text — перевод запрошенного фрагмента.
	Text string `json:"text"`
	// Sentence — перевод всего предложения, если он запрашивался.
	Sentence string `json:"sentence,omitempty"`
	// Provider — кто перевёл: важно и для отладки, и для кеша.
	Provider string `json:"provider"`
	// Cached означает, что ответ взят из кеша и квота не потрачена.
	Cached bool `json:"cached"`
	// Aligned означает, что слово получено выравниванием внутри предложения, а
	// не переведено в отрыве от контекста. Перевод без выравнивания заведомо
	// менее надёжен, и клиент вправе показать его иначе.
	Aligned bool `json:"aligned"`
}

// WordProvider переводит отдельные слова. Реализуется запасным провайдером:
// DeepL для этой задачи непригоден, см. документацию пакета.
type WordProvider interface {
	TranslateWord(ctx context.Context, word, source, target string) (string, error)
	Name() string
}

// Cache — хранилище готовых переводов.
type Cache interface {
	Get(ctx context.Context, source, target, text string) (string, string, bool)
	Put(ctx context.Context, source, target, text, translation, provider string) error
}

// Service выбирает провайдера под конкретный запрос и ходит в кеш.
type Service struct {
	deepl *DeepL
	words WordProvider
	cache Cache
}

// NewService собирает переводчик. Любая из зависимостей может быть nil:
// сервис деградирует, а не падает.
func NewService(deepl *DeepL, words WordProvider, cache Cache) *Service {
	return &Service{deepl: deepl, words: words, cache: cache}
}

// Available сообщает, способен ли сервис хоть что-то перевести.
func (s *Service) Available() bool {
	return s != nil && (s.deepl != nil || s.words != nil)
}

// Text переводит связный фрагмент: фразу, предложение или абзац.
//
// Это сильная сторона DeepL, поэтому он идёт первым, а запасной провайдер
// включается только при отказе.
func (s *Service) Text(ctx context.Context, text, source, target string) (*Result, error) {
	text = strings.TrimSpace(text)
	if text == "" {
		return nil, ErrEmptyText
	}
	if utf8.RuneCountInString(text) > MaxTextRunes {
		return nil, errors.New("фрагмент слишком длинный для перевода")
	}

	if s.cache != nil {
		if cached, provider, ok := s.cache.Get(ctx, source, target, text); ok {
			return &Result{Text: cached, Provider: provider, Cached: true, Aligned: true}, nil
		}
	}

	// Одиночное слово без контекста DeepL переводить нельзя.
	if IsSingleWord(text) {
		return s.word(ctx, text, source, target)
	}

	if s.deepl != nil {
		out, err := s.deepl.TranslateTexts(ctx, []string{text}, source, target, Options{})
		if err == nil && len(out) == 1 && strings.TrimSpace(out[0]) != "" {
			s.store(ctx, source, target, text, out[0], s.deepl.Name())
			return &Result{Text: out[0], Provider: s.deepl.Name(), Aligned: true}, nil
		}
		if err != nil && s.words == nil {
			return nil, err
		}
	}

	if s.words == nil {
		return nil, ErrNoProvider
	}
	out, err := s.words.TranslateWord(ctx, text, source, target)
	if err != nil {
		return nil, err
	}
	s.store(ctx, source, target, text, out, s.words.Name())
	return &Result{Text: out, Provider: s.words.Name(), Aligned: true}, nil
}

// InContext переводит слово [start:end) вместе с предложением, в котором оно
// стоит, и возвращает перевод обоих.
//
// Слово помечается тегом и переводится внутри фразы: так «kuća» получает
// значение «дом», а не «собака», которое DeepL выдаёт на слово без контекста.
// Один запрос даёт и перевод предложения, и выровненное слово.
func (s *Service) InContext(ctx context.Context, sentence string, start, end int, source, target string) (*Result, error) {
	if strings.TrimSpace(sentence) == "" {
		return nil, ErrEmptyText
	}

	word, err := sliceWord(sentence, start, end)
	if err != nil {
		return nil, err
	}
	if utf8.RuneCountInString(sentence) > MaxTextRunes {
		// Слишком длинный контекст: переводим слово как есть, без выравнивания.
		return s.word(ctx, word, source, target)
	}
	if s.deepl == nil {
		return s.word(ctx, word, source, target)
	}

	marked, err := MarkWord(sentence, start, end)
	if err != nil {
		return s.word(ctx, word, source, target)
	}

	out, err := s.deepl.TranslateTexts(ctx, []string{marked}, source, target, Options{XMLTags: true})
	if err != nil || len(out) != 1 {
		if fallback, ferr := s.word(ctx, word, source, target); ferr == nil {
			return fallback, nil
		}
		return nil, err
	}

	full, aligned := SplitMarked(out[0])
	res := &Result{Sentence: full, Provider: s.deepl.Name()}
	if aligned != "" {
		res.Text = aligned
		res.Aligned = true
		// В кеш попадает только выровненное слово: оно привязано к контексту,
		// поэтому кешируется как перевод предложения, а не слова.
		s.store(ctx, source, target, sentence, full, s.deepl.Name())
		return res, nil
	}

	// Тег не сохранился: показываем перевод предложения, а слово переводим
	// отдельно, честно пометив, что выравнивания не было.
	if w, err := s.word(ctx, word, source, target); err == nil {
		res.Text = w.Text
		res.Provider = w.Provider
	}
	return res, nil
}

// word переводит одиночное слово запасным провайдером.
func (s *Service) word(ctx context.Context, word, source, target string) (*Result, error) {
	word = strings.TrimSpace(word)
	if word == "" {
		return nil, ErrEmptyText
	}
	if s.cache != nil {
		if cached, provider, ok := s.cache.Get(ctx, source, target, word); ok {
			return &Result{Text: cached, Provider: provider, Cached: true}, nil
		}
	}
	if s.words == nil {
		return nil, ErrNoProvider
	}
	out, err := s.words.TranslateWord(ctx, word, source, target)
	if err != nil {
		return nil, err
	}
	s.store(ctx, source, target, word, out, s.words.Name())
	return &Result{Text: out, Provider: s.words.Name()}, nil
}

func (s *Service) store(ctx context.Context, source, target, text, translation, provider string) {
	if s.cache == nil || strings.TrimSpace(translation) == "" {
		return
	}
	_ = s.cache.Put(ctx, source, target, text, translation, provider)
}

// ErrBadOffsets возвращается, когда границы слова не описывают корректный
// фрагмент предложения.
var ErrBadOffsets = errors.New("границы слова не соответствуют предложению")

// sliceWord вырезает слово по байтовым смещениям.
//
// Проверка границ по символам обязательна. Смещения приходят от клиента, а
// клиенты считают их в других единицах: JavaScript и Dart индексируют строку в
// UTF-16, и ошибка пересчёта даёт смещение внутри многобайтовой буквы. Резать
// байты вслепую нельзя: получилась бы битая строка, которую переводчик всё
// равно во что-нибудь переведёт, и пользователь увидит уверенный, но полностью
// выдуманный ответ. Отказ здесь честнее.
func sliceWord(sentence string, start, end int) (string, error) {
	if start < 0 || end > len(sentence) || start >= end {
		return "", fmt.Errorf("%w: [%d:%d) при длине %d", ErrBadOffsets, start, end, len(sentence))
	}
	if !utf8.RuneStart(sentence[start]) || (end < len(sentence) && !utf8.RuneStart(sentence[end])) {
		return "", fmt.Errorf("%w: [%d:%d) рассекает символ UTF-8", ErrBadOffsets, start, end)
	}
	word := sentence[start:end]
	if !utf8.ValidString(word) {
		return "", fmt.Errorf("%w: выделенный фрагмент не является текстом", ErrBadOffsets)
	}
	if strings.TrimSpace(word) == "" {
		return "", ErrEmptyText
	}
	return word, nil
}

// IsSingleWord сообщает, что текст — одно слово без синтаксического окружения.
//
// Именно такой вход разваливает нейронный перевод, поэтому распознавать его
// нужно точно. Дефис внутри слова («српско-руски») словом быть не мешает,
// а вот пробел или конечная точка уже дают модели опору.
func IsSingleWord(text string) bool {
	text = strings.TrimSpace(text)
	if text == "" {
		return false
	}
	for _, r := range text {
		if unicode.IsSpace(r) {
			return false
		}
		if !unicode.IsLetter(r) && r != '-' && r != '\'' && r != '’' {
			return false
		}
	}
	return true
}
