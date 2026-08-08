package api

import (
	"errors"
	"log/slog"
	"net/http"
	"strings"

	"github.com/google/uuid"

	"github.com/citavuk/server/internal/roadmap"
	"github.com/citavuk/server/internal/store"
)

// Дорожная карта сербского языка.
//
// Карта открыта всем: смотреть, что учить на B1, можно и не входя. Вошедшему
// добавляются его отметки и проценты, поэтому здесь стоит optionalAuth, а не
// requireAuth — гость видит ту же карту, только без своего прогресса.

// viewerID возвращает того, чьи отметки показывать. uuid.Nil — гость.
func viewerID(r *http.Request) uuid.UUID {
	if user := userFrom(r.Context()); user != nil {
		return user.ID
	}
	return uuid.Nil
}

type roadmapLevelView struct {
	Level string `json:"level"`
	// Название ступени для человека: «B1» само по себе ничего не говорит.
	Name       string                      `json:"name"`
	Categories map[string]roadmap.Progress `json:"categories"`
	// Уровень взят целиком: по всем считаемым разделам не ниже порога.
	Passed bool `json:"passed"`
}

type roadmapOverviewResponse struct {
	Levels     []roadmapLevelView `json:"levels"`
	Categories []roadmap.Category `json:"categories"`
	// Цель читателя. Пусто — цель не выбрана, и тогда карта никуда не ведёт,
	// а просто показывает всё.
	Target string `json:"target"`
	// Уровень аккаунта: «где я сейчас», в отличие от цели.
	Current      string  `json:"current"`
	PassingScore float64 `json:"passingScore"`
	SignedIn     bool    `json:"signedIn"`
}

// levelNames — те же подписи, что на выборе уровня при первом входе.
var levelNames = map[string]string{
	"A1": "Первые слова",
	"A2": "Простые фразы",
	"B1": "Читаю с переводчиком",
	"B2": "Читаю почти свободно",
	"C1": "Свободно",
	"C2": "Как родной",
}

func (s *Server) handleRoadmap(w http.ResponseWriter, r *http.Request) {
	viewer := viewerID(r)
	progress, err := s.store.RoadmapOverview(r.Context(), viewer)
	if err != nil {
		slog.Error("handleRoadmap", "err", err)
		writeError(w, http.StatusInternalServerError, codeInternal, "Карта не загрузилась.")
		return
	}

	response := roadmapOverviewResponse{
		Categories:   roadmap.CategoryList,
		PassingScore: roadmap.PassingScore,
		SignedIn:     viewer != uuid.Nil,
	}
	for _, name := range roadmap.Levels {
		byCategory := progress[name]
		response.Levels = append(response.Levels, roadmapLevelView{
			Level:      name,
			Name:       levelNames[name],
			Categories: byCategory,
			Passed:     roadmap.LevelPassed(byCategory),
		})
	}

	if viewer != uuid.Nil {
		if target, err := s.store.GetRoadmapTarget(r.Context(), viewer); err == nil {
			response.Target = target
		}
		if current, err := s.store.GetSerbianLevel(r.Context(), viewer); err == nil {
			response.Current = current.Level
		}
	}
	writeJSON(w, http.StatusOK, response)
}

type roadmapSectionResponse struct {
	Level     string                     `json:"level"`
	Category  roadmap.Category           `json:"category"`
	Intro     string                     `json:"intro"`
	Items     []store.RoadmapItem        `json:"items"`
	Exercises []store.RoadmapExerciseSet `json:"exercises"`
	Words     []store.RoadmapWord        `json:"words"`
	Progress  roadmap.Progress           `json:"progress"`
}

