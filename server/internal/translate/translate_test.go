package translate

import (
	"context"
	"encoding/json"
	"errors"
	"net/http"
	"net/http/httptest"
	"strings"
	"sync"
	"testing"
)

func TestMarkWord(t *testing.T) {
	const sentence = "Ovo je velika kuća sa baštom."
	start := strings.Index(sentence, "kuća")

	got, err := MarkWord(sentence, start, start+len("kuća"))
	if err != nil {
		t.Fatal(err)
	}
	if want := "Ovo je velika <w>kuća</w> sa baštom."; got != want {
		t.Errorf("MarkWord = %q, want %q", got, want)
	}
}

// Сербская диакритика обязана дойти до переводчика без изменений: č и ć —
// разные буквы, и подмена меняет слово.
func TestMarkWordKeepsDiacritics(t *testing.T) {
	const sentence = "Čitam knjigu o džezu i đacima."
	start := strings.Index(sentence, "džezu")

	got, err := MarkWord(sentence, start, start+len("džezu"))
	if err != nil {
		t.Fatal(err)
	}
	if !strings.Contains(got, "<w>džezu</w>") {
		t.Errorf("слово исказилось: %q", got)
	}
	if !strings.Contains(got, "Čitam") || !strings.Contains(got, "đacima") {
		t.Errorf("диакритика вне тега пострадала: %q", got)
	}
}

// Символы разметки в тексте книги обязаны экранироваться, иначе ответ
// переводчика станет неразбираемым.
func TestMarkWordEscapesMarkupCharacters(t *testing.T) {
	const sentence = "Uslov a < b & c > d važi za reč."
	start := strings.Index(sentence, "reč")

	got, err := MarkWord(sentence, start, start+len("reč"))
	if err != nil {
		t.Fatal(err)
	}
	if strings.Contains(strings.ReplaceAll(got, "<w>", ""), "<") &&
		!strings.Contains(got, "&lt;") {
		t.Errorf("«<» не экранирован: %q", got)
	}
	if !strings.Contains(got, "&amp;") {
		t.Errorf("«&» не экранирован: %q", got)
	}
	// Ровно одна пара тегов: чужие «<» не должны стать разметкой.
	if n := strings.Count(got, "<w>"); n != 1 {
		t.Errorf("открывающих тегов %d, ожидался один: %q", n, got)
	}
}

func TestMarkWordRejectsBadBounds(t *testing.T) {
	const sentence = "Kratka rečenica."
	cases := [][2]int{{-1, 5}, {5, 5}, {8, 3}, {0, len(sentence) + 1}}
	for _, c := range cases {
		if _, err := MarkWord(sentence, c[0], c[1]); err == nil {
			t.Errorf("границы [%d:%d) приняты как корректные", c[0], c[1])
		}
	}
}

func TestSplitMarked(t *testing.T) {
	sentence, word := SplitMarked("Это большой <w>дом</w> с садом.")
	if sentence != "Это большой дом с садом." {
		t.Errorf("предложение = %q", sentence)
	}
	if word != "дом" {
		t.Errorf("слово = %q", word)
	}
}

// Переводчик вправе перестроить фразу и потерять тег. Это не ошибка: перевод
// предложения обязан вернуться, а слово — остаться пустым, а не выдуманным.
func TestSplitMarkedWithoutTags(t *testing.T) {
	sentence, word := SplitMarked("Это большой дом с садом.")
	if sentence != "Это большой дом с садом." {
		t.Errorf("предложение = %q", sentence)
	}
	if word != "" {
		t.Errorf("слово = %q, ожидалась пустая строка", word)
	}
}

func TestSplitMarkedUnescapes(t *testing.T) {
	sentence, word := SplitMarked("Условие a &lt; b &amp; c для <w>слова</w>.")
	if !strings.Contains(sentence, "a < b & c") {
		t.Errorf("экранирование не снято: %q", sentence)
	}
	if word != "слова" {
		t.Errorf("слово = %q", word)
	}
}

// «&amp;lt;» — это буквально текст «&lt;», а не символ «<».
func TestUnescapeOrderIsSafe(t *testing.T) {
	sentence, _ := SplitMarked("Запись &amp;lt; в тексте.")
	if !strings.Contains(sentence, "&lt;") {
		t.Errorf("двойное экранирование развёрнуто неверно: %q", sentence)
	}
}

