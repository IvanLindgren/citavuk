package store

import (
	"context"
	"encoding/json"
	"errors"
	"time"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
)

var ErrCourseProgressNotFound = errors.New("прогресс курса не найден")

type CourseProgress struct {
	CourseID  string          `json:"courseId"`
	Payload   json.RawMessage `json:"payload"`
	UpdatedAt time.Time       `json:"updatedAt"`
}

func (s *Store) GetCourseProgress(
	ctx context.Context,
	userID uuid.UUID,
	courseID string,
) (*CourseProgress, error) {
	var progress CourseProgress
	var payload []byte
	err := s.Pool.QueryRow(ctx, `
        SELECT course_id, payload, updated_at
          FROM course_progress
         WHERE user_id = $1 AND course_id = $2`,
		userID, courseID,
	).Scan(&progress.CourseID, &payload, &progress.UpdatedAt)
	if errors.Is(err, pgx.ErrNoRows) {
		return nil, ErrCourseProgressNotFound
	}
	if err != nil {
		return nil, err
	}
	progress.Payload = json.RawMessage(payload)
	return &progress, nil
}

// PutCourseProgress применяет документ только если он не старше серверного.
// Клиенты сначала сливают локальный и удалённый прогресс, поэтому повторный PUT
// идемпотентен, а поздно проснувшееся устройство не откатывает свежий результат.
func (s *Store) PutCourseProgress(
	ctx context.Context,
	userID uuid.UUID,
	progress *CourseProgress,
) (bool, *CourseProgress, error) {
	tag, err := s.Pool.Exec(ctx, `
        INSERT INTO course_progress (user_id, course_id, payload, updated_at)
        VALUES ($1, $2, $3, $4)
        ON CONFLICT (user_id, course_id) DO UPDATE SET
            payload = EXCLUDED.payload,
            updated_at = EXCLUDED.updated_at
        WHERE course_progress.updated_at <= EXCLUDED.updated_at`,
		userID, progress.CourseID, []byte(progress.Payload), progress.UpdatedAt)
	if err != nil {
		return false, nil, err
	}
	current, err := s.GetCourseProgress(ctx, userID, progress.CourseID)
	return tag.RowsAffected() > 0, current, err
}
