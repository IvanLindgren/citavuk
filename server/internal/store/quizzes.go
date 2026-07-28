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
	ID          uuid.UUID       `json:"id"`
	SourceSHA   string          `json:"sourceSha"`
	MaterialKey string          `json:"materialKey"`
	Title       string          `json:"title"`
	Subject     string          `json:"subject"`
	Excerpt     string          `json:"excerpt"`
	Questions   json.RawMessage `json:"questions"`
	AuthorID    *uuid.UUID      `json:"-"`
	CreatedAt   time.Time       `json:"createdAt"`
}

// MaterialQuiz — что известно о тесте по документу каталога.
//
// Отдаётся списком на страницу материалов: по нему карточка решает, предложить
// составить тест или сразу открыть готовый.
type MaterialQuiz struct {
	MaterialKey string    `json:"materialKey"`
	QuizID      uuid.UUID `json:"quizId"`
	Title       string    `json:"title"`
	Questions   int       `json:"questions"`
	// Attempts и BestScore — по текущему пользователю: в карточке важно «я это
	// уже решал», а не общая популярность. У гостя оба нуля.
	Attempts  int `json:"attempts"`
	BestScore int `json:"bestScore"`
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

const quizColumns = `id, source_sha, material_key, title, subject,
                     excerpt, questions, author_id, created_at`

// FindQuizBySource ищет готовый тест по содержимому материала.
func (s *Store) FindQuizBySource(ctx context.Context, sha string) (*Quiz, error) {
	return s.scanQuiz(ctx,
		`SELECT `+quizColumns+` FROM quizzes WHERE source_sha = $1`, sha)
}

// FindQuizByMaterial ищет тест по документу каталога.
func (s *Store) FindQuizByMaterial(ctx context.Context, key string) (*Quiz, error) {
	if key == "" {
		return nil, ErrQuizNotFound
	}
	return s.scanQuiz(ctx,
		`SELECT `+quizColumns+` FROM quizzes WHERE material_key = $1`, key)
}

// GetQuiz читает тест по идентификатору.
func (s *Store) GetQuiz(ctx context.Context, id uuid.UUID) (*Quiz, error) {
	return s.scanQuiz(ctx,
		`SELECT `+quizColumns+` FROM quizzes WHERE id = $1`, id)
}

func (s *Store) scanQuiz(ctx context.Context, query string, arg any) (*Quiz, error) {
	var quiz Quiz
	var questions []byte
	err := s.Pool.QueryRow(ctx, query, arg).Scan(
		&quiz.ID, &quiz.SourceSHA, &quiz.MaterialKey, &quiz.Title, &quiz.Subject,
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
// Гонка двух человек с одним материалом разрешается его адресом: второй
// получает уже сохранённый тест, а не дубль. Модель к этому моменту отработала
// дважды — этого не избежать, зато в базе останется одна запись.
func (s *Store) SaveQuiz(
	ctx context.Context,
	sha, materialKey, title, subject, excerpt string,
	questions json.RawMessage,
	authorID uuid.UUID,
) (*Quiz, error) {
	id := uuid.New()
	var created time.Time
	err := s.Pool.QueryRow(ctx, `
        INSERT INTO quizzes (id, source_sha, material_key, title, subject, excerpt, questions, author_id)
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
        ON CONFLICT (source_sha) DO NOTHING
        RETURNING id, created_at`,
		id, sha, materialKey, title, subject, excerpt, []byte(questions), authorID,
	).Scan(&id, &created)
	if errors.Is(err, pgx.ErrNoRows) {
		return s.FindQuizBySource(ctx, sha)
	}
	if err != nil {
		// Тот же документ каталога мог разобраться в чуть иной текст (другая
		// версия разборщика — другие пробелы), и тогда содержимое считается
		// новым, а ключ документа занят. Это не ошибка: тест по документу уже
		// есть, его и отдаём.
		if found, findErr := s.FindQuizByMaterial(ctx, materialKey); findErr == nil {
			return found, nil
		}
		return nil, err
	}
	return &Quiz{
		ID: id, SourceSHA: sha, MaterialKey: materialKey, Title: title,
		Subject: subject, Excerpt: excerpt, Questions: questions,
		AuthorID: &authorID, CreatedAt: created,
	}, nil
}

// ListMaterialQuizzes отдаёт все тесты по документам каталога.
//
// Список целиком, а не по запрошенным ключам: тестов по каталогу заведомо
// немного (их составляют вручную), зато страница материалов делает один запрос
// вместо адреса с сотней идентификаторов в строке.
func (s *Store) ListMaterialQuizzes(
	ctx context.Context,
	userID uuid.UUID,
) ([]MaterialQuiz, error) {
	rows, err := s.Pool.Query(ctx, `
        SELECT q.material_key, q.id, q.title,
               jsonb_array_length(q.questions),
               count(a.id),
               coalesce(max(CASE WHEN a.total > 0
                                 THEN a.correct * 100 / a.total END), 0)
          FROM quizzes q
          LEFT JOIN quiz_attempts a ON a.quiz_id = q.id AND a.user_id = $1
         WHERE q.material_key <> ''
         GROUP BY q.id
         ORDER BY q.created_at DESC`, userID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	list := make([]MaterialQuiz, 0, 32)
	for rows.Next() {
		var item MaterialQuiz
		if err := rows.Scan(
			&item.MaterialKey, &item.QuizID, &item.Title,
			&item.Questions, &item.Attempts, &item.BestScore,
		); err != nil {
			return nil, err
		}
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
