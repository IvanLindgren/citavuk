package store

import (
	"context"
	"errors"
	"time"

	"github.com/citavuk/server/internal/study"
	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
)

var ErrStudyTimezone = errors.New("часовой пояс серии уже закреплён")

type StudyView struct {
	study.State
	Today  string      `json:"today"`
	NewDay bool        `json:"newDay"`
	Days   []study.Day `json:"days"`
	AsOf   time.Time   `json:"asOf"`
}

// studyInTx вызывается при сохранении результата или синхронизации офлайн-
// попытки. Сервер определяет календарь и дедупликацию, а не принимает готовый
// счётчик клиента. Офлайн-упражнения проверяются клиентом, как и прежний SRS.
func studyInTx(ctx context.Context, tx pgx.Tx, userID uuid.UUID, timezone, eventKey string, now time.Time) (StudyView, error) {
	zone := timezone
	if zone == "" {
		zone = "UTC"
	}
	if !study.ValidTimezone(zone) {
		return StudyView{}, ErrStudyTimezone
	}
	_, err := tx.Exec(ctx, `INSERT INTO study_streaks(user_id,timezone) VALUES($1,$2) ON CONFLICT DO NOTHING`, userID, zone)
	if err != nil {
		return StudyView{}, err
	}
	var s study.State
	err = tx.QueryRow(ctx, `SELECT timezone,current,longest,freezes,active_days,coalesce(to_char(last_day,'YYYY-MM-DD'),''),today_active FROM study_streaks WHERE user_id=$1 FOR UPDATE`, userID).Scan(&s.Timezone, &s.Current, &s.Longest, &s.Freezes, &s.ActiveDays, &s.LastDay, &s.TodayActive)
	if err != nil {
		return StudyView{}, err
	}
	if timezone != "" && timezone != s.Timezone {
		if s.ActiveDays > 0 {
			return StudyView{}, ErrStudyTimezone
		}
		s.Timezone = timezone
	}
	credit := false
	if eventKey != "" {
		tag, e := tx.Exec(ctx, `INSERT INTO study_events(user_id,event_key) VALUES($1,$2) ON CONFLICT DO NOTHING`, userID, eventKey)
		if e != nil {
			return StudyView{}, e
		}
		credit = tag.RowsAffected() > 0
	}
	today, err := study.Date(now, s.Timezone)
	if err != nil {
		return StudyView{}, err
	}
	next, days, newDay, err := study.Advance(s, today, credit)
	if err != nil {
		return StudyView{}, err
	}
	for _, d := range days {
		_, err = tx.Exec(ctx, `INSERT INTO study_days(user_id,day,kind) VALUES($1,$2::date,$3) ON CONFLICT(user_id,day) DO NOTHING`, userID, d.Date, d.Kind)
		if err != nil {
			return StudyView{}, err
		}
	}
	_, err = tx.Exec(ctx, `UPDATE study_streaks SET timezone=$2,current=$3,longest=$4,freezes=$5,active_days=$6,last_day=nullif($7,'')::date,today_active=$8,updated_at=now() WHERE user_id=$1`, userID, next.Timezone, next.Current, next.Longest, next.Freezes, next.ActiveDays, next.LastDay, next.TodayActive)
	if err != nil {
		return StudyView{}, err
	}
	view := StudyView{State: next, Today: today, NewDay: newDay, Days: []study.Day{}, AsOf: now.UTC()}
	rows, err := tx.Query(ctx, `SELECT to_char(day,'YYYY-MM-DD'),kind FROM study_days WHERE user_id=$1 AND day >= $2::date - 365 ORDER BY day`, userID, today)
	if err != nil {
		return StudyView{}, err
	}
	defer rows.Close()
	for rows.Next() {
		var d study.Day
		if err = rows.Scan(&d.Date, &d.Kind); err != nil {
			return StudyView{}, err
		}
		view.Days = append(view.Days, d)
	}
	return view, rows.Err()
}

func (s *Store) GetStudy(ctx context.Context, userID uuid.UUID, timezone string) (StudyView, error) {
	tx, err := s.Pool.Begin(ctx)
	if err != nil {
		return StudyView{}, err
	}
	defer tx.Rollback(ctx)
	view, err := studyInTx(ctx, tx, userID, timezone, "", time.Now())
	if err != nil {
		return StudyView{}, err
	}
	if err = tx.Commit(ctx); err != nil {
		return StudyView{}, err
	}
	return view, nil
}

func (s *Store) RecordStudy(ctx context.Context, userID uuid.UUID, eventKey string) (StudyView, error) {
	tx, err := s.Pool.Begin(ctx)
	if err != nil {
		return StudyView{}, err
	}
	defer tx.Rollback(ctx)
	view, err := studyInTx(ctx, tx, userID, "", eventKey, time.Now())
	if err != nil {
		return StudyView{}, err
	}
	return view, tx.Commit(ctx)
}
