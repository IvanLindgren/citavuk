package store

import (
	"context"
	"os"
	"testing"
	"time"

	"github.com/jackc/pgx/v5"

	"github.com/citavuk/server/internal/config"
)

// testStore подключается к базе из CITAVUK_TEST_DATABASE_URL, а если её нет —
// к обычной DATABASE_URL из .env репозитория. Без базы тест пропускается:
// сборка на машине без доступа к PostgreSQL не должна падать.
func testStore(t *testing.T) *Store {
	t.Helper()

	url := os.Getenv("CITAVUK_TEST_DATABASE_URL")
	if url == "" {
		if cfg, err := config.Load("../../../.env"); err == nil {
			url = cfg.DatabaseURL
		}
	}
	if url == "" {
		t.Skip("нет строки подключения к PostgreSQL — тест пропущен")
	}

	ctx, cancel := context.WithTimeout(context.Background(), 30*time.Second)
	defer cancel()

	s, err := Open(ctx, url)
	if err != nil {
		t.Skipf("PostgreSQL недоступен: %v", err)
	}
	t.Cleanup(s.Close)
	return s
}

func TestMigrateIsIdempotent(t *testing.T) {
	s := testStore(t)
	ctx := context.Background()

	if _, err := s.Migrate(ctx); err != nil {
		t.Fatalf("первый прогон миграций: %v", err)
	}

	// Повторный запуск обязан быть пустым: сервер применяет миграции на каждом
	// старте, и второй запуск не должен ничего трогать.
	ran, err := s.Migrate(ctx)
	if err != nil {
		t.Fatalf("повторный прогон миграций: %v", err)
	}
	if len(ran) != 0 {
		t.Errorf("повторный прогон применил миграции заново: %v", ran)
	}

	// Схема действительно создана.
	for _, table := range []string{"users", "identities", "sessions", "books",
		"book_contents", "vocabulary", "reviews", "translation_cache"} {
		var exists bool
		err := s.Pool.QueryRow(ctx,
			`SELECT EXISTS (SELECT 1 FROM information_schema.tables
			                WHERE table_schema = 'public' AND table_name = $1)`, table).Scan(&exists)
		if err != nil {
			t.Fatalf("проверка таблицы %s: %v", table, err)
		}
		if !exists {
			t.Errorf("таблица %s не создана", table)
		}
	}
}

// Ошибка внутри транзакции обязана откатывать всё, что она успела сделать.
func TestInTxRollsBackOnError(t *testing.T) {
	s := testStore(t)
	ctx := context.Background()
	if _, err := s.Migrate(ctx); err != nil {
		t.Fatal(err)
	}

	_, err := s.Pool.Exec(ctx, `CREATE TABLE IF NOT EXISTS tx_probe (n integer)`)
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() {
		_, _ = s.Pool.Exec(context.Background(), `DROP TABLE IF EXISTS tx_probe`)
	})

	wantErr := context.Canceled
	err = s.InTx(ctx, func(tx pgx.Tx) error {
		if _, err := tx.Exec(ctx, `INSERT INTO tx_probe (n) VALUES (1)`); err != nil {
			return err
		}
		return wantErr
	})
	if err != wantErr {
		t.Fatalf("InTx вернул %v, ожидалось %v", err, wantErr)
	}

	var count int
	if err := s.Pool.QueryRow(ctx, `SELECT count(*) FROM tx_probe`).Scan(&count); err != nil {
		t.Fatal(err)
	}
	if count != 0 {
		t.Errorf("после ошибки в транзакции осталось %d строк — отката не произошло", count)
	}
}
