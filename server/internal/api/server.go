package api

import (
	"context"
	"log/slog"
	"net/http"
	"net/http/httputil"
	"time"

	"github.com/citavuk/server/internal/auth"
	rediscache "github.com/citavuk/server/internal/cache"
	"github.com/citavuk/server/internal/config"
	"github.com/citavuk/server/internal/mailer"
	"github.com/citavuk/server/internal/quiz"
	"github.com/citavuk/server/internal/store"
	"github.com/citavuk/server/internal/translate"
)

// Version подставляется при сборке через -ldflags.
var Version = "dev"

// Server связывает конфигурацию, хранилище и внешние сервисы.
type Server struct {
	cfg          *config.Config
	store        *store.Store
	google       *auth.GoogleVerifier
	googleCode   *auth.GoogleCodeExchanger
	yandex       *auth.YandexClient
	mailer       mailer.Sender
	deepl        *translate.DeepL
	translator   *translate.Service
	proxy        *httputil.ReverseProxy
	redis        *rediscache.Redis
	documentHTTP *http.Client
	quiz         *quiz.Generator

	authLimit      *limiter
	translateLimit *limiter
	generalLimit   *limiter
	quizLimit      *limiter
	stop           chan struct{}
}

// New собирает сервер.
func New(
	cfg *config.Config,
	st *store.Store,
	redisClients ...*rediscache.Redis,
) (*Server, error) {
	deepl := translate.NewDeepL(cfg.DeepLKey)
	var redisClient *rediscache.Redis
	if len(redisClients) > 0 {
		redisClient = redisClients[0]
	}

	var translationCache translate.Cache = st.Translations()
	if redisClient != nil {
		translationCache = rediscache.NewTranslationCache(
			redisClient,
			translationCache,
			cfg.RedisCacheTTL,
		)
	}

	s := &Server{
		cfg:    cfg,
		store:  st,
		google: auth.NewGoogleVerifier(cfg.GoogleClientIDs),
		googleCode: auth.NewGoogleCodeExchanger(
			cfg.GoogleDesktopClientID,
			cfg.GoogleDesktopSecret,
		),
		yandex: auth.NewYandexClient(
			cfg.YandexClientID,
			cfg.YandexClientSecret,
			cfg.YandexRedirectURI,
		),
		mailer: mailer.NewResend(cfg.ResendAPIKey, cfg.EmailFrom, cfg.WebURL),
		deepl:  deepl,
		// Порядок провайдеров задаёт translate.Service: связный текст идёт в
		// DeepL, одиночное слово — в запасной, потому что DeepL на словах без
		// контекста ошибается.
		translator:   translate.NewService(deepl, translate.NewGoogle(), translationCache),
		redis:        redisClient,
		documentHTTP: newDocumentHTTPClient(),
		quiz:         quiz.NewGenerator(cfg.QuizAPIKey, cfg.QuizModel, cfg.QuizURL),

		// Вход ограничивается жёстче остального: это защита от подбора пароля.
		authLimit:      newLimiter("auth", 20, 10, redisClient),
		translateLimit: newLimiter("translate", 120, 40, redisClient),
		generalLimit:   newLimiter("general", 600, 120, redisClient),
		// Каждый вызов модели стоит денег и занимает минуту, поэтому предел
		// куда ниже общего: десяток новых тестов в час — это уже много.
		quizLimit: newLimiter("quiz", 10, 3, redisClient),
		stop:      make(chan struct{}),
	}

	if cfg.UpstreamURL != "" {
		proxy, err := newUpstreamProxy(cfg.UpstreamURL)
		if err != nil {
			return nil, err
		}
		s.proxy = proxy
	}

	go s.authLimit.runCleanup(s.stop)
	go s.translateLimit.runCleanup(s.stop)
	go s.generalLimit.runCleanup(s.stop)
	go s.quizLimit.runCleanup(s.stop)
	go s.purgeSessionsPeriodically()

	return s, nil
}

