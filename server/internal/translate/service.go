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
	deepl  *DeepL
	words  WordProvider
	cache  Cache
	budget *Budget
}

// NewService собирает переводчик. Любая из зависимостей может быть nil:
// сервис деградирует, а не падает.
func NewService(deepl *DeepL, words WordProvider, cache Cache) *Service {
	return &Service{deepl: deepl, words: words, cache: cache}
}

// WithBudget подключает суточный бюджет знаков DeepL. Без него ограничение
// выключено — так работают тесты и сервер без ключа.
func (s *Service) WithBudget(b *Budget) *Service {
	if s != nil {
		s.budget = b
	}
	return s
}

// Budget отдаёт бюджет для отчёта в админке.
func (s *Service) Budget() *Budget {
	if s == nil {
		return nil
	}
	return s.budget
}

// deeplAllowed списывает знаки под запрос к DeepL.
//
// Отказ — не ошибка: перевод уходит запасному провайдеру, и человек этого не
// замечает. Именно поэтому бюджет проверяется ЗДЕСЬ, а не в обработчике: там
// пришлось бы выбирать между «ответить ошибкой» и «переводить бесплатно», и
// оба ответа хуже тихой замены провайдера.
func (s *Service) deeplAllowed(text string) bool {
	return s.budget.Allow(utf8.RuneCountInString(text))
}

func (s *Service) refundDeepL(text string) {
	s.budget.Refund(utf8.RuneCountInString(text))
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

	// Бюджет спрашивается только тогда, когда запасной провайдер есть: иначе
	// отказ бюджета означал бы «перевода не будет вовсе», а это хуже перерасхода.
	if s.deepl != nil && (s.words == nil || s.deeplAllowed(text)) {
		out, err := s.deepl.TranslateTexts(ctx, []string{text}, source, target, Options{})
		if err == nil && len(out) == 1 && strings.TrimSpace(out[0]) != "" {
			s.store(ctx, source, target, text, out[0], s.deepl.Name())
			return &Result{Text: out[0], Provider: s.deepl.Name(), Aligned: true}, nil
		}
		s.refundDeepL(text)
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
//
// Этот запрос — самая дорогая операция во всём приложении. У DeepL Free пятьсот
// тысяч знаков в МЕСЯЦ на всех, а сюда уходит целое предложение (около сотни
// знаков) на каждое нажатие: без кеша месячной квоты хватает примерно на четыре
// тысячи нажатий, то есть на одного активного читателя. Поэтому результат
// раскладывается в кеш по трём ключам, и каждый экономит квоту в своём случае.
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
	// Кеш проверяется РАНЬШЕ бюджета: готовый ответ квоты не тратит, и
	// списывать за него знаки значило бы наказывать за попадание в кеш.

	// Готовый ответ ровно на это нажатие. Ключом служит помеченное предложение:
	// оно однозначно задаёт и фразу, и слово внутри неё, поэтому из одной записи
	// восстанавливаются оба перевода сразу.
	//
	// Без этой проверки повторное нажатие на то же слово стоило бы ещё одного
	// запроса к DeepL. А повторов много: человек возвращается к абзацу, читает
	// книгу второй раз, и — главное — кеш общий на всех, поэтому вторым и
	// сотым читателем одной книги квота уже не тратится вовсе.
	if s.cache != nil {
		if cached, provider, ok := s.cache.Get(ctx, source, target, marked); ok {
			if full, aligned := SplitMarked(cached); aligned != "" {
				return &Result{
					Text:     aligned,
					Sentence: full,
					Provider: provider,
					Cached:   true,
					Aligned:  true,
				}, nil
			}
		}
	}

	// Бюджет исчерпан — слово переводится запасным провайдером. Это заметно
	// хуже по качеству, но перевод остаётся, а месячная квота доживает до
	// конца месяца. Без запасного провайдера бюджет не спрашивается: отказ
	// означал бы «перевода нет», а это хуже перерасхода.
	if s.words != nil && !s.deeplAllowed(marked) {
		return s.word(ctx, word, source, target)
	}

	out, err := s.deepl.TranslateTexts(ctx, []string{marked}, source, target, Options{XMLTags: true})
	if err != nil || len(out) != 1 {
		s.refundDeepL(marked)
		if fallback, ferr := s.word(ctx, word, source, target); ferr == nil {
			return fallback, nil
		}
		if err == nil {
			err = fmt.Errorf("переводчик вернул %d фрагментов вместо одного", len(out))
		}
		return nil, err
	}

	full, aligned := SplitMarked(out[0])
	res := &Result{Sentence: full, Provider: s.deepl.Name()}
	if aligned != "" {
		res.Text = aligned
		res.Aligned = true
		// Один запрос к DeepL наполняет кеш тремя разными ключами. Записи идут
		// подряд и только здесь — на этой ветке уже сделан сетевой запрос к
		// переводчику, рядом с которым три обращения к базе незаметны. На ветке
		// попадания в кеш записей нет ни одной.
		s.store(ctx, source, target, marked, out[0], s.deepl.Name())
		s.store(ctx, source, target, sentence, full, s.deepl.Name())
		// Слово отдельно от предложения — общий словарь.
		//
		// Сербская лексика повторяется от текста к тексту, а предложения — почти
		// никогда. Пока слово живёт только внутри записи о своём предложении,
		// его перевод бесполезен всем остальным. Отдельная запись превращает
		// потраченную квоту в общее достояние: когда DeepL откажет — по месячному
		// пределу или просто по недоступности, — запасной путь возьмёт отсюда
		// перевод, выровненный настоящим DeepL, вместо заведомо ненадёжного
		// перевода одиночного слова.
		s.store(ctx, source, target, word, aligned, s.deepl.Name())
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
//
// Сначала общий словарь. В нём лежат не только прежние ответы запасного
// провайдера, но и слова, выровненные DeepL внутри предложения (см. InContext),
// — то есть перевод заметно лучше того, что запасной провайдер выдаёт на слово
// в отрыве от текста. Признак Aligned при этом не выставляется: слово было
// выровнено в другом предложении, а не в этом, и выдавать чужой контекст за
// свой нечестно.
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