func TestIsSingleWord(t *testing.T) {
	single := []string{"kuća", "Čitavuk", "српско-руски", "reč", "džem"}
	for _, s := range single {
		if !IsSingleWord(s) {
			t.Errorf("IsSingleWord(%q) = false, ожидалось true", s)
		}
	}
	multi := []string{"velika kuća", "kuća.", "Ovo je", "", "   ", "reč!", "2 reči"}
	for _, s := range multi {
		if IsSingleWord(s) {
			t.Errorf("IsSingleWord(%q) = true, ожидалось false", s)
		}
	}
}

func TestParseGoogleResponse(t *testing.T) {
	body := []byte(`[[["дом","kuća",null,null,10]],null,"sr"]`)
	got, err := parseGoogleResponse(body)
	if err != nil {
		t.Fatal(err)
	}
	if got != "дом" {
		t.Errorf("перевод = %q", got)
	}
}

// Длинный текст приходит сегментами и должен склеиваться в исходном порядке.
func TestParseGoogleResponseJoinsSegments(t *testing.T) {
	body := []byte(`[[["Это большой дом. ","...",null,null,0],["Он стоит на улице.","...",null,null,0]],null,"sr"]`)
	got, err := parseGoogleResponse(body)
	if err != nil {
		t.Fatal(err)
	}
	if got != "Это большой дом. Он стоит на улице." {
		t.Errorf("сегменты склеены неверно: %q", got)
	}
}

func TestParseGoogleResponseRejectsGarbage(t *testing.T) {
	for _, body := range []string{``, `null`, `{}`, `[]`, `[null]`, `не json`} {
		if _, err := parseGoogleResponse([]byte(body)); err == nil {
			t.Errorf("мусор %q принят как валидный ответ", body)
		}
	}
}

// --- Подставные зависимости для проверки маршрутизации ---

type fakeWords struct {
	mu    sync.Mutex
	calls []string
	out   string
	err   error
}

func (f *fakeWords) TranslateWord(_ context.Context, word, _, _ string) (string, error) {
	f.mu.Lock()
	defer f.mu.Unlock()
	f.calls = append(f.calls, word)
	if f.err != nil {
		return "", f.err
	}
	return f.out, nil
}
func (f *fakeWords) Name() string { return "fake" }

type fakeCache struct {
	mu    sync.Mutex
	data  map[string]string
	puts  int
	gets  int
	hitOn string
}

func (c *fakeCache) Get(_ context.Context, _, _, text string) (string, string, bool) {
	c.mu.Lock()
	defer c.mu.Unlock()
	c.gets++
	if v, ok := c.data[text]; ok {
		return v, "cache", true
	}
	return "", "", false
}

func (c *fakeCache) Put(_ context.Context, _, _, text, translation, _ string) error {
	c.mu.Lock()
	defer c.mu.Unlock()
	if c.data == nil {
		c.data = map[string]string{}
	}
	c.data[text] = translation
	c.puts++
	return nil
}

// Главное правило маршрутизации: одиночное слово не уходит в DeepL.
func TestSingleWordGoesToWordProviderNotDeepL(t *testing.T) {
	words := &fakeWords{out: "дом"}
	// deepl == nil означал бы, что тест ничего не доказывает. Подставляем
	// заведомо нерабочий ключ: обращение к нему провалило бы тест по таймауту,
	// а корректная маршрутизация до него просто не дойдёт.
	svc := NewService(NewDeepL("нерабочий-ключ"), words, nil)

	res, err := svc.Text(context.Background(), "kuća", "sr", "ru")
	if err != nil {
		t.Fatalf("Text: %v", err)
	}
	if res.Text != "дом" {
		t.Errorf("перевод = %q", res.Text)
	}
	if res.Provider != "fake" {
		t.Errorf("одиночное слово ушло провайдеру %q вместо запасного", res.Provider)
	}
	if res.Aligned {
		t.Error("перевод слова без контекста помечен как выровненный")
	}
	if len(words.calls) != 1 || words.calls[0] != "kuća" {
		t.Errorf("запасной провайдер вызван неверно: %v", words.calls)
	}
}

