package store

import (
	"context"
	"encoding/json"
	"errors"
	"time"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5/pgconn"
)

var ErrDuplicateResult = errors.New("result already saved")

// CaseGameWeak — место, где ошибаются чаще всего: падеж, время или слово.
type CaseGameWeak struct {
	Label string `json:"label"`
	Wrong int    `json:"wrong"`
	Total int    `json:"total"`
}

// CaseGameResult — итог одной партии игры на падежи.
type CaseGameResult struct {
	ID             uuid.UUID      `json:"id"`
	Scope          string         `json:"scope"`
	LimitSeconds   int            `json:"limitSeconds"`
	ElapsedSeconds int            `json:"elapsedSeconds"`
	Words          int            `json:"words"`
	Correct        int            `json:"correct"`
	Wrong          int            `json:"wrong"`
	DiacriticSlips int            `json:"diacriticSlips"`
	Chars          int            `json:"chars"`
	CPM            int            `json:"cpm"`
	Accuracy       float64        `json:"accuracy"`
	Weak           []CaseGameWeak `json:"weak"`
	CreatedAt      time.Time      `json:"createdAt"`
}

// SaveCaseGameResult сохраняет итог. Повтор того же id (переотправка после
// обрыва связи) — не ошибка, а ErrDuplicateResult.
func (s *Store) SaveCaseGameResult(ctx context.Context, userID uuid.UUID, r *CaseGameResult) error {
	weak, err := json.Marshal(r.Weak)
	if err != nil {
		return err
	}
	err = s.Pool.QueryRow(ctx, `
        INSERT INTO case_game_results
            (id, user_id, scope, limit_seconds, elapsed_seconds, words, correct, wrong,
             diacritic_slips, chars, cpm, accuracy, weak)
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)
        RETURNING created_at`,
		r.ID, userID, r.Scope, r.LimitSeconds, r.ElapsedSeconds, r.Words, r.Correct, r.Wrong,
		r.DiacriticSlips, r.Chars, r.CPM, r.Accuracy, weak).Scan(&r.CreatedAt)
	var pgErr *pgconn.PgError
	if errors.As(err, &pgErr) && pgErr.Code == pgUniqueViolation {
		return ErrDuplicateResult
	}
	return err
}

// CaseGameResults — последние партии человека, новые сначала.
func (s *Store) CaseGameResults(ctx context.Context, userID uuid.UUID, limit int) ([]CaseGameResult, error) {
	rows, err := s.Pool.Query(ctx, `
        SELECT id, scope, limit_seconds, elapsed_seconds, words, correct, wrong,
               diacritic_slips, chars, cpm, accuracy, weak, created_at
          FROM case_game_results
         WHERE user_id = $1
         ORDER BY created_at DESC
         LIMIT $2`, userID, limit)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	out := []CaseGameResult{}
	for rows.Next() {
		var r CaseGameResult
		var weak []byte
		if err := rows.Scan(&r.ID, &r.Scope, &r.LimitSeconds, &r.ElapsedSeconds, &r.Words, &r.Correct,
			&r.Wrong, &r.DiacriticSlips, &r.Chars, &r.CPM, &r.Accuracy, &weak, &r.CreatedAt); err != nil {
			return nil, err
		}
		if err := json.Unmarshal(weak, &r.Weak); err != nil || r.Weak == nil {
			r.Weak = []CaseGameWeak{}
		}
		out = append(out, r)
	}
	return out, rows.Err()
}
