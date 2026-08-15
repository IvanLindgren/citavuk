package api

import (
	"net/http"
	"strings"
	"time"

	"github.com/citavuk/server/internal/duel"
	"github.com/citavuk/server/internal/translationgame"
)

// Подбор соперников.
//
// Онлайн у Читавука небольшой, и честнее всего сказать об этом прямо: пока
// ищутся люди, страница предлагает сыграть с DeepL, а поиск продолжается сам.
// Поэтому очередь — не блокирующее ожидание, а запись в базе: человек уходит
// играть с машиной, его место в очереди остаётся, и когда соперники находятся,
// приходит уведомление.

type duelQueueRequest struct {
	Level     string `json:"level"`
	Direction string `json:"direction"`
	Seats     int    `json:"seats"`
	Name      string `json:"name"`
}

type duelQueueResponse struct {
	Waiting bool      `json:"waiting"`
	Since   time.Time `json:"since,omitzero"`
	Seats   int       `json:"seats,omitempty"`
	// Ожидание затянулось: пора предложить сыграть с машиной.
	Ripe bool `json:"ripe"`
	// Код найденной комнаты.
	Room string `json:"room,omitempty"`
	// Сколько человек сейчас ищет матч на том же уровне и направлении.
	Searching int       `json:"searching"`
	Token     string    `json:"token,omitempty"`
	Now       time.Time `json:"now"`
}

func (s *Server) handleDuelEnqueue(w http.ResponseWriter, r *http.Request) {
	var req duelQueueRequest
	if err := decodeJSON(w, r, &req, 2<<10); err != nil {
		writeError(w, http.StatusBadRequest, codeBadRequest, "Не удалось прочитать запрос.")
		return
	}
	actor, err := s.duelEnter(r, req.Name)
	if err != nil {
		writeDuelError(w, err)
		return
	}
	level := strings.ToUpper(strings.TrimSpace(req.Level))
	direction, ok := translationgame.NormalizeDirection(req.Direction)
	if !translationgame.KnownLevel(level) || !ok {
		writeDuelError(w, duel.ErrLevel)
		return
	}
	if req.Seats < duel.MinSeats || req.Seats > duel.MaxSeats {
		writeDuelError(w, duel.ErrSeats)
		return
	}
	now := time.Now().UTC()
	if err := s.store.EnterDuelQueue(r.Context(), duel.Waiting{
		ID: actor.ID, UserID: actor.UserID, Name: actor.Name,
		Level: level, Direction: direction, Seats: req.Seats, Since: now,
	}, now); err != nil {
		writeDuelError(w, err)
		return
	}
	s.writeDuelQueue(w, r, actor, now)
}

func (s *Server) handleDuelQueue(w http.ResponseWriter, r *http.Request) {
	s.writeDuelQueue(w, r, s.duelWho(r), time.Now().UTC())
}

func (s *Server) handleDuelDequeue(w http.ResponseWriter, r *http.Request) {
	actor := s.duelWho(r)
	if actor.ID != "" {
		if err := s.store.LeaveDuelQueue(r.Context(), actor.ID); err != nil {
			writeDuelError(w, err)
			return
		}
	}
	writeJSON(w, http.StatusOK, duelQueueResponse{Now: time.Now().UTC()})
}

func (s *Server) writeDuelQueue(w http.ResponseWriter, r *http.Request, actor duelActor, now time.Time) {
	if actor.ID == "" {
		writeJSON(w, http.StatusOK, duelQueueResponse{Now: now, Token: actor.Token})
		return
	}
	place, code, err := s.store.DuelWaiting(r.Context(), actor.ID, now)
	if err != nil {
		writeDuelError(w, err)
		return
	}
	if place == nil {
		writeJSON(w, http.StatusOK, duelQueueResponse{Now: now, Token: actor.Token})
		return
	}
	if code == "" {
		// Подбор идёт на опросе тех, кто ждёт: отдельного часового для игры,
		// в которую играют раз в день, заводить не стоит.
		if rooms, err := s.store.MatchDuel(r.Context(), now); err != nil {
			writeDuelError(w, err)
			return
		} else if len(rooms) > 0 {
			if _, fresh, err := s.store.DuelWaiting(r.Context(), actor.ID, now); err == nil {
				code = fresh
			}
		}
	}
	searching, err := s.store.DuelSearching(r.Context(), place.Level, place.Direction, now)
	if err != nil {
		writeDuelError(w, err)
		return
	}
	writeJSON(w, http.StatusOK, duelQueueResponse{
		Waiting: true, Since: place.Since, Seats: place.Seats,
		Ripe: duel.Ripe(place.Since, now), Room: code,
		Searching: searching, Token: actor.Token, Now: now,
	})
}