// Close останавливает фоновые задачи сервера.
func (s *Server) Close() { close(s.stop) }

// purgeSessionsPeriodically убирает просроченные сессии.
func (s *Server) purgeSessionsPeriodically() {
	t := time.NewTicker(6 * time.Hour)
	defer t.Stop()
	for {
		select {
		case <-t.C:
			ctx, cancel := context.WithTimeout(context.Background(), 30*time.Second)
			if n, err := s.store.PurgeExpiredSessions(ctx); err != nil {
				slog.Warn("очистка сессий не удалась", "err", err)
			} else if n > 0 {
				slog.Info("удалены просроченные сессии", "count", n)
			}
			if n, err := s.store.PurgeExpiredAuthTokens(ctx); err != nil {
				slog.Warn("очистка одноразовых auth-токенов не удалась", "err", err)
			} else if n > 0 {
				slog.Info("удалены просроченные auth-токены", "count", n)
			}
			cancel()
		case <-s.stop:
			return
		}
	}
}

// Handler возвращает готовый HTTP-обработчик.
func (s *Server) Handler() http.Handler {
	mux := http.NewServeMux()

	mux.HandleFunc("GET /health", s.handleHealth)
	mux.HandleFunc("GET /v1/health", s.handleHealth)

	// Регистрация и вход.
	mux.HandleFunc("POST /v1/auth/register", s.rateLimit(s.authLimit, s.handleRegister))
	mux.HandleFunc("GET /v1/auth/providers", s.rateLimit(s.generalLimit, s.handleAuthProviders))
	mux.HandleFunc("POST /v1/auth/login", s.rateLimit(s.authLimit, s.handleLogin))
	mux.HandleFunc("POST /v1/auth/google", s.rateLimit(s.authLimit, s.handleGoogleLogin))
	mux.HandleFunc("POST /v1/auth/google/desktop", s.rateLimit(s.authLimit, s.handleGoogleDesktopLogin))
	mux.HandleFunc("POST /v1/auth/yandex/start", s.rateLimit(s.authLimit, s.handleYandexStart))
	mux.HandleFunc("GET /v1/auth/yandex/callback", s.rateLimit(s.authLimit, s.handleYandexCallback))
	mux.HandleFunc("POST /v1/auth/yandex/complete", s.rateLimit(s.authLimit, s.handleYandexComplete))
	mux.HandleFunc("POST /v1/auth/verify-email", s.rateLimit(s.authLimit, s.handleVerifyEmail))
	mux.HandleFunc("POST /v1/auth/resend-verification", s.rateLimit(s.authLimit, s.handleResendVerification))
	mux.HandleFunc("POST /v1/auth/logout", s.handleLogout)
	mux.HandleFunc("GET /v1/auth/me", s.requireAuth(s.handleMe))
	mux.HandleFunc("POST /v1/auth/password", s.rateLimit(s.authLimit, s.requireAuth(s.handleChangePassword)))
	// Удаление аккаунта — требование Google Play к приложениям с регистрацией.
	mux.HandleFunc("POST /v1/auth/account/delete", s.rateLimit(s.authLimit, s.requireAuth(s.handleDeleteAccount)))

	// Синхронизация.
	mux.HandleFunc("GET /v1/sync/changes", s.rateLimit(s.generalLimit, s.requireAuth(s.handlePull)))
	mux.HandleFunc("POST /v1/sync/push", s.rateLimit(s.generalLimit, s.requireAuth(s.handlePush)))
	mux.HandleFunc("POST /v1/sync/content/check", s.rateLimit(s.generalLimit, s.requireAuth(s.handleContentCheck)))
	mux.HandleFunc("PUT /v1/sync/content/{sha}", s.rateLimit(s.generalLimit, s.requireAuth(s.handlePutContent)))
	mux.HandleFunc("GET /v1/sync/content/{sha}", s.rateLimit(s.generalLimit, s.requireAuth(s.handleGetContent)))
	mux.HandleFunc("POST /v1/sync/content/purge", s.rateLimit(s.generalLimit, s.requireAuth(s.handlePurgeContent)))

	// Прогресс игрового курса. Документ общий для Flutter и web.
	mux.HandleFunc("GET /v1/course/progress/{courseId}", s.rateLimit(s.generalLimit, s.requireAuth(s.handleGetCourseProgress)))
	mux.HandleFunc("PUT /v1/course/progress/{courseId}", s.rateLimit(s.generalLimit, s.requireAuth(s.handlePutCourseProgress)))
	mux.HandleFunc("GET /v1/course/bundle/{courseId}", s.rateLimit(s.generalLimit, s.handlePublishedCourse))

	// Безопасная загрузка пользовательского документа по публичной ссылке.
	mux.HandleFunc("GET /v1/documents/fetch", s.rateLimit(s.generalLimit, s.handleDocumentFetch))

	// Тесты по материалам. Составление и попытки требуют аккаунта: без него
	// некому вести статистику, а обращение к модели ещё и стоит денег. Список
	// готовых тестов открыт всем — он нужен странице материалов до входа.
	mux.HandleFunc("GET /v1/quizzes/materials", s.rateLimit(s.generalLimit, s.optionalAuth(s.handleMaterialQuizzes)))
	mux.HandleFunc("POST /v1/quizzes", s.rateLimit(s.quizLimit, s.requireAuth(s.handleGenerateQuiz)))
	mux.HandleFunc("GET /v1/quizzes/stats", s.rateLimit(s.generalLimit, s.requireAuth(s.handleQuizStats)))
	mux.HandleFunc("GET /v1/quizzes/{id}", s.rateLimit(s.generalLimit, s.requireAuth(s.handleGetQuiz)))
	mux.HandleFunc("POST /v1/quizzes/{id}/attempts", s.rateLimit(s.generalLimit, s.requireAuth(s.handleSaveAttempt)))

	// Администрирование. Каждый обработчик повторно проверяет серверную роль.
	mux.HandleFunc("GET /v1/admin/overview", s.rateLimit(s.generalLimit, s.requireAdmin(s.handleAdminOverview)))
	mux.HandleFunc("GET /v1/admin/users", s.rateLimit(s.generalLimit, s.requireAdmin(s.handleAdminUsers)))
	mux.HandleFunc("GET /v1/admin/incidents", s.rateLimit(s.generalLimit, s.requireAdmin(s.handleAdminIncidents)))
	mux.HandleFunc("POST /v1/admin/incidents/{id}/resolve", s.rateLimit(s.generalLimit, s.requireAdmin(s.handleResolveIncident)))
	mux.HandleFunc("GET /v1/admin/courses", s.rateLimit(s.generalLimit, s.requireAdmin(s.handleAdminCourses)))
	mux.HandleFunc("GET /v1/admin/courses/{id}", s.rateLimit(s.generalLimit, s.requireAdmin(s.handleAdminCourse)))
	mux.HandleFunc("POST /v1/admin/courses", s.rateLimit(s.generalLimit, s.requireAdmin(s.handleCreateAdminCourse)))
	mux.HandleFunc("PUT /v1/admin/courses/{id}", s.rateLimit(s.generalLimit, s.requireAdmin(s.handleUpdateAdminCourse)))
	mux.HandleFunc("POST /v1/admin/courses/{id}/publish", s.rateLimit(s.generalLimit, s.requireAdmin(s.handlePublishAdminCourse)))

	// Перевод. Аккаунт не требуется: перевод нужен и до входа, но частота
	// ограничена — квота DeepL общая на всех.
	mux.HandleFunc("POST /v1/translate", s.rateLimit(s.translateLimit, s.handleTranslate))
	mux.HandleFunc("POST /v1/translate/context", s.rateLimit(s.translateLimit, s.handleTranslateInContext))
	mux.HandleFunc("GET /v1/translate/usage", s.rateLimit(s.generalLimit, s.handleUsage))

	// Грамматический разбор по встроенному лексикону. Ни сети, ни аккаунта не
	// требует: приложение делает то же офлайн, сайту нужен сервер.
	mux.HandleFunc("POST /v1/analyze", s.rateLimit(s.generalLimit, s.handleAnalyze))
	mux.HandleFunc("GET /v1/grammar/cases", s.rateLimit(s.generalLimit, s.handleGrammarCases))
	// Совместимость с уже установленными версиями приложения.
	mux.HandleFunc("GET /translate", s.rateLimit(s.translateLimit, s.handleTranslateLegacy))

	// Остальное — на прежний Python-бэкенд.
	mux.HandleFunc("/", s.handleFallback)

	return s.withLogging(s.withCORS(mux))
}

