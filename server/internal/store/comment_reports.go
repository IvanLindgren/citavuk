package store

import (
	"context"
	"errors"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
)

// Виды комментариев, на которые можно пожаловаться.
const (
	CommentKindFeed    = "feed"    // обсуждение карточки Вукотока
	CommentKindRoadmap = "roadmap" // обсуждение уровня на карте пути
	CommentKindBook    = "book"    // обсуждение страницы общей книги
)

// ErrCommentNotFound — комментария нет или он уже снят.
var ErrCommentNotFound = errors.New("комментарий не найден")

// ReportedComment — то, что модератор увидит в карточке жалобы.
type ReportedComment struct {
	Kind     string
	ID       uuid.UUID
	Body     string
	Author   string
	AuthorID uuid.UUID
	// Where — где написан комментарий: заголовок карточки, уровень, книга.
	Where string
}

// ValidCommentKind сообщает, известен ли вид комментария.
func ValidCommentKind(kind string) bool {
	return kind == CommentKindFeed || kind == CommentKindRoadmap || kind == CommentKindBook
}

// CommentForReport находит живой комментарий для карточки жалобы.
func (s *Store) CommentForReport(ctx context.Context, kind string, id uuid.UUID) (*ReportedComment, error) {
	var query string
	switch kind {
	case CommentKindFeed:
		query = `
			SELECT c.body, COALESCE(nullif(btrim(u.display_name), ''), 'Читатель'), c.user_id, i.title_latin
			  FROM micro_feed_comments c
			  JOIN users u ON u.id = c.user_id
			  JOIN micro_feed_content_items i ON i.id = c.item_id
			 WHERE c.id = $1 AND c.deleted_at IS NULL`
	case CommentKindRoadmap:
		query = `
			SELECT c.body, COALESCE(nullif(btrim(u.display_name), ''), 'Читатель'), c.user_id, 'Карта пути, ' || c.level
			  FROM roadmap_comments c
			  JOIN users u ON u.id = c.user_id
			 WHERE c.id = $1 AND c.deleted_at IS NULL`
	case CommentKindBook:
		query = `
			SELECT c.body, COALESCE(nullif(btrim(c.author), ''), 'Читатель'), c.user_id,
			       'Книга «' || b.title || '», страница с абзаца ' || c.paragraph
			  FROM book_comments c
			  JOIN shared_books b ON b.token = c.token
			 WHERE c.id = $1 AND NOT c.hidden`
	default:
		return nil, ErrCommentNotFound
	}
	out := &ReportedComment{Kind: kind, ID: id}
	err := s.Pool.QueryRow(ctx, query, id).Scan(&out.Body, &out.Author, &out.AuthorID, &out.Where)
	if errors.Is(err, pgx.ErrNoRows) {
		return nil, ErrCommentNotFound
	}
	if err != nil {
		return nil, err
	}
	return out, nil
}

// RemoveReportedComment снимает комментарий по решению модератора.
// Снятый раньше комментарий не ошибка: решение уже исполнено.
func (s *Store) RemoveReportedComment(ctx context.Context, kind string, id uuid.UUID) error {
	switch kind {
	case CommentKindFeed:
		return s.DeleteMicroFeedComment(ctx, id, uuid.Nil, true)
	case CommentKindRoadmap:
		err := s.DeleteRoadmapComment(ctx, id, uuid.Nil, true)
		if errors.Is(err, ErrRoadmapNotFound) {
			return nil
		}
		return err
	case CommentKindBook:
		_, err := s.Pool.Exec(ctx, `UPDATE book_comments SET hidden = true WHERE id = $1`, id)
		return err
	}
	return ErrCommentNotFound
}
