package store

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"time"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"

	"github.com/citavuk/server/internal/duel"
)

var (
	ErrDuelNotFound = errors.New("комната не найдена")
	// Комнату успел изменить другой игрок: запрос надо повторить на свежем
	// состоянии, а не затирать чужой ход.
	ErrDuelConflict = errors.New("комната изменилась")
)

const (
	// Столько комната лежит в базе после последнего движения.
	duelRoomLife = 30 * time.Minute

	// Столько ждём опроса очереди, прежде чем считать, что вкладку закрыли.
	// Подбор не должен сводить людей с теми, кого уже нет.
	duelQueueLife = 40 * time.Second

	// Столько брошенная запись очереди лежит, прежде чем её убирают совсем.
	duelQueueKeep = 10 * time.Minute
)

func (s *Store) CreateDuelRoom(ctx context.Context, room *duel.Room) error {
	state, err := json.Marshal(room)
	if err != nil {
		return err
	}
	_, err = s.Pool.Exec(ctx, `INSERT INTO duel_rooms
        (code,version,phase,level,direction,seats,listed,state,created_at,updated_at)
        VALUES ($1,1,$2,$3,$4,$5,$6,$7,$8,$8)`,
		room.Code, string(room.Phase), room.Level, room.Direction, room.Seats,
		room.Open, state, room.CreatedAt)
	return err
}

// DuelRoom читает комнату вместе с версией: с ней потом сверяется запись.
func (s *Store) DuelRoom(ctx context.Context, code string) (*duel.Room, int, error) {
	var state []byte
	var version int
	err := s.Pool.QueryRow(ctx, `SELECT state,version FROM duel_rooms WHERE code=$1`, code).
		Scan(&state, &version)
	if errors.Is(err, pgx.ErrNoRows) {
		return nil, 0, ErrDuelNotFound
	}
	if err != nil {
		return nil, 0, err
	}
	var room duel.Room
	if err := json.Unmarshal(state, &room); err != nil {
		return nil, 0, err
	}
	return &room, version, nil
}

// SaveDuelRoom записывает комнату, если её никто не тронул.
func (s *Store) SaveDuelRoom(ctx context.Context, room *duel.Room, version int) error {
	state, err := json.Marshal(room)
	if err != nil {
		return err
	}
	tag, err := s.Pool.Exec(ctx, `UPDATE duel_rooms
        SET version=version+1, phase=$1, listed=$2, state=$3, updated_at=$4
        WHERE code=$5 AND version=$6`,
		string(room.Phase), room.Open, state, room.UpdatedAt, room.Code, version)
	if err != nil {
		return err
	}
	if tag.RowsAffected() == 0 {
		return ErrDuelConflict
	}
	return nil
}

// EnterDuelQueue ставит человека в очередь. Повторный запрос от того же
// участника только продлевает присутствие: опрос очереди идёт постоянно.
func (s *Store) EnterDuelQueue(ctx context.Context, w duel.Waiting, now time.Time) error {
	var userID any
	if w.UserID != "" {
		parsed, err := uuid.Parse(w.UserID)
		if err != nil {
			return err
		}
		userID = parsed
	}
	_, err := s.Pool.Exec(ctx, `INSERT INTO duel_queue
        (id,user_id,name,level,direction,seats,since,seen)
        VALUES ($1,$2,$3,$4,$5,$6,$7,$7)
        ON CONFLICT (id) DO UPDATE SET
          name=EXCLUDED.name, level=EXCLUDED.level, direction=EXCLUDED.direction,
          seats=EXCLUDED.seats, since=EXCLUDED.since, seen=EXCLUDED.seen,
          -- Новый поиск начинается с чистого места: со старым room_code человек
          -- навсегда остался бы в комнате, из которой уже ушёл.
          room_code=NULL`,
		w.ID, userID, w.Name, w.Level, w.Direction, w.Seats, now)
	return err
}

func (s *Store) LeaveDuelQueue(ctx context.Context, id string) error {
	_, err := s.Pool.Exec(ctx, `DELETE FROM duel_queue WHERE id=$1`, id)
	return err
}

// DuelWaiting возвращает место в очереди и код комнаты, если человека уже
// позвали. Заодно отмечает, что он на связи.
func (s *Store) DuelWaiting(ctx context.Context, id string, now time.Time) (*duel.Waiting, string, error) {
	var w duel.Waiting
	var userID *uuid.UUID
	var code *string
	err := s.Pool.QueryRow(ctx, `UPDATE duel_queue SET seen=$2 WHERE id=$1
        RETURNING id,user_id,name,level,direction,seats,since,room_code`, id, now).
		Scan(&w.ID, &userID, &w.Name, &w.Level, &w.Direction, &w.Seats, &w.Since, &code)
	if errors.Is(err, pgx.ErrNoRows) {
		return nil, "", nil
	}
	if err != nil {
		return nil, "", err
	}
	if userID != nil {
		w.UserID = userID.String()
	}
	if code != nil {
		return &w, *code, nil
	}
	return &w, "", nil
}

// DuelSearching — сколько человек сейчас ищет матч на этом уровне.
func (s *Store) DuelSearching(ctx context.Context, level, direction string, now time.Time) (int, error) {
	var count int
	err := s.Pool.QueryRow(ctx, `SELECT count(*) FROM duel_queue
        WHERE level=$1 AND direction=$2 AND room_code IS NULL AND seen > $3`,
		level, direction, now.Add(-duelQueueLife)).Scan(&count)
	return count, err
}

