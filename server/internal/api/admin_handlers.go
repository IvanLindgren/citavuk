package api

import (
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"errors"
	"log/slog"
	"net/http"
	"strconv"
	"strings"

	"github.com/citavuk/server/internal/store"
	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgconn"
)

type courseBundleInput struct {
	Bundle json.RawMessage `json:"bundle"`
}

type courseEnvelope struct {
	CourseID      string `json:"courseId"`
	CourseVersion string `json:"courseVersion"`
	Title         string `json:"title"`
	Units         []struct {
		Skills []struct {
			Lessons []struct {
				Exercises []json.RawMessage `json:"exercises"`
			} `json:"lessons"`
		} `json:"skills"`
	} `json:"units"`
}

func (s *Server) handleAdminOverview(w http.ResponseWriter, r *http.Request) {
	overview, err := s.store.AdminOverview(r.Context())
	if err != nil {
		slog.Error("админская статистика", "err", err)
		writeError(w, http.StatusInternalServerError, codeInternal,
			"Не удалось загрузить статистику.")
		return
	}
	writeJSON(w, http.StatusOK, overview)
}

func (s *Server) handleAdminUsers(w http.ResponseWriter, r *http.Request) {
	limit, _ := strconv.Atoi(r.URL.Query().Get("limit"))
	offset, _ := strconv.Atoi(r.URL.Query().Get("offset"))
	users, err := s.store.ListAdminUsers(
		r.Context(),
		r.URL.Query().Get("q"),
		limit,
		offset,
	)
	if err != nil {
		slog.Error("список пользователей", "err", err)
		writeError(w, http.StatusInternalServerError, codeInternal,
			"Не удалось загрузить пользователей.")
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{"items": users})
}

func (s *Server) handleResolveIncident(w http.ResponseWriter, r *http.Request) {
	id, err := uuid.Parse(r.PathValue("id"))
	if err != nil {
		writeError(w, http.StatusBadRequest, codeBadRequest,
			"Некорректный идентификатор инцидента.")
		return
	}
	if err := s.store.ResolveIncident(r.Context(), id, userFrom(r.Context()).ID); err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			writeError(w, http.StatusNotFound, codeNotFound, "Инцидент не найден.")
			return
		}
		slog.Error("закрытие инцидента", "err", err)
		writeError(w, http.StatusInternalServerError, codeInternal,
			"Не удалось закрыть инцидент.")
		return
	}
	writeJSON(w, http.StatusOK, map[string]bool{"ok": true})
}

func (s *Server) handleAdminCourses(w http.ResponseWriter, r *http.Request) {
	releases, err := s.store.ListCourseReleases(r.Context())
	if err != nil {
		slog.Error("список курсов", "err", err)
		writeError(w, http.StatusInternalServerError, codeInternal,
			"Не удалось загрузить курсы.")
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{"items": releases})
}

func (s *Server) handleAdminCourse(w http.ResponseWriter, r *http.Request) {
	id, err := uuid.Parse(r.PathValue("id"))
	if err != nil {
		writeError(w, http.StatusBadRequest, codeBadRequest,
			"Некорректный идентификатор версии курса.")
		return
	}
	release, err := s.store.CourseReleaseByID(r.Context(), id)
	if errors.Is(err, store.ErrCourseReleaseNotFound) {
		writeError(w, http.StatusNotFound, codeNotFound, "Версия курса не найдена.")
		return
	}
	if err != nil {
		slog.Error("чтение курса", "err", err)
		writeError(w, http.StatusInternalServerError, codeInternal,
			"Не удалось загрузить курс.")
		return
	}
	writeJSON(w, http.StatusOK, release)
}

func (s *Server) handleCreateAdminCourse(w http.ResponseWriter, r *http.Request) {
	bundle, envelope, err := decodeAndNormalizeCourse(w, r, false)
	if err != nil {
		writeError(w, http.StatusBadRequest, codeBadRequest, err.Error())
		return
	}
	release, err := s.store.CreateCourseRelease(
		r.Context(),
		userFrom(r.Context()).ID,
		envelope.CourseID,
		envelope.CourseVersion,
		envelope.Title,
		bundle,
	)
	if isUniqueViolation(err) {
		writeError(w, http.StatusConflict, codeConflict,
			"Такая версия курса уже существует.")
		return
	}
	if err != nil {
		slog.Error("создание курса", "err", err)
		writeError(w, http.StatusInternalServerError, codeInternal,
			"Не удалось создать курс.")
		return
	}
	writeJSON(w, http.StatusCreated, release)
}

func (s *Server) handleUpdateAdminCourse(w http.ResponseWriter, r *http.Request) {
	id, err := uuid.Parse(r.PathValue("id"))
	if err != nil {
		writeError(w, http.StatusBadRequest, codeBadRequest,
			"Некорректный идентификатор версии курса.")
		return
	}
	bundle, envelope, err := decodeAndNormalizeCourse(w, r, false)
	if err != nil {
		writeError(w, http.StatusBadRequest, codeBadRequest, err.Error())
		return
	}
	release, err := s.store.UpdateCourseRelease(
		r.Context(),
		id,
		envelope.CourseID,
		envelope.CourseVersion,
		envelope.Title,
		bundle,
	)
	if isUniqueViolation(err) {
		writeError(w, http.StatusConflict, codeConflict,
			"Такая версия курса уже существует.")
		return
	}
	if errors.Is(err, store.ErrCourseReleaseNotFound) {
		writeError(w, http.StatusConflict, codeConflict,
			"Опубликованную версию нельзя менять. Создайте новый черновик.")
		return
	}
	if err != nil {
		slog.Error("обновление курса", "err", err)
		writeError(w, http.StatusInternalServerError, codeInternal,
			"Не удалось сохранить курс.")
		return
	}
	writeJSON(w, http.StatusOK, release)
}

