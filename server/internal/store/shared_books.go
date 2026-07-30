package store

import (
	"bytes"
	"compress/gzip"
	"context"
	"crypto/rand"
	"encoding/base64"
	"errors"
	"fmt"
	"io"
	"time"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
)

// ErrShareNotFound — ссылки с таким токеном нет.
var ErrShareNotFound = errors.New("книга по ссылке не найдена")

// SharedBook — книга, которой поделились.
type SharedBook struct {
	Token      string    `json:"token"`
	Title      string    `json:"title"`
	Paragraphs int       `json:"paragraphs"`
	CreatedAt  time.Time `json:"createdAt"`
	Opened     int64     `json:"opened"`
	ContentSHA string    `json:"-"`
	OwnerID    uuid.UUID `json:"-"`
}

// Comment — сообщение в обсуждении страницы.
type Comment struct {
	ID        uuid.UUID `json:"id"`
	Paragraph int       `json:"paragraph"`
	Author    string    `json:"author"`
	Body      string    `json:"body"`
	CreatedAt time.Time `json:"createdAt"`
	// Mine отмечает свои сообщения: их можно убрать.
	Mine bool `json:"mine"`
}

// shareTokenBytes — длина токена в байтах до кодирования.
//
// Двенадцать байт — это 96 бит и 16 символов в ссылке. Перебором такую ссылку
// не найти, а читается и пересылается она всё ещё легко.
const shareTokenBytes = 12

func newShareToken() (string, error) {
	raw := make([]byte, shareTokenBytes)
	if _, err := rand.Read(raw); err != nil {
		return "", err
	}
	return base64.RawURLEncoding.EncodeToString(raw), nil
}

// CreateShare выдаёт ссылку на книгу.
//
// Повторный вызов для той же книги того же человека возвращает прежний токен:
// иначе каждое нажатие «поделиться» рождало бы новую ссылку, и обсуждение
// расползлось бы по копиям одной и той же книги.
func (s *Store) CreateShare(
	ctx context.Context,
	ownerID uuid.UUID,
	contentSHA, title string,
	paragraphs int,
) (*SharedBook, error) {
	if contentSHA == "" {
		return nil, errors.New("не указан адрес текста")
	}
	// Текст должен быть уже выгружен: иначе получатель откроет ссылку в пустоту.
	var exists bool
	if err := s.Pool.QueryRow(ctx,
		`SELECT true FROM book_contents WHERE user_id = $1 AND sha256 = $2`,
		ownerID, contentSHA,
	).Scan(&exists); err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return nil, ErrContentNotFound
		}
		return nil, err
	}

	existing, err := s.shareByContent(ctx, ownerID, contentSHA)
	if err == nil {
		return existing, nil
	}
	if !errors.Is(err, ErrShareNotFound) {
		return nil, err
	}

	token, err := newShareToken()
	if err != nil {
		return nil, err
	}
	var created time.Time
	if err := s.Pool.QueryRow(ctx, `
        INSERT INTO shared_books (token, content_sha, title, paragraphs, owner_id)
        VALUES ($1, $2, $3, $4, $5)
        RETURNING created_at`,
		token, contentSHA, trunc(title, 300), paragraphs, ownerID,
	).Scan(&created); err != nil {
		return nil, err
	}
	return &SharedBook{
		Token: token, Title: title, Paragraphs: paragraphs,
		CreatedAt: created, ContentSHA: contentSHA, OwnerID: ownerID,
	}, nil
}

func (s *Store) shareByContent(
	ctx context.Context, ownerID uuid.UUID, contentSHA string,
) (*SharedBook, error) {
	return s.scanShare(ctx, `
        SELECT token, content_sha, title, paragraphs, owner_id, created_at, opened
          FROM shared_books WHERE owner_id = $1 AND content_sha = $2`,
		ownerID, contentSHA)
}

// Share читает ссылку и отмечает открытие.
func (s *Store) Share(ctx context.Context, token string) (*SharedBook, error) {
	share, err := s.scanShare(ctx, `
        SELECT token, content_sha, title, paragraphs, owner_id, created_at, opened
          FROM shared_books WHERE token = $1`, token)
	if err != nil {
		return nil, err
	}
	// Счётчик открытий не должен ронять запрос: он для сведения владельца.
	_, _ = s.Pool.Exec(ctx,
		`UPDATE shared_books SET opened = opened + 1 WHERE token = $1`, token)
	return share, nil
}

func (s *Store) scanShare(
	ctx context.Context, query string, args ...any,
) (*SharedBook, error) {
	var share SharedBook
	err := s.Pool.QueryRow(ctx, query, args...).Scan(
		&share.Token, &share.ContentSHA, &share.Title,
		&share.Paragraphs, &share.OwnerID, &share.CreatedAt, &share.Opened,
	)
	if errors.Is(err, pgx.ErrNoRows) {
		return nil, ErrShareNotFound
	}
	if err != nil {
		return nil, err
	}
	return &share, nil
}

