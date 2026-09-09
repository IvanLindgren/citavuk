// Package store инкапсулирует доступ к PostgreSQL: пул соединений, миграции и
// вспомогательные примитивы, общие для всех репозиториев.
package store

import (
	"context"
	"crypto/sha256"
	"embed"
	"fmt"
	"io/fs"
	"sort"
	"strings"
	"time"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
)

//go:embed all:migrations
var migrationsFS embed.FS

// Store — пул соединений к базе.
type Store struct {
	Pool *pgxpool.Pool
}

// Open открывает пул и проверяет соединение.
//
// Размер пула намеренно небольшой: приложение живёт на одноядерной машине, а
// managed-PostgreSQL ограничивает число соединений. Держать больше соединений,
// чем сервер способен параллельно обслужить, — способ упереться в лимит базы,
// а не ускориться.
func Open(ctx context.Context, databaseURL string) (*Store, error) {
	cfg, err := pgxpool.ParseConfig(databaseURL)
	if err != nil {
		return nil, fmt.Errorf("разбор строки подключения: %w", err)
	}
	cfg.MaxConns = 8
	cfg.MinConns = 1
	cfg.MaxConnIdleTime = 5 * time.Minute
	cfg.MaxConnLifetime = time.Hour
	cfg.ConnConfig.ConnectTimeout = 10 * time.Second

	pool, err := pgxpool.NewWithConfig(ctx, cfg)
	if err != nil {
		return nil, fmt.Errorf("создание пула: %w", err)
	}

	pingCtx, cancel := context.WithTimeout(ctx, 15*time.Second)
	defer cancel()
	if err := pool.Ping(pingCtx); err != nil {
		pool.Close()
		return nil, fmt.Errorf("нет связи с PostgreSQL: %w", err)
	}
	return &Store{Pool: pool}, nil
}

// Close закрывает пул.
func (s *Store) Close() {
	if s.Pool != nil {
		s.Pool.Close()
	}
}

// KnownMigrations возвращает имена всех встроенных миграций.
//
// Нужна выкатке для отчёта: по одному лишь числу применённых миграций не
// видно, попал ли новый файл в сборку вообще. Каталог здесь ровно один —
// `internal/store/migrations`, тот, что указан в go:embed выше. Второго
// каталога с миграциями в репозитории быть не должно: файл, положенный мимо
// встроенного, молча не доедет до базы.
func KnownMigrations() []string {
	names, err := migrationNames()
	if err != nil {
		return nil
	}
	return names
}

func migrationNames() ([]string, error) {
	entries, err := fs.ReadDir(migrationsFS, "migrations")
	if err != nil {
		return nil, err
	}
	names := make([]string, 0, len(entries))
	for _, e := range entries {
		if !e.IsDir() && strings.HasSuffix(e.Name(), ".sql") {
			names = append(names, e.Name())
		}
	}
	sort.Strings(names)
	return names, nil
}

// Migrate применяет неприменённые миграции по возрастанию имени файла.
//
// Каждая миграция выполняется в своей транзакции вместе с записью в
// schema_migrations: применение и отметка о применении не могут разъехаться.
func (s *Store) Migrate(ctx context.Context) ([]string, error) {
	// Один выделенный connection держит session-lock между транзакциями.
	conn, err := s.Pool.Acquire(ctx)
	if err != nil {
		return nil, err
	}
	defer conn.Release()
	if _, err = conn.Exec(ctx, `SELECT pg_advisory_lock(709413562)`); err != nil {
		return nil, err
	}
	defer func() {
		cleanup, cancel := context.WithTimeout(context.Background(), 5*time.Second)
		defer cancel()
		if _, unlockErr := conn.Exec(cleanup, `SELECT pg_advisory_unlock(709413562)`); unlockErr != nil {
			_ = conn.Conn().Close(cleanup)
		}
	}()
	_, err = conn.Exec(ctx, `
        CREATE TABLE IF NOT EXISTS schema_migrations (
            name       text PRIMARY KEY,
            applied_at timestamptz NOT NULL DEFAULT now()
        )`)
	if err != nil {
		return nil, fmt.Errorf("создание schema_migrations: %w", err)
	}
	if _, err = conn.Exec(ctx, `ALTER TABLE schema_migrations ADD COLUMN IF NOT EXISTS checksum text`); err != nil {
		return nil, err
	}

	applied := map[string]string{}
	rows, err := conn.Query(ctx, `SELECT name, COALESCE(checksum, '') FROM schema_migrations`)
	if err != nil {
		return nil, err
	}
	for rows.Next() {
		var name, checksum string
		if err := rows.Scan(&name, &checksum); err != nil {
			rows.Close()
			return nil, err
		}
		applied[name] = checksum
	}
	rows.Close()
	if err := rows.Err(); err != nil {
		return nil, err
	}

	names, err := migrationNames()
	if err != nil {
		return nil, err
	}

	var ran []string
	for _, name := range names {
		body, err := migrationsFS.ReadFile("migrations/" + name)
		if err != nil {
			return ran, err
		}
		checksum := fmt.Sprintf("%x", sha256.Sum256([]byte(strings.ReplaceAll(string(body), "\r\n", "\n"))))
		if old, exists := applied[name]; exists {
			if old != "" && old != checksum {
				return ran, fmt.Errorf("изменена применённая миграция %s", name)
			}
			if old == "" {
				if _, err := conn.Exec(ctx, `UPDATE schema_migrations SET checksum=$2 WHERE name=$1`, name, checksum); err != nil {
					return ran, err
				}
			}
			continue
		}
		err = pgx.BeginFunc(ctx, conn, func(tx pgx.Tx) error {
			if _, err := tx.Exec(ctx, string(body)); err != nil {
				return err
			}
			_, err := tx.Exec(ctx, `INSERT INTO schema_migrations (name, checksum) VALUES ($1,$2)`, name, checksum)
			return err
		})
		if err != nil {
			return ran, fmt.Errorf("миграция %s: %w", name, err)
		}
		ran = append(ran, name)
	}
	return ran, nil
}

// InTx выполняет fn в транзакции, откатывая её при любой ошибке или панике.
func (s *Store) InTx(ctx context.Context, fn func(pgx.Tx) error) error {
	tx, err := s.Pool.Begin(ctx)
	if err != nil {
		return err
	}
	committed := false
	defer func() {
		if !committed {
			// Контекст вызова мог быть уже отменён — откат делаем на отдельном,
			// иначе соединение останется в незавершённой транзакции.
			rollbackCtx, cancel := context.WithTimeout(context.WithoutCancel(ctx), 5*time.Second)
			defer cancel()
			_ = tx.Rollback(rollbackCtx)
		}
	}()

	if err := fn(tx); err != nil {
		return err
	}
	if err := tx.Commit(ctx); err != nil {
		return err
	}
	committed = true
	return nil
}
