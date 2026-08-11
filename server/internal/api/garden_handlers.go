package api

import (
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"errors"
	"log/slog"
	"net/http"
	"strings"
	"time"

	"github.com/google/uuid"

	"github.com/citavuk/server/internal/store"
	"github.com/citavuk/server/internal/translationgame"
)

type gardenStateResponse struct {
	store.GardenState
	Catalog []store.GardenSpecies `json:"catalog"`
	Stages  int                   `json:"stages"`
}

func (s *Server) handleGarden(w http.ResponseWriter, r *http.Request) {
	user := userFrom(r.Context())
	state, err := s.store.Garden(r.Context(), user.ID)
	if err != nil {
		slog.Error("чтение сада", "err", err)
		writeError(w, http.StatusInternalServerError, codeInternal, "Не удалось открыть сад.")
		return
	}
	writeJSON(w, http.StatusOK, gardenStateResponse{
		GardenState: state, Catalog: store.GardenCatalog, Stages: store.GardenStages,
	})
}

type gardenPlantRequest struct {
	Slot    int    `json:"slot"`
	Species string `json:"species"`
}

func (s *Server) handleGardenPlant(w http.ResponseWriter, r *http.Request) {
	var req gardenPlantRequest
	if err := decodeJSON(w, r, &req, 1<<10); err != nil {
		writeError(w, http.StatusBadRequest, codeBadRequest, "Не удалось прочитать запрос.")
		return
	}
	user := userFrom(r.Context())
	if err := s.store.PlantGarden(r.Context(), user.ID, req.Slot, req.Species); err != nil {
		writeGardenError(w, err, "Не удалось посадить семя.")
		return
	}
	s.writeGarden(w, r, user.ID)
}

type gardenWaterRequest struct {
	Slot int `json:"slot"`
}

func (s *Server) handleGardenWater(w http.ResponseWriter, r *http.Request) {
	var req gardenWaterRequest
	if err := decodeJSON(w, r, &req, 1<<10); err != nil {
		writeError(w, http.StatusBadRequest, codeBadRequest, "Не удалось прочитать запрос.")
		return
	}
	user := userFrom(r.Context())
	if err := s.store.WaterGarden(r.Context(), user.ID, req.Slot); err != nil {
		writeGardenError(w, err, "Не удалось полить грядку.")
		return
	}
	s.writeGarden(w, r, user.ID)
}

type gardenProfileRequest struct {
	Nickname string `json:"nickname"`
	Public   bool   `json:"public"`
}

func (s *Server) handleGardenProfile(w http.ResponseWriter, r *http.Request) {
	var req gardenProfileRequest
	if err := decodeJSON(w, r, &req, 1<<10); err != nil {
		writeError(w, http.StatusBadRequest, codeBadRequest, "Не удалось прочитать запрос.")
		return
	}
	user := userFrom(r.Context())
	if _, err := s.store.Garden(r.Context(), user.ID); err != nil {
		slog.Error("создание сада", "err", err)
		writeError(w, http.StatusInternalServerError, codeInternal, "Не удалось открыть сад.")
		return
	}
	if err := s.store.SetGardenProfile(r.Context(), user.ID, req.Nickname, req.Public); err != nil {
		writeGardenError(w, err, "Не удалось сохранить имя садовода.")
		return
	}
	s.writeGarden(w, r, user.ID)
}

func (s *Server) handleGardenLeaderboard(w http.ResponseWriter, r *http.Request) {
	board, err := s.store.GardenLeaderboard(r.Context(), 50)
	if err != nil {
		slog.Error("лидерборд сада", "err", err)
		writeError(w, http.StatusInternalServerError, codeInternal, "Не удалось загрузить таблицу садоводов.")
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{"board": board})
}

func (s *Server) handlePublicGarden(w http.ResponseWriter, r *http.Request) {
	nickname := strings.TrimSpace(r.PathValue("nickname"))
	if nickname == "" {
		writeError(w, http.StatusBadRequest, codeBadRequest, "Не указано имя садовода.")
		return
	}
	viewer := uuid.Nil
	if user := userFrom(r.Context()); user != nil {
		viewer = user.ID
	}
	garden, err := s.store.PublicGardenByNickname(r.Context(), nickname, viewer, time.Now().UTC())
	if err != nil {
		writeGardenError(w, err, "Не удалось открыть сад.")
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{
		"garden":  garden,
		"catalog": store.GardenCatalog,
		"stages":  store.GardenStages,
	})
}

func (s *Server) handleGardenHelp(w http.ResponseWriter, r *http.Request) {
	nickname := strings.TrimSpace(r.PathValue("nickname"))
	user := userFrom(r.Context())
	reward, err := s.store.HelpGarden(r.Context(), user.ID, nickname, time.Now().UTC())
	if err != nil {
		writeGardenError(w, err, "Не удалось полить чужой сад.")
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{"reward": reward})
}

