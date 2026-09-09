package store

import (
	"context"
	"encoding/json"
	"errors"
	"strconv"
	"strings"
	"time"

	"github.com/citavuk/server/internal/personal"
	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
)

var (
	ErrPersonalMissing  = errors.New("колода или урок не найдены")
	ErrPersonalLocked   = errors.New("урок ещё не открыт")
	ErrPersonalConflict = errors.New("урок изменился: обнови страницу")
	ErrPersonalFeedback = errors.New("пока недостаточно оценок для пересоставления")
	ErrPersonalLimit    = errors.New("лимит пересоставления этой колоды исчерпан")
)

type PersonalPlan struct {
	ID                  uuid.UUID          `json:"id"`
	Profile             personal.Profile   `json:"profile"`
	Outline             []personal.Outline `json:"outline"`
	StartedAt           time.Time          `json:"startedAt"`
	Status              string             `json:"status"`
	Generation          int                `json:"generation"`
	Regenerations       int                `json:"regenerations"`
	Error               string             `json:"error,omitempty"`
	Today               int                `json:"today"`
	Month               int                `json:"month"`
	Lessons             []PersonalCard     `json:"lessons"`
	SuggestRegeneration bool               `json:"suggestRegeneration"`
}
type PersonalCard struct {
	Day         int        `json:"day"`
	Revision    int        `json:"revision"`
	Edited      bool       `json:"edited"`
	CompletedAt *time.Time `json:"completedAt,omitempty"`
	Score       *int       `json:"score,omitempty"`
	Total       *int       `json:"total,omitempty"`
	Rating      int        `json:"rating"`
	Unlocked    bool       `json:"unlocked"`
}
type PersonalLesson struct {
	PersonalCard
	Content personal.Lesson `json:"content"`
}

type PersonalHistoryItem struct {
	ID        uuid.UUID `json:"id"`
	StartedAt time.Time `json:"startedAt"`
	Level     string    `json:"level"`
}

