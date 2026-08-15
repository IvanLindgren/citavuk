package api

import (
	"context"
	"log/slog"
	"net/http"
	"strconv"
	"strings"
	"time"

	"github.com/citavuk/server/internal/store"
	"github.com/google/uuid"
)

// Ручки состояния для админки: что с ключами, кто играет прямо сейчас, что
// сыплется и как растёт сайт.
//
// Всё это раньше жило в голове и в ssh: остаток квоты DeepL смотрели curl'ом,
// «кто играет» не смотрели никак, а причину ошибки искали в текстовом логе.

// startedAt — момент запуска процесса, для строки «сервер живёт столько-то».
var startedAt = time.Now()

type keyState struct {
	Name  string `json:"name"`
	Title string `json:"title"`
	Ready bool   `json:"ready"`
	Note  string `json:"note,omitempty"`
}

type quotaState struct {
	Provider string `json:"provider"`
	// Месячная квота провайдера.
	Used  int64 `json:"used"`
	Limit int64 `json:"limit"`
	// Суточный бюджет знаков — наша собственная защита квоты.
	DailyBudget    int    `json:"dailyBudget"`
	DailyRemaining int    `json:"dailyRemaining"`
	BudgetEnabled  bool   `json:"budgetEnabled"`
	Error          string `json:"error,omitempty"`
}

// handleAdminHealth отдаёт состояние ключей, квот и зависимостей.
func (s *Server) handleAdminHealth(w http.ResponseWriter, r *http.Request) {
	ctx, cancel := context.WithTimeout(r.Context(), 8*time.Second)
	defer cancel()

	quota := quotaState{Provider: "deepl"}
	budget := s.translator.Budget()
	quota.BudgetEnabled = budget != nil
	quota.DailyBudget = budget.PerDay()
	quota.DailyRemaining = budget.Available()
	if s.deepl == nil {
		quota.Error = "ключ DeepL не задан"
	} else if usage, err := s.deepl.Usage(ctx); err != nil {
		// Не авария: панель обязана открыться и без ответа провайдера.
		quota.Error = err.Error()
	} else {
		quota.Used = usage.CharacterCount
		quota.Limit = usage.CharacterLimit
	}

	keys := []keyState{
		{"deepl", "DeepL — перевод", s.deepl != nil, ""},
		{"gemma", "Судья матча (Polza AI)", s.cfg.TranslationGameAIKey != "", s.cfg.TranslationGameAIModel},
		{"quiz", "Генератор тестов", s.cfg.QuizAPIKey != "", s.cfg.QuizModel},
		{"feed", "Вукоток — тексты", s.cfg.FeedAIKey != "", s.cfg.FeedAIModel},
		{"embedding", "Вукоток — подбор", s.cfg.FeedEmbeddingKey != "", s.cfg.FeedEmbeddingModel},
		{"mail", "Почта (Resend)", s.mailer.Enabled(), s.cfg.EmailFrom},
		{"googleAuth", "Вход через Google", s.google.Enabled(), ""},
		{"yandexAuth", "Вход через Яндекс", s.yandex.Enabled(), ""},
		{"s3", "Хранилище файлов", s.cfg.S3Bucket != "", s.cfg.S3Bucket},
		{"redis", "Redis", s.redis != nil && s.redis.Ping(ctx), ""},
		{"upstream", "Старый Python-бэкенд", s.proxy != nil, s.cfg.UpstreamURL},
	}

	// Число открытых аварий идёт здесь же: строке состояния в шапке админки
	// хватает одного запроса вместо трёх.
	var incidents int64
	if err := s.store.Pool.QueryRow(ctx,
		`SELECT count(*) FROM incidents WHERE resolved_at IS NULL`).Scan(&incidents); err != nil {
		incidents = -1
	}

	writeJSON(w, http.StatusOK, map[string]any{
		"version":   Version,
		"uptime":    int64(time.Since(startedAt).Seconds()),
		"database":  s.store.Pool.Ping(ctx) == nil,
		"quota":     quota,
		"keys":      keys,
		"incidents": incidents,
		"now":       time.Now().UTC(),
	})
}