func (s *Server) writeGarden(w http.ResponseWriter, r *http.Request, userID uuid.UUID) {
	state, err := s.store.Garden(r.Context(), userID)
	if err != nil {
		slog.Error("чтение сада", "err", err)
		writeError(w, http.StatusInternalServerError, codeInternal, "Не удалось открыть сад.")
		return
	}
	writeJSON(w, http.StatusOK, gardenStateResponse{
		GardenState: state, Catalog: store.GardenCatalog, Stages: store.GardenStages,
	})
}

func writeGardenError(w http.ResponseWriter, err error, fallback string) {
	switch {
	case errors.Is(err, store.ErrGardenNoCoins):
		writeError(w, http.StatusConflict, codeConflict, "Не хватает цветочных динаров.")
	case errors.Is(err, store.ErrGardenSlotTaken):
		writeError(w, http.StatusConflict, codeConflict, "На этой грядке уже что-то растёт.")
	case errors.Is(err, store.ErrGardenSlotEmpty):
		writeError(w, http.StatusNotFound, codeNotFound, "Грядка пуста.")
	case errors.Is(err, store.ErrGardenBadSpecies):
		writeError(w, http.StatusBadRequest, codeBadRequest, "Такого семени нет в магазине.")
	case errors.Is(err, store.ErrGardenBadSlot):
		writeError(w, http.StatusBadRequest, codeBadRequest, "Такой грядки нет.")
	case errors.Is(err, store.ErrGardenNickTaken):
		writeError(w, http.StatusConflict, codeConflict, "Это имя садовода уже занято.")
	case errors.Is(err, store.ErrGardenNickBad):
		writeError(w, http.StatusBadRequest, codeBadRequest,
			"Имя садовода: от 2 до 24 букв или цифр. Публичный сад без имени не бывает.")
	case errors.Is(err, store.ErrGardenNotFound):
		writeError(w, http.StatusNotFound, codeNotFound, "Такого сада нет или он закрыт.")
	case errors.Is(err, store.ErrGardenWateredTwce):
		writeError(w, http.StatusConflict, codeConflict, "Этот сад сегодня уже полит.")
	case errors.Is(err, store.ErrGardenVisitLimit):
		writeError(w, http.StatusConflict, codeConflict, "На сегодня помощь соседям закончилась.")
	case errors.Is(err, store.ErrGardenSelfVisit):
		writeError(w, http.StatusBadRequest, codeBadRequest, "Свой сад поливают на своей странице.")
	default:
		slog.Error("сад", "err", err)
		writeError(w, http.StatusInternalServerError, codeInternal, fallback)
	}
}

// syncGardenCourse оплачивает пройденные уроки курса. Прогресс курса —
// клиентский блоб, проверить его сервер не может, поэтому у источника низкий
// дневной потолок.
func (s *Server) syncGardenCourse(r *http.Request, userID uuid.UUID, courseID string, payload []byte) {
	var doc struct {
		Lessons map[string]struct {
			Status string `json:"status"`
		} `json:"lessons"`
	}
	if err := json.Unmarshal(payload, &doc); err != nil {
		return
	}
	completed := 0
	for _, lesson := range doc.Lessons {
		if lesson.Status == "completed" || lesson.Status == "mastered" {
			completed++
		}
	}
	if err := s.store.GardenCourseSync(r.Context(), userID, courseID, completed); err != nil {
		slog.Warn("не удалось учесть уроки курса для сада", "err", err)
	}
}

// recordDuelRound отмечает выигранный раунд дуэли. Ключ — день и отпечаток
// набора предложений: переигрывать один раунд ради динаров бессмысленно, но
// назавтра он снова оплачивается.
func (s *Server) recordDuelRound(r *http.Request, entries []translationgame.Entry, result *translationgame.Result) {
	user := userFrom(r.Context())
	if user == nil || result == nil {
		return
	}
	var wins int
	for _, verdict := range result.Verdicts {
		if verdict.Winner == "user" {
			wins++
		}
	}
	if wins*2 <= len(result.Verdicts) {
		return
	}
	sum := sha256.New()
	for _, entry := range entries {
		sum.Write([]byte(entry.Source))
		sum.Write([]byte{0})
	}
	key := time.Now().UTC().Format("2006-01-02") + ":" + hex.EncodeToString(sum.Sum(nil)[:8])
	if err := s.store.RecordGardenEvent(r.Context(), user.ID, "duel", key); err != nil {
		slog.Warn("не удалось записать раунд дуэли", "err", err)
	}
}
