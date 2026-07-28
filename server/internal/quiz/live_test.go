package quiz

import (
	"os"
	"strings"
	"testing"

	"github.com/citavuk/server/internal/config"
)

// TestGenerateLive обращается к настоящей модели.
//
// Включается вручную: CITAVUK_QUIZ_LIVE=1 go test ./internal/quiz/. Каждый
// запуск стоит денег и занимает до минуты, поэтому в обычной сборке он молчит.
// Нужен он затем, что подсказка — единственная часть раздела, которую нельзя
// проверить без модели: разбор ответа мы проверяем на образцах, а вот
// «понимает ли модель, чего от неё хотят» — только так.
func TestGenerateLive(t *testing.T) {
	if os.Getenv("CITAVUK_QUIZ_LIVE") != "1" {
		t.Skip("живой вызов модели выключен: задайте CITAVUK_QUIZ_LIVE=1")
	}
	cfg, err := config.Load("../../../.env")
	if err != nil {
		t.Skipf("нет конфигурации: %v", err)
	}
	g := NewGenerator(cfg.QuizAPIKey, cfg.QuizModel, cfg.QuizURL)
	if !g.Enabled() {
		t.Skip("ключ модели не задан")
	}

	source := strings.Repeat(
		"Падеж в сербском языке выражает роль слова в предложении. "+
			"Номинатив отвечает на вопрос «ко? шта?» и обозначает подлежащее. "+
			"Генитив отвечает на вопрос «кога? чега?» и обозначает принадлежность. "+
			"Датив отвечает на вопрос «коме? чему?» и обозначает адресата. ", 4)

	result, err := g.Generate(t.Context(), source, 5)
	if err != nil {
		t.Fatalf("модель не составила тест: %v", err)
	}
	if len(result.Questions) == 0 {
		t.Fatal("модель вернула тест без вопросов")
	}
	for i, q := range result.Questions {
		if len(q.Options) != optionsPerQuestion {
			t.Fatalf("вопрос %d: вариантов %d", i, len(q.Options))
		}
		if q.Answer < 0 || q.Answer >= len(q.Options) {
			t.Fatalf("вопрос %d: номер ответа %d вне списка", i, q.Answer)
		}
		if strings.TrimSpace(q.Explanation) == "" {
			t.Fatalf("вопрос %d без объяснения", i)
		}
	}
	t.Logf("тема: %s (%s), вопросов: %d",
		result.Title, result.Subject, len(result.Questions))
}