// handleRoadmapSection отдаёт содержимое одной клетки карты.
func (s *Server) handleRoadmapSection(w http.ResponseWriter, r *http.Request) {
	level := roadmap.NormalizeLevel(r.PathValue("level"))
	category := strings.ToLower(strings.TrimSpace(r.PathValue("category")))
	if level == "" || !roadmap.ValidCategory(category) {
		writeError(w, http.StatusNotFound, codeNotFound, "Такого раздела нет.")
		return
	}
	viewer := viewerID(r)

	response := roadmapSectionResponse{
		Level:     level,
		Items:     []store.RoadmapItem{},
		Exercises: []store.RoadmapExerciseSet{},
		Words:     []store.RoadmapWord{},
	}
	for _, item := range roadmap.CategoryList {
		if item.Key == category {
			response.Category = item
		}
	}

	items, err := s.store.RoadmapItems(r.Context(), level, category, viewer, false)
	if err != nil {
		slog.Error("handleRoadmapSection: пункты", "err", err)
		writeError(w, http.StatusInternalServerError, codeInternal, "Раздел не загрузился.")
		return
	}
	exercises, err := s.store.RoadmapExercises(r.Context(), level, category, viewer, false)
	if err != nil {
		slog.Error("handleRoadmapSection: упражнения", "err", err)
		writeError(w, http.StatusInternalServerError, codeInternal, "Раздел не загрузился.")
		return
	}
	response.Items = items
	response.Exercises = exercises

	// Слова запрашиваются только для своего раздела: в Reading их нет, и
	// тащить шестьсот строк в каждый ответ незачем.
	if category == roadmap.CategoryVocabulary {
		words, err := s.store.RoadmapWords(r.Context(), level, viewer, false)
		if err != nil {
			slog.Error("handleRoadmapSection: слова", "err", err)
			writeError(w, http.StatusInternalServerError, codeInternal, "Раздел не загрузился.")
			return
		}
		response.Words = words
	}

	if intros, err := s.store.RoadmapIntros(r.Context()); err == nil {
		response.Intro = intros[level][category]
	}

	done, total := 0, len(items)+len(exercises)+len(response.Words)
	for _, item := range items {
		if item.Done {
			done++
		}
	}
	for _, set := range exercises {
		if set.Done {
			done++
		}
	}
	for _, word := range response.Words {
		if word.Known {
			done++
		}
	}
	response.Progress = roadmap.Ratio(done, total)

	writeJSON(w, http.StatusOK, response)
}

type roadmapMarkRequest struct {
	Kind string `json:"kind"`
	ID   string `json:"id"`
	// Score — доля верных ответов упражнения, 0..1. Для пункта и слова не
	// указывается: они либо сделаны, либо нет.
	Score float64 `json:"score"`
	// Done: false снимает отметку. Словарю это нужно — «выучил» обратимо.
	Done bool `json:"done"`
	// Source=trainer приходит только после полного захода Тренажёрки. Для
	// обычной ручной галочки поле пусто.
	Source string `json:"source"`
}

func (s *Server) handleRoadmapMark(w http.ResponseWriter, r *http.Request) {
	user := userFrom(r.Context())
	var request roadmapMarkRequest
	if err := decodeJSON(w, r, &request, 4<<10); err != nil {
		writeError(w, http.StatusBadRequest, codeBadRequest, "Не удалось прочитать отметку.")
		return
	}
	refID, err := uuid.Parse(strings.TrimSpace(request.ID))
	if err != nil {
		writeError(w, http.StatusBadRequest, codeBadRequest, "Неверный идентификатор.")
		return
	}

	if !request.Done {
		if err := s.store.UnmarkRoadmapDone(r.Context(), user.ID, request.Kind, refID); err != nil {
			slog.Error("handleRoadmapMark: снятие", "err", err)
			writeError(w, http.StatusInternalServerError, codeInternal, "Не удалось снять отметку.")
			return
		}
		writeJSON(w, http.StatusOK, map[string]any{"done": false})
		return
	}

	// Пункт и слово всегда идут в зачёт целиком: доля есть только у
	// упражнения, где она означает верные ответы.
	score := request.Score
	if request.Kind != "exercise" {
		score = 1
	}
	err = s.store.MarkRoadmapDone(r.Context(), user.ID, request.Kind, refID, score, request.Source)
	switch {
	case errors.Is(err, store.ErrRoadmapUnknownKind):
		writeError(w, http.StatusBadRequest, codeBadRequest, "Неизвестный вид отметки.")
	case errors.Is(err, store.ErrRoadmapNotFound):
		writeError(w, http.StatusNotFound, codeNotFound, "Этого пункта уже нет.")
	case err != nil:
		slog.Error("handleRoadmapMark", "err", err)
		writeError(w, http.StatusInternalServerError, codeInternal, "Не удалось сохранить отметку.")
	default:
		if _, achievementErr := s.store.EvaluateAchievements(r.Context(), user.ID); achievementErr != nil {
			slog.Warn("проверка достижений после дорожной карты", "err", achievementErr, "user", user.ID)
		}
		writeJSON(w, http.StatusOK, map[string]any{"done": true, "score": score})
	}
}

type roadmapTargetRequest struct {
	// Пустая строка снимает цель: отказаться от неё — законное действие.
	Level string `json:"level"`
}

func (s *Server) handleRoadmapTarget(w http.ResponseWriter, r *http.Request) {
	user := userFrom(r.Context())
	target, err := s.store.GetRoadmapTarget(r.Context(), user.ID)
	if err != nil {
		slog.Error("handleRoadmapTarget", "err", err)
		writeError(w, http.StatusInternalServerError, codeInternal, "Не удалось прочитать цель.")
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{"target": target})
}

