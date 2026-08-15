package api

import (
	"context"
	"encoding/json"
	"log/slog"
	"net/http"
	"runtime/debug"
	"slices"
	"strconv"
	"strings"
	"time"

	"github.com/citavuk/server/internal/auth"
	"github.com/citavuk/server/internal/store"
)

type ctxKey int

const userKey ctxKey = iota

// userFrom достаёт пользователя, положенного в контекст middleware requireAuth.
func userFrom(ctx context.Context) *store.User {
	u, _ := ctx.Value(userKey).(*store.User)
	return u
}

// optionalAuth узнаёт пользователя, если тот вошёл, и пропускает гостя дальше.
//
// Нужен там, где страница открыта всем, но вошедшему показывает больше:
// страница материалов сообщает про готовый тест любому посетителю, а «вы уже
// решали, было 80%» — только владельцу этих попыток. Негодный токен здесь не
// ошибка, а просто «гость»: иначе истёкшая сессия ломала бы публичную страницу.
func (s *Server) optionalAuth(next http.HandlerFunc) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		token := auth.BearerToken(r.Header.Get("Authorization"))
		if token == "" {
			next(w, r)
			return
		}
		user, err := s.store.SessionUser(r.Context(), auth.HashToken(token), s.cfg.SessionTTLDays)
		if err != nil {
			next(w, r)
			return
		}
		next(w, r.WithContext(context.WithValue(r.Context(), userKey, user)))
	}
}

// requireAuth пропускает только запросы с действующим токеном сессии.
func (s *Server) requireAuth(next http.HandlerFunc) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		token := auth.BearerToken(r.Header.Get("Authorization"))
		if token == "" {
			writeError(w, http.StatusUnauthorized, codeUnauthorized, "Нужно войти в аккаунт.")
			return
		}
		user, err := s.store.SessionUser(r.Context(), auth.HashToken(token), s.cfg.SessionTTLDays)
		if err != nil {
			// Истёкшая и несуществующая сессии намеренно неразличимы: разница
			// подсказала бы, какой токен когда-то существовал.
			writeError(w, http.StatusUnauthorized, codeUnauthorized, "Сессия истекла, войдите снова.")
			return
		}
		next(w, r.WithContext(context.WithValue(r.Context(), userKey, user)))
	}
}

// requireAdmin проверяет роль на сервере. Скрытие ссылки в интерфейсе — только
// удобство; настоящая граница доступа всегда находится здесь.
func (s *Server) requireAdmin(next http.HandlerFunc) http.HandlerFunc {
	return s.requireAuth(func(w http.ResponseWriter, r *http.Request) {
		if !userFrom(r.Context()).IsAdmin {
			writeError(w, http.StatusForbidden, codeForbidden,
				"Для этого раздела нужны права администратора.")
			return
		}
		next(w, r)
	})
}

// requireTeacher checks the approved application on every protected request.
// The role is deliberately not trusted to a client-side flag: an administrator
// can suspend publishing without waiting for a new login session.
func (s *Server) requireTeacher(next http.HandlerFunc) http.HandlerFunc {
	return s.requireAuth(func(w http.ResponseWriter, r *http.Request) {
		approved, err := s.store.IsApprovedTeacher(r.Context(), userFrom(r.Context()).ID)
		if err != nil {
			writeError(w, http.StatusInternalServerError, codeInternal, "Не удалось проверить права преподавателя.")
			return
		}
		if !approved {
			writeError(w, http.StatusForbidden, codeForbidden, "Для редактора нужна одобренная заявка преподавателя.")
			return
		}
		next(w, r)
	})
}

// rateLimit ограничивает частоту запросов по адресу клиента.
func (s *Server) rateLimit(l *limiter, next http.HandlerFunc) http.HandlerFunc {
	return s.rateLimitKey(l, func(r *http.Request) string {
		return clientIP(r, s.cfg.TrustProxy)
	}, next)
}

// rateLimitKey ограничивает частоту запросов по произвольному ключу.
func (s *Server) rateLimitKey(l *limiter, key func(*http.Request) string, next http.HandlerFunc) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		if !l.allow(r.Context(), key(r)) {
			writeRateLimited(w)
			return
		}
		next(w, r)
	}
}

// rateLimitIdentity считает вошедшего пользователя по ID, а гостя — по IP.
// Middleware должен стоять после requireAuth/optionalAuth, чтобы пользователь
// уже находился в контексте. Так соседи за одним NAT не делят общий bucket.
func (s *Server) rateLimitIdentity(l *limiter, next http.HandlerFunc) http.HandlerFunc {
	return s.rateLimitKey(l, func(r *http.Request) string {
		if u := userFrom(r.Context()); u != nil {
			return "user:" + u.ID.String()
		}
		return "ip:" + clientIP(r, s.cfg.TrustProxy)
	}, next)
}

// rateLimitTranslate выбирает ограничитель по тому, вошёл ли пользователь.
// Вызывается после optionalAuth: у гостя предел намного жёстче, чем у
// аккаунта, потому что квота DeepL общая и анонимный бот не должен выесть
// её целиком.
func (s *Server) rateLimitTranslate(next http.HandlerFunc) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		if u := userFrom(r.Context()); u != nil {
			if !s.userTranslateLimit.allow(r.Context(), "user:"+u.ID.String()) {
				writeRateLimited(w)
				return
			}
		} else if !s.anonTranslateLimit.allow(
			r.Context(), "ip:"+clientIP(r, s.cfg.TrustProxy),
		) {
			writeRateLimited(w)
			return
		}
		// Последний рубеж защищает общую квоту провайдера даже при атаке через
		// множество аккаунтов и IP. Проверяем его после личного bucket, чтобы
		// один уже заблокированный клиент не отнимал токены у остальных.
		if !s.translateGlobalLimit.allow(r.Context(), "all") {
			writeRateLimited(w)
			return
		}
		next(w, r)
	}
}

