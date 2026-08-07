package store

import (
	"context"
	"strings"
	"time"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
)

// Уровень сербского у аккаунта.
//
// Раньше уровень спрашивал только Вукоток и хранил его в профиле ленты, ключ
// которого — устройство, а не человек. Поэтому один и тот же читатель отвечал
// на один и тот же вопрос в браузере и в телефоне, а остальные разделы о его
// уровне не знали вовсе. Здесь уровень лежит на аккаунте: спрошенный однажды,
// он виден всем разделам и на всех устройствах.

// SerbianLevels — шкала CEFR в порядке возрастания.
//
// До C2, как и в заявке преподавателя: колонки называются одинаково и означают
// одно и то же, и разошедшиеся домены — ловушка, а не решение. Лента при этом
// остаётся с A1…C1 (MicroFeedLevels): там уровень стоит на карточке, а не на
// человеке, и «текст уровня C2» никто не размечает.
var SerbianLevels = []string{"A1", "A2", "B1", "B2", "C1", "C2"}

// ClampToFeedLevel опускает уровень до шкалы ленты.
//
// Нужен ровно в одном месте — когда уровень аккаунта переносится в профиль
// ленты, у которого своя, более короткая шкала. Без него C2 не проходил бы
// проверку и молча становился B1, то есть серединой, а не потолком.
func ClampToFeedLevel(level string) string {
	if allowedFeedValue(level, MicroFeedLevels) {
		return level
	}
	if SerbianLevelIndex(level) > SerbianLevelIndex(MicroFeedLevels[len(MicroFeedLevels)-1]) {
		return MicroFeedLevels[len(MicroFeedLevels)-1]
	}
	return ""
}

// Откуда взялся уровень.
const (
	LevelSourceDeclared = "declared" // сказал сам
	LevelSourceTest     = "test"     // прошёл тест
)

// SerbianLevel — что известно об уровне читателя.
type SerbianLevel struct {
	// Level пуст, если уровень ещё не спрашивали. Пустая строка и «A1» — не
	// одно и то же: слив их, мы потеряли бы право спросить у новичка.
	Level  string     `json:"level"`
	Source string     `json:"source"`
	SetAt  *time.Time `json:"setAt"`
}

// Known сообщает, что уровень уже известен и спрашивать не нужно.
func (l SerbianLevel) Known() bool { return l.Level != "" }

// NormalizeSerbianLevel приводит уровень к каноническому виду. Пустая строка
// возвращается для всего непонятного: подставлять вместо мусора B1 нельзя —
// тогда «не спрашивали» превратится в ответ, которого никто не давал.
func NormalizeSerbianLevel(level string) string {
	level = strings.ToUpper(strings.TrimSpace(level))
	for _, known := range SerbianLevels {
		if known == level {
			return level
		}
	}
	return ""
}

// SerbianLevelIndex — номер ступени, начиная с единицы. Ноль означает, что
// уровень неизвестен.
func SerbianLevelIndex(level string) int {
	for index, known := range SerbianLevels {
		if known == level {
			return index + 1
		}
	}
	return 0
}

// GetSerbianLevel читает уровень аккаунта.
func (s *Store) GetSerbianLevel(ctx context.Context, userID uuid.UUID) (SerbianLevel, error) {
	var level SerbianLevel
	err := s.Pool.QueryRow(ctx, `
		SELECT serbian_level, serbian_level_source, serbian_level_set_at
		  FROM users WHERE id = $1`, userID).Scan(&level.Level, &level.Source, &level.SetAt)
	if err == pgx.ErrNoRows {
		return level, ErrUserNotFound
	}
	return level, err
}

// SetSerbianLevel записывает уровень аккаунта.
//
// Уровень перезаписывается всегда, а не только когда он ещё не задан: человек
// растёт, и «я теперь B2» — обычное обновление, а не попытка испортить данные.
func (s *Store) SetSerbianLevel(
	ctx context.Context, userID uuid.UUID, level, source string,
) (SerbianLevel, error) {
	clean := NormalizeSerbianLevel(level)
	if clean == "" {
		return SerbianLevel{}, ErrUnknownSerbianLevel
	}
	if source != LevelSourceTest {
		source = LevelSourceDeclared
	}
	var saved SerbianLevel
	err := s.Pool.QueryRow(ctx, `
		UPDATE users
		   SET serbian_level = $2,
		       serbian_level_source = $3,
		       serbian_level_set_at = now(),
		       updated_at = now()
		 WHERE id = $1
		RETURNING serbian_level, serbian_level_source, serbian_level_set_at`,
		userID, clean, source).Scan(&saved.Level, &saved.Source, &saved.SetAt)
	if err == pgx.ErrNoRows {
		return SerbianLevel{}, ErrUserNotFound
	}
	return saved, err
}
