package store

import (
	"context"
	"encoding/json"
	"time"

	"github.com/citavuk/server/internal/duel"
)

// Живая картина игры для админки.
//
// Матч живёт минуты и не оставляет следов: доигранные комнаты убирает уборщик,
// а очередь подбора хранит только тех, кто ждёт прямо сейчас. Поэтому «кто
// играет» нельзя посчитать задним числом — это снимок, и смотреть его нужно в
// ту же минуту.

type LivePlayer struct {
	Name string `json:"name"`
	// Пусто у человека, иначе deepl или google.
	Machine string `json:"machine,omitempty"`
	Host    bool   `json:"host,omitempty"`
	Score   int    `json:"score"`
	Ready   bool   `json:"ready,omitempty"`
	Left    bool   `json:"left,omitempty"`
	// Сколько фраз раунда уже переведено — то же число, что видят соседи за
	// столом.
	Answers int  `json:"answers"`
	Account bool `json:"account,omitempty"`
	// Сколько секунд назад игрок последний раз опрашивал комнату.
	SeenAgo int `json:"seenAgo"`
}

type LiveRoom struct {
	Code      string       `json:"code"`
	Phase     string       `json:"phase"`
	Level     string       `json:"level"`
	Direction string       `json:"direction"`
	Seats     int          `json:"seats"`
	Round     int          `json:"round"`
	Open      bool         `json:"open"`
	Matched   bool         `json:"matched"`
	People    int          `json:"people"`
	Machines  int          `json:"machines"`
	Players   []LivePlayer `json:"players"`
	Sentences int          `json:"sentences"`
	CreatedAt time.Time    `json:"createdAt"`
	UpdatedAt time.Time    `json:"updatedAt"`
}

type LiveWaiting struct {
	Name      string    `json:"name"`
	Level     string    `json:"level"`
	Direction string    `json:"direction"`
	Seats     int       `json:"seats"`
	Account   bool      `json:"account,omitempty"`
	Since     time.Time `json:"since"`
	Seen      time.Time `json:"seen"`
	Room      string    `json:"room,omitempty"`
}

type LiveDuel struct {
	Rooms  []LiveRoom    `json:"rooms"`
	Queue  []LiveWaiting `json:"queue"`
	People int           `json:"people"`
	// Матчей за сутки: доигранные комнаты живут до уборки, поэтому число
	// приблизительное и снизу.
	RoomsToday int64 `json:"roomsToday"`
}

// LiveDuelState собирает снимок игры: живые комнаты и очередь подбора.
func (s *Store) LiveDuelState(ctx context.Context, now time.Time) (*LiveDuel, error) {
	live := &LiveDuel{Rooms: []LiveRoom{}, Queue: []LiveWaiting{}}

	rows, err := s.Pool.Query(ctx, `
        SELECT state, created_at, updated_at
          FROM duel_rooms
         WHERE updated_at > now() - interval '15 minutes'
         ORDER BY updated_at DESC
         LIMIT 60`)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	for rows.Next() {
		var raw []byte
		var created, updated time.Time
		if err := rows.Scan(&raw, &created, &updated); err != nil {
			return nil, err
		}
		var room duel.Room
		if err := json.Unmarshal(raw, &room); err != nil {
			// Битую комнату лучше пропустить, чем уронить всю панель.
			continue
		}
		live.Rooms = append(live.Rooms, liveRoom(&room, created, updated, now))
	}
	if err := rows.Err(); err != nil {
		return nil, err
	}
	for _, room := range live.Rooms {
		live.People += room.People
	}

	waiting, err := s.Pool.Query(ctx, `
        SELECT name, level, direction, seats, user_id IS NOT NULL,
               since, seen, coalesce(room_code, '')
          FROM duel_queue
         WHERE seen > now() - interval '2 minutes'
         ORDER BY since
         LIMIT 60`)
	if err != nil {
		return nil, err
	}
	defer waiting.Close()
	for waiting.Next() {
		var item LiveWaiting
		if err := waiting.Scan(
			&item.Name, &item.Level, &item.Direction, &item.Seats,
			&item.Account, &item.Since, &item.Seen, &item.Room,
		); err != nil {
			return nil, err
		}
		live.Queue = append(live.Queue, item)
	}
	if err := waiting.Err(); err != nil {
		return nil, err
	}

	if err := s.Pool.QueryRow(ctx, `
        SELECT count(*) FROM duel_rooms
         WHERE created_at > now() - interval '24 hours'`).
		Scan(&live.RoomsToday); err != nil {
		return nil, err
	}
	return live, nil
}

func liveRoom(room *duel.Room, created, updated, now time.Time) LiveRoom {
	out := LiveRoom{
		Code:      room.Code,
		Phase:     string(room.Phase),
		Level:     room.Level,
		Direction: room.Direction,
		Seats:     room.Seats,
		Round:     room.Round,
		Open:      room.Open,
		Matched:   room.Matched,
		Sentences: len(room.Sentences),
		Players:   make([]LivePlayer, 0, len(room.Players)),
		CreatedAt: created,
		UpdatedAt: updated,
	}
	for _, player := range room.Players {
		seen := 0
		if !player.Seen.IsZero() {
			seen = int(now.Sub(player.Seen).Seconds())
		}
		out.Players = append(out.Players, LivePlayer{
			Name:    player.Name,
			Machine: player.Machine,
			Host:    player.Host,
			Score:   player.Score,
			Ready:   player.Ready,
			Left:    player.Left,
			Answers: len(player.Answers),
			Account: player.UserID != "",
			SeenAgo: seen,
		})
		if player.Left {
			continue
		}
		if player.Machine != "" {
			out.Machines++
		} else {
			out.People++
		}
	}
	return out
}
