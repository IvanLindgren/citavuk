package store

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"time"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
)

var ErrCourseProgressNotFound = errors.New("прогресс курса не найден")

type CourseProgress struct {
	CourseID  string          `json:"courseId"`
	Payload   json.RawMessage `json:"payload"`
	UpdatedAt time.Time       `json:"updatedAt"`
	Study     *StudyView      `json:"study,omitempty"`
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
	tx, err := s.Pool.Begin(ctx)
	if err != nil {
		return false, nil, err
	}
	defer tx.Rollback(ctx)
	// Один порядок блокировок со sync: сначала аккаунт, затем серия.
	var owner uuid.UUID
	if err = tx.QueryRow(ctx, `SELECT id FROM users WHERE id=$1 FOR UPDATE`, userID).Scan(&owner); err != nil {
		return false, nil, err
	}
	var previous []byte
	err = tx.QueryRow(ctx, `SELECT payload FROM course_progress WHERE user_id=$1 AND course_id=$2`, userID, progress.CourseID).Scan(&previous)
	if err != nil && !errors.Is(err, pgx.ErrNoRows) {
		return false, nil, err
	}
	tag, err := tx.Exec(ctx, `
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
	var studyView *StudyView
	if tag.RowsAffected() > 0 {
		event := courseStudyEvent(progress.CourseID, previous, progress.Payload, time.Now())
		if event != "" {
			v, e := studyInTx(ctx, tx, userID, "", event, time.Now())
			if e != nil {
				return false, nil, e
			}
			studyView = &v
		}
	}
	if err = tx.Commit(ctx); err != nil {
		return false, nil, err
	}
	current, err := s.GetCourseProgress(ctx, userID, progress.CourseID)
	if current != nil {
		current.Study = studyView
	}
	return tag.RowsAffected() > 0, current, err
}

func courseStudyEvent(course string, oldRaw, newRaw []byte, now time.Time) string {
	type lesson struct {
		Status      string     `json:"status"`
		Skipped     bool       `json:"skipped"`
		Attempts    int        `json:"attemptsCount"`
		CompletedAt *time.Time `json:"completedAt"`
	}
	type document struct {
		Lessons map[string]lesson `json:"lessons"`
	}
	var old, next document
	if json.Unmarshal(newRaw, &next) != nil {
		return ""
	}
	_ = json.Unmarshal(oldRaw, &old)
	// Стабильный выбор из map, чтобы повторные запросы порождали тот же ключ.
	selected := ""
	for id, l := range next.Lessons {
		if l.Skipped || l.Attempts <= old.Lessons[id].Attempts || l.Attempts < 1 || l.Attempts > 1000000 || l.CompletedAt == nil {
			continue
		}
		if l.Status != "completed" && l.Status != "mastered" && l.Status != "needsReview" {
			continue
		}
		if l.CompletedAt.Before(now.Add(-48*time.Hour)) || l.CompletedAt.After(now.Add(5*time.Minute)) {
			continue
		}
		key := fmt.Sprintf("course:%s:%s:%d", course, id, l.Attempts)
		if selected == "" || key < selected {
			selected = key
		}
	}
	return selected
}
