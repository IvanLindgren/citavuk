package store

import "context"

// ClaimDonationChecks распределяет проверки между экземплярами сервера.
// Только существующие оплаты: не создаёт новых платежей или списаний.
func (s *Store) ClaimDonationChecks(ctx context.Context, limit int) ([]Donation, error) {
	if limit < 1 || limit > 20 {
		limit = 20
	}
	rows, err := s.Pool.Query(ctx, `WITH due AS (
        SELECT id FROM donations
        WHERE status='pending' AND provider_payment_id IS NOT NULL AND provider_payment_id<>''
          AND payment_recheck_after<=now()
        ORDER BY payment_recheck_after,created_at,id
        FOR UPDATE SKIP LOCKED LIMIT $1
    ) UPDATE donations AS d
      SET payment_recheck_after=now()+CASE WHEN d.created_at<now()-interval '1 day'
          THEN interval '1 hour' ELSE interval '2 minutes' END
      FROM due WHERE d.id=due.id RETURNING `+donationColumns, limit)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	var out []Donation
	for rows.Next() {
		d, err := scanDonation(rows)
		if err != nil {
			return nil, err
		}
		out = append(out, *d)
	}
	return out, rows.Err()
}