func (s *Server) handlePublishAdminCourse(w http.ResponseWriter, r *http.Request) {
	id, err := uuid.Parse(r.PathValue("id"))
	if err != nil {
		writeError(w, http.StatusBadRequest, codeBadRequest,
			"Некорректный идентификатор версии курса.")
		return
	}
	release, err := s.store.CourseReleaseByID(r.Context(), id)
	if errors.Is(err, store.ErrCourseReleaseNotFound) {
		writeError(w, http.StatusNotFound, codeNotFound, "Версия курса не найдена.")
		return
	}
	if err != nil {
		writeError(w, http.StatusInternalServerError, codeInternal,
			"Не удалось прочитать курс.")
		return
	}
	if _, _, err := normalizeCourseBundle(release.Bundle, true); err != nil {
		writeError(w, http.StatusBadRequest, codeBadRequest,
			"Курс не готов к публикации: "+err.Error())
		return
	}
	published, err := s.store.PublishCourseRelease(r.Context(), id)
	if err != nil {
		slog.Error("публикация курса", "err", err)
		writeError(w, http.StatusInternalServerError, codeInternal,
			"Не удалось опубликовать курс.")
		return
	}
	writeJSON(w, http.StatusOK, published)
}

func (s *Server) handlePublishedCourse(w http.ResponseWriter, r *http.Request) {
	courseID := strings.TrimSpace(r.PathValue("courseId"))
	release, err := s.store.PublishedCourse(r.Context(), courseID)
	if errors.Is(err, store.ErrCourseReleaseNotFound) {
		// Отсутствие серверной версии означает, что клиент должен использовать
		// встроенный bundle. 204 не засоряет консоль браузера ожидаемым 404.
		w.Header().Set("Cache-Control", "public, max-age=60")
		w.WriteHeader(http.StatusNoContent)
		return
	}
	if err != nil {
		writeError(w, http.StatusInternalServerError, codeInternal,
			"Не удалось загрузить курс.")
		return
	}
	w.Header().Set("Cache-Control", "public, max-age=300")
	writeJSON(w, http.StatusOK, json.RawMessage(release.Bundle))
}

func decodeAndNormalizeCourse(
	w http.ResponseWriter,
	r *http.Request,
	strict bool,
) (json.RawMessage, *courseEnvelope, error) {
	var input courseBundleInput
	if err := decodeJSON(w, r, &input, 5<<20); err != nil {
		if errors.Is(err, errTooLarge) {
			return nil, nil, errors.New("курс больше 5 МБ")
		}
		return nil, nil, errors.New("не удалось прочитать JSON курса")
	}
	return normalizeCourseBundle(input.Bundle, strict)
}

func normalizeCourseBundle(
	raw json.RawMessage,
	strict bool,
) (json.RawMessage, *courseEnvelope, error) {
	if len(raw) == 0 || !json.Valid(raw) {
		return nil, nil, errors.New("bundle должен быть корректным JSON")
	}
	var envelope courseEnvelope
	if err := json.Unmarshal(raw, &envelope); err != nil {
		return nil, nil, errors.New("не удалось разобрать структуру курса")
	}
	if strings.TrimSpace(envelope.CourseID) == "" ||
		strings.TrimSpace(envelope.CourseVersion) == "" ||
		strings.TrimSpace(envelope.Title) == "" {
		return nil, nil, errors.New("нужны courseId, courseVersion и title")
	}
	if strict {
		if len(envelope.Units) == 0 {
			return nil, nil, errors.New("в курсе нет разделов")
		}
		lessons := 0
		for _, unit := range envelope.Units {
			for _, skill := range unit.Skills {
				for _, lesson := range skill.Lessons {
					lessons++
					if len(lesson.Exercises) == 0 {
						return nil, nil, errors.New(
							"каждый урок должен содержать хотя бы одно упражнение",
						)
					}
				}
			}
		}
		if lessons == 0 {
			return nil, nil, errors.New("в курсе нет уроков")
		}
	}

	var object map[string]any
	if err := json.Unmarshal(raw, &object); err != nil {
		return nil, nil, errors.New("bundle должен быть JSON-объектом")
	}
	delete(object, "contentChecksum")
	canonical, _ := json.Marshal(object)
	sum := sha256.Sum256(canonical)
	object["contentChecksum"] = "sha256:" + hex.EncodeToString(sum[:])
	normalized, err := json.Marshal(object)
	if err != nil {
		return nil, nil, err
	}
	return normalized, &envelope, nil
}

func isUniqueViolation(err error) bool {
	var pgErr *pgconn.PgError
	return errors.As(err, &pgErr) && pgErr.Code == "23505"
}
