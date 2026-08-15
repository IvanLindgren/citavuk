// Command citavukd — сервер Citavuk: аккаунты, синхронизация и перевод.
//
// Запуск:
//
//	citavukd                      # .env берётся из рабочего каталога
//	citavukd -env /etc/citavuk.env
//	citavukd -migrate-only        # применить миграции и выйти
package main

import (
	"context"
	"errors"
	"flag"
	"fmt"
	"log/slog"
	"net/http"
	"os"
	"os/signal"
	"syscall"
	"time"

	"github.com/citavuk/server/internal/api"
	rediscache "github.com/citavuk/server/internal/cache"
	"github.com/citavuk/server/internal/config"
	"github.com/citavuk/server/internal/store"
)

func main() {
	var (
		envPath      = flag.String("env", ".env", "путь к файлу с настройками")
		migrateOnly  = flag.Bool("migrate-only", false, "применить миграции и выйти")
		logLevelName = flag.String("log", "info", "уровень журнала: debug, info, warn, error")
	)
	flag.Parse()

	setupLogging(*logLevelName)

	if err := run(*envPath, *migrateOnly); err != nil {
		slog.Error("сервер остановлен", "err", err)
		os.Exit(1)
	}
}

func setupLogging(level string) {
	var l slog.Level
	if err := l.UnmarshalText([]byte(level)); err != nil {
		l = slog.LevelInfo
	}
	slog.SetDefault(slog.New(slog.NewTextHandler(os.Stderr, &slog.HandlerOptions{Level: l})))
}

func run(envPath string, migrateOnly bool) error {
	cfg, err := config.Load(envPath)
	if err != nil {
		return err
	}

	ctx, cancel := context.WithTimeout(context.Background(), 30*time.Second)
	st, err := store.Open(ctx, cfg.DatabaseURL)
	cancel()
	if err != nil {
		return err
	}
	defer st.Close()

	redisClient, err := rediscache.NewRedis(cfg.RedisURL, cfg.RedisPrefix)
	if err != nil {
		slog.Warn("Redis отключён: неверный REDIS_URL", "err", err)
		redisClient = nil
	}
	if redisClient != nil {
		defer redisClient.Close()
		pingCtx, cancelPing := context.WithTimeout(context.Background(), 3*time.Second)
		if redisClient.Ping(pingCtx) {
			slog.Info("Redis подключён", "prefix", cfg.RedisPrefix)
		} else {
			slog.Warn("Redis пока недоступен; сервис запущен с fallback")
		}
		cancelPing()
	}

	migrateCtx, cancelMigrate := context.WithTimeout(context.Background(), 2*time.Minute)
	applied, err := st.Migrate(migrateCtx)
	cancelMigrate()
	if err != nil {
		return fmt.Errorf("миграции: %w", err)
	}
	// Отчёт печатается всегда, а не только когда что-то применилось. Молчание
	// при нуле применённых миграций уже стоило сломанного выпуска: файл лежал
	// не в том каталоге, в сборку не попал, а выкатка бодро сообщила «миграции
	// применены» — и таблицы не оказалось. Общее число встроенных миграций
	// показывает такую пропажу сразу.
	slog.Info("миграции",
		"всего", len(store.KnownMigrations()),
		"применено", len(applied),
		"имена", applied)
	// С этого момента каждая запись журнала уровня error заводит инцидент в
	// админке. Раньше туда попадал только код ответа («вернул 500»), а
	// причина оставалась в текстовом логе на сервере — то есть за ssh.
	slog.SetDefault(slog.New(api.NewIncidentLogger(slog.Default().Handler(), st)))

	adminCtx, cancelAdmins := context.WithTimeout(context.Background(), 10*time.Second)
	promoted, err := st.ConfigureAdmins(adminCtx, cfg.AdminEmails)
	cancelAdmins()
	if err != nil {
		return fmt.Errorf("настройка администраторов: %w", err)
	}
	if promoted > 0 {
		slog.Info("назначены администраторы", "count", promoted)
	}
	if migrateOnly {
		slog.Info("миграции применены, выходим")
		return nil
	}

	srv, err := api.New(cfg, st, redisClient)
	if err != nil {
		return err
	}
	defer srv.Close()

	httpServer := &http.Server{
		Addr:    cfg.Addr,
		Handler: srv.Handler(),
		// Таймауты обязательны: без них зависший клиент удерживает соединение
		// и горутину бесконечно, а на одноядерной машине это быстро исчерпает
		// ресурсы. WriteTimeout выбран с запасом под выгрузку текста книги.
		ReadHeaderTimeout: 10 * time.Second,
		ReadTimeout:       2 * time.Minute,
		WriteTimeout:      7 * time.Minute,
		IdleTimeout:       2 * time.Minute,
		MaxHeaderBytes:    1 << 16,
	}

	errCh := make(chan error, 1)
	go func() {
		slog.Info("сервер запущен",
			"addr", cfg.Addr,
			"version", api.Version,
			"google", len(cfg.GoogleClientIDs) > 0,
			"deepl", cfg.DeepLKey != "",
			"redis", redisClient != nil)
		if err := httpServer.ListenAndServe(); err != nil && !errors.Is(err, http.ErrServerClosed) {
			errCh <- err
		}
	}()

	stop := make(chan os.Signal, 1)
	signal.Notify(stop, os.Interrupt, syscall.SIGTERM)

	select {
	case err := <-errCh:
		return err
	case sig := <-stop:
		slog.Info("получен сигнал, завершаемся", "signal", sig.String())
	}

	// Плавная остановка: уже начатые запросы (например, выгрузка книги)
	// доводятся до конца, новые не принимаются.
	shutdownCtx, cancelShutdown := context.WithTimeout(context.Background(), 30*time.Second)
	defer cancelShutdown()
	if err := httpServer.Shutdown(shutdownCtx); err != nil {
		return fmt.Errorf("остановка сервера: %w", err)
	}
	slog.Info("сервер остановлен")
	return nil
}
