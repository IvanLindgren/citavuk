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
	"github.com/citavuk/server/internal/feed"
	"github.com/citavuk/server/internal/mailer"
	"github.com/citavuk/server/internal/media"
	"github.com/citavuk/server/internal/podcast"
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
	podcasts     *podcast.Service
	media        *media.Service
	microFeed    *feed.Generator
	feedSources  *feed.SourceFetcher

	authLimit            *limiter
	anonTranslateLimit   *limiter
	userTranslateLimit   *limiter
	translateGlobalLimit *limiter
	generalLimit         *limiter
	quizLimit            *limiter
	stop                 chan struct{}
}

// New собирает сервер.
func New(
	cfg *config.Config,
	st *store.Store,
	redisClients ...*rediscache.Redis,
) (*Server, error) {
	deepl := translate.NewDeepL(cfg.DeepLKey)
	mediaService, err := media.New(media.Config{
		Endpoint: cfg.S3Endpoint, Region: cfg.S3Region, Bucket: cfg.S3Bucket,
		AccessKey: cfg.S3AccessKey, SecretKey: cfg.S3SecretKey,
		PublicBaseURL: cfg.PublicMediaBaseURL,
	})
	if err != nil {
		return nil, err
	}
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
		podcasts:     podcast.New(),
		media:        mediaService,
		microFeed: feed.NewGenerator(
			cfg.FeedAIKey, cfg.FeedAIModel, cfg.FeedAIURL,
			cfg.FeedEmbeddingKey, cfg.FeedEmbeddingModel, cfg.FeedEmbeddingURL,
		),
		feedSources: feed.NewSourceFetcher(),

		// Вход ограничивается жёстче остального: это защита от подбора пароля.
		authLimit: newLimiter("auth", 10, 5, redisClient),
		// Перевод разделён по гостю и вошедшему пользователю: анонимный бот не
		// должен выесть общую квоту DeepL раньше, чем ей пользуются читатели.
		anonTranslateLimit:   newLimiter("anon_translate", 12, 4, redisClient),
		userTranslateLimit:   newLimiter("user_translate", 30, 8, redisClient),
		translateGlobalLimit: newLimiter("translate_global", 60, 15, redisClient),
		generalLimit:         newLimiter("general", 180, 40, redisClient),
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
	go s.anonTranslateLimit.runCleanup(s.stop)
	go s.userTranslateLimit.runCleanup(s.stop)
	go s.translateGlobalLimit.runCleanup(s.stop)
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
			if n, err := s.store.PurgeUnverifiedUsers(ctx, 7*24*time.Hour); err != nil {
				slog.Warn("очистка неподтверждённых аккаунтов не удалась", "err", err)
			} else if n > 0 {
				slog.Info("удалены неподтверждённые аккаунты", "count", n)
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
	mux.HandleFunc("GET /v1/auth/me", s.requireAuth(s.rateLimitIdentity(s.generalLimit, s.handleMe)))
	mux.HandleFunc("POST /v1/auth/password", s.rateLimit(s.authLimit, s.requireAuth(s.handleChangePassword)))
	// Удаление аккаунта — требование Google Play к приложениям с регистрацией.
	mux.HandleFunc("POST /v1/auth/account/delete", s.rateLimit(s.authLimit, s.requireAuth(s.handleDeleteAccount)))

	// Синхронизация.
	mux.HandleFunc("GET /v1/sync/changes", s.requireAuth(s.rateLimitIdentity(s.generalLimit, s.handlePull)))
	mux.HandleFunc("POST /v1/sync/push", s.requireAuth(s.rateLimitIdentity(s.generalLimit, s.handlePush)))
	mux.HandleFunc("POST /v1/sync/content/check", s.requireAuth(s.rateLimitIdentity(s.generalLimit, s.handleContentCheck)))
	mux.HandleFunc("PUT /v1/sync/content/{sha}", s.requireAuth(s.rateLimitIdentity(s.generalLimit, s.handlePutContent)))
	mux.HandleFunc("GET /v1/sync/content/{sha}", s.requireAuth(s.rateLimitIdentity(s.generalLimit, s.handleGetContent)))
	mux.HandleFunc("POST /v1/sync/content/purge", s.requireAuth(s.rateLimitIdentity(s.generalLimit, s.handlePurgeContent)))

	// Прогресс игрового курса. Документ общий для Flutter и web.
	mux.HandleFunc("GET /v1/course/progress/{courseId}", s.requireAuth(s.rateLimitIdentity(s.generalLimit, s.handleGetCourseProgress)))
	mux.HandleFunc("PUT /v1/course/progress/{courseId}", s.requireAuth(s.rateLimitIdentity(s.generalLimit, s.handlePutCourseProgress)))
	mux.HandleFunc("GET /v1/course/bundle/{courseId}", s.rateLimit(s.generalLimit, s.handlePublishedCourse))

	// Авторские уроки. Заявка доступна любому вошедшему пользователю, редактор
	// только одобренному преподавателю, каталог и unlisted-ссылка открыты гостям.
	mux.HandleFunc("GET /v1/teachers/application", s.requireAuth(s.rateLimitIdentity(s.generalLimit, s.handleTeacherApplication)))
	mux.HandleFunc("PUT /v1/teachers/application", s.requireAuth(s.rateLimitIdentity(s.generalLimit, s.handleSubmitTeacherApplication)))
	mux.HandleFunc("GET /v1/teachers/lessons", s.requireTeacher(s.rateLimitIdentity(s.generalLimit, s.handleTeacherLessons)))
	mux.HandleFunc("GET /v1/teachers/profile", s.requireTeacher(s.rateLimitIdentity(s.generalLimit, s.handleTeacherProfile)))
	mux.HandleFunc("PUT /v1/teachers/profile", s.requireTeacher(s.rateLimitIdentity(s.generalLimit, s.handleUpdateTeacherProfile)))
	mux.HandleFunc("GET /v1/teachers/{id}", s.rateLimit(s.generalLimit, s.handlePublicTeacherProfile))
	mux.HandleFunc("POST /v1/teachers/lessons", s.requireTeacher(s.rateLimitIdentity(s.generalLimit, s.handleCreateTeacherLesson)))
	mux.HandleFunc("PUT /v1/teachers/lessons/{id}", s.requireTeacher(s.rateLimitIdentity(s.generalLimit, s.handleUpdateTeacherLesson)))
	mux.HandleFunc("DELETE /v1/teachers/lessons/{id}", s.requireTeacher(s.rateLimitIdentity(s.generalLimit, s.handleDeleteTeacherLesson)))
	mux.HandleFunc("POST /v1/teachers/lessons/{id}/publish-unlisted", s.requireTeacher(s.rateLimitIdentity(s.generalLimit, s.handlePublishUnlistedLesson)))
	mux.HandleFunc("POST /v1/teachers/lessons/{id}/submit", s.requireTeacher(s.rateLimitIdentity(s.generalLimit, s.handleSubmitPublicLesson)))
	mux.HandleFunc("POST /v1/teachers/media/upload-policy", s.requireTeacher(s.rateLimitIdentity(s.generalLimit, s.handleTeacherMediaPolicy)))
	mux.HandleFunc("GET /v1/teachers/submissions", s.requireTeacher(s.rateLimitIdentity(s.generalLimit, s.handleTeacherSubmissions)))
	mux.HandleFunc("POST /v1/teachers/submissions/{id}/review", s.requireTeacher(s.rateLimitIdentity(s.generalLimit, s.handleReviewSubmission)))
	// Карта и страницы уроков для поисковика. Статические разделы сайта
	// отрисовываются на сборке, а уроки появляются между выкладками — их
	// разметку отдаёт сервер (см. internal/api/seo_handlers.go).
	mux.HandleFunc("GET /sitemap-lessons.xml", s.rateLimit(s.generalLimit, s.handleLessonSitemap))
	mux.HandleFunc("GET /lessons/{slug}", s.rateLimit(s.generalLimit, s.handleLessonPage))
	mux.HandleFunc("GET /v1/lessons", s.rateLimit(s.generalLimit, s.handlePublicLessons))
	mux.HandleFunc("GET /v1/lessons/{slug}", s.rateLimit(s.generalLimit, s.handlePublicLesson))
	mux.HandleFunc("GET /v1/lesson-links/{token}", s.rateLimit(s.generalLimit, s.handleUnlistedLesson))
	mux.HandleFunc("GET /v1/lessons/{id}/progress", s.requireAuth(s.rateLimitIdentity(s.generalLimit, s.handleLessonProgress)))
	mux.HandleFunc("PUT /v1/lessons/{id}/progress", s.requireAuth(s.rateLimitIdentity(s.generalLimit, s.handlePutLessonProgress)))
	mux.HandleFunc("POST /v1/lessons/{id}/submissions", s.requireAuth(s.rateLimitIdentity(s.generalLimit, s.handleCreateLessonSubmission)))
	mux.HandleFunc("POST /v1/lessons/{id}/reports", s.requireAuth(s.rateLimitIdentity(s.generalLimit, s.handleReportLesson)))

	// Серверные объявления и центр уведомлений. Баннер доступен гостю, но
	// состояние, уведомления и награды принадлежат конкретному аккаунту.
	mux.HandleFunc("GET /v1/announcements", s.optionalAuth(s.rateLimitIdentity(s.generalLimit, s.handleAnnouncements)))
	mux.HandleFunc("POST /v1/announcements/{id}/read", s.requireAuth(s.rateLimitIdentity(s.generalLimit, s.handleReadAnnouncement)))
	mux.HandleFunc("POST /v1/announcements/{id}/dismiss", s.requireAuth(s.rateLimitIdentity(s.generalLimit, s.handleDismissAnnouncement)))
	mux.HandleFunc("POST /v1/announcements/{id}/claim", s.requireAuth(s.rateLimitIdentity(s.generalLimit, s.handleClaimAnnouncement)))
	mux.HandleFunc("GET /v1/notifications", s.requireAuth(s.rateLimitIdentity(s.generalLimit, s.handleNotifications)))
	mux.HandleFunc("POST /v1/notifications/read-all", s.requireAuth(s.rateLimitIdentity(s.generalLimit, s.handleReadAllNotifications)))
	mux.HandleFunc("POST /v1/notifications/{id}/read", s.requireAuth(s.rateLimitIdentity(s.generalLimit, s.handleReadNotification)))

	// Безопасная загрузка пользовательского документа по публичной ссылке.
	mux.HandleFunc("GET /v1/documents/fetch", s.rateLimit(s.generalLimit, s.handleDocumentFetch))

	// Перевод не-сербского документа на сербский. Определение языка открыто
	// всем: это обращение к встроенному словарю, и спрашивать про вход раньше,
	// чем выяснилось, что перевод вообще нужен, значило бы спрашивать зря у
	// каждого, кто добавляет обычную сербскую книгу. Сам перевод — только с
	// аккаунтом и не чаще предела: он стоит квоты внешнего провайдера.
	mux.HandleFunc("POST /v1/documents/language", s.rateLimit(s.generalLimit, s.handleDocumentLanguage))
	mux.HandleFunc("GET /v1/documents/translation/quota", s.requireAuth(s.rateLimitIdentity(s.generalLimit, s.handleTranslationQuota)))
	mux.HandleFunc("POST /v1/documents/translation", s.requireAuth(s.rateLimitIdentity(s.generalLimit, s.handleStartTranslation)))
	mux.HandleFunc("POST /v1/documents/translation/{id}/chunk", s.requireAuth(s.rateLimitIdentity(s.generalLimit, s.handleTranslateChunk)))
	mux.HandleFunc("POST /v1/documents/translation/{id}/finish", s.requireAuth(s.rateLimitIdentity(s.generalLimit, s.handleFinishTranslation)))
	// Картинки из книги. Ключ считается от содержимого, поэтому одна и та же
	// книга с разных устройств остаётся одной книгой (см. media.BookImagePolicy).
	mux.HandleFunc("POST /v1/books/media/upload-policy", s.requireAuth(s.rateLimitIdentity(s.generalLimit, s.handleBookImagePolicy)))
	mux.HandleFunc("PUT /v1/media/upload", s.requireAuth(s.rateLimitIdentity(s.generalLimit, s.handleMediaUpload)))

	// Книга по ссылке и обсуждение её страниц.
	//
	// Чтение открыто всем: по ссылке приходят те, у кого аккаунта ещё нет, и
	// книгу они должны увидеть до регистрации. Писать в обсуждение и создавать
	// ссылки — только с аккаунтом: под сообщением стоит имя, а безымянные
	// сообщения превращают раздел в свалку.
	mux.HandleFunc("POST /v1/share/books", s.requireAuth(s.rateLimitIdentity(s.generalLimit, s.handleCreateShare)))
	mux.HandleFunc("GET /v1/share/books/{token}", s.rateLimit(s.generalLimit, s.handleGetShare))
	mux.HandleFunc("GET /v1/share/books/{token}/content", s.rateLimit(s.generalLimit, s.handleShareContent))
	mux.HandleFunc("DELETE /v1/share/books/{token}", s.requireAuth(s.rateLimitIdentity(s.generalLimit, s.handleDeleteShare)))
	mux.HandleFunc("GET /v1/share/books/{token}/comments", s.optionalAuth(s.rateLimitIdentity(s.generalLimit, s.handleComments)))
	mux.HandleFunc("POST /v1/share/books/{token}/comments", s.requireAuth(s.rateLimitIdentity(s.generalLimit, s.handleAddComment)))
	mux.HandleFunc("DELETE /v1/share/comments/{id}", s.requireAuth(s.rateLimitIdentity(s.generalLimit, s.handleHideComment)))

	// Подкасты. Раньше уходили на прежний Python-бэкенд: он засыпал (502), а
	// тайминги реплик там выдумывались пропорционально длине текста.
	mux.HandleFunc("GET /audio/lessons", s.rateLimit(s.generalLimit, s.handleAudioLessons))
	mux.HandleFunc("GET /audio/transcript", s.rateLimit(s.generalLimit, s.handleAudioTranscript))

	// Тесты по материалам. Составление и попытки требуют аккаунта: без него
	// некому вести статистику, а обращение к модели ещё и стоит денег. Список
	// готовых тестов открыт всем — он нужен странице материалов до входа.
	mux.HandleFunc("GET /v1/quizzes/materials", s.optionalAuth(s.rateLimitIdentity(s.generalLimit, s.handleMaterialQuizzes)))
	mux.HandleFunc("POST /v1/quizzes", s.requireAuth(s.rateLimitIdentity(s.quizLimit, s.handleGenerateQuiz)))
	mux.HandleFunc("GET /v1/quizzes/stats", s.requireAuth(s.rateLimitIdentity(s.generalLimit, s.handleQuizStats)))
	mux.HandleFunc("GET /v1/quizzes/{id}", s.requireAuth(s.rateLimitIdentity(s.generalLimit, s.handleGetQuiz)))
	mux.HandleFunc("POST /v1/quizzes/{id}/attempts", s.requireAuth(s.rateLimitIdentity(s.generalLimit, s.handleSaveAttempt)))

	// Experimental web micro-feed. Reading and anonymous recommendations are
	// public; moderation and source synchronization remain admin-only.
	mux.HandleFunc("GET /v1/micro-feed", s.optionalAuth(s.rateLimitIdentity(s.generalLimit, s.handleMicroFeed)))
	mux.HandleFunc("POST /v1/micro-feed/{id}/interactions", s.optionalAuth(s.rateLimitIdentity(s.generalLimit, s.handleMicroFeedInteraction)))

	// Администрирование. Каждый обработчик повторно проверяет серверную роль.
	mux.HandleFunc("GET /v1/admin/overview", s.requireAdmin(s.rateLimitIdentity(s.generalLimit, s.handleAdminOverview)))
	mux.HandleFunc("GET /v1/admin/users", s.requireAdmin(s.rateLimitIdentity(s.generalLimit, s.handleAdminUsers)))
	mux.HandleFunc("GET /v1/admin/incidents", s.requireAdmin(s.rateLimitIdentity(s.generalLimit, s.handleAdminIncidents)))
	mux.HandleFunc("POST /v1/admin/incidents/{id}/resolve", s.requireAdmin(s.rateLimitIdentity(s.generalLimit, s.handleResolveIncident)))
	mux.HandleFunc("GET /v1/admin/courses", s.requireAdmin(s.rateLimitIdentity(s.generalLimit, s.handleAdminCourses)))
	mux.HandleFunc("GET /v1/admin/courses/{id}", s.requireAdmin(s.rateLimitIdentity(s.generalLimit, s.handleAdminCourse)))
	mux.HandleFunc("POST /v1/admin/courses", s.requireAdmin(s.rateLimitIdentity(s.generalLimit, s.handleCreateAdminCourse)))
	mux.HandleFunc("PUT /v1/admin/courses/{id}", s.requireAdmin(s.rateLimitIdentity(s.generalLimit, s.handleUpdateAdminCourse)))
	mux.HandleFunc("POST /v1/admin/courses/{id}/publish", s.requireAdmin(s.rateLimitIdentity(s.generalLimit, s.handlePublishAdminCourse)))
	mux.HandleFunc("GET /v1/admin/teacher-applications", s.requireAdmin(s.rateLimitIdentity(s.generalLimit, s.handleAdminTeacherApplications)))
	mux.HandleFunc("POST /v1/admin/teacher-applications/{userId}/review", s.requireAdmin(s.rateLimitIdentity(s.generalLimit, s.handleAdminReviewTeacherApplication)))
	mux.HandleFunc("GET /v1/admin/lesson-revisions", s.requireAdmin(s.rateLimitIdentity(s.generalLimit, s.handleAdminLessonQueue)))
	mux.HandleFunc("POST /v1/admin/lesson-revisions/{revisionId}/review", s.requireAdmin(s.rateLimitIdentity(s.generalLimit, s.handleAdminReviewLesson)))
	mux.HandleFunc("GET /v1/admin/lesson-reports", s.requireAdmin(s.rateLimitIdentity(s.generalLimit, s.handleAdminLessonReports)))
	mux.HandleFunc("GET /v1/admin/announcements", s.requireAdmin(s.rateLimitIdentity(s.generalLimit, s.handleAdminAnnouncements)))
	mux.HandleFunc("POST /v1/admin/announcements", s.requireAdmin(s.rateLimitIdentity(s.generalLimit, s.handleCreateAnnouncement)))
	mux.HandleFunc("PUT /v1/admin/announcements/{id}", s.requireAdmin(s.rateLimitIdentity(s.generalLimit, s.handleUpdateAnnouncement)))
	mux.HandleFunc("POST /v1/admin/announcements/{id}/publish", s.requireAdmin(s.rateLimitIdentity(s.generalLimit, s.handlePublishAnnouncement)))
	mux.HandleFunc("POST /v1/admin/announcements/{id}/archive", s.requireAdmin(s.rateLimitIdentity(s.generalLimit, s.handleArchiveAnnouncement)))
	mux.HandleFunc("GET /v1/admin/micro-feed/sources", s.requireAdmin(s.rateLimitIdentity(s.generalLimit, s.handleAdminMicroFeedSources)))
	mux.HandleFunc("POST /v1/admin/micro-feed/sources/{slug}/sync", s.requireAdmin(s.rateLimitIdentity(s.generalLimit, s.handleAdminSyncMicroFeedSource)))
	mux.HandleFunc("GET /v1/admin/micro-feed/imports", s.requireAdmin(s.rateLimitIdentity(s.generalLimit, s.handleAdminMicroFeedImports)))
	mux.HandleFunc("POST /v1/admin/micro-feed/imports/{id}/generate", s.requireAdmin(s.rateLimitIdentity(s.quizLimit, s.handleAdminGenerateMicroFeedItem)))
	mux.HandleFunc("POST /v1/admin/micro-feed/imports/{id}/reject", s.requireAdmin(s.rateLimitIdentity(s.generalLimit, s.handleAdminRejectMicroFeedImport)))
	mux.HandleFunc("GET /v1/admin/micro-feed/items", s.requireAdmin(s.rateLimitIdentity(s.generalLimit, s.handleAdminMicroFeedItems)))
	mux.HandleFunc("POST /v1/admin/micro-feed/items", s.requireAdmin(s.rateLimitIdentity(s.generalLimit, s.handleAdminCreateMicroFeedItem)))
	mux.HandleFunc("PUT /v1/admin/micro-feed/items/{id}", s.requireAdmin(s.rateLimitIdentity(s.generalLimit, s.handleAdminUpdateMicroFeedItem)))
	mux.HandleFunc("POST /v1/admin/micro-feed/items/{id}/publish", s.requireAdmin(s.rateLimitIdentity(s.generalLimit, s.handleAdminPublishMicroFeedItem)))
	mux.HandleFunc("POST /v1/admin/micro-feed/items/{id}/archive", s.requireAdmin(s.rateLimitIdentity(s.generalLimit, s.handleAdminArchiveMicroFeedItem)))
	mux.HandleFunc("DELETE /v1/admin/micro-feed/items/{id}", s.requireAdmin(s.rateLimitIdentity(s.generalLimit, s.handleAdminDeleteMicroFeedItem)))
	mux.HandleFunc("POST /v1/admin/lesson-reports/{id}/review", s.requireAdmin(s.rateLimitIdentity(s.generalLimit, s.handleAdminReviewLessonReport)))

	// Перевод. Аккаунт не требуется: перевод нужен и до входа, но гость
	// ограничен жёстче вошедшего — квота DeepL общая на всех.
	mux.HandleFunc("POST /v1/translate", s.optionalAuth(s.rateLimitTranslate(s.handleTranslate)))
	mux.HandleFunc("POST /v1/translate/context", s.optionalAuth(s.rateLimitTranslate(s.handleTranslateInContext)))
	mux.HandleFunc("GET /v1/translate/usage", s.requireAdmin(s.rateLimitIdentity(s.generalLimit, s.handleUsage)))

	// Грамматический разбор по встроенному лексикону. Ни сети, ни аккаунта не
	// требует: приложение делает то же офлайн, сайту нужен сервер.
	mux.HandleFunc("POST /v1/analyze", s.rateLimit(s.generalLimit, s.handleAnalyze))
	mux.HandleFunc("GET /v1/grammar/cases", s.rateLimit(s.generalLimit, s.handleGrammarCases))
	// Совместимость с уже установленными версиями приложения.
	mux.HandleFunc("GET /translate", s.optionalAuth(s.rateLimitTranslate(s.handleTranslateLegacy)))

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
