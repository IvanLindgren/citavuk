package api

import (
	"encoding/json"
	"errors"
	"log/slog"
	"net/http"
	"strings"

	"github.com/google/uuid"

	"github.com/citavuk/server/internal/roadmap"
	"github.com/citavuk/server/internal/store"
)

// Правка дорожной карты.
//
// Наполнение живёт в базе именно ради этого: автор добавляет упражнение или
// текст на сайте, без выкатки. Каждая правка проходит через requireAdmin —
// уроки преподавателей попадают на карту ссылкой, а не правом записи.

// handleAdminRoadmapSection отдаёт клетку целиком, включая черновики.
func (s *Server) handleAdminRoadmapSection(w http.ResponseWriter, r *http.Request) {
	level := roadmap.NormalizeLevel(r.PathValue("level"))
	category := strings.ToLower(strings.TrimSpace(r.PathValue("category")))
	if level == "" || !roadmap.ValidCategory(category) {
		writeError(w, http.StatusNotFound, codeNotFound, "Такого раздела нет.")
		return
	}

	items, err := s.store.RoadmapItems(r.Context(), level, category, uuid.Nil, true)
	if err != nil {
		slog.Error("handleAdminRoadmapSection: пункты", "err", err)
		writeError(w, http.StatusInternalServerError, codeInternal, "Раздел не загрузился.")
		return
	}
	exercises, err := s.store.RoadmapExercises(r.Context(), level, category, uuid.Nil, true)
	if err != nil {
		slog.Error("handleAdminRoadmapSection: упражнения", "err", err)
		writeError(w, http.StatusInternalServerError, codeInternal, "Раздел не загрузился.")
		return
	}

	words := []store.RoadmapWord{}
	if category == roadmap.CategoryVocabulary {
		words, err = s.store.RoadmapWords(r.Context(), level, uuid.Nil, true)
		if err != nil {
			slog.Error("handleAdminRoadmapSection: слова", "err", err)
			writeError(w, http.StatusInternalServerError, codeInternal, "Раздел не загрузился.")
			return
		}
	}

	intro := ""
	if intros, err := s.store.RoadmapIntros(r.Context()); err == nil {
		intro = intros[level][category]
	}

	writeJSON(w, http.StatusOK, map[string]any{
		"level": level, "category": category, "intro": intro,
		"items": items, "exercises": exercises, "words": words,
	})
}

type adminRoadmapItemRequest struct {
	ID       string          `json:"id"`
	Level    string          `json:"level"`
	Category string          `json:"category"`
	Kind     string          `json:"kind"`
	Title    string          `json:"title"`
	Summary  string          `json:"summary"`
	Body     string          `json:"body"`
	Payload  json.RawMessage `json:"payload"`
	Position int             `json:"position"`
	Status   string          `json:"status"`
}

func (s *Server) handleAdminSaveRoadmapItem(w http.ResponseWriter, r *http.Request) {
	var request adminRoadmapItemRequest
	if err := decodeJSON(w, r, &request, 512<<10); err != nil {
		writeError(w, http.StatusBadRequest, codeBadRequest, "Не удалось прочитать пункт.")
		return
	}

	item := store.RoadmapItem{
		Level: request.Level, Category: request.Category, Kind: request.Kind,
		Title: request.Title, Summary: request.Summary, Body: request.Body,
		Payload: request.Payload, Position: request.Position, Status: request.Status,
	}
	if trimmed := strings.TrimSpace(request.ID); trimmed != "" {
		parsed, err := uuid.Parse(trimmed)
		if err != nil {
			writeError(w, http.StatusBadRequest, codeBadRequest, "Неверный идентификатор.")
			return
		}
		item.ID = parsed
	}

	saved, err := s.store.SaveRoadmapItem(r.Context(), item)
	if handled := s.writeRoadmapSaveError(w, err, "пункт"); handled {
		return
	}
	writeJSON(w, http.StatusOK, saved)
}

func (s *Server) handleAdminDeleteRoadmapItem(w http.ResponseWriter, r *http.Request) {
	id, err := uuid.Parse(r.PathValue("id"))
	if err != nil {
		writeError(w, http.StatusBadRequest, codeBadRequest, "Неверный идентификатор.")
		return
	}
	if err := s.store.DeleteRoadmapItem(r.Context(), id); err != nil {
		if errors.Is(err, store.ErrRoadmapNotFound) {
			writeError(w, http.StatusNotFound, codeNotFound, "Пункта уже нет.")
			return
		}
		slog.Error("handleAdminDeleteRoadmapItem", "err", err)
		writeError(w, http.StatusInternalServerError, codeInternal, "Не удалось удалить пункт.")
		return
	}
	w.WriteHeader(http.StatusNoContent)
}

