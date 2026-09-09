package translate

import (
	"context"
	"errors"
	"fmt"
	"strings"
	"sync"
	"time"
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

	// cooldownUntil временно запрещает обращаться к ограничившему
	// провайдеру: получив 429, нет смысла долбить его каждым нажатием —
	// все эти запросы всё равно закончатся тем же 429. Хранится в памяти
	// процесса: перезапуск запрет снимает, и это нормально.
	mu            sync.Mutex
	cooldownUntil map[string]time.Time
}

// providerCooldown — сколько молчим после 429.
//
// Google снимает ограничение за единицы минут; стучаться чаще — только
// продлевать бан и жечь таймауты. Пока кулдаун идёт, запросы получают
// ErrRateLimited сразу, без сети: клиент отвечает 429 с понятным
// «подождите», а не 502.
const providerCooldown = time.Minute

// inCooldown сообщает, молчим ли ещё по провайдеру name.
func (s *Service) inCooldown(name string) bool {
	s.mu.Lock()
	defer s.mu.Unlock()
	until, ok := s.cooldownUntil[name]
	return ok && time.Now().Before(until)
}

// setCooldown включает молчание по провайдеру name.
func (s *Service) setCooldown(name string) {
	s.mu.Lock()
	defer s.mu.Unlock()
	if s.cooldownUntil == nil {
		s.cooldownUntil = map[string]time.Time{}
	}
	s.cooldownUntil[name] = time.Now().Add(providerCooldown)
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
		return s.word(ctx, text, source, target, wordFallback{})
	}

	// Бюджет спрашивается только тогда, когда запасной провайдер есть: иначе
	// отказ бюджета означал бы «перевода не будет вовсе», а это хуже перерасхода.
	deeplReady := s.deepl != nil && !s.inCooldown(s.deepl.Name())
	var deeplErr error
	if deeplReady && (s.words == nil || s.deeplAllowed(text)) {
		var out []string
		out, deeplErr = s.deepl.TranslateTexts(ctx, []string{text}, source, target, Options{})
		if deeplErr == nil && len(out) == 1 && strings.TrimSpace(out[0]) != "" {
			s.store(ctx, source, target, text, out[0], s.deepl.Name())
			return &Result{Text: out[0], Provider: s.deepl.Name(), Aligned: true}, nil
		}
		s.refundDeepL(text)
		if errors.Is(deeplErr, ErrRateLimited) {
			s.setCooldown(s.deepl.Name())
		}
		if deeplErr != nil && s.words == nil {
			return nil, deeplErr
		}
	}

	if s.words == nil {
		if deeplErr != nil {
			return nil, deeplErr
		}
		if s.deepl != nil {
			// DeepL есть, но его не пробовали: он в кулдауне после 429.
			return nil, ErrRateLimited
		}
		return nil, ErrNoProvider
	}
	return s.word(ctx, text, source, target, wordFallback{err: deeplErr, aligned: true})
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
		return s.word(ctx, word, source, target, wordFallback{})
	}
	if s.deepl == nil {
		return s.word(ctx, word, source, target, wordFallback{})
	}

	marked, err := MarkWord(sentence, start, end)
	if err != nil {
		return s.word(ctx, word, source, target, wordFallback{contextHint: sentence})
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
	//
	// Пауза и факт списания фиксируются один раз: между двумя проверками
	// другой запрос может включить кулдаун (знаки списаны, перевода нет,
	// возврата нет) или пауза может кончиться (запрос ушёл без списания).
	// Возвращается только действительно зарезервированный бюджет.
	deeplSkipped := s.inCooldown(s.deepl.Name())
	spent := false
	if s.words != nil && !deeplSkipped {
		if !s.deeplAllowed(marked) {
			return s.word(ctx, word, source, target, wordFallback{contextHint: sentence})
		}
		spent = true
	}

	var out []string
	var derr error
	if !deeplSkipped {
		out, derr = s.deepl.TranslateTexts(ctx, []string{marked}, source, target, Options{XMLTags: true})
		if errors.Is(derr, ErrRateLimited) {
			s.setCooldown(s.deepl.Name())
		}
	}
	if deeplSkipped || derr != nil || len(out) != 1 {
		if spent {
			s.refundDeepL(marked)
		}
		fallback, ferr := s.word(ctx, word, source, target,
			wordFallback{err: derr, contextHint: sentence})
		switch {
		case ferr == nil:
			return fallback, nil
		case errors.Is(ferr, ErrRateLimited) || errors.Is(ferr, ErrQuota):
			// Запасной путь честно сказал «подождите» — это точнее ошибки DeepL.
			return nil, ferr
		case deeplSkipped:
			// DeepL не пробовали: ошибка запасного пути — единственная.
			return nil, ferr
		}
		if derr == nil {
			derr = fmt.Errorf("переводчик вернул %d фрагментов вместо одного", len(out))
		}
		return nil, derr
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
	if w, err := s.word(ctx, word, source, target,
		wordFallback{contextHint: sentence}); err == nil {
		res.Text = w.Text
		res.Provider = w.Provider
	}
	return res, nil
}

// wordFallback — чем закончилась попытка DeepL выше по стеку и как вести
// себя запасному пути.
type wordFallback struct {
	// err — ошибка DeepL (nil — не пробовали: бюджет отказал, текст слишком
	// длинен или DeepL нет вовсе).
	err error
	// contextHint — предложение для повтора через DeepL, когда он есть.
	// С ним галлюцинаций на одиночных словах почти нет.
	contextHint string
	// aligned — выставить признак выравнивания у ответа запасного пути.
	// Ставится только там, где раньше его ставил прямой вызов провайдера
	// из Text: переведён запрошенный текст целиком, а не слово из контекста.
	aligned bool
}

// word переводит одиночное слово запасным провайдером.
//
// Сначала общий словарь. В нём лежат не только прежние ответы запасного
// провайдера, но и слова, выровненные DeepL внутри предложения (см. InContext),
// — то есть перевод заметно лучше того, что запасной провайдер выдаёт на слово
// в отрыве от текста. Признак Aligned при этом не выставляется: слово было
// выровнено в другом предложении, а не в этом, и выдавать чужой контекст за
// свой нечестно.
func (s *Service) word(ctx context.Context, word, source, target string, fb wordFallback) (*Result, error) {
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
	var wordsErr error
	if s.inCooldown(s.words.Name()) {
		// Не дергаем ограничившего: сразу честный 429 вместо нового.
		wordsErr = ErrRateLimited
	} else {
		var out string
		out, wordsErr = s.words.TranslateWord(ctx, word, source, target)
		switch {
		case wordsErr == nil:
			s.store(ctx, source, target, word, out, s.words.Name())
			return &Result{Text: out, Provider: s.words.Name(), Aligned: fb.aligned}, nil
		case errors.Is(wordsErr, ErrRateLimited):
			s.setCooldown(s.words.Name())
		}
	}
	// Запасной провайдер отказал. Повтор через DeepL — лучше неточный перевод,
	// чем никакой. Повтор НЕ кэшируется: словарь общий, и перевод одиночного
	// слова из режима выживания не должен отравлять его после восстановления
	// запасного пути.
	if s.deepl == nil || s.inCooldown(s.deepl.Name()) {
		return nil, wordsErr
	}
	if errors.Is(fb.err, ErrQuota) || errors.Is(fb.err, ErrRateLimited) {
		return nil, wordsErr
	}
	if !s.deeplAllowed(word) {
		return nil, wordsErr
	}
	out, err := s.deepl.TranslateTexts(ctx, []string{word}, source, target, Options{Context: fb.contextHint})
	if err != nil {
		s.refundDeepL(word)
		if errors.Is(err, ErrRateLimited) {
			s.setCooldown(s.deepl.Name())
		}
		return nil, wordsErr
	}
	if len(out) != 1 || strings.TrimSpace(out[0]) == "" {
		s.refundDeepL(word)
		return nil, wordsErr
	}
	return &Result{Text: strings.TrimSpace(out[0]), Provider: s.deepl.Name()}, nil
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
