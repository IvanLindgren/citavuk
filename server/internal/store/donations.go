package store

import (
	"context"
	"errors"
	"fmt"
	"time"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
)

// SupporterThresholdKopecks — с какой суммы оплат аккаунт получает значок и бонусы.
// Суммы складываются по всем платежам; публичное имя доступно при любой поддержке.
const SupporterThresholdKopecks = 200_00

var ErrDonationNotFound = errors.New("donation not found")

type Donation struct {
	ID                uuid.UUID  `json:"id"`
	UserID            *uuid.UUID `json:"userId,omitempty"`
	PublicName        string     `json:"publicName"`
	ShowPublic        bool       `json:"showPublic"`
	ShowAmount        bool       `json:"showAmount"`
	ShowMessage       bool       `json:"showMessage"`
	MessageApproved   bool       `json:"messageApproved"`
	SubscriptionID    *uuid.UUID `json:"subscriptionId,omitempty"`
	Message           string     `json:"message"`
	AmountKopecks     int64      `json:"amountKopecks"`
	Status            string     `json:"status"`
	Source            string     `json:"source"`
	ProviderPaymentID string     `json:"providerPaymentId,omitempty"`
	IsTest            bool       `json:"isTest"`
	CreatedAt         time.Time  `json:"createdAt"`
	PaidAt            *time.Time `json:"paidAt,omitempty"`
	// UserEmail заполняется только в выборке для админки.
	UserEmail string `json:"userEmail,omitempty"`
}

type NewDonation struct {
	UserID        *uuid.UUID
	PublicName    string
	ShowPublic    bool
	Message       string
	AmountKopecks int64
	Source        string
	ShowAmount    bool
	ShowMessage   bool
}

type Supporter struct {
	Name          string    `json:"name"`
	Since         time.Time `json:"since"`
	AmountKopecks int64     `json:"amountKopecks,omitempty"`
}

const donationColumns = `d.id, d.user_id, d.public_name, d.show_public, d.message,
    d.amount_kopecks, d.status, d.source, coalesce(d.provider_payment_id, ''),
    d.is_test, d.created_at, d.paid_at, d.show_amount, d.show_message, d.message_approved, d.subscription_id`

func scanDonation(row pgx.Row, extra ...any) (*Donation, error) {
	var d Donation
	dest := append([]any{&d.ID, &d.UserID, &d.PublicName, &d.ShowPublic, &d.Message,
		&d.AmountKopecks, &d.Status, &d.Source, &d.ProviderPaymentID,
		&d.IsTest, &d.CreatedAt, &d.PaidAt, &d.ShowAmount, &d.ShowMessage, &d.MessageApproved, &d.SubscriptionID}, extra...)
	if err := row.Scan(dest...); err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return nil, ErrDonationNotFound
		}
		return nil, err
	}
	return &d, nil
}

func (s *Store) CreateDonation(ctx context.Context, in NewDonation) (*Donation, error) {
	source := in.Source
	if source == "" {
		source = "yookassa"
	}
	return scanDonation(s.Pool.QueryRow(ctx, `
        INSERT INTO donations AS d (user_id, public_name, show_public, message, amount_kopecks, source, show_amount, show_message)
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
        RETURNING `+donationColumns,
		in.UserID, trunc(in.PublicName, 60), in.ShowPublic, trunc(in.Message, 300),
		in.AmountKopecks, source, in.ShowAmount, in.ShowMessage))
}

func (s *Store) DonationByID(ctx context.Context, id uuid.UUID) (*Donation, error) {
	return scanDonation(s.Pool.QueryRow(ctx,
		`SELECT `+donationColumns+` FROM donations d WHERE d.id = $1`, id))
}

func (s *Store) DonationByPaymentID(ctx context.Context, paymentID string) (*Donation, error) {
	return scanDonation(s.Pool.QueryRow(ctx,
		`SELECT `+donationColumns+` FROM donations d WHERE d.provider_payment_id = $1`, paymentID))
}

// MarkDonationTest помечает платёж тестового магазина.
func (s *Store) MarkDonationTest(ctx context.Context, id uuid.UUID) error {
	_, err := s.Pool.Exec(ctx, `UPDATE donations SET is_test = true WHERE id = $1`, id)
	return err
}

func (s *Store) SetDonationPaymentID(ctx context.Context, id uuid.UUID, paymentID string) error {
	_, err := s.Pool.Exec(ctx,
		`UPDATE donations SET provider_payment_id = $2 WHERE id = $1`, id, paymentID)
	return err
}

