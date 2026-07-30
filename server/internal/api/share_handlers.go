package api

import (
	"errors"
	"log/slog"
	"net/http"
	"strconv"
	"strings"
	"time"

	"github.com/citavuk/server/internal/serbian"
	"github.com/citavuk/server/internal/store"
	"github.com/google/uuid"
)

// maxCommentRunes — предел длины сообщения в обсуждении.
const maxCommentRunes = 1000

// commentsPerHour — сколько сообщений человек может оставить за час.
//
// Обсуждение книги идёт неспешно; десяток сообщений в час — это уже живой
// разговор, а всё сверх того похоже на рассылку.
const commentsPerHour = 20

type createShareRequest struct {
	ContentSHA string `json:"contentSha"`
	Title      string `json:"title"`
	Paragraphs int    `json:"paragraphs"`
}

// handleCreateShare выдаёт ссылку на книгу.
//
// Текст должен быть уже выгружен обычной синхронизацией: копии здесь не
// делается, ссылка лишь открывает доступ к тому, что и так лежит на сервере.
func (s *Server) handleCreateShare(w http.ResponseWriter, r *http.Request) {
	var req createShareRequest
	if err := decodeJSON(w, r, &req, 8<<10); err != nil {
		writeError(w, http.StatusBadRequest, codeBadRequest, "Не удалось прочитать запрос.")
		return
	}
	user := userFrom(r.Context())

	share, err := s.store.CreateShare(
		r.Context(), user.ID,
		strings.TrimSpace(req.ContentSHA), trimField(req.Title, 300), req.Paragraphs,
	)
	if errors.Is(err, store.ErrContentNotFound) {
		writeError(w, http.StatusConflict, codeConflict,
			"Текст книги ещё не выгружен на сервер. Дождитесь синхронизации и повторите.")
		return
	}
	if err != nil {
		slog.Warn("не удалось создать ссылку", "err", err)
		writeError(w, http.StatusInternalServerError, codeInternal, "Не удалось создать ссылку.")
		return
	}
	writeJSON(w, http.StatusCreated, share)
}

// handleGetShare отдаёт сведения о книге по ссылке.
//
// Открыт всем: по ссылке приходят те, у кого аккаунта ещё нет, и они должны
// увидеть, что за книга, прежде чем решать, заводить ли его.
func (s *Server) handleGetShare(w http.ResponseWriter, r *http.Request) {
	share, err := s.store.Share(r.Context(), r.PathValue("token"))
	if errors.Is(err, store.ErrShareNotFound) {
		writeError(w, http.StatusNotFound, codeNotFound,
			"Такой ссылки нет. Возможно, её отозвали.")
		return
	}
	if err != nil {
		writeError(w, http.StatusInternalServerError, codeInternal, "База недоступна.")
		return
	}
	writeJSON(w, http.StatusOK, share)
}

// handleShareContent отдаёт текст книги по ссылке.
func (s *Server) handleShareContent(w http.ResponseWriter, r *http.Request) {
	payload, err := s.store.ShareContent(r.Context(), r.PathValue("token"))
	if errors.Is(err, store.ErrShareNotFound) {
		writeError(w, http.StatusNotFound, codeNotFound, "Текст по этой ссылке не найден.")
		return
	}
	if err != nil {
		slog.Error("чтение текста по ссылке", "err", err)
		writeError(w, http.StatusInternalServerError, codeInternal, "Не удалось прочитать текст.")
		return
	}
	// Тело уже корректный JSON-массив строк — отдаём как есть, не пересобирая.
	w.Header().Set("Content-Type", "application/json; charset=utf-8")
	w.Header().Set("Cache-Control", "private, no-store")
	w.WriteHeader(http.StatusOK)
	_, _ = w.Write(payload)
}

// handleDeleteShare отзывает ссылку.
func (s *Server) handleDeleteShare(w http.ResponseWriter, r *http.Request) {
	user := userFrom(r.Context())
	err := s.store.DeleteShare(r.Context(), user.ID, r.PathValue("token"))
	if errors.Is(err, store.ErrShareNotFound) {
		writeError(w, http.StatusNotFound, codeNotFound, "Такой ссылки у вас нет.")
		return
	}
	if err != nil {
		writeError(w, http.StatusInternalServerError, codeInternal, "Не удалось отозвать ссылку.")
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{"deleted": true})
}