func (s *Store) PersonalHistory(ctx context.Context, userID uuid.UUID) ([]PersonalHistoryItem, error) {
	rows, err := s.Pool.Query(ctx, `SELECT id,started_at,profile->>'level' FROM personal_plans WHERE user_id=$1 ORDER BY created_at DESC,id DESC`, userID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	items := []PersonalHistoryItem{}
	for rows.Next() {
		var item PersonalHistoryItem
		if err = rows.Scan(&item.ID, &item.StartedAt, &item.Level); err != nil {
			return nil, err
		}
		items = append(items, item)
	}
	return items, rows.Err()
}

func scanPersonal(row pgx.Row) (PersonalPlan, error) {
	var p PersonalPlan
	err := row.Scan(&p.ID, &p.Profile, &p.Outline, &p.StartedAt, &p.Status, &p.Generation, &p.Regenerations, &p.Error)
	if errors.Is(err, pgx.ErrNoRows) {
		err = ErrPersonalMissing
	}
	p.Today = personal.DayAt(p.StartedAt, time.Now(), p.Profile.Timezone)
	loc, locationErr := time.LoadLocation(p.Profile.Timezone)
	if locationErr != nil {
		loc = time.UTC
	}
	p.Month = int(time.Now().In(loc).Month())
	p.Lessons = []PersonalCard{}
	return p, err
}

const personalColumns = `id,profile,outline,started_at,status,generation,regenerations,error`

const personalRatingQuery = `SELECT count(*) FILTER(WHERE rating=-1)>=3 FROM
 (SELECT l.rating FROM personal_lessons l JOIN personal_plans p ON p.id=l.plan_id
 WHERE l.plan_id=$1 AND l.rating<>0 AND l.rated_at>coalesce(p.feedback_at,'-infinity'::timestamptz)
 ORDER BY l.rated_at DESC,l.day DESC LIMIT 5) rated`

func (s *Store) LatestPersonal(ctx context.Context, userID uuid.UUID) (*PersonalPlan, error) {
	p, err := scanPersonal(s.Pool.QueryRow(ctx, `SELECT `+personalColumns+` FROM personal_plans WHERE user_id=$1 ORDER BY created_at DESC,id DESC LIMIT 1`, userID))
	if errors.Is(err, ErrPersonalMissing) {
		return nil, nil
	}
	if err != nil {
		return nil, err
	}
	return s.PersonalPlan(ctx, userID, p.ID)
}

func (s *Store) PersonalPlan(ctx context.Context, userID, id uuid.UUID) (*PersonalPlan, error) {
	p, err := scanPersonal(s.Pool.QueryRow(ctx, `SELECT `+personalColumns+` FROM personal_plans WHERE user_id=$1 AND id=$2`, userID, id))
	if err != nil {
		return nil, err
	}
	rows, err := s.Pool.Query(ctx, `SELECT day,revision,edited,completed_at,score,total,rating FROM personal_lessons WHERE plan_id=$1 ORDER BY day`, id)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	for rows.Next() {
		var c PersonalCard
		if err = rows.Scan(&c.Day, &c.Revision, &c.Edited, &c.CompletedAt, &c.Score, &c.Total, &c.Rating); err != nil {
			return nil, err
		}
		c.Unlocked = c.Day <= p.Today
		p.Lessons = append(p.Lessons, c)
	}
	if err = rows.Err(); err != nil {
		return nil, err
	}
	err = s.Pool.QueryRow(ctx, personalRatingQuery, id).Scan(&p.SuggestRegeneration)
	return &p, err
}

// Блокировка аккаунта предотвращает создание двух платных колод двойным тапом.
func (s *Store) CreatePersonal(ctx context.Context, userID uuid.UUID, profile personal.Profile) (uuid.UUID, error) {
	if err := profile.Validate(); err != nil {
		return uuid.Nil, err
	}
	tx, err := s.Pool.Begin(ctx)
	if err != nil {
		return uuid.Nil, err
	}
	defer tx.Rollback(ctx)
	var lock uuid.UUID
	if err = tx.QueryRow(ctx, `SELECT id FROM users WHERE id=$1 FOR UPDATE`, userID).Scan(&lock); err != nil {
		return uuid.Nil, err
	}
	p, err := scanPersonal(tx.QueryRow(ctx, `SELECT `+personalColumns+` FROM personal_plans WHERE user_id=$1 ORDER BY created_at DESC,id DESC LIMIT 1`, userID))
	if err == nil && p.Today <= personal.Days {
		return p.ID, tx.Commit(ctx)
	}
	if err != nil && !errors.Is(err, ErrPersonalMissing) {
		return uuid.Nil, err
	}
	view, err := studyInTx(ctx, tx, userID, "", "", time.Now())
	if err != nil {
		return uuid.Nil, err
	}
	if view.ActiveDays > 0 {
		profile.Timezone = view.Timezone
	} else {
		if _, err = studyInTx(ctx, tx, userID, profile.Timezone, "", time.Now()); err != nil {
			return uuid.Nil, err
		}
	}
	id := uuid.New()
	data, _ := json.Marshal(profile)
	_, err = tx.Exec(ctx, `INSERT INTO personal_plans(id,user_id,profile) VALUES($1,$2,$3)`, id, userID, data)
	if err != nil {
		return uuid.Nil, err
	}
	return id, tx.Commit(ctx)
}

func lockPersonal(ctx context.Context, tx pgx.Tx, userID, id uuid.UUID) (PersonalPlan, error) {
	return scanPersonal(tx.QueryRow(ctx, `SELECT `+personalColumns+` FROM personal_plans WHERE user_id=$1 AND id=$2 FOR UPDATE`, userID, id))
}
func personalLessonTx(ctx context.Context, tx pgx.Tx, p PersonalPlan, day int) (PersonalLesson, error) {
	var l PersonalLesson
	if day < 1 || day > personal.Days {
		return l, ErrPersonalMissing
	}
	if day > p.Today {
		return l, ErrPersonalLocked
	}
	err := tx.QueryRow(ctx, `SELECT day,revision,edited,completed_at,score,total,rating,content FROM personal_lessons WHERE plan_id=$1 AND day=$2 FOR UPDATE`, p.ID, day).Scan(&l.Day, &l.Revision, &l.Edited, &l.CompletedAt, &l.Score, &l.Total, &l.Rating, &l.Content)
	if errors.Is(err, pgx.ErrNoRows) {
		err = ErrPersonalMissing
	}
	l.Unlocked = true
	return l, err
}
func (s *Store) PersonalLesson(ctx context.Context, userID, id uuid.UUID, day int) (PersonalLesson, error) {
	tx, err := s.Pool.Begin(ctx)
	if err != nil {
		return PersonalLesson{}, err
	}
	defer tx.Rollback(ctx)
	p, err := lockPersonal(ctx, tx, userID, id)
	if err != nil {
		return PersonalLesson{}, err
	}
	l, err := personalLessonTx(ctx, tx, p, day)
	if err != nil {
		return l, err
	}
	return l, tx.Commit(ctx)
}

func (s *Store) EditPersonal(ctx context.Context, userID, id uuid.UUID, day, revision int, content personal.Lesson) error {
	if err := content.Validate(); err != nil {
		return err
	}
	tx, err := s.Pool.Begin(ctx)
	if err != nil {
		return err
	}
	defer tx.Rollback(ctx)
	p, err := lockPersonal(ctx, tx, userID, id)
	if err != nil {
		return err
	}
	l, err := personalLessonTx(ctx, tx, p, day)
	if err != nil {
		return err
	}
	if l.Revision != revision {
		return ErrPersonalConflict
	}
	raw, _ := json.Marshal(content)
	_, err = tx.Exec(ctx, `UPDATE personal_lessons SET original_content=coalesce(original_content,content),content=$3,revision=revision+1,edited=true,updated_at=now() WHERE plan_id=$1 AND day=$2`, id, day, raw)
	if err != nil {
		return err
	}
	return tx.Commit(ctx)
}

type PersonalResult struct {
	Score     int       `json:"score"`
	Total     int       `json:"total"`
	Completed bool      `json:"completed"`
	Study     StudyView `json:"study"`
}

func (s *Store) CompletePersonal(ctx context.Context, userID, id uuid.UUID, day, revision int, answers []string) (PersonalResult, error) {
	var result PersonalResult
	tx, err := s.Pool.Begin(ctx)
	if err != nil {
		return result, err
	}
	defer tx.Rollback(ctx)
	p, err := lockPersonal(ctx, tx, userID, id)
	if err != nil {
		return result, err
	}
	l, err := personalLessonTx(ctx, tx, p, day)
	if err != nil {
		return result, err
	}
	if l.CompletedAt != nil {
		result.Score = *l.Score
		result.Total = *l.Total
		result.Completed = true
	} else {
		if l.Revision != revision {
			return result, ErrPersonalConflict
		}
		result.Score, err = personal.Grade(l.Content, answers)
		if err != nil {
			return result, err
		}
		result.Total = len(l.Content.Exercises)
		// Завершение означает выполнение всех заданий, а не обязательные 100%.
		// Ошибки остаются в статистике и доступны для разбора.
		data, _ := json.Marshal(answers)
		_, err = tx.Exec(ctx, `UPDATE personal_lessons SET completed_at=now(),score=$3,total=$4,completed_revision=revision,completed_content=content,answers=$5,updated_at=now() WHERE plan_id=$1 AND day=$2`, id, day, result.Score, result.Total, data)
		if err != nil {
			return result, err
		}
		result.Completed = true
	}
	result.Study, err = studyInTx(ctx, tx, userID, "", "personal:"+id.String()+":"+strconv.Itoa(day), time.Now())
	if err != nil {
		return result, err
	}
	return result, tx.Commit(ctx)
}

func (s *Store) RatePersonal(ctx context.Context, userID, id uuid.UUID, day, rating int) error {
	if rating < -1 || rating > 1 {
		return personal.ErrInvalid
	}
	tx, err := s.Pool.Begin(ctx)
	if err != nil {
		return err
	}
	defer tx.Rollback(ctx)
	p, err := lockPersonal(ctx, tx, userID, id)
	if err != nil {
		return err
	}
	if _, err = personalLessonTx(ctx, tx, p, day); err != nil {
		return err
	}
	_, err = tx.Exec(ctx, `UPDATE personal_lessons SET rating=$3,rated_at=now(),updated_at=now() WHERE plan_id=$1 AND day=$2 AND rating<>$3`, id, day, rating)
	if err != nil {
		return err
	}
	return tx.Commit(ctx)
}

func (s *Store) RegeneratePersonal(ctx context.Context, userID, id uuid.UUID, feedback string) error {
	feedback = strings.TrimSpace(feedback)
	if len([]rune(feedback)) < 5 || len([]rune(feedback)) > 1500 {
		return personal.ErrInvalid
	}
	tx, err := s.Pool.Begin(ctx)
	if err != nil {
		return err
	}
	defer tx.Rollback(ctx)
	p, err := lockPersonal(ctx, tx, userID, id)
	if err != nil {
		return err
	}
	if p.Status == "running" || p.Status == "queued" {
		return ErrPersonalConflict
	}
	if p.Regenerations >= 3 {
		return ErrPersonalLimit
	}
	var enough bool
	err = tx.QueryRow(ctx, personalRatingQuery, id).Scan(&enough)
	if err != nil {
		return err
	}
	if !enough {
		return ErrPersonalFeedback
	}
	_, err = tx.Exec(ctx, `UPDATE personal_plans SET generation=generation+1,regenerations=regenerations+1,feedback=$2,feedback_at=now(),status='queued',attempts=0,error='',lease_until=NULL,lease_token=NULL,updated_at=now() WHERE id=$1`, id, feedback)
	if err != nil {
		return err
	}
	return tx.Commit(ctx)
}

func (s *Store) RetryPersonal(ctx context.Context, userID, id uuid.UUID) error {
	tag, err := s.Pool.Exec(ctx, `UPDATE personal_plans SET status='queued',attempts=0,retries=retries+1,error='',lease_until=NULL,lease_token=NULL,updated_at=now() WHERE id=$1 AND user_id=$2 AND status='error' AND retries<3`, id, userID)
	if err != nil {
		return err
	}
	if tag.RowsAffected() == 0 {
		return ErrPersonalLimit
	}
	return nil
}
