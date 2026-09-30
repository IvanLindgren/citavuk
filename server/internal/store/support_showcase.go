package store

import (
	"context"
	"errors"
	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
	"time"
)

type SupportSpotlight struct {
	Name          string `json:"name"`
	Message       string `json:"message,omitempty"`
	AmountKopecks int64  `json:"amountKopecks,omitempty"`
	Day           string `json:"day"`
}

// Spotlight — победитель вчерашнего дня, без тестовых и возвращённых платежей.
func (s *Store) Spotlight(ctx context.Context, now time.Time) (*SupportSpotlight, error) {
	loc := time.FixedZone("Moscow", 3*60*60)
	local := now.In(loc)
	end := time.Date(local.Year(), local.Month(), local.Day(), 0, 0, 0, 0, loc)
	var p SupportSpotlight
	err := s.Pool.QueryRow(ctx, `SELECT public_name,
        CASE WHEN message_approved AND show_message THEN message ELSE '' END,
        CASE WHEN show_amount THEN amount_kopecks ELSE 0 END
        FROM donations WHERE status='succeeded' AND NOT is_test AND show_public
          AND public_name<>'' AND paid_at >= $1 AND paid_at < $2
        ORDER BY amount_kopecks DESC, paid_at, id LIMIT 1`, end.AddDate(0, 0, -1), end).Scan(&p.Name, &p.Message, &p.AmountKopecks)
	if errors.Is(err, pgx.ErrNoRows) {
		return nil, nil
	}
	p.Day = end.Format("2006-01-02")
	return &p, err
}

func (s *Store) ApproveDonationMessage(ctx context.Context, id uuid.UUID, approved bool) error {
	tag, err := s.Pool.Exec(ctx, `UPDATE donations SET message_approved=$2 WHERE id=$1 AND show_message AND status='succeeded' AND NOT is_test`, id, approved)
	if err == nil && tag.RowsAffected() == 0 {
		return ErrDonationNotFound
	}
	return err
}
