package store

import (
	"context"
	"errors"
	"strings"
	"time"
	"unicode/utf8"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
)

// Обсуждение карточек Вукотока.
//
// Комментировать может только вошедший: у всей остальной ленты действующее
// лицо — actor_key, годный и для гостя по ключу из localStorage, но анонимная
// запись, видимая всем, — это приглашение для спама, а модератор в проекте один
// и он же автор. Читают обсуждение все.

// MicroFeedCommentMaxRunes — предел длины реплики.
//
// Тот же предел стоит и в базе (CHECK). Здесь он нужен, чтобы отказать с
// внятным сообщением, а не ошибкой ограничения; в базе — чтобы длинная реплика
// не проехала мимо любого другого пути записи.
const MicroFeedCommentMaxRunes = 600

// microFeedCommentGap — сколько ждать между своими репликами.
//
// Не полноценное ограничение частоты, а защита от случайного двойного нажатия
// и от простейшего спама в одну строку. Настоящий заслон — обязательный вход.
const microFeedCommentGap = 10 * time.Second

var (
	ErrMicroFeedCommentEmpty  = errors.New("пустой комментарий")
	ErrMicroFeedCommentLong   = errors.New("слишком длинный комментарий")
	ErrMicroFeedCommentSoon   = errors.New("слишком часто")
	ErrMicroFeedCommentDenied = errors.New("чужой комментарий")
)

type MicroFeedComment struct {
	ID        uuid.UUID `json:"id"`
	ItemID    uuid.UUID `json:"itemId"`
	UserID    uuid.UUID `json:"userId"`
	Author    string    `json:"author"`
	Body      string    `json:"body"`
	CreatedAt time.Time `json:"createdAt"`
	/** Своя реплика: её можно удалить. Считается на сервере, а не в браузере. */
	Mine bool `json:"mine"`
}

// ListMicroFeedComments возвращает обсуждение карточки, новые сверху.
func (s *Store) ListMicroFeedComments(
	ctx context.Context,
	itemID uuid.UUID,
	viewer uuid.UUID,
	limit int,
) ([]MicroFeedComment, error) {
	if limit <= 0 || limit > 200 {
		limit = 100
	}
	rows, err := s.Pool.Query(ctx, `
		SELECT c.id, c.item_id, c.user_id,
		       COALESCE(nullif(btrim(u.display_name), ''), 'Читатель'),
		       c.body, c.created_at, (c.user_id = $2) AS mine
		  FROM micro_feed_comments c
		  JOIN users u ON u.id = c.user_id
		 WHERE c.item_id = $1 AND c.deleted_at IS NULL
		 ORDER BY c.created_at DESC
		 LIMIT $3`, itemID, viewer, limit)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	out := make([]MicroFeedComment, 0, limit)
	for rows.Next() {
		var comment MicroFeedComment
		if err := rows.Scan(
			&comment.ID, &comment.ItemID, &comment.UserID,
			&comment.Author, &comment.Body, &comment.CreatedAt, &comment.Mine,
		); err != nil {
			return nil, err
		}
		out = append(out, comment)
	}
	return out, rows.Err()
}

