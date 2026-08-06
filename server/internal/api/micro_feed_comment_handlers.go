package api

import (
	"errors"
	"log/slog"
	"net/http"
	"strconv"

	"github.com/citavuk/server/internal/store"
	"github.com/google/uuid"
)

// Обсуждение карточек Вукотока.
//
// Читать может кто угодно, писать — только вошедший. Разделение не в удобстве:
// анонимная запись, видимая всем, — приглашение для спама, а модератор в
// проекте один и он же автор.

func (s *Server) handleMicroFeedComments(w http.ResponseWriter, r *http.Request) {
	id, ok := microFeedID(w, r)
	if !ok {
		return
	}
	viewer := uuid.Nil
	if user := userFrom(r.Context()); user != nil {
		viewer = user.ID
	}
	limit, _ := strconv.Atoi(r.URL.Query().Get("limit"))
	items, err := s.store.ListMicroFeedComments(r.Context(), id, viewer, limit)
	if err != nil {
		slog.Error("handleMicroFeedComments", "err", err)
		writeError(w, http.StatusInternalServerError, codeInternal, "Не удалось загрузить обсуждение.")
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{"items": items})
}

type microFeedCommentRequest struct {
	Body string `json:"body"`
}

func (s *Server) handleAddMicroFeedComment(w http.ResponseWriter, r *http.Request) {
	id, ok := microFeedID(w, r)
	if !ok {
		return
	}
	user := userFrom(r.Context())
	if user == nil {
		writeError(w, http.StatusUnauthorized, codeUnauthorized, "Войдите, чтобы писать в обсуждение.")
		return
	}
	var request microFeedCommentRequest
	// Предел вчетверо больше разрешённой реплики: тело в 600 символов кириллицы
	// весит до 1200 байт, и отказ по длине должен быть внятным сообщением, а не
	// обрывом чтения.
	if err := decodeJSON(w, r, &request, 4<<10); err != nil {
		writeError(w, http.StatusBadRequest, codeBadRequest, "Не удалось прочитать комментарий.")
		return
	}

	comment, err := s.store.AddMicroFeedComment(r.Context(), id, user.ID, request.Body)
	switch {
	case errors.Is(err, store.ErrMicroFeedCommentEmpty):
		writeError(w, http.StatusUnprocessableEntity, codeBadRequest, "Комментарий пустой.")
		return
	case errors.Is(err, store.ErrMicroFeedCommentLong):
		writeError(w, http.StatusUnprocessableEntity, codeBadRequest,
			"Комментарий длиннее "+strconv.Itoa(store.MicroFeedCommentMaxRunes)+" символов.")
		return
	case errors.Is(err, store.ErrMicroFeedCommentSoon):
		writeError(w, http.StatusTooManyRequests, codeRateLimited,
			"Слишком часто. Подождите несколько секунд.")
		return
	case err != nil:
		slog.Error("handleAddMicroFeedComment", "err", err)
		writeError(w, http.StatusInternalServerError, codeInternal, "Не удалось сохранить комментарий.")
		return
	}
	writeJSON(w, http.StatusCreated, comment)
}

func (s *Server) handleDeleteMicroFeedComment(w http.ResponseWriter, r *http.Request) {
	commentID, err := uuid.Parse(r.PathValue("commentId"))
	if err != nil {
		writeError(w, http.StatusBadRequest, codeBadRequest, "Неверный идентификатор комментария.")
		return
	}
	user := userFrom(r.Context())
	if user == nil {
		writeError(w, http.StatusUnauthorized, codeUnauthorized, "Войдите, чтобы удалить комментарий.")
		return
	}
	err = s.store.DeleteMicroFeedComment(r.Context(), commentID, user.ID, user.IsAdmin)
	if errors.Is(err, store.ErrMicroFeedCommentDenied) {
		writeError(w, http.StatusForbidden, codeForbidden, "Это чужой комментарий.")
		return
	}
	if err != nil {
		slog.Error("handleDeleteMicroFeedComment", "err", err)
		writeError(w, http.StatusInternalServerError, codeInternal, "Не удалось удалить комментарий.")
		return
	}
	w.WriteHeader(http.StatusNoContent)
}
