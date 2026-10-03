package store

import (
	"context"
	"crypto/sha256"
	"encoding/hex"
	"errors"
	"fmt"
	"strings"
	"time"

	"github.com/citavuk/server/internal/lexicon"
	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
)

// Область исправления перевода.
const (
	FeedbackScopeSentence = "sentence"
	FeedbackScopeForm     = "form"
)

var (
	ErrFeedbackNotFound = errors.New("жалоба на перевод не найдена")
	// ErrFeedbackDecided — решение уже принято: второе нажатие кнопки в Telegram
	// или вкладка админки, открытая до решения из бота.
	ErrFeedbackDecided = errors.New("по жалобе уже принято решение")
)

// TranslationFeedback — жалоба читателя на перевод слова.
type TranslationFeedback struct {
	ID         uuid.UUID  `json:"id"`
	UserEmail  string     `json:"userEmail,omitempty"`
	Source     string     `json:"source"`
	Target     string     `json:"target"`
	Word       string     `json:"word"`
	Sentence   string     `json:"sentence"`
	Start      int        `json:"start"`
	End        int        `json:"end"`
	Shown      string     `json:"shown"`
	Provider   string     `json:"provider"`
	Suggestion string     `json:"suggestion"`
	Comment    string     `json:"comment"`
	Scope      string     `json:"scope"`
	Status     string     `json:"status"`
	Final      string     `json:"final,omitempty"`
	CreatedAt  time.Time  `json:"createdAt"`
	DecidedAt  *time.Time `json:"decidedAt,omitempty"`

	overrideKey       string
	TelegramMessageID int64 `json:"-"`
}

// FeedbackInput — то, что присылает читалка.
type FeedbackInput struct {
	UserID     uuid.UUID
	Source     string
	Target     string
	Word       string
	Sentence   string
	Start      int
	End        int
	Shown      string
	Provider   string
	Suggestion string
	Comment    string
	Scope      string
}

// FeedbackKey — ключ исправления.
//
// Для формы — сама форма без регистра и в латинице: «Тежа» и «teža» одно
// слово. Для предложения — отпечаток текста вместе с границами слова: в одном
// предложении слово может встретиться дважды, и исправлять надо то, что нажали.
func FeedbackKey(scope, word, sentence string, start, end int) string {
	if scope == FeedbackScopeForm {
		return lexicon.Normalize(strings.TrimSpace(word))
	}
	sum := sha256.Sum256(fmt.Appendf(nil, "%s\x00%d:%d", strings.Join(strings.Fields(sentence), " "), start, end))
	return hex.EncodeToString(sum[:])
}

func (s *Store) CreateTranslationFeedback(ctx context.Context, in FeedbackInput) (*TranslationFeedback, error) {
	key := FeedbackKey(in.Scope, in.Word, in.Sentence, in.Start, in.End)
	var id uuid.UUID
	err := s.Pool.QueryRow(ctx, `
        INSERT INTO translation_feedback
            (user_id, source, target, word, sentence, span_start, span_end, shown,
             provider, suggestion, comment, scope, override_key)
        VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)
        RETURNING id`,
		in.UserID, in.Source, in.Target, in.Word, in.Sentence, in.Start, in.End, in.Shown,
		in.Provider, in.Suggestion, in.Comment, in.Scope, key).Scan(&id)
	if err != nil {
		return nil, fmt.Errorf("сохранение жалобы на перевод: %w", err)
	}
	return s.TranslationFeedbackByID(ctx, id)
}

const feedbackColumns = `f.id, coalesce(u.email, ''), f.source, f.target, f.word, f.sentence,
       f.span_start, f.span_end, f.shown, f.provider, f.suggestion, f.comment, f.scope,
       f.status, coalesce(o.translation, ''), f.created_at, f.decided_at, f.override_key,
       coalesce(f.telegram_message_id, 0)`

const feedbackFrom = `
  FROM translation_feedback f
  LEFT JOIN users u ON u.id = f.user_id
  LEFT JOIN translation_overrides o ON o.feedback_id = f.id`

func scanFeedback(row pgx.Row) (*TranslationFeedback, error) {
	var f TranslationFeedback
	err := row.Scan(&f.ID, &f.UserEmail, &f.Source, &f.Target, &f.Word, &f.Sentence,
		&f.Start, &f.End, &f.Shown, &f.Provider, &f.Suggestion, &f.Comment, &f.Scope,
		&f.Status, &f.Final, &f.CreatedAt, &f.DecidedAt, &f.overrideKey, &f.TelegramMessageID)
	if err != nil {
		return nil, err
	}
	return &f, nil
}

func (s *Store) TranslationFeedbackByID(ctx context.Context, id uuid.UUID) (*TranslationFeedback, error) {
	f, err := scanFeedback(s.Pool.QueryRow(ctx, `SELECT `+feedbackColumns+feedbackFrom+` WHERE f.id = $1`, id))
	if errors.Is(err, pgx.ErrNoRows) {
		return nil, ErrFeedbackNotFound
	}
	return f, err
}

// ListTranslationFeedback — жалобы с заданным статусом, новые сверху. Пустой
// статус — все подряд.
func (s *Store) ListTranslationFeedback(ctx context.Context, status string, limit int) ([]TranslationFeedback, error) {
	rows, err := s.Pool.Query(ctx, `SELECT `+feedbackColumns+feedbackFrom+`
        WHERE ($1 = '' OR f.status = $1)
        ORDER BY f.created_at DESC
        LIMIT $2`, status, limit)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	list := []TranslationFeedback{}
	for rows.Next() {
		f, err := scanFeedback(rows)
		if err != nil {
			return nil, err
		}
		list = append(list, *f)
	}
	return list, rows.Err()
}

