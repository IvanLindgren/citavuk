package store

import (
	"context"
	"errors"
	"time"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
)

var ErrGuestDonationProof = errors.New("подтверждение гостевой оплаты не найдено или истекло")
var ErrGuestDonationEmail = errors.New("нужен аккаунт с подтверждённой почтой, на которую пришла ссылка")

type GuestDonation struct {
	ID               uuid.UUID `json:"id"`
	Status           string    `json:"status"`
	AmountKopecks    int64     `json:"amountKopecks"`
	HasRecoveryEmail bool      `json:"hasRecoveryEmail"`
	EmailSent        bool      `json:"emailSent"`
}

func (s *Store) RegisterGuestDonation(ctx context.Context, id uuid.UUID, hash []byte, email string) error {
	tag, err := s.Pool.Exec(ctx, `INSERT INTO donation_guest_ownership(donation_id,browser_hash,recovery_email)
      SELECT id,$2,$3 FROM donations WHERE id=$1 AND user_id IS NULL`, id, hash, NormalizeEmail(email))
	if err == nil && tag.RowsAffected() != 1 {
		return ErrGuestDonationProof
	}
	return err
}

func (s *Store) OwnedGuestDonations(ctx context.Context, hash []byte) ([]GuestDonation, error) {
	rows, err := s.Pool.Query(ctx, `SELECT d.id,d.status,d.amount_kopecks,g.recovery_email<>'',g.email_sent_at IS NOT NULL
      FROM donation_guest_ownership g JOIN donations d ON d.id=g.donation_id
      WHERE g.browser_hash=$1 AND g.claimed_at IS NULL AND g.expires_at>now() AND d.user_id IS NULL AND NOT d.is_test
      ORDER BY d.created_at DESC LIMIT 100`, hash)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	out := []GuestDonation{}
	for rows.Next() {
		var d GuestDonation
		if err := rows.Scan(&d.ID, &d.Status, &d.AmountKopecks, &d.HasRecoveryEmail, &d.EmailSent); err != nil {
			return nil, err
		}
		out = append(out, d)
	}
	return out, rows.Err()
}

// Только исходный браузер может запросить повторное письмо или исправить почту.
func (s *Store) RequestGuestDonationEmail(ctx context.Context, id uuid.UUID, hash []byte, email string) error {
	tag, err := s.Pool.Exec(ctx, `UPDATE donation_guest_ownership g SET recovery_email=CASE WHEN $3='' THEN recovery_email ELSE $3 END,
       email_sent_at=NULL,email_retry_after=now()+interval '5 seconds'
       FROM donations d WHERE g.donation_id=$1 AND g.donation_id=d.id AND g.browser_hash=$2
       AND g.claimed_at IS NULL AND g.expires_at>now() AND d.user_id IS NULL AND d.status='succeeded'
       AND g.email_retry_after<=now() AND (g.recovery_email<>'' OR $3<>'')`, id, hash, NormalizeEmail(email))
	if err == nil && tag.RowsAffected() != 1 {
		return ErrGuestDonationProof
	}
	return err
}

type GuestEmailDelivery struct {
	DonationID uuid.UUID
	Email      string
}

// Аренда не даёт нескольким процессам одновременно рассылать одинаковые письма.
func (s *Store) ClaimGuestDonationEmails(ctx context.Context) ([]GuestEmailDelivery, error) {
	rows, err := s.Pool.Query(ctx, `WITH due AS (
       SELECT g.donation_id FROM donation_guest_ownership g JOIN donations d ON d.id=g.donation_id
       WHERE g.claimed_at IS NULL AND g.expires_at>now() AND g.email_sent_at IS NULL
       AND g.recovery_email<>'' AND g.email_retry_after<=now() AND d.user_id IS NULL
       AND d.status='succeeded' AND NOT d.is_test
       ORDER BY d.paid_at,g.donation_id FOR UPDATE OF g SKIP LOCKED LIMIT 10
      ) UPDATE donation_guest_ownership g SET email_retry_after=now()+interval '5 minutes'
        FROM due WHERE g.donation_id=due.donation_id RETURNING g.donation_id,g.recovery_email`)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	out := []GuestEmailDelivery{}
	for rows.Next() {
		var d GuestEmailDelivery
		if err := rows.Scan(&d.DonationID, &d.Email); err != nil {
			return nil, err
		}
		out = append(out, d)
	}
	return out, rows.Err()
}

