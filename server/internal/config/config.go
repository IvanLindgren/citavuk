// Package config читает настройки сервера из .env-файла и переменных окружения.
//
// Приоритет: переменная окружения > .env > значение по умолчанию. Такой порядок
// позволяет держать секреты в .env на машине разработчика и подставлять их
// через systemd EnvironmentFile на сервере, не меняя код.
package config

import (
	"bufio"
	"errors"
	"fmt"
	"os"
	"path/filepath"
	"strconv"
	"strings"
	"time"
)

// Config — полный набор настроек сервера.
type Config struct {
	// Addr — адрес прослушивания. На сервере это localhost:порт: наружу
	// смотрит nginx, который терминирует TLS.
	Addr string

	// DatabaseURL — строка подключения к PostgreSQL.
	DatabaseURL string

	// RedisURL — необязательный общий кеш и распределённый rate limit.
	// PostgreSQL остаётся источником истины, поэтому Redis может быть недоступен.
	RedisURL string

	// RedisPrefix отделяет ключи Citavuk от других приложений в общем Redis.
	RedisPrefix string

	// RedisCacheTTL ограничивает срок жизни горячего кеша переводов.
	RedisCacheTTL time.Duration

	// DeepLKey — ключ DeepL. Ключи с суффиксом ":fx" относятся к free-плану и
	// требуют другого хоста API, см. translate.DeepL.
	DeepLKey string

	// GoogleClientIDs — все допустимые audience для Google ID token. У desktop,
	// web и Android разные client_id, но все они принадлежат одному проекту и
	// должны приниматься одним и тем же сервером.
	GoogleClientIDs   []string
	GoogleWebClientID string

	// GoogleDesktopClientID и GoogleDesktopSecret нужны для входа с настольных
	// систем. Там нет нативного SDK Google, поэтому приложение проводит обычный
	// OAuth через системный браузер с возвратом на localhost, а обмен кода на
	// токен делает сервер: секрет клиента не должен лежать в файле программы,
	// который пользователь может распаковать.
	GoogleDesktopClientID string
	GoogleDesktopSecret   string

	// Yandex OAuth используется через серверный authorization-code flow:
	// client secret никогда не попадает в браузер или APK.
	YandexClientID     string
	YandexClientSecret string
	YandexRedirectURI  string

	// Resend отправляет письма подтверждения для парольной регистрации.
	ResendAPIKey         string
	EmailFrom            string
	WebURL               string
	EmailVerificationTTL time.Duration

	// UpstreamURL — старый Python-бэкенд. Go пока не умеет CLASSLA, новости и
	// TTS, поэтому такие запросы проксируются. Пустая строка выключает проксирование.
	UpstreamURL string

	// AllowedOrigins — список origin для CORS. Пустой список означает, что
	// браузерные запросы с других origin запрещены.
	AllowedOrigins []string

	// SessionTTLDays — срок жизни сессии без активности.
	SessionTTLDays int

	// MaxBookBytes ограничивает размер загружаемого текста книги.
	MaxBookBytes int64

	// TrustProxy включает чтение X-Forwarded-For. Включать только когда перед
	// сервером действительно стоит nginx, иначе клиент подделает свой IP и
	// обойдёт ограничение частоты запросов.
	TrustProxy bool

	// QuizAPIKey, QuizModel и QuizURL — генератор тестов по учебным материалам.
	// Протокол OpenAI-совместимый, поэтому провайдера можно сменить одной
	// переменной окружения. Пустой ключ просто выключает раздел.
	QuizAPIKey string
	QuizModel  string
	QuizURL    string

	// AdminEmails — аккаунты, которым при старте выдаётся роль администратора.
	// Список хранится в окружении, чтобы роль нельзя было получить регистрацией
	// с особым именем или подменой клиентского запроса.
	AdminEmails []string
}

