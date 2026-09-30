package config

import (
	"os"
	"path/filepath"
	"testing"
)

// Формат ровно тот, который разработчик пишет руками: пробелы вокруг "=",
// кавычки, комментарии-разделители, пустые строки.
const sampleEnv = `#translate
DEEPL_API_KEY="bb1e76fe-de60-43a6-a9b7-6bc77dd51e60:fx"

#database
DB_URL = "postgres://user:pa#ss@host:15357/defaultdb?sslmode=require"
DB_PORT = 15357
DB_USER = "avnadmin"

#auth
GOOGLE_CLIENT_ID_DESKTOP="111-desktop.apps.googleusercontent.com"
GOOGLE_CLIENT_ID_WEB="222-web.apps.googleusercontent.com"
PLAIN=value with spaces # хвостовой комментарий
`

func writeEnv(t *testing.T, body string) string {
	t.Helper()
	path := filepath.Join(t.TempDir(), ".env")
	if err := os.WriteFile(path, []byte(body), 0o600); err != nil {
		t.Fatal(err)
	}
	return path
}

func TestLoadParsesHandWrittenEnv(t *testing.T) {
	path := writeEnv(t, sampleEnv)
	for _, k := range []string{"DEEPL_API_KEY", "DB_URL", "DB_PORT", "DB_USER", "PLAIN",
		"GOOGLE_CLIENT_ID_DESKTOP", "GOOGLE_CLIENT_ID_WEB"} {
		t.Setenv(k, "")
		os.Unsetenv(k)
	}

	cfg, err := Load(path)
	if err != nil {
		t.Fatalf("Load: %v", err)
	}

	if cfg.DeepLKey != "bb1e76fe-de60-43a6-a9b7-6bc77dd51e60:fx" {
		t.Errorf("DeepLKey = %q", cfg.DeepLKey)
	}
	// Пароль с "#" внутри кавычек не должен быть обрезан как комментарий.
	if want := "postgres://user:pa#ss@host:15357/defaultdb?sslmode=require"; cfg.DatabaseURL != want {
		t.Errorf("DatabaseURL = %q, want %q", cfg.DatabaseURL, want)
	}
	if got := os.Getenv("DB_PORT"); got != "15357" {
		t.Errorf("DB_PORT = %q", got)
	}
	// А вне кавычек хвостовой комментарий отрезается.
	if got := os.Getenv("PLAIN"); got != "value with spaces" {
		t.Errorf("PLAIN = %q", got)
	}
	if len(cfg.GoogleClientIDs) != 2 {
		t.Fatalf("GoogleClientIDs = %v, ожидалось 2", cfg.GoogleClientIDs)
	}
	if cfg.GoogleClientIDs[0] != "111-desktop.apps.googleusercontent.com" {
		t.Errorf("порядок audience нарушен: %v", cfg.GoogleClientIDs)
	}
}

// Окружение важнее файла: так systemd подставляет production-секреты.
func TestEnvironmentOverridesFile(t *testing.T) {
	path := writeEnv(t, sampleEnv)
	t.Setenv("DB_URL", "postgres://from-env/db")

	cfg, err := Load(path)
	if err != nil {
		t.Fatalf("Load: %v", err)
	}
	if cfg.DatabaseURL != "postgres://from-env/db" {
		t.Errorf("окружение не перекрыло файл: %q", cfg.DatabaseURL)
	}
}

func TestLoadFailsWithoutDatabase(t *testing.T) {
	path := writeEnv(t, "DEEPL_API_KEY=x\n")
	t.Setenv("DATABASE_URL", "")
	t.Setenv("DB_URL", "")

	if _, err := Load(path); err == nil {
		t.Fatal("ожидалась ошибка: без DATABASE_URL сервер запускаться не должен")
	}
}

// Отсутствие .env — не ошибка: на сервере переменные приходят из systemd.
func TestMissingEnvFileIsNotFatal(t *testing.T) {
	t.Setenv("DB_URL", "postgres://x/y")

	cfg, err := Load(filepath.Join(t.TempDir(), "нет-такого.env"))
	if err != nil {
		t.Fatalf("отсутствующий .env стал ошибкой: %v", err)
	}
	if cfg.DatabaseURL != "postgres://x/y" {
		t.Errorf("DatabaseURL = %q", cfg.DatabaseURL)
	}
}

func TestDuplicateGoogleClientIDsCollapse(t *testing.T) {
	t.Setenv("DB_URL", "postgres://x/y")
	t.Setenv("GOOGLE_CLIENT_ID_DESKTOP", "same.apps.googleusercontent.com")
	t.Setenv("GOOGLE_CLIENT_ID_WEB", "same.apps.googleusercontent.com")

	cfg, err := Load("")
	if err != nil {
		t.Fatal(err)
	}
	if len(cfg.GoogleClientIDs) != 1 {
		t.Errorf("дубликаты audience не схлопнулись: %v", cfg.GoogleClientIDs)
	}
}

func TestDefaultTextModelsUseLowReasoningDeepSeek(t *testing.T) {
	t.Setenv("DB_URL", "postgres://x/y")
	t.Setenv("DATABASE_URL", "")
	for _, name := range []string{
		"CITAVUK_QUIZ_MODEL", "CITAVUK_TRANSLATION_GAME_AI_MODEL",
		"CITAVUK_DAILY_AI_MODEL", "CITAVUK_DEFINITION_AI_MODEL",
		"CITAVUK_FORM_HINT_AI_MODEL", "CITAVUK_FEED_AI_MODEL",
		"CITAVUK_PHOTO_SCAN_MODEL", "CITAVUK_DEFINITION_AI_REASONING",
		"CITAVUK_FORM_HINT_AI_REASONING",
	} {
		t.Setenv(name, "")
	}
	cfg, err := Load("")
	if err != nil {
		t.Fatal(err)
	}
	const model = "openai/gpt-6-luna"
	for name, got := range map[string]string{
		"quiz":       cfg.QuizModel,
		"judge":      cfg.TranslationGameAIModel,
		"daily":      cfg.DailyAIModel,
		"definition": cfg.DefinitionAIModel,
		"form_hint":  cfg.FormHintAIModel,
		"feed":       cfg.FeedAIModel,
	} {
		if got != model {
			t.Errorf("%s model = %q, want %q", name, got, model)
		}
	}
	if cfg.DefinitionAIReasoning != "low" || cfg.FormHintAIReasoning != "low" {
		t.Errorf("reasoning = %q/%q, want low/low", cfg.DefinitionAIReasoning, cfg.FormHintAIReasoning)
	}
	if cfg.PhotoScanModel != "openai/gpt-6-luna" {
		t.Errorf("photo model changed: %q", cfg.PhotoScanModel)
	}
}
