package api

import (
	"encoding/json"
	"errors"
	"log/slog"
	"net/http"
	"regexp"
	"time"

	"github.com/citavuk/server/internal/store"
)

const maxCourseProgressBytes = 512 << 10

var courseIDPattern = regexp.MustCompile(`^[A-Za-z0-9_.-]{1,80}$`)

type courseProgressInput struct {
	Payload   json.RawMessage `json:"payload"`
	UpdatedAt time.Time       `json:"updatedAt"`
}

func (s *Server) handleGetCourseProgress(w http.ResponseWriter, r *http.Request) {
	courseID := r.PathValue("courseId")
	if !courseIDPattern.MatchString(courseID) {
		writeError(w, http.StatusBadRequest, codeBadRequest, "Некорректный идентификатор курса.")
		return
	}
	user := userFrom(r.Context())
	progress, err := s.store.GetCourseProgress(r.Context(), user.ID, courseID)
	if errors.Is(err, store.ErrCourseProgressNotFound) {
		writeError(w, http.StatusNotFound, codeNotFound, "Прогресс этого курса ещё не создан.")
		return
	}
	if err != nil {
		slog.Error("чтение прогресса курса", "err", err)
		writeError(w, http.StatusInternalServerError, codeInternal, "Не удалось загрузить прогресс курса.")
		return
	}
	writeJSON(w, http.StatusOK, progress)
}

func (s *Server) handlePutCourseProgress(w http.ResponseWriter, r *http.Request) {
	courseID := r.PathValue("courseId")
	if !courseIDPattern.MatchString(courseID) {
		writeError(w, http.StatusBadRequest, codeBadRequest, "Некорректный идентификатор курса.")
		return
	}
	var input courseProgressInput
	if err := decodeJSON(w, r, &input, maxCourseProgressBytes); err != nil {
		if errors.Is(err, errTooLarge) {
			writeError(w, http.StatusRequestEntityTooLarge, codeTooLarge, "Прогресс курса слишком велик.")
			return
		}
		writeError(w, http.StatusBadRequest, codeBadRequest, "Не удалось прочитать прогресс курса.")
		return
	}
	if len(input.Payload) == 0 || !json.Valid(input.Payload) ||
		string(input.Payload) == "null" || input.Payload[0] != '{' {
		writeError(w, http.StatusBadRequest, codeBadRequest, "Прогресс курса должен быть JSON-объектом.")
		return
	}
	now := time.Now().UTC()
	if input.UpdatedAt.IsZero() || input.UpdatedAt.After(now.Add(5*time.Minute)) {
		input.UpdatedAt = now
	}

	user := userFrom(r.Context())
	applied, current, err := s.store.PutCourseProgress(r.Context(), user.ID, &store.CourseProgress{
		CourseID:  courseID,
		Payload:   input.Payload,
		UpdatedAt: input.UpdatedAt,
	})
	if err != nil {
		slog.Error("сохранение прогресса курса", "err", err)
		writeError(w, http.StatusInternalServerError, codeInternal, "Не удалось сохранить прогресс курса.")
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{
		"applied":   applied,
		"courseId":  current.CourseID,
		"payload":   current.Payload,
		"updatedAt": current.UpdatedAt,
	})
}
