package translate

import (
	"context"
	"errors"
	"strings"
	"testing"
)

// Соответствие «абзац к абзацу» — главный инвариант перевода книги. Клиент
// подставляет перевод на место оригинала, и потеря или лишний элемент сдвинули
// бы весь остаток текста относительно картинок и таблиц. Сдвиг заметен не сразу
// и чинится только повторным переводом, на который суточный предел уже потрачен.

// fakeProvider изображает запасной переводчик.
type fakeProvider struct {
	// calls хранит всё, что провайдер получил: по нему видно, склеились ли
	// абзацы в один запрос или ушли по одному.
	calls []string
	// keepNewlines выключается, чтобы изобразить провайдера, который потерял
	// разделитель абзацев.
	keepNewlines bool
	err          error
}

func (f *fakeProvider) Name() string { return "fake" }

func (f *fakeProvider) TranslateWord(_ context.Context, text, _, _ string) (string, error) {
	f.calls = append(f.calls, text)
	if f.err != nil {
		return "", f.err
	}
	out := "<" + text + ">"
	if !f.keepNewlines {
		out = strings.ReplaceAll(out, "\n", " ")
	}
	return out, nil
}

func newFake() *fakeProvider { return &fakeProvider{keepNewlines: true} }

func TestParagraphsKeepsCount(t *testing.T) {
	fake := newFake()
	service := NewService(nil, fake, nil)

	in := []string{"prvi pasus", "drugi pasus", "treci pasus"}
	out, err := service.Paragraphs(context.Background(), in, "", "sr", ProviderGoogle)
	if err != nil {
		t.Fatalf("перевод не удался: %v", err)
	}
	if len(out) != len(in) {
		t.Fatalf("на входе %d абзацев, на выходе %d", len(in), len(out))
	}
	for i, text := range out {
		if !strings.Contains(text, in[i]) {
			t.Errorf("абзац %d получил чужой перевод: %q", i, text)
		}
	}
}

// Разделитель абзацев переводчик сохраняет не всегда, и молчаливый сдвиг строк
// был бы худшим из возможных исходов. При расхождении абзацы обязаны уйти по
// одному.
func TestParagraphsSurvivesLostSeparator(t *testing.T) {
	fake := newFake()
	fake.keepNewlines = false
	service := NewService(nil, fake, nil)

	in := []string{"prvi", "drugi", "treci"}
	out, err := service.Paragraphs(context.Background(), in, "", "sr", ProviderGoogle)
	if err != nil {
		t.Fatalf("перевод не удался: %v", err)
	}
	if len(out) != len(in) {
		t.Fatalf("на входе %d абзацев, на выходе %d", len(in), len(out))
	}
	for i, text := range out {
		if text != "<"+in[i]+">" {
			t.Errorf("абзац %d: %q — перевод достался не от своего оригинала", i, text)
		}
	}
	// Первый запрос — склейка, затем по одному на абзац.
	if len(fake.calls) != 1+len(in) {
		t.Errorf("запросов %d, ожидалось %d", len(fake.calls), 1+len(in))
	}
}

// Абзацы склеиваются в один запрос: иначе на книгу ушли бы тысячи обращений.
func TestParagraphsBatchesIntoOneRequest(t *testing.T) {
	fake := newFake()
	service := NewService(nil, fake, nil)

	in := make([]string, 20)
	for i := range in {
		in[i] = "kratak pasus broj " + string(rune('a'+i))
	}
	if _, err := service.Paragraphs(context.Background(), in, "", "sr", ProviderGoogle); err != nil {
		t.Fatalf("перевод не удался: %v", err)
	}
	if len(fake.calls) != 1 {
		t.Errorf("двадцать коротких абзацев ушли %d запросами, ожидался 1", len(fake.calls))
	}
}

// Длинный документ обязан резаться на куски: у публичного endpoint есть предел
// длины запроса, и упереться в него означает потерять весь кусок целиком.
func TestParagraphsSplitsLongDocument(t *testing.T) {
	fake := newFake()
	service := NewService(nil, fake, nil)

	in := make([]string, 12)
	for i := range in {
		in[i] = strings.Repeat("reč ", 100)
	}
	out, err := service.Paragraphs(context.Background(), in, "", "sr", ProviderGoogle)
	if err != nil {
		t.Fatalf("перевод не удался: %v", err)
	}
	if len(out) != len(in) {
		t.Fatalf("на входе %d абзацев, на выходе %d", len(in), len(out))
	}
	if len(fake.calls) < 2 {
		t.Errorf("длинный документ ушёл %d запросом", len(fake.calls))
	}
	for _, call := range fake.calls {
		if runes := len([]rune(call)); runes > googleChunkRunes*2 {
			t.Errorf("кусок длиной %d знаков — предел не соблюдён", runes)
		}
	}
}