// DecideTranslationFeedback принимает или отклоняет жалобу.
//
// Принятая жалоба становится исправлением: translation — итоговый перевод,
// а если он пуст, берётся то, что предложил автор. Без перевода принять
// нельзя: «здесь неверно» без верного варианта исправлением не станет.
func (s *Store) DecideTranslationFeedback(ctx context.Context, id, deciderID uuid.UUID, accept bool, translation string) (*TranslationFeedback, error) {
	tx, err := s.Pool.Begin(ctx)
	if err != nil {
		return nil, err
	}
	defer func() { _ = tx.Rollback(ctx) }()

	var status, suggestion, scope, source, target, key string
	err = tx.QueryRow(ctx, `
        SELECT status, suggestion, scope, source, target, override_key
          FROM translation_feedback WHERE id = $1 FOR UPDATE`, id).
		Scan(&status, &suggestion, &scope, &source, &target, &key)
	if errors.Is(err, pgx.ErrNoRows) {
		return nil, ErrFeedbackNotFound
	}
	if err != nil {
		return nil, err
	}
	if status != "pending" {
		return nil, ErrFeedbackDecided
	}

	next := "rejected"
	if accept {
		translation = strings.TrimSpace(translation)
		if translation == "" {
			translation = strings.TrimSpace(suggestion)
		}
		if translation == "" {
			return nil, fmt.Errorf("не указан верный перевод")
		}
		if _, err := tx.Exec(ctx, `
            INSERT INTO translation_overrides (scope, source, target, key, translation, feedback_id, author_id)
            VALUES ($1,$2,$3,$4,$5,$6,$7)
            ON CONFLICT (scope, source, target, key) DO UPDATE SET
                translation = EXCLUDED.translation, feedback_id = EXCLUDED.feedback_id,
                author_id = EXCLUDED.author_id, updated_at = now()`,
			scope, source, target, key, translation, id, nullUUID(deciderID)); err != nil {
			return nil, fmt.Errorf("сохранение исправления: %w", err)
		}
		next = "accepted"
	}
	if _, err := tx.Exec(ctx, `
        UPDATE translation_feedback SET status = $2, decided_by = $3, decided_at = now()
         WHERE id = $1`, id, next, nullUUID(deciderID)); err != nil {
		return nil, err
	}
	if err := tx.Commit(ctx); err != nil {
		return nil, err
	}
	return s.TranslationFeedbackByID(ctx, id)
}

// nullUUID — пустой автор решения: из Telegram решают без аккаунта Читавука.
func nullUUID(id uuid.UUID) *uuid.UUID {
	if id == uuid.Nil {
		return nil
	}
	return &id
}

func (s *Store) SetFeedbackTelegramMessage(ctx context.Context, id uuid.UUID, messageID int64) error {
	_, err := s.Pool.Exec(ctx, `UPDATE translation_feedback SET telegram_message_id = $2 WHERE id = $1`, id, messageID)
	return err
}

// TranslationOverride ищет исправление: сначала для этого предложения, потом
// для формы слова. Исправление в предложении точнее и потому главнее.
func (s *Store) TranslationOverride(ctx context.Context, source, target, word, sentence string, start, end int) (string, bool, error) {
	var translation string
	err := s.Pool.QueryRow(ctx, `
        SELECT translation FROM translation_overrides
         WHERE source = $1 AND target = $2
           AND ((scope = 'sentence' AND key = $3) OR (scope = 'form' AND key = $4))
         ORDER BY scope = 'sentence' DESC
         LIMIT 1`,
		source, target,
		FeedbackKey(FeedbackScopeSentence, word, sentence, start, end),
		FeedbackKey(FeedbackScopeForm, word, sentence, start, end)).Scan(&translation)
	if errors.Is(err, pgx.ErrNoRows) {
		return "", false, nil
	}
	if err != nil {
		return "", false, err
	}
	return translation, true, nil
}

// TranslationEditor — тот, чьи исправления применяются сразу.
type TranslationEditor struct {
	UserID      uuid.UUID `json:"userId"`
	Email       string    `json:"email"`
	DisplayName string    `json:"displayName"`
	GrantedAt   time.Time `json:"grantedAt"`
}

func (s *Store) IsTranslationEditor(ctx context.Context, userID uuid.UUID) (bool, error) {
	var ok bool
	err := s.Pool.QueryRow(ctx, `SELECT EXISTS (SELECT 1 FROM translation_editors WHERE user_id = $1)`, userID).Scan(&ok)
	return ok, err
}

func (s *Store) SetTranslationEditor(ctx context.Context, userID, grantedBy uuid.UUID, on bool) error {
	if !on {
		_, err := s.Pool.Exec(ctx, `DELETE FROM translation_editors WHERE user_id = $1`, userID)
		return err
	}
	_, err := s.Pool.Exec(ctx, `
        INSERT INTO translation_editors (user_id, granted_by) VALUES ($1, $2)
        ON CONFLICT (user_id) DO NOTHING`, userID, nullUUID(grantedBy))
	return err
}

func (s *Store) ListTranslationEditors(ctx context.Context) ([]TranslationEditor, error) {
	rows, err := s.Pool.Query(ctx, `
        SELECT e.user_id, u.email, u.display_name, e.granted_at
          FROM translation_editors e JOIN users u ON u.id = e.user_id
         ORDER BY e.granted_at DESC`)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	list := []TranslationEditor{}
	for rows.Next() {
		var e TranslationEditor
		if err := rows.Scan(&e.UserID, &e.Email, &e.DisplayName, &e.GrantedAt); err != nil {
			return nil, err
		}
		list = append(list, e)
	}
	return list, rows.Err()
}