func writeRateLimited(w http.ResponseWriter) {
	w.Header().Set("Retry-After", "60")
	writeError(w, http.StatusTooManyRequests, codeRateLimited,
		"Слишком много запросов. Подождите минуту.")
}

// withCORS добавляет заголовки для браузерной версии приложения.
//
// Origin сверяется со списком: подставлять в Allow-Origin любой присланный
// origin вместе с Allow-Credentials — значит разрешить любому сайту читать
// данные пользователя от его имени.
func (s *Server) withCORS(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		origin := r.Header.Get("Origin")
		if origin != "" && s.originAllowed(origin) {
			w.Header().Set("Access-Control-Allow-Origin", origin)
			w.Header().Set("Access-Control-Allow-Credentials", "true")
			w.Header().Set("Access-Control-Allow-Headers", "Authorization, Content-Type, X-Duel-Player")
			w.Header().Set("Access-Control-Allow-Methods", "GET, POST, PUT, DELETE, OPTIONS")
			w.Header().Set("Access-Control-Expose-Headers", "Content-Disposition, Content-Type, X-Citavuk-Filename")
			w.Header().Set("Access-Control-Max-Age", "86400")
			// Ответ зависит от Origin, иначе кеш отдаст чужие заголовки.
			w.Header().Add("Vary", "Origin")
		}
		if r.Method == http.MethodOptions {
			w.WriteHeader(http.StatusNoContent)
			return
		}
		next.ServeHTTP(w, r)
	})
}

func (s *Server) originAllowed(origin string) bool {
	if slices.Contains(s.cfg.AllowedOrigins, "*") {
		return true
	}
	if slices.Contains(s.cfg.AllowedOrigins, origin) {
		return true
	}
	// localhost на любом порту разрешён всегда: это режим разработки, до
	// которого посторонний сайт всё равно не дотянется.
	return strings.HasPrefix(origin, "http://localhost:") ||
		strings.HasPrefix(origin, "http://127.0.0.1:")
}

// statusRecorder запоминает код ответа для журнала.
type statusRecorder struct {
	http.ResponseWriter
	status int
	bytes  int
	// Начало тела ошибочного ответа: по нему в админке видно, что именно
	// человек получил на экран, а не только код.
	body []byte
}

func (s *statusRecorder) WriteHeader(code int) {
	if s.status != 0 {
		return
	}
	s.status = code
	s.ResponseWriter.WriteHeader(code)
}

func (s *statusRecorder) Write(b []byte) (int, error) {
	if s.status == 0 {
		s.status = http.StatusOK
	}
	if s.status >= http.StatusBadRequest && len(s.body) < 512 {
		s.body = append(s.body, b[:min(len(b), 512-len(s.body))]...)
	}
	n, err := s.ResponseWriter.Write(b)
	s.bytes += n
	return n, err
}

func (s *statusRecorder) Unwrap() http.ResponseWriter {
	return s.ResponseWriter
}

// withLogging пишет одну строку на запрос и не даёт панике уронить процесс.
func (s *Server) withLogging(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		start := time.Now()
		rec := &statusRecorder{ResponseWriter: w}

		defer func() {
			if v := recover(); v != nil {
				// Паника в одном обработчике не должна ронять весь сервер и уж
				// точно не должна показывать пользователю стек.
				slog.Error("паника в обработчике",
					"method", r.Method, "path", r.URL.Path,
					"panic", v, "stack", string(debug.Stack()))
				if rec.status == 0 {
					writeError(rec, http.StatusInternalServerError, codeInternal,
						"Внутренняя ошибка сервера.")
				}
			}
			if rec.status == 0 {
				rec.status = http.StatusOK
			}
			// Инцидент заводится только на настоящую аварию. Если клиент успел
			// отвалиться, любой код после этого — следствие обрыва, а не сбоя.
			if rec.status >= http.StatusInternalServerError && r.Context().Err() == nil {
				s.recordHTTPIncident(r, rec.status)
			}
			// А в живой список попадают и отказы клиенту: пачка 401 или 429
			// значит, что у людей что-то не работает, хотя сервер здоров.
			if rec.status >= http.StatusBadRequest {
				s.errors.add(ErrorEvent{
					At:      start.UTC(),
					Method:  r.Method,
					Path:    r.URL.Path,
					Status:  rec.status,
					Ms:      time.Since(start).Milliseconds(),
					User:    actorName(r),
					Message: errorText(rec.body),
				})
			}
			slog.Info("запрос",
				"method", r.Method,
				"path", r.URL.Path,
				"status", rec.status,
				"bytes", rec.bytes,
				"ms", time.Since(start).Milliseconds())
		}()

		next.ServeHTTP(rec, r)
	})
}

// actorName называет того, кто получил ошибку. Почта нужна ровно затем, чтобы
// понять, у одного человека сломалось или у всех; за пределы админки она не
// уходит.
func actorName(r *http.Request) string {
	if user := userFrom(r.Context()); user != nil {
		return user.Email
	}
	return ""
}

func (s *Server) recordHTTPIncident(r *http.Request, status int) {
	method := r.Method
	path := r.URL.Path
	go func() {
		ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
		defer cancel()
		details, _ := json.Marshal(map[string]any{
			"method": method,
			"path":   path,
			"status": status,
		})
		fingerprint := "http:" + method + ":" + path + ":" + strconv.Itoa(status)
		if err := s.store.RecordIncident(
			ctx,
			fingerprint,
			"error",
			"api",
			method+" "+path+" вернул "+strconv.Itoa(status),
			details,
		); err != nil {
			slog.Warn("не удалось записать инцидент", "err", err)
		}
	}()
}
