package dictionary

import (
	"context"
	"os"
	"testing"
	"time"
)

// Проверка против настоящего srpskirecnik.com. По умолчанию пропускается:
// тесты не должны зависеть от чужого сайта и от наличия интернета. Запускать
// руками, когда есть подозрение, что у них сменился формат ответа:
//
//	CITAVUK_NETWORK_TESTS=1 go test ./internal/dictionary/ -run Live -v
func TestLiveLookup(t *testing.T) {
	if os.Getenv("CITAVUK_NETWORK_TESTS") != "1" {
		t.Skip("сетевой тест: CITAVUK_NETWORK_TESTS=1")
	}

	ctx, cancel := context.WithTimeout(context.Background(), 20*time.Second)
	defer cancel()

	// Слово задано латиницей намеренно: так его напишет читатель книги, и по
	// пути оно должно превратиться в кириллицу.
	entry, err := New(time.Minute).Lookup(ctx, "nihilizam")
	if err != nil {
		t.Fatalf("Lookup: %v", err)
	}
	if entry.Headword == "" || len(entry.Senses) == 0 {
		t.Fatalf("пустая статья: %+v", entry)
	}
	if entry.SourceTitle == "" || entry.URL == "" {
		t.Errorf("нет указания источника: %+v", entry)
	}
	t.Logf("%s (%s): %s", entry.Headword, entry.Grammar, entry.Senses[0].Definition)
	t.Logf("источник: %s, том %d, с. %d — %s",
		entry.SourceTitle, entry.Volume, entry.Page, entry.URL)
}

// Проверка настоящей модели: знает ли она разговорное слово и откажется ли от
// выдуманного. Второе важнее — сочинённое объяснение читатель не отличит от
// словарной статьи. Прогонять при смене модели:
//
//	CITAVUK_NETWORK_TESTS=1 POLZA_AI_KEY=… go test ./internal/dictionary/ -run LiveExplain -v
func TestLiveExplain(t *testing.T) {
	if os.Getenv("CITAVUK_NETWORK_TESTS") != "1" {
		t.Skip("сетевой тест: CITAVUK_NETWORK_TESTS=1")
	}
	key := os.Getenv("POLZA_AI_KEY")
	if key == "" {
		t.Skip("нет POLZA_AI_KEY")
	}
	explainer := NewExplainer(key, envOrDefault("CITAVUK_DEFINITION_AI_MODEL", "google/gemini-3.7-flash"),
		envOrDefault("CITAVUK_DEFINITION_AI_URL", "https://api.polza.ai/api/v1/chat/completions"),
		envOrDefault("CITAVUK_DEFINITION_AI_REASONING", "low"))

	ctx, cancel := context.WithTimeout(context.Background(), 60*time.Second)
	defer cancel()

	// Разговорное слово, которого в словаре Матице српске нет.
	entry, err := explainer.Explain(ctx, "фолирант")
	if err != nil {
		t.Fatalf("модель не объяснила обычное разговорное слово: %v", err)
	}
	if !entry.Generated || len(entry.Senses) == 0 {
		t.Fatalf("толкование пустое или без пометки: %+v", entry)
	}
	t.Logf("%s (%s): %s", entry.Headword, entry.Grammar, entry.Senses[0].Definition)

	// Выдуманные слова: модель обязана сказать, что их нет. Слова подобраны так,
	// чтобы не быть правдоподобными производными от живого корня: «трабуњавица»
	// от «трабуњати» модель признаёт словом примерно в половине прогонов, и
	// проверять ею — значит получить мигающий тест вместо проверки.
	for _, word := range []string{"зорњикав", "прешкољавац", "крњумпаст", "пљаскодер"} {
		if made, err := explainer.Explain(ctx, word); err == nil {
			t.Errorf("модель сочинила слово %q: %s", word, made.Senses[0].Definition)
		}
	}
}

func envOrDefault(name, fallback string) string {
	if value := os.Getenv(name); value != "" {
		return value
	}
	return fallback
}
