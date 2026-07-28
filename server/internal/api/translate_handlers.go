package api

import (
	"errors"
	"log/slog"
	"net/http"
	"strings"

	"github.com/citavuk/server/internal/translate"
)

type translateRequest struct {
	Text   string `json:"text"`
	Source string `json:"source"`
	Target string `json:"target"`
}

type contextTranslateRequest struct {
	Sentence string `json:"sentence"`
	// Границы слова в байтах исходной строки — те же смещения, которые выдаёт
	// токенизатор клиента. Пересчитывать их на сервере нельзя: любое
	// расхождение указало бы на другое слово.
	Start  int    `json:"start"`
	End    int    `json:"end"`
	Source string `json:"source"`
	Target string `json:"target"`
}

func langs(source, target string) (string, string) {
	if strings.TrimSpace(source) == "" {
		source = "sr"
	}
	if strings.TrimSpace(target) == "" {
		target = "ru"
	}
	return strings.ToLower(source), strings.ToLower(target)
}

// handleTranslate переводит фразу или отдельное слово.
func (s *Server) handleTranslate(w http.ResponseWriter, r *http.Request) {
	if !s.translator.Available() {
		writeError(w, http.StatusServiceUnavailable, codeUpstream, "Переводчик не настроен.")
		return
	}

	var req translateRequest
	if err := decodeJSON(w, r, &req, 64<<10); err != nil {
		writeError(w, http.StatusBadRequest, codeBadRequest, "Не удалось прочитать запрос.")
		return
	}
	source, target := langs(req.Source, req.Target)

	res, err := s.translator.Text(r.Context(), req.Text, source, target)
	if err != nil {
		writeTranslateError(w, err)
		return
	}
	writeJSON(w, http.StatusOK, res)
}

// handleTranslateInContext переводит слово вместе с его предложением.
//
// Это основной путь для читалки: слово, вырванное из фразы, переводится заметно
// хуже — см. документацию пакета translate.
func (s *Server) handleTranslateInContext(w http.ResponseWriter, r *http.Request) {
	if !s.translator.Available() {
		writeError(w, http.StatusServiceUnavailable, codeUpstream, "Переводчик не настроен.")
		return
	}

	var req contextTranslateRequest
	if err := decodeJSON(w, r, &req, 64<<10); err != nil {
		writeError(w, http.StatusBadRequest, codeBadRequest, "Не удалось прочитать запрос.")
		return
	}
	source, target := langs(req.Source, req.Target)

	res, err := s.translator.InContext(r.Context(), req.Sentence, req.Start, req.End, source, target)
	if err != nil {
		writeTranslateError(w, err)
		return
	}
	writeJSON(w, http.StatusOK, res)
}

func writeTranslateError(w http.ResponseWriter, err error) {
	switch {
	case errors.Is(err, translate.ErrEmptyText):
		writeError(w, http.StatusBadRequest, codeBadRequest, "Пустой текст.")
	case errors.Is(err, translate.ErrQuota):
		writeError(w, http.StatusServiceUnavailable, codeUpstream,
			"Исчерпан месячный лимит переводчика.")
	case errors.Is(err, translate.ErrRateLimited):
		writeError(w, http.StatusTooManyRequests, codeRateLimited,
			"Переводчик просит подождать. Попробуйте через минуту.")
	case errors.Is(err, translate.ErrNoProvider):
		writeError(w, http.StatusServiceUnavailable, codeUpstream, "Переводчик недоступен.")
	default:
		slog.Warn("перевод не удался", "err", err)
		writeError(w, http.StatusBadGateway, codeUpstream, "Не удалось перевести текст.")
	}
}

// handleTranslateLegacy повторяет старый GET-эндпоинт Python-бэкенда, чтобы уже
// установленные версии приложения продолжали работать после перехода на Go.
func (s *Server) handleTranslateLegacy(w http.ResponseWriter, r *http.Request) {
	if !s.translator.Available() {
		writeError(w, http.StatusServiceUnavailable, codeUpstream, "Переводчик не настроен.")
		return
	}
	q := r.URL.Query()
	source, target := langs(q.Get("sl"), q.Get("tl"))

	res, err := s.translator.Text(r.Context(), q.Get("q"), source, target)
	if err != nil {
		writeTranslateError(w, err)
		return
	}
	// Формат ответа старого бэкенда.
	writeJSON(w, http.StatusOK, map[string]string{"translation": res.Text})
}

// handleUsage показывает расход квоты переводчика.
func (s *Server) handleUsage(w http.ResponseWriter, r *http.Request) {
	if s.deepl == nil {
		writeError(w, http.StatusServiceUnavailable, codeUpstream, "DeepL не настроен.")
		return
	}
	usage, err := s.deepl.Usage(r.Context())
	if err != nil {
		writeError(w, http.StatusBadGateway, codeUpstream, "Не удалось получить расход квоты.")
		return
	}
	writeJSON(w, http.StatusOK, usage)
}