// handleAuthProviders сообщает клиенту, какие способы входа настроены.
//
// Отсюда же приходят client_id: они публичны по определению — попадают в адрес
// авторизации, который видно в строке браузера. Держать их в приложении незачем,
// иначе каждая смена проекта Google требовала бы пересборки APK.
func (s *Server) handleAuthProviders(w http.ResponseWriter, _ *http.Request) {
	writeJSON(w, http.StatusOK, map[string]any{
		"google": map[string]any{
			"enabled":        s.google.Enabled() && s.cfg.GoogleWebClientID != "",
			"serverClientId": s.cfg.GoogleWebClientID,
			// Настольные приложения проводят вход сами через системный браузер,
			// поэтому им нужен отдельный client_id типа «Desktop app».
			"desktopEnabled":  s.googleCode.Enabled() && s.google.Enabled(),
			"desktopClientId": s.googleCode.ClientID(),
		},
		"yandex": map[string]bool{
			"enabled": s.yandex.Enabled(),
		},
		"email": map[string]bool{
			"enabled": s.mailer.Enabled(),
		},
	})
}

// handleFallback направляет запрос наверх либо отвечает 404.
func (s *Server) handleFallback(w http.ResponseWriter, r *http.Request) {
	if s.proxy != nil && isLegacyPath(r.URL.Path) {
		if !s.generalLimit.allow(r.Context(), clientIP(r, s.cfg.TrustProxy)) {
			writeError(w, http.StatusTooManyRequests, codeRateLimited,
				"Слишком много запросов. Подождите минуту.")
			return
		}
		s.proxy.ServeHTTP(w, r)
		return
	}
	writeError(w, http.StatusNotFound, codeNotFound, "Такого метода нет.")
}