// Абзацы без букв — номера страниц, разделители — не должны тратить квоту.
func TestParagraphsSkipsTextWithoutLetters(t *testing.T) {
	fake := newFake()
	service := NewService(nil, fake, nil)

	in := []string{"— 42 —", "prava rečenica", "***", "   "}
	out, err := service.Paragraphs(context.Background(), in, "", "sr", ProviderGoogle)
	if err != nil {
		t.Fatalf("перевод не удался: %v", err)
	}
	for _, i := range []int{0, 2, 3} {
		if out[i] != in[i] {
			t.Errorf("абзац %d без букв изменён: %q", i, out[i])
		}
	}
	for _, call := range fake.calls {
		if strings.Contains(call, "42") || strings.Contains(call, "***") {
			t.Errorf("абзац без букв ушёл переводчику: %q", call)
		}
	}
}

// Пустой перевод — это потеря абзаца. Оригинал в таком месте честнее пустоты:
// читатель увидит непереведённую строку и поймёт, что случилось.
func TestParagraphsKeepsOriginalOnEmptyTranslation(t *testing.T) {
	service := NewService(nil, blankProvider{}, nil)

	out, err := service.Paragraphs(context.Background(), []string{"važan pasus"}, "", "sr", ProviderGoogle)
	if err != nil {
		t.Fatalf("перевод не удался: %v", err)
	}
	if out[0] != "važan pasus" {
		t.Errorf("пустой перевод заменил абзац на %q", out[0])
	}
}

type blankProvider struct{}

func (blankProvider) Name() string { return "blank" }
func (blankProvider) TranslateWord(context.Context, string, string, string) (string, error) {
	return "   ", nil
}

// Ошибка провайдера обязана дойти до вызывающего: молча вернуть половину книги
// в оригинале значит выдать испорченный текст за перевод.
func TestParagraphsReportsProviderError(t *testing.T) {
	fake := newFake()
	fake.err = errors.New("провайдер недоступен")
	service := NewService(nil, fake, nil)

	if _, err := service.Paragraphs(
		context.Background(), []string{"pasus"}, "", "sr", ProviderGoogle,
	); err == nil {
		t.Error("ошибка провайдера потеряна")
	}
}

func TestPickProviderByLength(t *testing.T) {
	both := NewService(NewDeepL("test-key:fx"), newFake(), nil)
	if got := both.PickProvider(5_000); got != ProviderDeepL {
		t.Errorf("короткий документ ушёл в %q", got)
	}
	if got := both.PickProvider(DeepLDocumentRunes + 1); got != ProviderGoogle {
		t.Errorf("книга ушла в %q — месячной квоты DeepL на неё не хватит", got)
	}

	onlyFallback := NewService(nil, newFake(), nil)
	if got := onlyFallback.PickProvider(100); got != ProviderGoogle {
		t.Errorf("без DeepL выбран %q", got)
	}

	none := NewService(nil, nil, nil)
	if got := none.PickProvider(100); got != "" {
		t.Errorf("без провайдеров выбран %q", got)
	}
}

func TestParagraphsRejectsUnknownProvider(t *testing.T) {
	service := NewService(nil, newFake(), nil)
	if _, err := service.Paragraphs(
		context.Background(), []string{"pasus"}, "", "sr", "выдуманный",
	); !errors.Is(err, ErrNoProvider) {
		t.Errorf("неизвестный провайдер дал ошибку %v", err)
	}
}

// Запасной провайдер написан для читалки, где источник всегда сербский, и
// пустое значение заменяет на "sr". Для книги это означало бы перевод «с
// сербского на сербский»: Google в таком случае возвращает исходный текст без
// изменений — то есть непереведённую книгу и потраченный суточный предел.
func TestParagraphsAsksFallbackToDetectSource(t *testing.T) {
	fake := &sourceSpy{}
	service := NewService(nil, fake, nil)

	if _, err := service.Paragraphs(
		context.Background(), []string{"Books were his best friends."}, "", "sr", ProviderGoogle,
	); err != nil {
		t.Fatalf("перевод не удался: %v", err)
	}
	if fake.source != "auto" {
		t.Errorf("источник передан как %q, ожидалось \"auto\"", fake.source)
	}

	// Явно указанный язык оригинала не подменяется.
	fake.source = ""
	if _, err := service.Paragraphs(
		context.Background(), []string{"Books were his best friends."}, "en", "sr", ProviderGoogle,
	); err != nil {
		t.Fatalf("перевод не удался: %v", err)
	}
	if fake.source != "en" {
		t.Errorf("источник передан как %q, ожидалось \"en\"", fake.source)
	}
}

type sourceSpy struct{ source string }

func (s *sourceSpy) Name() string { return "spy" }
func (s *sourceSpy) TranslateWord(_ context.Context, text, source, _ string) (string, error) {
	s.source = source
	return text, nil
}

func TestCountRunes(t *testing.T) {
	// Кириллица занимает два байта на букву: считать байты вместо букв значило
	// бы вдвое завысить объём и выбрать не того провайдера.
	if got := CountRunes([]string{"кућа", "dom"}); got != 7 {
		t.Errorf("посчитано %d знаков, ожидалось 7", got)
	}
}
