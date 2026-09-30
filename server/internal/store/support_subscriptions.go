package store

import (
	"context"
	"errors"
	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
	"time"
)

type SupportSubscription struct {
	ID            uuid.UUID  `json:"id"`
	AmountKopecks int64      `json:"amountKopecks"`
	Status        string     `json:"status"`
	NextChargeAt  *time.Time `json:"nextChargeAt,omitempty"`
}

// Следующий месяц сохраняет исходное число, включая 31 января -> 28 февраля -> 31 марта.
func NextMonthlyCharge(at time.Time, day int) time.Time {
	loc := time.FixedZone("Moscow", 3*60*60)
	t := at.In(loc)
	first := time.Date(t.Year(), t.Month()+1, 1, t.Hour(), t.Minute(), t.Second(), 0, loc)
	last := first.AddDate(0, 1, -1).Day()
	if day > last {
		day = last
	}
	if day < 1 {
		day = 1
	}
	return time.Date(first.Year(), first.Month(), day, t.Hour(), t.Minute(), t.Second(), 0, loc)
}

func (s *Store) CreateSupportSubscription(ctx context.Context, d *Donation) error {
	if d.UserID == nil {
		return errors.New("monthly support requires an account")
	}
	return s.InTx(ctx, func(tx pgx.Tx) error {
		var id uuid.UUID
		err := tx.QueryRow(ctx, `INSERT INTO support_subscriptions(user_id,initial_donation_id,amount_kopecks,public_name,show_public,show_amount)
            VALUES($1,$2,$3,$4,$5,$6) RETURNING id`, d.UserID, d.ID, d.AmountKopecks, d.PublicName, d.ShowPublic, d.ShowAmount).Scan(&id)
		if err != nil {
			return err
		}
		_, err = tx.Exec(ctx, `UPDATE donations SET subscription_id=$2 WHERE id=$1`, d.ID, id)
		d.SubscriptionID = &id
		return err
	})
}

func (s *Store) SyncSupportSubscription(ctx context.Context, d *Donation, methodID string, saved bool) error {
	if d.SubscriptionID == nil {
		return nil
	}
	return s.InTx(ctx, func(tx pgx.Tx) error {
		var initial uuid.UUID
		var status string
		var day int
		var next *time.Time
		err := tx.QueryRow(ctx, `SELECT initial_donation_id,status,anchor_day,next_charge_at FROM support_subscriptions WHERE id=$1 FOR UPDATE`, d.SubscriptionID).Scan(&initial, &status, &day, &next)
		if err != nil {
			return err
		}
		if status == "canceled" {
			return nil
		}
		if d.Status == "canceled" || d.Status == "refunded" || (d.ID == initial && d.Status == "succeeded" && (!saved || methodID == "")) {
			_, err = tx.Exec(ctx, `UPDATE support_subscriptions SET status='paused',cycle_donation_id=NULL WHERE id=$1`, d.SubscriptionID)
			return err
		}
		if d.Status != "succeeded" {
			return nil
		}
		if d.ID == initial && next != nil {
			return nil
		} // повторное уведомление
		var cycle *uuid.UUID
		err = tx.QueryRow(ctx, `SELECT cycle_donation_id FROM support_subscriptions WHERE id=$1`, d.SubscriptionID).Scan(&cycle)
		if err != nil {
			return err
		}
		if d.ID != initial && (cycle == nil || *cycle != d.ID) {
			return nil
		}
		at := time.Now()
		if d.PaidAt != nil {
			at = *d.PaidAt
		}
		if d.ID == initial {
			day = at.In(time.FixedZone("Moscow", 10800)).Day()
		} else if next != nil {
			at = *next
		}
		_, err = tx.Exec(ctx, `UPDATE support_subscriptions SET status='active',payment_method_id=coalesce(nullif($2,''),payment_method_id),anchor_day=$3,next_charge_at=$4,cycle_donation_id=NULL WHERE id=$1`, d.SubscriptionID, methodID, day, NextMonthlyCharge(at, day))
		return err
	})
}

