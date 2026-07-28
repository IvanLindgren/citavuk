package store

import (
	"context"
	"errors"
	"time"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
)

var ErrAuthTokenInvalid = errors.New("одноразовый токен недействителен или истёк")

// OAuthState — одноразовое состояние начатой авторизации.
type OAuthState struct {
	ReturnTarget string

	// ReturnURL заполняется только для настольных приложений: там возврат идёт
	// на 127.0.0.1 со случайным портом, который заранее неизвестен. Для web и
	// mobile адрес возврата постоянный и берётся из настроек сервера.
	ReturnURL string

	DeviceID       string
	DeviceName     string
	DevicePlatform string
}

// OAuthCompletion — данные для выдачи сессии после callback провайдера.
type OAuthCompletion struct {
	User           *User
	DeviceID       string
	DeviceName     string
	DevicePlatform string
}

// PutEmailVerificationToken заменяет прежнюю ссылку подтверждения новой.
func (s *Store) PutEmailVerificationToken(
	ctx context.Context,
	userID uuid.UUID,
	tokenHash []byte,
	ttl time.Duration,
) error {
	if ttl <= 0 {
		ttl = time.Hour
	}
	_, err := s.Pool.Exec(ctx, `
        INSERT INTO email_verification_tokens (user_id, token_hash, expires_at)
        VALUES ($1, $2, now() + ($3 * interval '1 second'))
        ON CONFLICT (user_id)
        DO UPDATE SET token_hash = EXCLUDED.token_hash,
                      expires_at = EXCLUDED.expires_at,
                      created_at = now()`,
		userID, tokenHash, int64(ttl/time.Second),
	)
	return err
}

// VerifyEmailToken атомарно подтверждает почту и уничтожает все ссылки
// пользователя. Повторное использование того же URL невозможно.
func (s *Store) VerifyEmailToken(ctx context.Context, tokenHash []byte) (*User, error) {
	var user *User
	err := s.InTx(ctx, func(tx pgx.Tx) error {
		var userID uuid.UUID
		err := tx.QueryRow(ctx, `
            SELECT user_id
              FROM email_verification_tokens
             WHERE token_hash = $1 AND expires_at > now()
             FOR UPDATE`,
			tokenHash,
		).Scan(&userID)
		if errors.Is(err, pgx.ErrNoRows) {
			return ErrAuthTokenInvalid
		}
		if err != nil {
			return err
		}

		if _, err := tx.Exec(ctx, `
            UPDATE users
               SET email_verified_at = coalesce(email_verified_at, now()),
                   updated_at = now()
             WHERE id = $1`,
			userID,
		); err != nil {
			return err
		}
		if _, err := tx.Exec(ctx,
			`DELETE FROM email_verification_tokens WHERE user_id = $1`,
			userID,
		); err != nil {
			return err
		}

		user, err = scanUser(tx.QueryRow(ctx,
			`SELECT `+userColumns+` FROM users WHERE id = $1`, userID))
		return err
	})
	return user, err
}

// PutOAuthState сохраняет CSRF-state перед переходом к провайдеру.
func (s *Store) PutOAuthState(
	ctx context.Context,
	tokenHash []byte,
	provider string,
	state OAuthState,
	ttl time.Duration,
) error {
	if ttl <= 0 {
		ttl = 10 * time.Minute
	}
	_, err := s.Pool.Exec(ctx, `
        INSERT INTO oauth_states (
            token_hash, provider, return_target, return_url,
            device_id, device_name, device_platform, expires_at
        )
        VALUES ($1, $2, $3, $4, $5, $6, $7, now() + ($8 * interval '1 second'))`,
		tokenHash,
		trunc(provider, 32),
		trunc(state.ReturnTarget, 16),
		trunc(state.ReturnURL, 256),
		trunc(state.DeviceID, 128),
		trunc(state.DeviceName, 128),
		trunc(state.DevicePlatform, 32),
		int64(ttl/time.Second),
	)
	return err
}

// ConsumeOAuthState читает и сразу уничтожает state.
func (s *Store) ConsumeOAuthState(
	ctx context.Context,
	tokenHash []byte,
	provider string,
) (*OAuthState, error) {
	var state OAuthState
	err := s.Pool.QueryRow(ctx, `
        DELETE FROM oauth_states
         WHERE token_hash = $1
           AND provider = $2
           AND expires_at > now()
        RETURNING return_target, return_url, device_id, device_name, device_platform`,
		tokenHash, provider,
	).Scan(
		&state.ReturnTarget,
		&state.ReturnURL,
		&state.DeviceID,
		&state.DeviceName,
		&state.DevicePlatform,
	)
	if errors.Is(err, pgx.ErrNoRows) {
		return nil, ErrAuthTokenInvalid
	}
	if err != nil {
		return nil, err
	}
	return &state, nil
}

// PutOAuthCompletion создаёт короткоживущий код обмена на Citavuk-сессию.
func (s *Store) PutOAuthCompletion(
	ctx context.Context,
	tokenHash []byte,
	userID uuid.UUID,
	state *OAuthState,
	ttl time.Duration,
) error {
	if ttl <= 0 {
		ttl = 5 * time.Minute
	}
	_, err := s.Pool.Exec(ctx, `
        INSERT INTO oauth_completions (
            token_hash, user_id, device_id, device_name, device_platform, expires_at
        )
        VALUES ($1, $2, $3, $4, $5, now() + ($6 * interval '1 second'))`,
		tokenHash,
		userID,
		trunc(state.DeviceID, 128),
		trunc(state.DeviceName, 128),
		trunc(state.DevicePlatform, 32),
		int64(ttl/time.Second),
	)
	return err
}

// ConsumeOAuthCompletion возвращает пользователя и уничтожает код.
func (s *Store) ConsumeOAuthCompletion(
	ctx context.Context,
	tokenHash []byte,
) (*OAuthCompletion, error) {
	var userID uuid.UUID
	var out OAuthCompletion
	err := s.Pool.QueryRow(ctx, `
        DELETE FROM oauth_completions
         WHERE token_hash = $1 AND expires_at > now()
        RETURNING user_id, device_id, device_name, device_platform`,
		tokenHash,
	).Scan(
		&userID,
		&out.DeviceID,
		&out.DeviceName,
		&out.DevicePlatform,
	)
	if errors.Is(err, pgx.ErrNoRows) {
		return nil, ErrAuthTokenInvalid
	}
	if err != nil {
		return nil, err
	}

	out.User, err = s.UserByID(ctx, userID)
	if err != nil {
		return nil, err
	}
	return &out, nil
}

// PurgeExpiredAuthTokens ограничивает рост служебных таблиц.
func (s *Store) PurgeExpiredAuthTokens(ctx context.Context) (int64, error) {
	var total int64
	for _, table := range []string{
		"email_verification_tokens",
		"oauth_states",
		"oauth_completions",
	} {
		tag, err := s.Pool.Exec(ctx, `DELETE FROM `+table+` WHERE expires_at < now()`)
		if err != nil {
			return total, err
		}
		total += tag.RowsAffected()
	}
	return total, nil
}
