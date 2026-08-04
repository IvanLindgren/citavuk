// Package store инкапсулирует доступ к PostgreSQL: пул соединений, миграции и
// вспомогательные примитивы, общие для всех репозиториев.
package store

import (
	"context"
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
	_, err := s.Pool.Exec(ctx, `
        CREATE TABLE IF NOT EXISTS schema_migrations (
            name       text PRIMARY KEY,
            applied_at timestamptz NOT NULL DEFAULT now()
        )`)
	if err != nil {
		return nil, fmt.Errorf("создание schema_migrations: %w", err)
	}

	applied := map[string]bool{}
	rows, err := s.Pool.Query(ctx, `SELECT name FROM schema_migrations`)
	if err != nil {
		return nil, err
	}
	for rows.Next() {
		var name string
		if err := rows.Scan(&name); err != nil {
			rows.Close()
			return nil, err
		}
		applied[name] = true
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
		if applied[name] {
			continue
		}
		body, err := migrationsFS.ReadFile("migrations/" + name)
		if err != nil {
			return ran, err
		}
		err = s.InTx(ctx, func(tx pgx.Tx) error {
			if _, err := tx.Exec(ctx, string(body)); err != nil {
				return err
			}
			_, err := tx.Exec(ctx, `INSERT INTO schema_migrations (name) VALUES ($1)`, name)
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