func TestCacheHitSkipsProviders(t *testing.T) {
	words := &fakeWords{err: errors.New("провайдер не должен вызываться")}
	cache := &fakeCache{data: map[string]string{"kuća": "дом"}}
	svc := NewService(nil, words, cache)

	res, err := svc.Text(context.Background(), "kuća", "sr", "ru")
	if err != nil {
		t.Fatalf("Text: %v", err)
	}
	if !res.Cached {
		t.Error("ответ не помечен как взятый из кеша")
	}
	if res.Text != "дом" {
		t.Errorf("перевод = %q", res.Text)
	}
	if len(words.calls) != 0 {
		t.Errorf("при попадании в кеш провайдер всё равно вызван: %v", words.calls)
	}
}

func TestEmptyTextRejected(t *testing.T) {
	svc := NewService(nil, &fakeWords{out: "x"}, nil)
	for _, s := range []string{"", "   ", "\n\t"} {
		if _, err := svc.Text(context.Background(), s, "sr", "ru"); !errors.Is(err, ErrEmptyText) {
			t.Errorf("Text(%q) вернул %v, ожидалась ErrEmptyText", s, err)
		}
	}
}

func TestServiceWithoutProvidersReportsUnavailable(t *testing.T) {
	svc := NewService(nil, nil, nil)
	if svc.Available() {
		t.Error("сервис без провайдеров считает себя работоспособным")
	}
	if _, err := svc.Text(context.Background(), "kuća", "sr", "ru"); !errors.Is(err, ErrNoProvider) {
		t.Errorf("ожидалась ErrNoProvider, получено %v", err)
	}
}

// Слишком длинный фрагмент отвергается до похода в сеть.
func TestOverlongTextRejected(t *testing.T) {
	words := &fakeWords{err: errors.New("не должен вызываться")}
	svc := NewService(nil, words, nil)

	long := strings.Repeat("реч ", MaxTextRunes)
	if _, err := svc.Text(context.Background(), long, "sr", "ru"); err == nil {
		t.Fatal("слишком длинный текст принят")
	}
	if len(words.calls) != 0 {
		t.Error("длинный текст всё-таки ушёл провайдеру")
	}
}

// NewDeepL должен отличать free-ключ от платного: у них разные хосты.
func TestDeepLHostDependsOnKeyPlan(t *testing.T) {
	free := NewDeepL("abc:fx")
	if free.host != "https://api-free.deepl.com" {
		t.Errorf("free-ключ направлен на %s", free.host)
	}
	pro := NewDeepL("abc")
	if pro.host != "https://api.deepl.com" {
		t.Errorf("платный ключ направлен на %s", pro.host)
	}
	if NewDeepL("   ") != nil {
		t.Error("пустой ключ должен давать nil-клиента, а не рабочего")
	}
}

// Смещение внутри многобайтового символа обязано отвергаться: клиент на Dart
// считает индексы в единицах UTF-16, и ошибка пересчёта пометила бы тегом
// половину буквы, а не слово.
func TestMarkWordRejectsOffsetInsideRune(t *testing.T) {
	const sentence = "Ово је прва глава књиге."
	// Каждая кириллическая буква занимает два байта в UTF-8, поэтому нечётное
	// смещение всегда попадает в середину символа.
	if _, err := MarkWord(sentence, 1, 5); err == nil {
		t.Error("смещение внутри символа принято")
	}
	if _, err := MarkWord(sentence, 0, 5); err == nil {
		t.Error("правая граница внутри символа принята")
	}

	// Корректные байтовые границы слова «прва».
	start := strings.Index(sentence, "прва")
	got, err := MarkWord(sentence, start, start+len("прва"))
	if err != nil {
		t.Fatalf("верные границы отвергнуты: %v", err)
	}
	if !strings.Contains(got, "<w>прва</w>") {
		t.Errorf("слово помечено неверно: %q", got)
	}
}