func (s *Store) SupportSubscriptions(ctx context.Context, user uuid.UUID) ([]SupportSubscription, error) {
	rows, err := s.Pool.Query(ctx, `SELECT id,amount_kopecks,status,next_charge_at FROM support_subscriptions WHERE user_id=$1 ORDER BY created_at DESC`, user)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	out := []SupportSubscription{}
	for rows.Next() {
		var sub SupportSubscription
		if err := rows.Scan(&sub.ID, &sub.AmountKopecks, &sub.Status, &sub.NextChargeAt); err != nil {
			return nil, err
		}
		out = append(out, sub)
	}
	return out, rows.Err()
}

func (s *Store) CancelSupportSubscription(ctx context.Context, user, id uuid.UUID) error {
	tag, err := s.Pool.Exec(ctx, `UPDATE support_subscriptions SET status='canceled',payment_method_id=NULL,canceled_at=now() WHERE user_id=$1 AND id=$2`, user, id)
	if err == nil && tag.RowsAffected() == 0 {
		return ErrDonationNotFound
	}
	return err
}

// Блокировка сериализует worker, отмену и повторный webhook. При неопределённом
// сетевом результате остаётся тот же donation UUID: новый ключ не создаётся.
func (s *Store) ChargeNextSupportSubscription(ctx context.Context, charge func(*Donation, string) (string, error)) (*Donation, error) {
	tx, err := s.Pool.Begin(ctx)
	if err != nil {
		return nil, err
	}
	defer tx.Rollback(ctx)
	var id, user uuid.UUID
	var method, name string
	var amount int64
	var public, showAmount bool
	var cycle *uuid.UUID
	err = tx.QueryRow(ctx, `SELECT id,user_id,payment_method_id,public_name,amount_kopecks,show_public,show_amount,cycle_donation_id
        FROM support_subscriptions WHERE status='active' AND next_charge_at<=now() AND payment_method_id IS NOT NULL
        ORDER BY next_charge_at FOR UPDATE SKIP LOCKED LIMIT 1`).Scan(&id, &user, &method, &name, &amount, &public, &showAmount, &cycle)
	if errors.Is(err, pgx.ErrNoRows) {
		return nil, nil
	}
	if err != nil {
		return nil, err
	}
	if cycle == nil {
		var donationID uuid.UUID
		err = tx.QueryRow(ctx, `INSERT INTO donations(user_id,public_name,show_public,show_amount,amount_kopecks,subscription_id) VALUES($1,$2,$3,$4,$5,$6) RETURNING id`, user, name, public, showAmount, amount, id).Scan(&donationID)
		if err != nil {
			return nil, err
		}
		cycle = &donationID
		_, err = tx.Exec(ctx, `UPDATE support_subscriptions SET cycle_donation_id=$2 WHERE id=$1`, id, cycle)
		if err != nil {
			return nil, err
		}
		// Сначала сохраняем ключ — даже падение процесса не продублирует списание.
		if err = tx.Commit(ctx); err != nil {
			return nil, err
		}
		return s.ChargeNextSupportSubscription(ctx, charge)
	}
	d, err := scanDonation(tx.QueryRow(ctx, `SELECT `+donationColumns+` FROM donations d WHERE d.id=$1`, cycle))
	if err != nil {
		return nil, err
	}
	if d.ProviderPaymentID == "" && time.Since(d.CreatedAt) > 22*time.Hour {
		// Idempotence-Key ЮKassa действует 24 часа. После окна не рискуем
		// повторить неизвестное списание: требуется ручная сверка.
		_, err = tx.Exec(ctx, `UPDATE support_subscriptions SET status='paused' WHERE id=$1`, id)
		if err != nil {
			return nil, err
		}
		return nil, tx.Commit(ctx)
	}
	if d.ProviderPaymentID == "" {
		paymentID, callErr := charge(d, method)
		if callErr != nil {
			return nil, callErr
		}
		_, err = tx.Exec(ctx, `UPDATE donations SET provider_payment_id=$2 WHERE id=$1`, d.ID, paymentID)
		if err != nil {
			return nil, err
		}
		d.ProviderPaymentID = paymentID
	}
	if err = tx.Commit(ctx); err != nil {
		return nil, err
	}
	return d, nil
}
