package store

import (
	"context"
	"errors"
	"fmt"
	"strings"
	"time"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgconn"
)

// Ошибки уровня хранилища.
var (
	ErrEmailTaken   = errors.New("аккаунт с такой почтой уже существует")
	ErrUserNotFound = errors.New("пользователь не найден")
	ErrNoPassword   = errors.New("у аккаунта нет пароля")
)

// pgUniqueViolation — код SQLSTATE нарушения уникального индекса.
const pgUniqueViolation = "23505"

// User — учётная запись.
type User struct {
	ID            uuid.UUID
	Email         string
	PasswordHash  string // пусто, если вход только через провайдера
	DisplayName   string
	SyncRev       int64
	IsAdmin       bool
	EmailVerified bool
	CreatedAt     time.Time
}

// NormalizeEmail приводит почту к каноническому виду для сравнения.
//
// Регистр домена и локальной части не различается всеми практически значимыми
// почтовыми провайдерами, а пользователь легко вводит адрес то так, то иначе.
// Без нормализации он завёл бы два аккаунта на одну почту.
func NormalizeEmail(email string) string {
	return strings.ToLower(strings.TrimSpace(email))
}

// ValidateEmail выполняет минимальную структурную проверку.
//
// Это намеренно не полная проверка по RFC 5322: единственный настоящий способ
// узнать, что адрес существует, — отправить на него письмо. Задача проверки —
// отсечь явные опечатки, а не выступать оракулом валидности.
func ValidateEmail(email string) error {
	if email == "" {
		return errors.New("почта не указана")
	}
	if len(email) > 254 {
		return errors.New("адрес почты слишком длинный")
	}
	local, domain, ok := strings.Cut(email, "@")
	if !ok || local == "" || domain == "" {
		return errors.New("адрес почты должен содержать «@»")
	}
	if strings.Contains(domain, "@") || !strings.Contains(domain, ".") {
		return errors.New("некорректный домен в адресе почты")
	}
	if strings.ContainsAny(email, " \t\r\n") {
		return errors.New("адрес почты содержит пробелы")
	}
	return nil
}

// CreateUser заводит аккаунт. passwordHash может быть пустым для входа только
// через внешнего провайдера.
func (s *Store) CreateUser(
	ctx context.Context,
	email, passwordHash, displayName string,
	emailVerified bool,
) (*User, error) {
	email = NormalizeEmail(email)
	if err := ValidateEmail(email); err != nil {
		return nil, err
	}

	u := &User{
		ID:            uuid.New(),
		Email:         email,
		PasswordHash:  passwordHash,
		DisplayName:   strings.TrimSpace(displayName),
		EmailVerified: emailVerified,
	}
	var hash any
	if passwordHash != "" {
		hash = passwordHash
	}

	err := s.Pool.QueryRow(ctx, `
        INSERT INTO users (id, email, password_hash, display_name, email_verified_at)
        VALUES ($1, $2, $3, $4, CASE WHEN $5 THEN now() END)
        RETURNING created_at, sync_rev`,
		u.ID, u.Email, hash, u.DisplayName, emailVerified).Scan(&u.CreatedAt, &u.SyncRev)
	if err != nil {
		var pgErr *pgconn.PgError
		if errors.As(err, &pgErr) && pgErr.Code == pgUniqueViolation {
			return nil, ErrEmailTaken
		}
		return nil, fmt.Errorf("создание пользователя: %w", err)
	}
	return u, nil
}

const userColumns = `id, email, coalesce(password_hash, ''), display_name, sync_rev, is_admin, email_verified_at IS NOT NULL, created_at`
const qualifiedUserColumns = `u.id, u.email, coalesce(u.password_hash, ''), u.display_name, u.sync_rev, u.is_admin, u.email_verified_at IS NOT NULL, u.created_at`

func scanUser(row pgx.Row) (*User, error) {
	var u User
	err := row.Scan(
		&u.ID,
		&u.Email,
		&u.PasswordHash,
		&u.DisplayName,
		&u.SyncRev,
		&u.IsAdmin,
		&u.EmailVerified,
		&u.CreatedAt,
	)
	if errors.Is(err, pgx.ErrNoRows) {
		return nil, ErrUserNotFound
	}
	if err != nil {
		return nil, err
	}
	return &u, nil
}

// MarkEmailVerified подтверждает адрес, доказанный внешним провайдером.
func (s *Store) MarkEmailVerified(ctx context.Context, id uuid.UUID) error {
	tag, err := s.Pool.Exec(ctx, `
        UPDATE users
           SET email_verified_at = coalesce(email_verified_at, now()),
               updated_at = now()
         WHERE id = $1`,
		id,
	)
	if err != nil {
		return err
	}
	if tag.RowsAffected() == 0 {
		return ErrUserNotFound
	}
	return nil
}