// Load читает конфигурацию. Если envPath не пуст и файл существует, его
// значения загружаются в окружение процесса (не перезаписывая уже заданные).
func Load(envPath string) (*Config, error) {
	if envPath != "" {
		if err := loadEnvFile(envPath); err != nil && !errors.Is(err, os.ErrNotExist) {
			return nil, fmt.Errorf("чтение %s: %w", envPath, err)
		}
	}

	c := &Config{
		Addr:           envOr("CITAVUK_ADDR", "127.0.0.1:8090"),
		DatabaseURL:    firstEnv("DATABASE_URL", "DB_URL"),
		RedisURL:       firstEnv("REDIS_URL", "CITAVUK_REDIS_URL"),
		RedisPrefix:    envOr("CITAVUK_REDIS_PREFIX", "citavuk"),
		RedisCacheTTL:  envDuration("CITAVUK_REDIS_CACHE_TTL", 24*time.Hour),
		DeepLKey:       firstEnv("DEEPL_API_KEY", "DEEPL_KEY"),
		UpstreamURL:    envOr("CITAVUK_UPSTREAM", "https://ivanessalingren-citavukspace.hf.space"),
		AllowedOrigins: splitList(envOr("CITAVUK_ALLOWED_ORIGINS", "https://citavuk.ru,https://www.citavuk.ru")),
		SessionTTLDays: envInt("CITAVUK_SESSION_TTL_DAYS", 90),
		MaxBookBytes:   int64(envInt("CITAVUK_MAX_BOOK_BYTES", 12<<20)),
		TrustProxy:     envBool("CITAVUK_TRUST_PROXY", false),
		AdminEmails:    splitList(os.Getenv("CITAVUK_ADMIN_EMAILS")),
		QuizAPIKey:     firstEnv("POLZA_AI_KEY", "CITAVUK_QUIZ_KEY"),
		QuizModel:      envOr("CITAVUK_QUIZ_MODEL", "google/gemma-4-31b-it"),
		QuizURL: envOr(
			"CITAVUK_QUIZ_URL",
			"https://api.polza.ai/api/v1/chat/completions",
		),
		GoogleClientIDs:       googleClientIDs(),
		GoogleWebClientID:     strings.TrimSpace(os.Getenv("GOOGLE_CLIENT_ID_WEB")),
		GoogleDesktopClientID: strings.TrimSpace(os.Getenv("GOOGLE_CLIENT_ID_DESKTOP")),
		GoogleDesktopSecret:   strings.TrimSpace(os.Getenv("GOOGLE_CLIENT_SECRET_DESKTOP")),
		YandexClientID:        strings.TrimSpace(os.Getenv("YANDEX_CLIENT_ID")),
		YandexClientSecret:    strings.TrimSpace(os.Getenv("YANDEX_CLIENT_SECRET")),
		YandexRedirectURI: envOr(
			"YANDEX_REDIRECT_URI",
			"https://api.citavuk.ru/v1/auth/yandex/callback",
		),
		ResendAPIKey: strings.TrimSpace(os.Getenv("RESEND_API_KEY")),
		EmailFrom: envOr(
			"CITAVUK_EMAIL_FROM",
			"Читавук <noreply@citavuk.ru>",
		),
		WebURL:               strings.TrimRight(envOr("CITAVUK_WEB_URL", "https://citavuk.ru"), "/"),
		EmailVerificationTTL: envDuration("CITAVUK_EMAIL_VERIFICATION_TTL", 24*time.Hour),
	}

	if c.DatabaseURL == "" {
		return nil, errors.New("не задан DATABASE_URL (или DB_URL): сервер не может работать без PostgreSQL")
	}
	return c, nil
}