// MatchDuel сводит ожидающих в комнаты и зовёт их туда.
//
// Вся работа идёт под общим замком: подбор смотрит на очередь целиком, и два
// одновременных запроса без замка посадили бы одного человека сразу за два
// стола.
func (s *Store) MatchDuel(ctx context.Context, now time.Time) ([]*duel.Room, error) {
	var created []*duel.Room
	err := s.InTx(ctx, func(tx pgx.Tx) error {
		if _, err := tx.Exec(ctx,
			`SELECT pg_advisory_xact_lock(hashtext('citavuk-duel-match'))`); err != nil {
			return err
		}
		rows, err := tx.Query(ctx, `SELECT id,user_id,name,level,direction,seats,since
            FROM duel_queue WHERE room_code IS NULL AND seen > $1 ORDER BY since`,
			now.Add(-duelQueueLife))
		if err != nil {
			return err
		}
		var waiting []duel.Waiting
		for rows.Next() {
			var w duel.Waiting
			var userID *uuid.UUID
			if err := rows.Scan(&w.ID, &userID, &w.Name, &w.Level, &w.Direction, &w.Seats, &w.Since); err != nil {
				rows.Close()
				return err
			}
			if userID != nil {
				w.UserID = userID.String()
			}
			waiting = append(waiting, w)
		}
		rows.Close()
		if err := rows.Err(); err != nil {
			return err
		}

		for _, group := range duel.Match(waiting, now) {
			room, err := s.seatGroup(ctx, tx, group, now)
			if err != nil {
				return err
			}
			created = append(created, room)
		}
		return nil
	})
	if err != nil {
		return nil, err
	}
	return created, nil
}

// seatGroup создаёт комнату для набранной группы и зовёт в неё людей.
func (s *Store) seatGroup(ctx context.Context, tx pgx.Tx, group duel.Group, now time.Time) (*duel.Room, error) {
	head := group.Players[0]
	var code string
	for attempt := range 5 {
		code = duel.NewCode()
		var taken bool
		if err := tx.QueryRow(ctx, `SELECT exists(SELECT 1 FROM duel_rooms WHERE code=$1)`, code).
			Scan(&taken); err != nil {
			return nil, err
		}
		if !taken {
			break
		}
		if attempt == 4 {
			return nil, fmt.Errorf("не удалось придумать свободный код комнаты")
		}
	}

	room, err := duel.NewRoom(code, group.Level, group.Direction, group.Seats,
		duel.Player{ID: head.ID, UserID: head.UserID, Name: head.Name}, now)
	if err != nil {
		return nil, err
	}
	for _, player := range group.Players[1:] {
		if err := room.Join(duel.Player{ID: player.ID, UserID: player.UserID, Name: player.Name}, now); err != nil {
			return nil, err
		}
	}
	// Комнату ещё никто не открывал: подбор только свёл людей, и каждому
	// предстоит подтвердить участие.
	for i := range room.Players {
		room.Players[i].Joined = false
	}
	room.Gather(now)

	state, err := json.Marshal(room)
	if err != nil {
		return nil, err
	}
	if _, err := tx.Exec(ctx, `INSERT INTO duel_rooms
        (code,version,phase,level,direction,seats,listed,state,created_at,updated_at)
        VALUES ($1,1,$2,$3,$4,$5,false,$6,$7,$7)`,
		room.Code, string(room.Phase), room.Level, room.Direction, room.Seats, state, now); err != nil {
		return nil, err
	}

	ids := make([]string, 0, len(group.Players))
	for _, player := range group.Players {
		ids = append(ids, player.ID)
	}
	if _, err := tx.Exec(ctx, `UPDATE duel_queue SET room_code=$1 WHERE id = ANY($2)`,
		room.Code, ids); err != nil {
		return nil, err
	}

	// Уведомление в колокольчик достаётся вошедшим: гостю его положить некуда.
	for _, player := range group.Players {
		if player.UserID == "" {
			continue
		}
		userID, err := uuid.Parse(player.UserID)
		if err != nil {
			continue
		}
		if _, err := tx.Exec(ctx, `INSERT INTO user_notifications
            (id,user_id,kind,title,body,target_url) VALUES ($1,$2,$3,$4,$5,$6)`,
			uuid.New(), userID, "duel", "Соперники нашлись",
			fmt.Sprintf("Комната на %d — уровень %s. Матч начнётся, как только все соберутся.",
				group.Seats, group.Level),
			"/trainer/translation-duel/"+room.Code); err != nil {
			return nil, err
		}
	}
	return room, nil
}

// SweepDuel убирает доигранные комнаты и брошенные места в очереди.
func (s *Store) SweepDuel(ctx context.Context, now time.Time) error {
	if _, err := s.Pool.Exec(ctx, `DELETE FROM duel_queue WHERE seen < $1`,
		now.Add(-duelQueueKeep)); err != nil {
		return err
	}
	_, err := s.Pool.Exec(ctx, `DELETE FROM duel_rooms WHERE updated_at < $1`,
		now.Add(-duelRoomLife))
	return err
}