// DeleteUnverifiedUser убирает незавершённую регистрацию, если письмо не
// удалось отправить. Подтверждённый аккаунт этот запрос удалить не может.
func (s *Store) DeleteUnverifiedUser(ctx context.Context, id uuid.UUID) error {
	_, err := s.Pool.Exec(ctx,
		`DELETE FROM users WHERE id = $1 AND email_verified_at IS NULL`, id)
	return err
}

// PurgeUnverifiedUsers удаляет аккаунты, владельцы которых не подтвердили
// почту за отведённое время и ни разу не вошли. Книги, словарь и прочие
// данные уходят каскадом по внешним ключам, но у такого аккаунта их и быть
// не могло: без подтверждения сессия не выдаётся.
func (s *Store) PurgeUnverifiedUsers(ctx context.Context, olderThan time.Duration) (int64, error) {
	if olderThan <= 0 {
		olderThan = 7 * 24 * time.Hour
	}
	tag, err := s.Pool.Exec(ctx, `
        DELETE FROM users
         WHERE email_verified_at IS NULL
           AND created_at < now() - ($1 * interval '1 second')
           AND NOT EXISTS (SELECT 1 FROM sessions
                            WHERE sessions.user_id = users.id
                              AND sessions.expires_at > now())`,
		int64(olderThan/time.Second),
	)
	if err != nil {
		return 0, err
	}
	return tag.RowsAffected(), nil
}

// DeleteUser удаляет аккаунт со всеми данными.
//
// Книги, словарь, повторения, прогресс курса и сессии уходят каскадом по
// внешним ключам — отдельного вычищения не требуется.
func (s *Store) DeleteUser(ctx context.Context, id uuid.UUID) error {
	tag, err := s.Pool.Exec(ctx, `DELETE FROM users WHERE id = $1`, id)
	if err != nil {
		return err
	}
	if tag.RowsAffected() == 0 {
		return ErrUserNotFound
	}
	return nil
}

// ConfigureAdmins повышает перечисленные аккаунты до администратора.
//
// Роль намеренно не снимается у остальных адресов: временно пустая переменная
// окружения при выкладке не должна закрыть владельцу доступ к панели.
func (s *Store) ConfigureAdmins(ctx context.Context, emails []string) (int64, error) {
	normalized := make([]string, 0, len(emails))
	for _, email := range emails {
		if value := NormalizeEmail(email); value != "" {
			normalized = append(normalized, value)
		}
	}
	if len(normalized) == 0 {
		return 0, nil
	}
	tag, err := s.Pool.Exec(ctx, `
        UPDATE users
           SET is_admin = true, updated_at = now()
         WHERE email = ANY($1) AND NOT is_admin`,
		normalized,
	)
	if err != nil {
		return 0, err
	}
	return tag.RowsAffected(), nil
}

// UserByEmail ищет аккаунт по нормализованной почте.
func (s *Store) UserByEmail(ctx context.Context, email string) (*User, error) {
	return scanUser(s.Pool.QueryRow(ctx,
		`SELECT `+userColumns+` FROM users WHERE email = $1`, NormalizeEmail(email)))
}

// UserByID ищет аккаунт по идентификатору.
func (s *Store) UserByID(ctx context.Context, id uuid.UUID) (*User, error) {
	return scanUser(s.Pool.QueryRow(ctx,
		`SELECT `+userColumns+` FROM users WHERE id = $1`, id))
}

// SetPasswordHash задаёт или меняет пароль.
func (s *Store) SetPasswordHash(ctx context.Context, id uuid.UUID, hash string) error {
	tag, err := s.Pool.Exec(ctx,
		`UPDATE users SET password_hash = $2, updated_at = now() WHERE id = $1`, id, hash)
	if err != nil {
		return err
	}
	if tag.RowsAffected() == 0 {
		return ErrUserNotFound
	}
	return nil
}

// SetDisplayName меняет отображаемое имя.
func (s *Store) SetDisplayName(ctx context.Context, id uuid.UUID, name string) error {
	tag, err := s.Pool.Exec(ctx,
		`UPDATE users SET display_name = $2, updated_at = now() WHERE id = $1`,
		id, strings.TrimSpace(name))
	if err != nil {
		return err
	}
	if tag.RowsAffected() == 0 {
		return ErrUserNotFound
	}
	return nil
}

// UserByIdentity ищет аккаунт по внешнему провайдеру входа.
func (s *Store) UserByIdentity(ctx context.Context, provider, providerUID string) (*User, error) {
	return scanUser(s.Pool.QueryRow(ctx, `
        SELECT `+qualifiedUserColumns+` FROM users u
        JOIN identities i ON i.user_id = u.id
        WHERE i.provider = $1 AND i.provider_uid = $2`, provider, providerUID))
}

