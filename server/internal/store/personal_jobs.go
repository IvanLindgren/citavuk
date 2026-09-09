package store

import (
	"context"
	"encoding/json"
	"errors"

	"github.com/citavuk/server/internal/personal"
	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
)

var ErrPersonalLease = errors.New("задача генерации передана другому исполнителю")

type PersonalJob struct {
	PersonalPlan
	Token    uuid.UUID
	Feedback string
	Attempts int
}

// Lease и случайный token защищают от двух серверов и запоздалого ответа
// модели: старый исполнитель не может перезаписать новую генерацию.
func (s *Store) ClaimPersonal(ctx context.Context) (*PersonalJob, error) {
	var j PersonalJob
	j.Token = uuid.New()
	err := s.Pool.QueryRow(ctx, `WITH candidate AS (
 SELECT id FROM personal_plans WHERE
 (status='queued' AND (lease_until IS NULL OR lease_until<now())) OR
 (status='running' AND lease_until<now())
 ORDER BY updated_at LIMIT 1 FOR UPDATE SKIP LOCKED)
 UPDATE personal_plans p SET status='running',lease_token=$1,
 lease_until=now()+interval '2 minutes',attempts=attempts+1,updated_at=now()
 FROM candidate c WHERE p.id=c.id RETURNING p.id,p.profile,p.outline,
 p.started_at,p.status,p.generation,p.regenerations,p.error,p.feedback,p.attempts`, j.Token).Scan(&j.ID, &j.Profile, &j.Outline, &j.StartedAt, &j.Status, &j.Generation, &j.Regenerations, &j.Error, &j.Feedback, &j.Attempts)
	if errors.Is(err, pgx.ErrNoRows) {
		return nil, nil
	}
	if err != nil {
		return nil, err
	}
	return &j, nil
}

func (s *Store) SavePersonalOutline(ctx context.Context, j *PersonalJob, outline []personal.Outline) error {
	if err := personal.ValidateOutline(outline); err != nil {
		return err
	}
	raw, _ := json.Marshal(outline)
	tag, err := s.Pool.Exec(ctx, `UPDATE personal_plans SET outline=$3,lease_until=now()+interval '2 minutes',updated_at=now() WHERE id=$1 AND lease_token=$2 AND status='running'`, j.ID, j.Token, raw)
	if err != nil {
		return err
	}
	if tag.RowsAffected() == 0 {
		return ErrPersonalLease
	}
	j.Outline = outline
	return nil
}

func (s *Store) PersonalJobDays(ctx context.Context, j *PersonalJob) ([]int, error) {
	rows, err := s.Pool.Query(ctx, `SELECT n FROM generate_series(1,30) n LEFT JOIN personal_lessons l ON l.plan_id=$1 AND l.day=n WHERE l.day IS NULL OR (NOT l.edited AND l.completed_at IS NULL AND l.generated_for<$2) ORDER BY n`, j.ID, j.Generation)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	days := []int{}
	for rows.Next() {
		var d int
		if err = rows.Scan(&d); err != nil {
			return nil, err
		}
		days = append(days, d)
	}
	return days, rows.Err()
}

func (s *Store) SavePersonalGenerated(ctx context.Context, j *PersonalJob, day int, l personal.Lesson) error {
	if day < 1 || day > 30 {
		return personal.ErrInvalid
	}
	if err := l.Validate(); err != nil {
		return err
	}
	tx, err := s.Pool.Begin(ctx)
	if err != nil {
		return err
	}
	defer tx.Rollback(ctx)
	tag, err := tx.Exec(ctx, `UPDATE personal_plans SET lease_until=now()+interval '2 minutes',updated_at=now() WHERE id=$1 AND lease_token=$2 AND status='running'`, j.ID, j.Token)
	if err != nil {
		return err
	}
	if tag.RowsAffected() == 0 {
		return ErrPersonalLease
	}
	raw, _ := json.Marshal(l)
	_, err = tx.Exec(ctx, `INSERT INTO personal_lessons(plan_id,day,content,generated_for) VALUES($1,$2,$3,$4) ON CONFLICT(plan_id,day) DO UPDATE SET content=EXCLUDED.content,revision=personal_lessons.revision+1,generated_for=EXCLUDED.generated_for,rating=0,updated_at=now() WHERE NOT personal_lessons.edited AND personal_lessons.completed_at IS NULL AND personal_lessons.generated_for<EXCLUDED.generated_for`, j.ID, day, raw, j.Generation)
	if err != nil {
		return err
	}
	return tx.Commit(ctx)
}

func (s *Store) FinishPersonalJob(ctx context.Context, j *PersonalJob, failed bool) error {
	status, message := "ready", ""
	if failed {
		status = "queued"
		if j.Attempts >= 3 {
			status = "error"
		}
		message = "Не удалось составить все занятия. Готовые карточки сохранены."
	}
	tag, err := s.Pool.Exec(ctx, `UPDATE personal_plans SET status=$3,error=$4,lease_until=now()+interval '1 minute',lease_token=NULL,updated_at=now() WHERE id=$1 AND lease_token=$2`, j.ID, j.Token, status, message)
	if err != nil {
		return err
	}
	if tag.RowsAffected() == 0 {
		return ErrPersonalLease
	}
	return nil
}