type adminRoadmapExerciseRequest struct {
	ID       string          `json:"id"`
	Level    string          `json:"level"`
	Category string          `json:"category"`
	ItemID   string          `json:"itemId"`
	Title    string          `json:"title"`
	Content  json.RawMessage `json:"content"`
	Position int             `json:"position"`
	Status   string          `json:"status"`
}

func (s *Server) handleAdminSaveRoadmapExercise(w http.ResponseWriter, r *http.Request) {
	var request adminRoadmapExerciseRequest
	if err := decodeJSON(w, r, &request, 1<<20); err != nil {
		writeError(w, http.StatusBadRequest, codeBadRequest, "Не удалось прочитать упражнения.")
		return
	}

	set := store.RoadmapExerciseSet{
		Level: request.Level, Category: request.Category, Title: request.Title,
		Content: request.Content, Position: request.Position, Status: request.Status,
	}
	if trimmed := strings.TrimSpace(request.ID); trimmed != "" {
		parsed, err := uuid.Parse(trimmed)
		if err != nil {
			writeError(w, http.StatusBadRequest, codeBadRequest, "Неверный идентификатор.")
			return
		}
		set.ID = parsed
	}
	if trimmed := strings.TrimSpace(request.ItemID); trimmed != "" {
		parsed, err := uuid.Parse(trimmed)
		if err != nil {
			writeError(w, http.StatusBadRequest, codeBadRequest, "Неверная привязка к пункту.")
			return
		}
		set.ItemID = &parsed
	}

	saved, err := s.store.SaveRoadmapExerciseSet(r.Context(), set)
	if handled := s.writeRoadmapSaveError(w, err, "упражнения"); handled {
		return
	}
	writeJSON(w, http.StatusOK, saved)
}

func (s *Server) handleAdminDeleteRoadmapExercise(w http.ResponseWriter, r *http.Request) {
	id, err := uuid.Parse(r.PathValue("id"))
	if err != nil {
		writeError(w, http.StatusBadRequest, codeBadRequest, "Неверный идентификатор.")
		return
	}
	if err := s.store.DeleteRoadmapExerciseSet(r.Context(), id); err != nil {
		if errors.Is(err, store.ErrRoadmapNotFound) {
			writeError(w, http.StatusNotFound, codeNotFound, "Упражнений уже нет.")
			return
		}
		slog.Error("handleAdminDeleteRoadmapExercise", "err", err)
		writeError(w, http.StatusInternalServerError, codeInternal, "Не удалось удалить упражнения.")
		return
	}
	w.WriteHeader(http.StatusNoContent)
}

type adminRoadmapWordRequest struct {
	ID                 string `json:"id"`
	Level              string `json:"level"`
	Theme              string `json:"theme"`
	Lemma              string `json:"lemma"`
	Translation        string `json:"translation"`
	POS                string `json:"pos"`
	Note               string `json:"note"`
	Example            string `json:"example"`
	ExampleTranslation string `json:"exampleTranslation"`
	Rank               int    `json:"rank"`
	Position           int    `json:"position"`
	Status             string `json:"status"`
}

func (s *Server) handleAdminSaveRoadmapWord(w http.ResponseWriter, r *http.Request) {
	var request adminRoadmapWordRequest
	if err := decodeJSON(w, r, &request, 16<<10); err != nil {
		writeError(w, http.StatusBadRequest, codeBadRequest, "Не удалось прочитать слово.")
		return
	}

	word := store.RoadmapWord{
		Level: request.Level, Theme: request.Theme, Lemma: request.Lemma,
		Translation: request.Translation, POS: request.POS, Note: request.Note,
		Example: request.Example, Rank: request.Rank, Position: request.Position,
		Status: request.Status,
	}
	if trimmed := strings.TrimSpace(request.ID); trimmed != "" {
		parsed, err := uuid.Parse(trimmed)
		if err != nil {
			writeError(w, http.StatusBadRequest, codeBadRequest, "Неверный идентификатор.")
			return
		}
		word.ID = parsed
	}

	saved, err := s.store.SaveRoadmapWord(r.Context(), word)
	if handled := s.writeRoadmapSaveError(w, err, "слово"); handled {
		return
	}
	writeJSON(w, http.StatusOK, saved)
}