// SetDonationStatus переводит платёж в новое состояние и пересчитывает значок
// владельца. Повторное уведомление с тем же статусом ничего не меняет.
func (s *Store) SetDonationStatus(
	ctx context.Context, id uuid.UUID, status string, paidAt *time.Time,
) (*Donation, error) {
	tx, err := s.Pool.Begin(ctx)
	if err != nil {
		return nil, err
	}
	defer tx.Rollback(ctx)

	d, err := scanDonation(tx.QueryRow(ctx, `
        UPDATE donations AS d
           SET status = $2,
               paid_at = coalesce(d.paid_at, $3)
         WHERE d.id = $1
        RETURNING `+donationColumns, id, status, paidAt))
	if err != nil {
		return nil, err
	}
	if d.UserID != nil {
		if err := refreshSupporter(ctx, tx, *d.UserID); err != nil {
			return nil, err
		}
	}
	return d, tx.Commit(ctx)
}

func refreshSupporter(ctx context.Context, tx pgx.Tx, userID uuid.UUID) error {
	// Webhook и резервная сверка могут одновременно подтвердить разные оплаты
	// одного аккаунта. Сумму читаем отдельным запросом после получения блокировки,
	// иначе ожидающий UPDATE может записать результат устаревшего снимка.
	if _, err := tx.Exec(ctx, `SELECT id FROM users WHERE id=$1 FOR NO KEY UPDATE`, userID); err != nil {
		return err
	}
	// Дата значка — момент, когда накопленная сумма впервые перешла порог.
	_, err := tx.Exec(ctx, `
        WITH paid AS (
            SELECT paid_at,
                   sum(amount_kopecks) OVER (ORDER BY paid_at, id) AS running
              FROM donations
             WHERE user_id = $1 AND status = 'succeeded'
        )
        UPDATE users
           SET supporter_since = (SELECT min(paid_at) FROM paid WHERE running >= $2)
         WHERE id = $1`, userID, SupporterThresholdKopecks)
	if err != nil {
		return fmt.Errorf("пересчёт значка поддержавшего: %w", err)
	}
	return nil
}

// UserDonationTotal — сумма оплаченной поддержки аккаунта в копейках.
func (s *Store) UserDonationTotal(ctx context.Context, userID uuid.UUID) (int64, error) {
	var total int64
	err := s.Pool.QueryRow(ctx, `
        SELECT coalesce(sum(amount_kopecks), 0)::bigint
          FROM donations
         WHERE user_id = $1 AND status = 'succeeded'`, userID).Scan(&total)
	return total, err
}

// Supporters — публичный список: аккаунт показывается один раз под последним
// указанным именем, гостевой платёж — отдельной строкой.
func (s *Store) Supporters(ctx context.Context, limit int) ([]Supporter, error) {
	rows, err := s.Pool.Query(ctx, `
        WITH paid AS (
            SELECT coalesce(user_id::text, id::text) AS who,
                   public_name, show_public, amount_kopecks, paid_at, show_amount
              FROM donations
             WHERE status = 'succeeded' AND NOT is_test
        ), grouped AS (
            SELECT who,
                   sum(amount_kopecks) AS total,
                   coalesce(sum(amount_kopecks) FILTER (WHERE show_public),0)::bigint AS ranking_total,
                   coalesce(sum(amount_kopecks) FILTER (WHERE show_public AND show_amount),0)::bigint AS public_total,
                   min(paid_at) AS since,
                   (array_agg(public_name ORDER BY paid_at DESC)
                       FILTER (WHERE show_public AND public_name <> ''))[1] AS name
              FROM paid
             GROUP BY who
        )
        SELECT name, since, public_total FROM grouped
         WHERE total >= $1 AND name IS NOT NULL
         ORDER BY ranking_total DESC, since, who
         LIMIT $2`, int64(1), limit)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	out := []Supporter{}
	for rows.Next() {
		var sp Supporter
		if err := rows.Scan(&sp.Name, &sp.Since, &sp.AmountKopecks); err != nil {
			return nil, err
		}
		out = append(out, sp)
	}
	return out, rows.Err()
}

// DonationsForMonth — оплаченные и возвращённые платежи месяца по московскому
// времени: по этому списку пробиваются чеки в «Мой налог».
func (s *Store) DonationsForMonth(ctx context.Context, month time.Time) ([]Donation, error) {
	rows, err := s.Pool.Query(ctx, `
        SELECT `+donationColumns+`, coalesce(u.email, '')
          FROM donations d
          LEFT JOIN users u ON u.id = d.user_id
         WHERE d.status IN ('succeeded', 'refunded')
           AND d.paid_at >= $1 AND d.paid_at < $2
         ORDER BY d.paid_at`, month, month.AddDate(0, 1, 0))
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	out := []Donation{}
	for rows.Next() {
		var email string
		d, err := scanDonation(rows, &email)
		if err != nil {
			return nil, err
		}
		d.UserEmail = email
		out = append(out, *d)
	}
	return out, rows.Err()
}