// ShareContent отдаёт текст книги по ссылке.
//
// Читается из текста владельца: копии текста не делается, книга и так лежит в
// book_contents, выгруженная синхронизацией.
func (s *Store) ShareContent(ctx context.Context, token string) ([]byte, error) {
	var body []byte
	err := s.Pool.QueryRow(ctx, `
        SELECT c.body
          FROM shared_books s
          JOIN book_contents c
            ON c.user_id = s.owner_id AND c.sha256 = s.content_sha
         WHERE s.token = $1`, token).Scan(&body)
	if errors.Is(err, pgx.ErrNoRows) {
		return nil, ErrShareNotFound
	}
	if err != nil {
		return nil, err
	}

	zr, err := gzip.NewReader(bytes.NewReader(body))
	if err != nil {
		return nil, fmt.Errorf("распаковка текста: %w", err)
	}
	defer zr.Close()
	out, err := io.ReadAll(io.LimitReader(zr, 64<<20))
	if err != nil {
		return nil, fmt.Errorf("чтение текста: %w", err)
	}
	return out, nil
}

// DeleteShare отзывает ссылку. Обсуждение уходит вместе с ней.
func (s *Store) DeleteShare(ctx context.Context, ownerID uuid.UUID, token string) error {
	tag, err := s.Pool.Exec(ctx,
		`DELETE FROM shared_books WHERE token = $1 AND owner_id = $2`, token, ownerID)
	if err != nil {
		return err
	}
	if tag.RowsAffected() == 0 {
		return ErrShareNotFound
	}
	return nil
}

// MaxCommentsPerPage ограничивает выдачу: страница обсуждения не должна
// превращаться в бесконечную ленту.
const MaxCommentsPerPage = 200

// Comments отдаёт обсуждение страницы.
func (s *Store) Comments(
	ctx context.Context, token string, paragraph int, viewer uuid.UUID,
) ([]Comment, error) {
	rows, err := s.Pool.Query(ctx, `
        SELECT id, paragraph, author, body, created_at, user_id = $3
          FROM book_comments
         WHERE token = $1 AND paragraph = $2 AND NOT hidden
         ORDER BY created_at
         LIMIT $4`, token, paragraph, viewer, MaxCommentsPerPage)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	list := make([]Comment, 0, 16)
	for rows.Next() {
		var comment Comment
		if err := rows.Scan(
			&comment.ID, &comment.Paragraph, &comment.Author,
			&comment.Body, &comment.CreatedAt, &comment.Mine,
		); err != nil {
			return nil, err
		}
		list = append(list, comment)
	}
	return list, rows.Err()
}

// CommentCounts сообщает, на каких страницах есть обсуждение.
//
// Нужно, чтобы читалка отметила такие страницы, не запрашивая их по одной.
func (s *Store) CommentCounts(ctx context.Context, token string) (map[int]int, error) {
	rows, err := s.Pool.Query(ctx, `
        SELECT paragraph, count(*) FROM book_comments
         WHERE token = $1 AND NOT hidden GROUP BY paragraph`, token)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	counts := map[int]int{}
	for rows.Next() {
		var paragraph, count int
		if err := rows.Scan(&paragraph, &count); err != nil {
			return nil, err
		}
		counts[paragraph] = count
	}
	return counts, rows.Err()
}

// AddComment записывает сообщение в обсуждение.
func (s *Store) AddComment(
	ctx context.Context,
	token string,
	paragraph int,
	userID uuid.UUID,
	author, body string,
) (*Comment, error) {
	comment := Comment{
		ID:        uuid.New(),
		Paragraph: paragraph,
		Author:    trunc(author, 120),
		Body:      body,
		Mine:      true,
	}
	err := s.Pool.QueryRow(ctx, `
        INSERT INTO book_comments (id, token, paragraph, user_id, author, body)
        VALUES ($1, $2, $3, $4, $5, $6)
        RETURNING created_at`,
		comment.ID, token, paragraph, userID, comment.Author, comment.Body,
	).Scan(&comment.CreatedAt)
	if err != nil {
		return nil, err
	}
	return &comment, nil
}

// HideOwnComment убирает своё сообщение из обсуждения.
func (s *Store) HideOwnComment(
	ctx context.Context, id, userID uuid.UUID,
) error {
	tag, err := s.Pool.Exec(ctx,
		`UPDATE book_comments SET hidden = true WHERE id = $1 AND user_id = $2`,
		id, userID)
	if err != nil {
		return err
	}
	if tag.RowsAffected() == 0 {
		return errors.New("сообщение не найдено")
	}
	return nil
}

// RecentCommentsByUser считает сообщения человека за последнее время — по нему
// ограничивается частота отправки.
func (s *Store) RecentCommentsByUser(
	ctx context.Context, userID uuid.UUID, within time.Duration,
) (int, error) {
	var count int
	err := s.Pool.QueryRow(ctx, `
        SELECT count(*) FROM book_comments
         WHERE user_id = $1 AND created_at > now() - $2::interval`,
		userID, within.String(),
	).Scan(&count)
	return count, err
}