func (s *Server) handleAdminDeleteRoadmapWord(w http.ResponseWriter, r *http.Request) {
	id, err := uuid.Parse(r.PathValue("id"))
	if err != nil {
		writeError(w, http.StatusBadRequest, codeBadRequest, "Неверный идентификатор.")
		return
	}
	if err := s.store.DeleteRoadmapWord(r.Context(), id); err != nil {
		if errors.Is(err, store.ErrRoadmapNotFound) {
			writeError(w, http.StatusNotFound, codeNotFound, "Слова уже нет.")
			return
		}
		slog.Error("handleAdminDeleteRoadmapWord", "err", err)
		writeError(w, http.StatusInternalServerError, codeInternal, "Не удалось удалить слово.")
		return
	}
	w.WriteHeader(http.StatusNoContent)
}

// handleAdminPublishRoadmapWords открывает читателям весь черновой словарь
// уровня разом: слова заводятся сотнями, и по одному это шестьсот нажатий.
func (s *Server) handleAdminPublishRoadmapWords(w http.ResponseWriter, r *http.Request) {
	count, err := s.store.PublishRoadmapWords(r.Context(), r.PathValue("level"))
	if errors.Is(err, store.ErrRoadmapUnknownLevel) {
		writeError(w, http.StatusNotFound, codeNotFound, "Такого уровня нет.")
		return
	}
	if err != nil {
		slog.Error("handleAdminPublishRoadmapWords", "err", err)
		writeError(w, http.StatusInternalServerError, codeInternal, "Не удалось опубликовать словарь.")
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{"published": count})
}

type adminRoadmapIntroRequest struct {
	Intro string `json:"intro"`
}

func (s *Server) handleAdminSaveRoadmapIntro(w http.ResponseWriter, r *http.Request) {
	var request adminRoadmapIntroRequest
	if err := decodeJSON(w, r, &request, 64<<10); err != nil {
		writeError(w, http.StatusBadRequest, codeBadRequest, "Не удалось прочитать текст.")
		return
	}
	err := s.store.SaveRoadmapIntro(
		r.Context(), r.PathValue("level"), r.PathValue("category"), request.Intro)
	switch {
	case errors.Is(err, store.ErrRoadmapUnknownLevel),
		errors.Is(err, store.ErrRoadmapUnknownCategory):
		writeError(w, http.StatusNotFound, codeNotFound, "Такого раздела нет.")
	case err != nil:
		slog.Error("handleAdminSaveRoadmapIntro", "err", err)
		writeError(w, http.StatusInternalServerError, codeInternal, "Не удалось сохранить текст.")
	default:
		writeJSON(w, http.StatusOK, map[string]any{"saved": true})
	}
}

// writeRoadmapSaveError отвечает на ошибку сохранения и сообщает, ответил ли.
//
// Один разбор на три почти одинаковых обработчика: набор проверок у пункта,
// упражнения и слова совпадает, а расходятся только слова в сообщении.
func (s *Server) writeRoadmapSaveError(w http.ResponseWriter, err error, what string) bool {
	switch {
	case err == nil:
		return false
	case errors.Is(err, store.ErrRoadmapUnknownLevel):
		writeError(w, http.StatusUnprocessableEntity, codeBadRequest, "Неизвестный уровень.")
	case errors.Is(err, store.ErrRoadmapUnknownCategory):
		writeError(w, http.StatusUnprocessableEntity, codeBadRequest, "Неизвестный раздел.")
	case errors.Is(err, store.ErrRoadmapUnknownKind):
		writeError(w, http.StatusUnprocessableEntity, codeBadRequest, "Неизвестный вид пункта.")
	case errors.Is(err, store.ErrRoadmapTitleEmpty):
		writeError(w, http.StatusUnprocessableEntity, codeBadRequest, "Заполните название.")
	case errors.Is(err, store.ErrRoadmapNotFound):
		writeError(w, http.StatusNotFound, codeNotFound, "Записи уже нет.")
	default:
		slog.Error("не удалось сохранить "+what, "err", err)
		writeError(w, http.StatusInternalServerError, codeInternal, "Не удалось сохранить.")
	}
	return true
}
