package quiz

import (
	"strings"
	"testing"
)

func TestSourceSHAIgnoresFormatting(t *testing.T) {
	// Один конспект, скопированный по-разному, — один тест и один вызов модели.
	a := SourceSHA("Ниш — третий по величине город Сербии.")
	b := SourceSHA("  ниш —  третий\nпо величине   город Сербии.  ")
	if a != b {
		t.Fatalf("адрес материала зависит от пробелов: %s != %s", a, b)
	}
	if a == SourceSHA("Нови-Сад — второй по величине город Сербии.") {
		t.Fatal("разные материалы получили один адрес")
	}
}

func TestParseResultAcceptsFencedJSON(t *testing.T) {
	content := "Вот тест:\n```json\n" + `{
      "title":"Ниш","subject":"География",
      "questions":[{"question":"Какой по счёту город?",
        "options":["Первый","Второй","Третий","Четвёртый"],
        "answer":2,"explanation":"Так сказано в тексте.","wrongHint":"Путают с Нови-Садом."}]
    }` + "\n```"

	result, err := parseResult(content)
	if err != nil {
		t.Fatalf("не разобрали ответ модели: %v", err)
	}
	if result.Title != "Ниш" || len(result.Questions) != 1 {
		t.Fatalf("неожиданный результат: %+v", result)
	}
	if result.Questions[0].Answer != 2 {
		t.Fatalf("потерян номер верного ответа: %+v", result.Questions[0])
	}
}

func TestValidQuestionsDropsBroken(t *testing.T) {
	questions := []Question{
		// Верный вопрос.
		{Question: "Вопрос", Options: []string{"а", "б", "в", "г"}, Answer: 1},
		// Вариантов не четыре.
		{Question: "Вопрос", Options: []string{"а", "б"}, Answer: 0},
		// Номер ответа вне списка.
		{Question: "Вопрос", Options: []string{"а", "б", "в", "г"}, Answer: 9},
		// Повторяющиеся варианты: правильный ответ неотличим от неправильного.
		{Question: "Вопрос", Options: []string{"а", "а", "в", "г"}, Answer: 0},
		// Пустая формулировка.
		{Question: "   ", Options: []string{"а", "б", "в", "г"}, Answer: 0},
	}

	valid := validQuestions(questions)
	if len(valid) != 1 {
		t.Fatalf("ожидался один пригодный вопрос, получено %d", len(valid))
	}
}

func TestGenerateRejectsShortSource(t *testing.T) {
	g := NewGenerator("ключ", "модель", "https://example.invalid")
	if _, err := g.Generate(t.Context(), "Короткий текст.", 5); err != ErrTooShort {
		t.Fatalf("короткий материал прошёл проверку: %v", err)
	}
}

func TestGenerateWithoutKeyDisabled(t *testing.T) {
	g := NewGenerator("  ", "модель", "https://example.invalid")
	if g.Enabled() {
		t.Fatal("генератор без ключа считает себя настроенным")
	}
	if _, err := g.Generate(t.Context(), strings.Repeat("текст ", 200), 5); err != ErrNotConfigured {
		t.Fatalf("ожидали ErrNotConfigured, получили %v", err)
	}
}

func TestExcerptTrims(t *testing.T) {
	got := Excerpt("Первое  предложение.\n\nВторое предложение.", 20)
	if len([]rune(got)) > 21 || !strings.HasSuffix(got, "…") {
		t.Fatalf("выдержка не обрезана: %q", got)
	}
}