// handleAdminLiveDuel показывает, кто играет прямо сейчас.
func (s *Server) handleAdminLiveDuel(w http.ResponseWriter, r *http.Request) {
	live, err := s.store.LiveDuelState(r.Context(), time.Now().UTC())
	if err != nil {
		slog.Error("живые комнаты матча", "err", err)
		writeError(w, http.StatusInternalServerError, codeInternal,
			"Не удалось загрузить комнаты.")
		return
	}
	writeJSON(w, http.StatusOK, live)
}

// handleAdminStats отдаёт подробную статистику.
//
// Считается это десятком count(*) по большим таблицам, поэтому запрос ограничен
// по времени: панель, которую открывают раз в день, не должна держать
// соединение базы, пока её ждут остальные.
func (s *Server) handleAdminStats(w http.ResponseWriter, r *http.Request) {
	ctx, cancel := context.WithTimeout(r.Context(), 20*time.Second)
	defer cancel()
	stats, err := s.store.AdminDetailedStats(ctx)
	if err != nil {
		slog.Error("подробная статистика", "err", err)
		writeError(w, http.StatusInternalServerError, codeInternal,
			"Не удалось посчитать статистику.")
		return
	}
	writeJSON(w, http.StatusOK, stats)
}

// handleAdminRecentErrors отдаёт живой список ответов с ошибкой.
func (s *Server) handleAdminRecentErrors(w http.ResponseWriter, r *http.Request) {
	limit, _ := strconv.Atoi(r.URL.Query().Get("limit"))
	if limit < 1 || limit > 300 {
		limit = 120
	}
	writeJSON(w, http.StatusOK, map[string]any{
		"items": s.errors.list(limit),
		"paths": s.errors.byPath(),
	})
}

// handleAdminIncidentsFiltered — журнал ошибок с отбором.
func (s *Server) handleAdminIncidentsFiltered(w http.ResponseWriter, r *http.Request) {
	query := r.URL.Query()
	hours, _ := strconv.Atoi(query.Get("hours"))
	limit, _ := strconv.Atoi(query.Get("limit"))
	incidents, err := s.store.ListIncidentsFiltered(r.Context(), store.IncidentFilter{
		OpenOnly: query.Get("status") != "all",
		Severity: query.Get("severity"),
		Source:   query.Get("source"),
		Query:    query.Get("q"),
		Hours:    hours,
		Limit:    limit,
	})
	if err != nil {
		slog.Error("журнал ошибок", "err", err)
		writeError(w, http.StatusInternalServerError, codeInternal,
			"Не удалось загрузить журнал.")
		return
	}
	facets, err := s.store.IncidentFacets(r.Context())
	if err != nil {
		slog.Error("сводка журнала", "err", err)
		facets = map[string][]store.IncidentFacet{}
	}
	writeJSON(w, http.StatusOK, map[string]any{"items": incidents, "facets": facets})
}

// handleAdminResolveSource закрывает все открытые записи одного источника.
func (s *Server) handleAdminResolveSource(w http.ResponseWriter, r *http.Request) {
	source := strings.TrimSpace(r.URL.Query().Get("source"))
	if source == "" {
		writeError(w, http.StatusBadRequest, codeBadRequest, "Не указан источник.")
		return
	}
	var admin uuid.UUID
	if user := userFrom(r.Context()); user != nil {
		admin = user.ID
	}
	closed, err := s.store.ResolveIncidentsBySource(r.Context(), source, admin)
	if err != nil {
		slog.Error("закрытие журнала по источнику", "err", err)
		writeError(w, http.StatusInternalServerError, codeInternal,
			"Не удалось закрыть записи.")
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{"closed": closed})
}