func (s *Store) AddGuestDonationLink(ctx context.Context, id uuid.UUID, hash []byte, email string) error {
	tag, err := s.Pool.Exec(ctx, `INSERT INTO donation_guest_claim_links(token_hash,donation_id,expires_at)
      SELECT $2,g.donation_id,least(g.expires_at,now()+interval '3 days') FROM donation_guest_ownership g
      JOIN donations d ON d.id=g.donation_id WHERE g.donation_id=$1 AND g.recovery_email=$3
      AND g.claimed_at IS NULL AND g.expires_at>now() AND d.user_id IS NULL AND d.status='succeeded'`, id, hash, email)
	if err == nil && tag.RowsAffected() != 1 {
		return ErrGuestDonationProof
	}
	return err
}

func (s *Store) MarkGuestDonationEmailSent(ctx context.Context, id uuid.UUID, email string) error {
	_, err := s.Pool.Exec(ctx, `UPDATE donation_guest_ownership SET email_sent_at=now(),email_retry_after=now()+interval '2 minutes'
      WHERE donation_id=$1 AND recovery_email=$2 AND claimed_at IS NULL`, id, email)
	return err
}

// Link proof дополнительно требует подтверждённую почту получателя.
// Блокировка и одно обновление исключают двойную выдачу даже при параллельных запросах.
func (s *Store) ClaimGuestDonation(ctx context.Context, userID, id uuid.UUID, browserHash, linkHash []byte) (uuid.UUID, error) {
	var claimed uuid.UUID
	err := s.InTx(ctx, func(tx pgx.Tx) error {
		var email string
		var verified bool
		if err := tx.QueryRow(ctx, `SELECT email,email_verified_at IS NOT NULL FROM users WHERE id=$1 FOR NO KEY UPDATE`, userID).Scan(&email, &verified); err != nil {
			return err
		}
		if !verified {
			return ErrGuestDonationEmail
		}
		var recovery, status string
		query := `SELECT g.donation_id,g.recovery_email,d.status FROM donation_guest_ownership g JOIN donations d ON d.id=g.donation_id
           WHERE g.claimed_at IS NULL AND g.expires_at>now() AND d.user_id IS NULL AND NOT d.is_test `
		var args []any
		if len(linkHash) == 32 {
			query += `AND EXISTS(SELECT 1 FROM donation_guest_claim_links l WHERE l.donation_id=g.donation_id AND l.token_hash=$1 AND l.expires_at>now()) `
			args = []any{linkHash}
		} else {
			if id == uuid.Nil || len(browserHash) != 32 {
				return ErrGuestDonationProof
			}
			query += `AND g.donation_id=$1 AND g.browser_hash=$2 `
			args = []any{id, browserHash}
		}
		query += `FOR UPDATE OF g,d`
		if err := tx.QueryRow(ctx, query, args...).Scan(&claimed, &recovery, &status); err != nil {
			if errors.Is(err, pgx.ErrNoRows) {
				return ErrGuestDonationProof
			}
			return err
		}
		if status != "succeeded" {
			return ErrGuestDonationProof
		}
		if len(linkHash) == 32 && NormalizeEmail(email) != recovery {
			return ErrGuestDonationEmail
		}
		if _, err := tx.Exec(ctx, `UPDATE donations SET user_id=$2 WHERE id=$1 AND user_id IS NULL`, claimed, userID); err != nil {
			return err
		}
		if _, err := tx.Exec(ctx, `UPDATE donation_guest_ownership SET claimed_at=now(),recovery_email='' WHERE donation_id=$1`, claimed); err != nil {
			return err
		}
		if _, err := tx.Exec(ctx, `DELETE FROM donation_guest_claim_links WHERE donation_id=$1`, claimed); err != nil {
			return err
		}
		if err := refreshSupporter(ctx, tx, userID); err != nil {
			return err
		}
		_, err := tx.Exec(ctx, `INSERT INTO user_notifications(id,user_id,kind,title,body,target_url)
          VALUES($1,$2,'support','Поддержка привязана к аккаунту','Спасибо за поддержку Читавука, твой платёж теперь учитывается в профиле','/account')`, uuid.New(), userID)
		return err
	})
	return claimed, err
}

// Не используемые подтверждения удаляются после истечения срока, сами оплаты остаются.
func (s *Store) PurgeGuestDonationLinks(ctx context.Context) error {
	_, err := s.Pool.Exec(ctx, `WITH expired AS (
        DELETE FROM donation_guest_ownership WHERE expires_at<$1
      ) DELETE FROM donation_guest_claim_links WHERE expires_at<$1`, time.Now())
	return err
}