// googleClientIDs собирает audience из отдельных переменных под каждую
// платформу и из общего списка. Секреты клиентов серверу не нужны: он проверяет
// только ID token, а обмен кода на токен выполняет само приложение.
func googleClientIDs() []string {
	var ids []string
	seen := map[string]bool{}
	add := func(s string) {
		s = strings.TrimSpace(s)
		if s == "" || seen[s] {
			return
		}
		seen[s] = true
		ids = append(ids, s)
	}
	for _, key := range []string{
		"GOOGLE_CLIENT_ID_DESKTOP",
		"GOOGLE_CLIENT_ID_WEB",
		"GOOGLE_CLIENT_ID_ANDROID",
		"GOOGLE_CLIENT_ID_IOS",
	} {
		add(os.Getenv(key))
	}
	for _, s := range splitList(os.Getenv("GOOGLE_CLIENT_IDS")) {
		add(s)
	}
	return ids
}

// loadEnvFile разбирает .env. Поддерживаются пробелы вокруг "=", комментарии с
// "#" и значения в одинарных или двойных кавычках — именно так выглядит файл,
// который ведёт разработчик вручную.
func loadEnvFile(path string) error {
	f, err := os.Open(path)
	if err != nil {
		return err
	}
	defer f.Close()

	sc := bufio.NewScanner(f)
	sc.Buffer(make([]byte, 0, 64*1024), 1<<20)
	for line := 1; sc.Scan(); line++ {
		text := strings.TrimSpace(sc.Text())
		if text == "" || strings.HasPrefix(text, "#") {
			continue
		}
		text = strings.TrimPrefix(text, "export ")
		key, value, ok := strings.Cut(text, "=")
		if !ok {
			return fmt.Errorf("%s:%d: строка без '='", filepath.Base(path), line)
		}
		key = strings.TrimSpace(key)
		if key == "" {
			return fmt.Errorf("%s:%d: пустое имя переменной", filepath.Base(path), line)
		}
		value = unquote(strings.TrimSpace(value))
		// Уже заданное окружение имеет приоритет: так systemd и docker run -e
		// перекрывают файл, а не наоборот.
		if _, exists := os.LookupEnv(key); !exists {
			if err := os.Setenv(key, value); err != nil {
				return err
			}
		}
	}
	return sc.Err()
}

// unquote снимает парные кавычки. Комментарий в конце строки отрезается только
// у значений без кавычек: внутри кавычек "#" — обычный символ, а пароли к БД
// вполне могут его содержать.
func unquote(s string) string {
	if len(s) >= 2 {
		if (s[0] == '"' && s[len(s)-1] == '"') || (s[0] == '\'' && s[len(s)-1] == '\'') {
			return s[1 : len(s)-1]
		}
	}
	if i := strings.Index(s, " #"); i >= 0 {
		s = strings.TrimSpace(s[:i])
	}
	return s
}

func envOr(key, def string) string {
	if v := strings.TrimSpace(os.Getenv(key)); v != "" {
		return v
	}
	return def
}

func firstEnv(keys ...string) string {
	for _, k := range keys {
		if v := strings.TrimSpace(os.Getenv(k)); v != "" {
			return v
		}
	}
	return ""
}

func envInt(key string, def int) int {
	v := strings.TrimSpace(os.Getenv(key))
	if v == "" {
		return def
	}
	n, err := strconv.Atoi(v)
	if err != nil || n <= 0 {
		return def
	}
	return n
}

func envBool(key string, def bool) bool {
	v := strings.TrimSpace(os.Getenv(key))
	if v == "" {
		return def
	}
	b, err := strconv.ParseBool(v)
	if err != nil {
		return def
	}
	return b
}

func envDuration(key string, def time.Duration) time.Duration {
	v := strings.TrimSpace(os.Getenv(key))
	if v == "" {
		return def
	}
	d, err := time.ParseDuration(v)
	if err != nil || d <= 0 {
		return def
	}
	return d
}

func splitList(s string) []string {
	var out []string
	for _, part := range strings.Split(s, ",") {
		if p := strings.TrimSpace(part); p != "" {
			out = append(out, p)
		}
	}
	return out
}