// Неверные смещения обязаны давать отказ, а не перевод обрезка строки.
//
// Это тот самый случай, когда уверенный неверный ответ хуже отсутствия ответа:
// пользователь увидел бы осмысленный русский текст, не имеющий отношения к
// слову, которое он нажал.
func TestInContextRejectsBadOffsets(t *testing.T) {
	const sentence = "Ово је велика кућа са баштом."

	// Каждая кириллическая буква занимает два байта, поэтому смещение внутри
	// буквы всегда попадает на её второй байт.
	cases := map[string][2]int{
		"начало внутри буквы": {1, 13},
		"конец внутри буквы":  {0, 13},
		"за пределами строки": {0, len(sentence) + 5},
		"перевёрнутые":        {10, 4},
		"отрицательное":       {-3, 8},
		"пустой диапазон":     {8, 8},
	}

	for name, bounds := range cases {
		t.Run(name, func(t *testing.T) {
			// Свой провайдер на каждый случай: общий накапливал бы вызовы
			// предыдущих подтестов и проверка теряла бы смысл.
			words := &fakeWords{err: errors.New("провайдер не должен вызываться")}
			svc := NewService(nil, words, nil)

			if _, err := svc.InContext(context.Background(), sentence, bounds[0], bounds[1], "sr", "ru"); err == nil {
				t.Fatal("некорректные границы приняты")
			}
			if len(words.calls) != 0 {
				t.Errorf("обрезок строки всё-таки ушёл переводчику: %q", words.calls)
			}
		})
	}
}

// Границы по символам корректны, даже если они не совпадают с границами слова:
// пользователь вправе выделить часть слова, и это не ошибка.
func TestInContextAcceptsAnyRuneBoundary(t *testing.T) {
	words := &fakeWords{out: "нечто"}
	svc := NewService(nil, words, nil)

	// [0:9) — «Ово ј»: обрывается посреди слова, но на границе символа.
	if _, err := svc.InContext(context.Background(), "Ово је велика кућа.", 0, 9, "sr", "ru"); err != nil {
		t.Fatalf("корректная граница символа отвергнута: %v", err)
	}
}

// Верные границы на кириллице по-прежнему работают.
func TestInContextAcceptsCyrillicOffsets(t *testing.T) {
	words := &fakeWords{out: "дом"}
	svc := NewService(nil, words, nil)

	const sentence = "Ово је велика кућа са баштом."
	start := strings.Index(sentence, "кућа")

	res, err := svc.InContext(context.Background(), sentence, start, start+len("кућа"), "sr", "ru")
	if err != nil {
		t.Fatalf("верные границы отвергнуты: %v", err)
	}
	if res.Text != "дом" {
		t.Errorf("перевод = %q", res.Text)
	}
}

// --- Кеш вокруг перевода в контексте ---
//
// Здесь проверяется не удобство, а бюджет. Месячной квоты DeepL Free хватает
// примерно на четыре тысячи нажатий на слово НА ВСЕХ пользователей сразу, и
// каждый лишний запрос отнимает их у кого-то другого.

// stubDeepL поднимает подставной DeepL и считает обращения.
func stubDeepL(t *testing.T, reply func(texts []string) []string) (*DeepL, *int) {
	t.Helper()
	calls := 0

	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		calls++
		if err := r.ParseForm(); err != nil {
			t.Errorf("подставной DeepL не разобрал запрос: %v", err)
		}
		out := reply(r.Form["text"])
		items := make([]map[string]string, 0, len(out))
		for _, text := range out {
			items = append(items, map[string]string{"text": text})
		}
		w.Header().Set("Content-Type", "application/json")
		_ = json.NewEncoder(w).Encode(map[string]any{"translations": items})
	}))
	t.Cleanup(server.Close)

	client := NewDeepL("тестовый-ключ:fx")
	client.host = server.URL
	return client, &calls
}

const (
	testSentence   = "Ovo je velika kuća sa baštom."
	testTranslated = "Это большой <w>дом</w> с садом."
)

func markedReply([]string) []string { return []string{testTranslated} }

func wordAt(t *testing.T, sentence, word string) (int, int) {
	t.Helper()
	start := strings.Index(sentence, word)
	if start < 0 {
		t.Fatalf("слово %q не найдено в %q", word, sentence)
	}
	return start, start + len(word)
}

