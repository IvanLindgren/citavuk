package store

import (
	"context"
	"encoding/json"
	"errors"
	"time"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
)

// ErrQuizNotFound — теста с таким адресом нет.
var ErrQuizNotFound = errors.New("тест не найден")

// Quiz — тест вместе с вопросами.
type Quiz struct {
	ID        uuid.UUID       `json:"id"`
	SourceSHA string          `json:"sourceSha"`
	Title     string          `json:"title"`
	Subject   string          `json:"subject"`
	Excerpt   string          `json:"excerpt"`
	Questions json.RawMessage `json:"questions"`
	AuthorID  *uuid.UUID      `json:"-"`
	CreatedAt time.Time       `json:"createdAt"`
}

// QuizSummary — строка общего списка тестов.
type QuizSummary struct {
	ID        uuid.UUID `json:"id"`
	Title     string    `json:"title"`
	Subject   string    `json:"subject"`
	Excerpt   string    `json:"excerpt"`
	Questions int       `json:"questions"`
	CreatedAt time.Time `json:"createdAt"`
	Mine      bool      `json:"mine"`
	// Attempts и BestScore — по текущему пользователю, а не по всем: в списке
	// человек ищет «что я уже решал», а не общую популярность.
	Attempts  int        `json:"attempts"`
	BestScore int        `json:"bestScore"`
	LastTried *time.Time `json:"lastTried,omitempty"`
}

// QuizAttempt — одна попытка.
type QuizAttempt struct {
	QuizID    uuid.UUID `json:"quizId"`
	Title     string    `json:"title"`
	Correct   int       `json:"correct"`
	Total     int       `json:"total"`
	Wrong     []int     `json:"wrong"`
	CreatedAt time.Time `json:"createdAt"`
}

// FindQuizBySource ищет готовый тест по адресу материала.
func (s *Store) FindQuizBySource(ctx context.Context, sha string) (*Quiz, error) {
	return s.scanQuiz(ctx, `
        SELECT id, source_sha, title, subject, excerpt, questions, author_id, created_at
          FROM quizzes WHERE source_sha = $1`, sha)
}

// GetQuiz читает тест по идентификатору.
func (s *Store) GetQuiz(ctx context.Context, id uuid.UUID) (*Quiz, error) {
	return s.scanQuiz(ctx, `
        SELECT id, source_sha, title, subject, excerpt, questions, author_id, created_at
          FROM quizzes WHERE id = $1`, id)
}

func (s *Store) scanQuiz(ctx context.Context, query string, arg any) (*Quiz, error) {
	var quiz Quiz
	var questions []byte
	err := s.Pool.QueryRow(ctx, query, arg).Scan(
		&quiz.ID, &quiz.SourceSHA, &quiz.Title, &quiz.Subject,
		&quiz.Excerpt, &questions, &quiz.AuthorID, &quiz.CreatedAt,
	)
	if errors.Is(err, pgx.ErrNoRows) {
		return nil, ErrQuizNotFound
	}
	if err != nil {
		return nil, err
	}
	quiz.Questions = questions
	return &quiz, nil
}

// SaveQuiz сохраняет тест.
//
// Гонка двух человек с одним конспектом разрешается адресом материала: второй
// получает уже сохранённый тест, а не дубль. Модель к этому моменту отработала
// дважды — этого не избежать, зато в базе останется одна запись.
func (s *Store) SaveQuiz(
	ctx context.Context,
	sha, title, subject, excerpt string,
	questions json.RawMessage,
	authorID uuid.UUID,
) (*Quiz, error) {
	id := uuid.New()
	var created time.Time
	err := s.Pool.QueryRow(ctx, `
        INSERT INTO quizzes (id, source_sha, title, subject, excerpt, questions, author_id)
        VALUES ($1, $2, $3, $4, $5, $6, $7)
        ON CONFLICT (source_sha) DO NOTHING
        RETURNING id, created_at`,
		id, sha, title, subject, excerpt, []byte(questions), authorID,
	).Scan(&id, &created)
	if errors.Is(err, pgx.ErrNoRows) {
		return s.FindQuizBySource(ctx, sha)
	}
	if err != nil {
		return nil, err
	}
	return &Quiz{
		ID: id, SourceSHA: sha, Title: title, Subject: subject,
		Excerpt: excerpt, Questions: questions, AuthorID: &authorID,
		CreatedAt: created,
	}, nil
}

// ListQuizzes отдаёт общий список тестов вместе с успехами пользователя.
func (s *Store) ListQuizzes(
	ctx context.Context,
	userID uuid.UUID,
	limit int,
) ([]QuizSummary, error) {
	if limit <= 0 || limit > 200 {
		limit = 60
	}
	rows, err := s.Pool.Query(ctx, `
        SELECT q.id, q.title, q.subject, q.excerpt,
               jsonb_array_length(q.questions),
               q.created_at,
               q.author_id = $1 AS mine,
               count(a.id),
               coalesce(max(CASE WHEN a.total > 0
                                 THEN a.correct * 100 / a.total END), 0),
               max(a.created_at)
          FROM quizzes q
          LEFT JOIN quiz_attempts a ON a.quiz_id = q.id AND a.user_id = $1
         GROUP BY q.id
         ORDER BY max(a.created_at) DESC NULLS LAST, q.created_at DESC
         LIMIT $2`, userID, limit)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	list := make([]QuizSummary, 0, limit)
	for rows.Next() {
		var item QuizSummary
		var mine *bool
		if err := rows.Scan(
			&item.ID, &item.Title, &item.Subject, &item.Excerpt,
			&item.Questions, &item.CreatedAt, &mine,
			&item.Attempts, &item.BestScore, &item.LastTried,
		); err != nil {
			return nil, err
		}
		item.Mine = mine != nil && *mine
		list = append(list, item)
	}
	return list, rows.Err()
}

// SaveAttempt записывает попытку.
func (s *Store) SaveAttempt(
	ctx context.Context,
	quizID, userID uuid.UUID,
	correct, total int,
	wrong []int,
) error {
	if wrong == nil {
		wrong = []int{}
	}
	payload, err := json.Marshal(wrong)
	if err != nil {
		return err
	}
	_, err = s.Pool.Exec(ctx, `
        INSERT INTO quiz_attempts (id, quiz_id, user_id, correct, total, wrong)
        VALUES ($1, $2, $3, $4, $5, $6)`,
		uuid.New(), quizID, userID, correct, total, payload)
	return err
}

// ListAttempts отдаёт историю попыток пользователя.
func (s *Store) ListAttempts(
	ctx context.Context,
	userID uuid.UUID,
	limit int,
) ([]QuizAttempt, error) {
	if limit <= 0 || limit > 500 {
		limit = 100
	}
	rows, err := s.Pool.Query(ctx, `
        SELECT a.quiz_id, q.title, a.correct, a.total, a.wrong, a.created_at
          FROM quiz_attempts a
          JOIN quizzes q ON q.id = a.quiz_id
         WHERE a.user_id = $1
         ORDER BY a.created_at DESC
         LIMIT $2`, userID, limit)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	list := make([]QuizAttempt, 0, limit)
	for rows.Next() {
		var attempt QuizAttempt
		var wrong []byte
		if err := rows.Scan(
			&attempt.QuizID, &attempt.Title, &attempt.Correct,
			&attempt.Total, &wrong, &attempt.CreatedAt,
		); err != nil {
			return nil, err
		}
		_ = json.Unmarshal(wrong, &attempt.Wrong)
		list = append(list, attempt)
	}
	return list, rows.Err()
}