// LinkIdentity привязывает внешний аккаунт к пользователю.
//
// Повторная привязка того же провайдера к тому же пользователю не считается
// ошибкой: пользователь может входить через Google многократно.
func (s *Store) LinkIdentity(ctx context.Context, userID uuid.UUID, provider, providerUID, email string) error {
	_, err := s.Pool.Exec(ctx, `
        INSERT INTO identities (provider, provider_uid, user_id, email)
        VALUES ($1, $2, $3, $4)
        ON CONFLICT (provider, provider_uid)
        DO UPDATE SET email = EXCLUDED.email
        WHERE identities.user_id = EXCLUDED.user_id`,
		provider, providerUID, userID, NormalizeEmail(email))
	return err
}

// Session — активная сессия устройства.
type Session struct {
	UserID     uuid.UUID
	DeviceID   string
	DeviceName string
	Platform   string
	CreatedAt  time.Time
	LastSeenAt time.Time
	ExpiresAt  time.Time
}

// CreateSession сохраняет хеш выданного токена.
//
// Срок жизни считается часами самой базы, а не Go: часы сервера приложения и
// сервера БД расходятся, и сессия, «протухшая» по одним часам и живая по
// другим, давала бы плавающие разлогины.
func (s *Store) CreateSession(ctx context.Context, userID uuid.UUID, tokenHash []byte,
	deviceID, deviceName, platform string, ttlDays int) (time.Time, error) {

	if ttlDays <= 0 {
		ttlDays = 1
	}
	var expires time.Time
	err := s.Pool.QueryRow(ctx, `
        INSERT INTO sessions (token_hash, user_id, device_id, device_name, platform, expires_at)
        VALUES ($1, $2, $3, $4, $5, now() + make_interval(days => $6))
        RETURNING expires_at`,
		tokenHash, userID, trunc(deviceID, 128), trunc(deviceName, 128), trunc(platform, 32), ttlDays).
		Scan(&expires)
	if err != nil {
		return time.Time{}, fmt.Errorf("создание сессии: %w", err)
	}
	return expires, nil
}

// SessionUser находит пользователя по хешу токена и продлевает сессию.
//
// Просроченные сессии не находятся. Продление скользящее, но выполняется не
// чаще раза в час: иначе каждый запрос синхронизации писал бы в базу ради поля,
// точность которого никому не нужна.
func (s *Store) SessionUser(ctx context.Context, tokenHash []byte, ttlDays int) (*User, error) {
	if ttlDays <= 0 {
		ttlDays = 1
	}
	// CTE вместо RETURNING-подзапроса: UPDATE и чтение пользователя выполняются
	// одним запросом, но колонки приходят обычным плоским набором, а не
	// композитным типом.
	return scanUser(s.Pool.QueryRow(ctx, `
        WITH touched AS (
            UPDATE sessions
               SET last_seen_at = now(),
                   expires_at   = CASE WHEN last_seen_at < now() - interval '1 hour'
                                       THEN now() + make_interval(days => $2)
                                       ELSE expires_at END
             WHERE token_hash = $1 AND expires_at > now()
            RETURNING user_id
        )
        SELECT `+userColumns+`
          FROM users
          JOIN touched ON touched.user_id = users.id`,
		tokenHash, ttlDays))
}

// DeleteSession завершает конкретную сессию (выход на одном устройстве).
func (s *Store) DeleteSession(ctx context.Context, tokenHash []byte) error {
	_, err := s.Pool.Exec(ctx, `DELETE FROM sessions WHERE token_hash = $1`, tokenHash)
	return err
}

// DeleteUserSessions завершает все сессии пользователя. Вызывается при смене
// пароля: сменивший пароль ожидает, что чужие устройства потеряют доступ.
func (s *Store) DeleteUserSessions(ctx context.Context, userID uuid.UUID) error {
	_, err := s.Pool.Exec(ctx, `DELETE FROM sessions WHERE user_id = $1`, userID)
	return err
}

// PurgeExpiredSessions удаляет протухшие сессии.
func (s *Store) PurgeExpiredSessions(ctx context.Context) (int64, error) {
	tag, err := s.Pool.Exec(ctx, `DELETE FROM sessions WHERE expires_at < now()`)
	if err != nil {
		return 0, err
	}
	return tag.RowsAffected(), nil
}

// trunc обрезает строку по границе рун. Резать по байтам нельзя: имя устройства
// вроде «Ноутбук Дениса» приходит в UTF-8, и обрыв посередине символа даст
// невалидную строку, которую PostgreSQL отвергнет целиком.
func trunc(s string, maxRunes int) string {
	runes := []rune(s)
	if len(runes) <= maxRunes {
		return s
	}
	return string(runes[:maxRunes])
}