func (s *Server) handleSetRoadmapTarget(w http.ResponseWriter, r *http.Request) {
	user := userFrom(r.Context())
	var request roadmapTargetRequest
	if err := decodeJSON(w, r, &request, 4<<10); err != nil {
		writeError(w, http.StatusBadRequest, codeBadRequest, "Не удалось прочитать цель.")
		return
	}
	target, err := s.store.SetRoadmapTarget(r.Context(), user.ID, request.Level)
	if errors.Is(err, store.ErrRoadmapUnknownLevel) {
		writeError(w, http.StatusUnprocessableEntity, codeBadRequest, "Неизвестный уровень.")
		return
	}
	if err != nil {
		slog.Error("handleSetRoadmapTarget", "err", err)
		writeError(w, http.StatusInternalServerError, codeInternal, "Не удалось сохранить цель.")
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{"target": target})
}

// ------------------------------------------------------------- обсуждение

func (s *Server) handleRoadmapComments(w http.ResponseWriter, r *http.Request) {
	level := roadmap.NormalizeLevel(r.PathValue("level"))
	if level == "" {
		writeError(w, http.StatusNotFound, codeNotFound, "Такого уровня нет.")
		return
	}
	comments, err := s.store.ListRoadmapComments(r.Context(), level, viewerID(r), 200)
	if err != nil {
		slog.Error("handleRoadmapComments", "err", err)
		writeError(w, http.StatusInternalServerError, codeInternal, "Обсуждение не загрузилось.")
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{"comments": comments})
}

type roadmapCommentRequest struct {
	Body string `json:"body"`
	// ParentID — ответ на реплику. Пусто — новая ветка.
	ParentID string `json:"parentId"`
}

func (s *Server) handleAddRoadmapComment(w http.ResponseWriter, r *http.Request) {
	user := userFrom(r.Context())
	level := roadmap.NormalizeLevel(r.PathValue("level"))
	if level == "" {
		writeError(w, http.StatusNotFound, codeNotFound, "Такого уровня нет.")
		return
	}
	var request roadmapCommentRequest
	if err := decodeJSON(w, r, &request, 16<<10); err != nil {
		writeError(w, http.StatusBadRequest, codeBadRequest, "Не удалось прочитать комментарий.")
		return
	}

	var parent *uuid.UUID
	if trimmed := strings.TrimSpace(request.ParentID); trimmed != "" {
		parsed, err := uuid.Parse(trimmed)
		if err != nil {
			writeError(w, http.StatusBadRequest, codeBadRequest, "Неверный идентификатор ответа.")
			return
		}
		parent = &parsed
	}

	comment, err := s.store.AddRoadmapComment(r.Context(), level, user.ID, parent, request.Body)
	switch {
	case errors.Is(err, store.ErrRoadmapCommentEmpty):
		writeError(w, http.StatusUnprocessableEntity, codeBadRequest, "Комментарий пустой.")
	case errors.Is(err, store.ErrRoadmapCommentLong):
		writeError(w, http.StatusUnprocessableEntity, codeBadRequest, "Слишком длинный комментарий.")
	case errors.Is(err, store.ErrRoadmapCommentSoon):
		writeError(w, http.StatusTooManyRequests, codeRateLimited, "Подождите несколько секунд.")
	case errors.Is(err, store.ErrRoadmapCommentParent):
		writeError(w, http.StatusNotFound, codeNotFound, "Этой реплики уже нет.")
	case err != nil:
		slog.Error("handleAddRoadmapComment", "err", err)
		writeError(w, http.StatusInternalServerError, codeInternal, "Не удалось отправить комментарий.")
	default:
		writeJSON(w, http.StatusCreated, comment)
	}
}

func (s *Server) handleDeleteRoadmapComment(w http.ResponseWriter, r *http.Request) {
	user := userFrom(r.Context())
	commentID, err := uuid.Parse(r.PathValue("commentId"))
	if err != nil {
		writeError(w, http.StatusBadRequest, codeBadRequest, "Неверный идентификатор.")
		return
	}
	err = s.store.DeleteRoadmapComment(r.Context(), commentID, user.ID, user.IsAdmin)
	switch {
	case errors.Is(err, store.ErrRoadmapNotFound):
		writeError(w, http.StatusNotFound, codeNotFound, "Комментария уже нет.")
	case errors.Is(err, store.ErrRoadmapCommentDenied):
		writeError(w, http.StatusForbidden, codeForbidden, "Это чужой комментарий.")
	case err != nil:
		slog.Error("handleDeleteRoadmapComment", "err", err)
		writeError(w, http.StatusInternalServerError, codeInternal, "Не удалось удалить комментарий.")
	default:
		w.WriteHeader(http.StatusNoContent)
	}
}