// handleComments отдаёт обсуждение страницы.
func (s *Server) handleComments(w http.ResponseWriter, r *http.Request) {
	token := r.PathValue("token")
	if _, err := s.store.Share(r.Context(), token); err != nil {
		writeError(w, http.StatusNotFound, codeNotFound, "Такой ссылки нет.")
		return
	}

	viewer := uuid.Nil
	if user := userFrom(r.Context()); user != nil {
		viewer = user.ID
	}

	// Без номера страницы отдаём карту «страница → сколько сообщений»: читалке
	// нужно отметить страницы с обсуждением, не спрашивая каждую отдельно.
	raw := strings.TrimSpace(r.URL.Query().Get("paragraph"))
	if raw == "" {
		counts, err := s.store.CommentCounts(r.Context(), token)
		if err != nil {
			writeError(w, http.StatusInternalServerError, codeInternal, "База недоступна.")
			return
		}
		pages := make(map[string]int, len(counts))
		for paragraph, count := range counts {
			pages[strconv.Itoa(paragraph)] = count
		}
		writeJSON(w, http.StatusOK, map[string]any{"pages": pages})
		return
	}

	paragraph, err := strconv.Atoi(raw)
	if err != nil || paragraph < 0 {
		writeError(w, http.StatusBadRequest, codeBadRequest, "Неверный номер страницы.")
		return
	}
	list, err := s.store.Comments(r.Context(), token, paragraph, viewer)
	if err != nil {
		writeError(w, http.StatusInternalServerError, codeInternal, "База недоступна.")
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{"items": list})
}

type addCommentRequest struct {
	Paragraph int    `json:"paragraph"`
	Body      string `json:"body"`
}

// handleAddComment добавляет сообщение в обсуждение страницы.
//
// Правило раздела — только сербский, и проверяется он здесь. Проверка в
// интерфейсе обходится одним запросом мимо него, а смысл раздела именно в том,
// чтобы заставить писать на изучаемом языке.
func (s *Server) handleAddComment(w http.ResponseWriter, r *http.Request) {
	token := r.PathValue("token")
	if _, err := s.store.Share(r.Context(), token); err != nil {
		writeError(w, http.StatusNotFound, codeNotFound, "Такой ссылки нет.")
		return
	}

	var req addCommentRequest
	if err := decodeJSON(w, r, &req, 16<<10); err != nil {
		writeError(w, http.StatusBadRequest, codeBadRequest, "Не удалось прочитать сообщение.")
		return
	}
	if req.Paragraph < 0 {
		writeError(w, http.StatusBadRequest, codeBadRequest, "Неверный номер страницы.")
		return
	}

	body := trimField(req.Body, maxCommentRunes)
	if verdict := serbian.Check(body); !verdict.OK {
		// 422: запрос понятен, но содержимое не годится. Текст ответа человек
		// увидит целиком — он объясняет, что именно исправить.
		writeError(w, http.StatusUnprocessableEntity, codeBadRequest, verdict.Reason)
		return
	}

	user := userFrom(r.Context())
	recent, err := s.store.RecentCommentsByUser(r.Context(), user.ID, time.Hour)
	if err == nil && recent >= commentsPerHour {
		writeError(w, http.StatusTooManyRequests, codeRateLimited,
			"Слишком много сообщений за час. Продолжите чуть позже.")
		return
	}

	author := strings.TrimSpace(user.DisplayName)
	if author == "" {
		author = "Читатель"
	}
	comment, err := s.store.AddComment(r.Context(), token, req.Paragraph, user.ID, author, body)
	if err != nil {
		slog.Warn("не удалось записать сообщение", "err", err)
		writeError(w, http.StatusInternalServerError, codeInternal, "Не удалось отправить сообщение.")
		return
	}
	writeJSON(w, http.StatusCreated, comment)
}

// handleHideComment убирает своё сообщение.
func (s *Server) handleHideComment(w http.ResponseWriter, r *http.Request) {
	id, err := uuid.Parse(r.PathValue("id"))
	if err != nil {
		writeError(w, http.StatusBadRequest, codeBadRequest, "Неверный адрес сообщения.")
		return
	}
	user := userFrom(r.Context())
	if err := s.store.HideOwnComment(r.Context(), id, user.ID); err != nil {
		writeError(w, http.StatusNotFound, codeNotFound, "Своего сообщения с таким номером нет.")
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{"hidden": true})
}