// AddMicroFeedComment записывает реплику и обновляет счётчик карточки.
//
// Счётчик хранится на карточке, а не считается на лету: сортировка «популярного»
// идёт по всем опубликованным карточкам, и подзапрос на каждую строку превратил
// бы выдачу ленты в перебор всей таблицы комментариев.
//
// Обсуждение — самый дорогой сигнал, который лента умеет собрать, поэтому
// вместе с записью пересобирается профиль читателя.
func (s *Store) AddMicroFeedComment(
	ctx context.Context,
	itemID uuid.UUID,
	userID uuid.UUID,
	body string,
) (*MicroFeedComment, error) {
	body = normalizeComment(body)
	if body == "" {
		return nil, ErrMicroFeedCommentEmpty
	}
	if utf8.RuneCountInString(body) > MicroFeedCommentMaxRunes {
		return nil, ErrMicroFeedCommentLong
	}

	var comment MicroFeedComment
	err := s.InTx(ctx, func(tx pgx.Tx) error {
		var recent bool
		if err := tx.QueryRow(ctx, `
			SELECT EXISTS (
				SELECT 1 FROM micro_feed_comments
				 WHERE user_id=$1 AND created_at > now()-$2::interval
			)`, userID, microFeedCommentGap.String()).Scan(&recent); err != nil {
			return err
		}
		if recent {
			return ErrMicroFeedCommentSoon
		}

		if err := tx.QueryRow(ctx, `
			INSERT INTO micro_feed_comments (item_id, user_id, body)
			VALUES ($1, $2, $3)
			RETURNING id, item_id, user_id, body, created_at`,
			itemID, userID, body,
		).Scan(
			&comment.ID, &comment.ItemID, &comment.UserID,
			&comment.Body, &comment.CreatedAt,
		); err != nil {
			return err
		}

		if _, err := tx.Exec(ctx, `
			UPDATE micro_feed_content_items
			   SET comments_count = comments_count + 1
			 WHERE id = $1`, itemID); err != nil {
			return err
		}

		if err := tx.QueryRow(ctx, `
			SELECT COALESCE(nullif(btrim(display_name), ''), 'Читатель')
			  FROM users WHERE id=$1`, userID).Scan(&comment.Author); err != nil {
			return err
		}

		return refreshMicroFeedProfile(ctx, tx, "user:"+userID.String(), userID)
	})
	if err != nil {
		return nil, err
	}
	comment.Mine = true
	return &comment, nil
}

// DeleteMicroFeedComment убирает свою реплику; администратор убирает любую.
//
// Удаление мягкое: жёсткое стирало бы возможность разобраться в жалобе задним
// числом. Счётчик при этом уменьшается — в ленте должно быть видно то же
// число, что и в самом обсуждении.
func (s *Store) DeleteMicroFeedComment(
	ctx context.Context,
	commentID uuid.UUID,
	userID uuid.UUID,
	isAdmin bool,
) error {
	return s.InTx(ctx, func(tx pgx.Tx) error {
		var itemID uuid.UUID
		var author uuid.UUID
		err := tx.QueryRow(ctx, `
			SELECT item_id, user_id FROM micro_feed_comments
			 WHERE id=$1 AND deleted_at IS NULL FOR UPDATE`, commentID).Scan(&itemID, &author)
		if errors.Is(err, pgx.ErrNoRows) {
			// Уже удалён — считаем удаление состоявшимся: повторное нажатие не
			// должно показывать ошибку там, где всё вышло как задумано.
			return nil
		}
		if err != nil {
			return err
		}
		if author != userID && !isAdmin {
			return ErrMicroFeedCommentDenied
		}

		if _, err := tx.Exec(ctx, `
			UPDATE micro_feed_comments SET deleted_at=now() WHERE id=$1`, commentID); err != nil {
			return err
		}
		_, err = tx.Exec(ctx, `
			UPDATE micro_feed_content_items
			   SET comments_count = greatest(0, comments_count - 1)
			 WHERE id = $1`, itemID)
		return err
	})
}

// normalizeComment убирает лишние пробелы и пустые строки подряд.
//
// Реплика из тридцати переводов строки — самый дешёвый способ занять весь
// экран обсуждения, и запрещать его отдельным правилом незачем: достаточно не
// хранить того, чего человек не писал.
func normalizeComment(body string) string {
	lines := strings.Split(strings.ReplaceAll(body, "\r\n", "\n"), "\n")
	out := make([]string, 0, len(lines))
	blank := 0
	for _, line := range lines {
		line = strings.TrimSpace(line)
		if line == "" {
			blank++
			if blank > 1 || len(out) == 0 {
				continue
			}
		} else {
			blank = 0
		}
		out = append(out, line)
	}
	return strings.TrimSpace(strings.Join(out, "\n"))
}
