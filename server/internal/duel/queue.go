package duel

import (
	"sort"
	"time"
)

// Подбор соперников.
//
// Читавук — не игровая площадка с тысячей человек онлайн, и главная опасность
// здесь не «нечестный матч», а «матча не случилось вовсе». Отсюда правила:
// уровень и направление совпадают строго (иначе фразы будут не те), а размер
// комнаты через две минуты ожидания перестаёт быть требованием — человек,
// выбравший «вшестером», иначе не дождётся никого.
//
// Смягчение работает только вниз: попросивший комнату на шестерых согласен и
// на двоих, а попросивший на двоих в комнату на шестерых не попадёт. Выбор
// «вдвоём» — это выбор, а не компромисс.

const (
	// Через столько ожидание считается затянувшимся: пора предложить сыграть
	// с машиной, пока ищутся люди.
	Patience = 45 * time.Second

	// Через столько размер комнаты перестаёт быть требованием.
	Relax = 2 * time.Minute
)

// Waiting — человек в подборе.
type Waiting struct {
	ID        string    `json:"id"`
	Name      string    `json:"name"`
	UserID    string    `json:"userId,omitempty"`
	Level     string    `json:"level"`
	Direction string    `json:"direction"`
	Seats     int       `json:"seats"`
	Since     time.Time `json:"since"`
}

// Group — набранная комната: кого с кем свести.
type Group struct {
	Level     string
	Direction string
	Seats     int
	Players   []Waiting
}

// Ripe — ожидание затянулось.
func Ripe(since, now time.Time) bool {
	return now.Sub(since) >= Patience
}

func relaxed(w Waiting, now time.Time) bool {
	return now.Sub(w.Since) >= Relax
}

// accepts говорит, сядет ли человек в комнату на seats мест.
func accepts(w Waiting, seats int, now time.Time) bool {
	if seats < MinSeats || seats > MaxSeats {
		return false
	}
	if seats == w.Seats {
		return true
	}
	return seats < w.Seats && relaxed(w, now)
}

// Match сводит ожидающих в комнаты. Первым обслуживается тот, кто ждёт дольше
// всех: иначе на людном уровне можно простоять всё время, пропуская вперёд
// вновь пришедших.
func Match(waiting []Waiting, now time.Time) []Group {
	queue := make([]Waiting, len(waiting))
	copy(queue, waiting)
	sort.SliceStable(queue, func(i, j int) bool {
		if !queue[i].Since.Equal(queue[j].Since) {
			return queue[i].Since.Before(queue[j].Since)
		}
		return queue[i].ID < queue[j].ID
	})

	taken := make(map[string]bool, len(queue))
	var groups []Group
	for i := range queue {
		head := queue[i]
		if taken[head.ID] {
			continue
		}
		// Сначала пробуем ту комнату, которую человек и просил, потом меньше:
		// шестером играть интереснее, чем вдвоём, если шестеро есть.
		for seats := head.Seats; seats >= MinSeats; seats-- {
			if !accepts(head, seats, now) {
				continue
			}
			pool := []Waiting{head}
			for j := range queue {
				other := queue[j]
				if other.ID == head.ID || taken[other.ID] {
					continue
				}
				if other.Level != head.Level || other.Direction != head.Direction {
					continue
				}
				if !accepts(other, seats, now) {
					continue
				}
				pool = append(pool, other)
				if len(pool) == seats {
					break
				}
			}
			if len(pool) < seats {
				continue
			}
			for _, player := range pool {
				taken[player.ID] = true
			}
			groups = append(groups, Group{
				Level: head.Level, Direction: head.Direction, Seats: seats, Players: pool,
			})
			break
		}
	}
	return groups
}