type healthResponse struct {
	Status    string `json:"status"`
	Version   string `json:"version"`
	Database  bool   `json:"database"`
	Translate bool   `json:"translate"`
	Google    bool   `json:"google"`
	Yandex    bool   `json:"yandex"`
	Email     bool   `json:"email"`
	Upstream  bool   `json:"upstream"`
	Redis     bool   `json:"redis"`
}

func (s *Server) handleHealth(w http.ResponseWriter, r *http.Request) {
	ctx, cancel := context.WithTimeout(r.Context(), 5*time.Second)
	defer cancel()

	dbOK := s.store.Pool.Ping(ctx) == nil
	redisOK := s.redis != nil && s.redis.Ping(ctx)
	status := "ok"
	code := http.StatusOK
	if !dbOK {
		// База — единственная незаменимая зависимость: без неё нет ни входа,
		// ни синхронизации. Отвечать «ok» в таком состоянии значит обмануть
		// систему мониторинга.
		status = "degraded"
		code = http.StatusServiceUnavailable
	}

	writeJSON(w, code, healthResponse{
		Status:    status,
		Version:   Version,
		Database:  dbOK,
		Translate: s.translator.Available(),
		Google:    s.google.Enabled(),
		Yandex:    s.yandex.Enabled(),
		Email:     s.mailer.Enabled(),
		Upstream:  s.proxy != nil,
		Redis:     redisOK,
	})
}