// Второе нажатие на то же слово обязано обойтись без DeepL.
//
// Без этого чтение книги во второй раз стоит ровно столько же, сколько в
// первый, а второй читатель той же книги — как первый. Кеш общий, поэтому
// экономия растёт с числом читателей, а не с усидчивостью одного.
func TestInContextRepeatedTapSkipsDeepL(t *testing.T) {
	deepl, calls := stubDeepL(t, markedReply)
	cache := &fakeCache{}
	svc := NewService(deepl, &fakeWords{err: errors.New("запасной провайдер не нужен")}, cache)

	start, end := wordAt(t, testSentence, "kuća")

	first, err := svc.InContext(context.Background(), testSentence, start, end, "sr", "ru")
	if err != nil {
		t.Fatalf("первое нажатие: %v", err)
	}
	if first.Text != "дом" || first.Sentence != "Это большой дом с садом." {
		t.Fatalf("первое нажатие вернуло %q / %q", first.Text, first.Sentence)
	}
	if first.Cached {
		t.Error("первое нажатие помечено как взятое из кеша")
	}

	second, err := svc.InContext(context.Background(), testSentence, start, end, "sr", "ru")
	if err != nil {
		t.Fatalf("второе нажатие: %v", err)
	}
	if *calls != 1 {
		t.Errorf("обращений к DeepL: %d, ожидалось 1", *calls)
	}
	if !second.Cached {
		t.Error("повтор не помечен как взятый из кеша")
	}
	// Ответ из кеша обязан быть полным: клиент показывает поле «Всё
	// предложение», и молчаливая потеря контекста выглядела бы поломкой.
	if second.Text != first.Text || second.Sentence != first.Sentence {
		t.Errorf("ответ из кеша %q / %q не совпал с живым %q / %q",
			second.Text, second.Sentence, first.Text, first.Sentence)
	}
	if !second.Aligned {
		t.Error("ответ из кеша потерял признак выравнивания")
	}
}

// Выровненное слово попадает в общий словарь отдельной записью.
//
// Предложения не повторяются почти никогда, а сербские слова — постоянно.
// Пока слово хранится только внутри записи о своём предложении, оплаченный
// перевод не достаётся больше никому.
func TestInContextStoresWordSeparately(t *testing.T) {
	deepl, _ := stubDeepL(t, markedReply)
	cache := &fakeCache{}
	svc := NewService(deepl, &fakeWords{out: "не должен пригодиться"}, cache)

	start, end := wordAt(t, testSentence, "kuća")
	if _, err := svc.InContext(context.Background(), testSentence, start, end, "sr", "ru"); err != nil {
		t.Fatalf("InContext: %v", err)
	}

	if got := cache.data["kuća"]; got != "дом" {
		t.Errorf("слово в словаре = %q, ожидалось \"дом\"", got)
	}
	if got := cache.data[testSentence]; got != "Это большой дом с садом." {
		t.Errorf("предложение в кеше = %q", got)
	}
	if _, ok := cache.data["Ovo je velika <w>kuća</w> sa baštom."]; !ok {
		t.Error("помеченное предложение не сохранено — повтор нажатия снова уйдёт в DeepL")
	}
}

// Когда DeepL отказывает — по месячному пределу или недоступности, — запасной
// путь обязан взять слово из словаря, а не идти к запасному провайдеру за
// заведомо ненадёжным переводом одиночного слова.
func TestWordCacheServesFallbackAfterDeepLFails(t *testing.T) {
	cache := &fakeCache{data: map[string]string{"kuća": "дом"}}
	words := &fakeWords{err: errors.New("запасной провайдер не должен вызываться")}

	failing, _ := stubDeepL(t, func([]string) []string { return nil })
	svc := NewService(failing, words, cache)

	start, end := wordAt(t, testSentence, "kuća")
	res, err := svc.InContext(context.Background(), testSentence, start, end, "sr", "ru")
	if err != nil {
		t.Fatalf("InContext: %v", err)
	}
	if res.Text != "дом" {
		t.Errorf("перевод = %q, ожидался \"дом\" из словаря", res.Text)
	}
	if !res.Cached {
		t.Error("ответ не помечен как взятый из кеша")
	}
	// Слово выровнено в ЧУЖОМ предложении, поэтому выдавать его за
	// выровненное в этом нельзя: клиент на этом признаке строит предупреждение.
	if res.Aligned {
		t.Error("слово из словаря выдано за выровненное в этом предложении")
	}
	if len(words.calls) != 0 {
		t.Errorf("запасной провайдер вызван зря: %v", words.calls)
	}
}
