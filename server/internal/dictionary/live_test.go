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
