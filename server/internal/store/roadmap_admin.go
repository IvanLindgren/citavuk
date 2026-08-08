package store

import (
	"context"
	"encoding/json"
	"errors"
	"strings"
	"time"
	"unicode/utf8"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"

	"github.com/citavuk/server/internal/roadmap"
)

// Правка дорожной карты и обсуждение уровней.
//
// Править может только администратор — он же автор карты. Уроки преподавателей
// живут своей жизнью и попадают на карту ссылкой, а не правом записи.

const (
	// RoadmapCommentMaxRunes — предел длины реплики.
	//
	// Втрое больше, чем в Вукотоке: там подпись под карточкой, здесь разбор
	// дорожной карты, ради которого раздел и заведён.
	RoadmapCommentMaxRunes = 2000

	// roadmapCommentGap — защита от двойного нажатия и простейшего спама.
	roadmapCommentGap = 10 * time.Second
)

var (
	ErrRoadmapCommentEmpty  = errors.New("пустой комментарий")
	ErrRoadmapCommentLong   = errors.New("слишком длинный комментарий")
	ErrRoadmapCommentSoon   = errors.New("слишком часто")
	ErrRoadmapCommentDenied = errors.New("чужой комментарий")
	ErrRoadmapCommentParent = errors.New("ответ не к той ветке")
)

// RoadmapComment — реплика в обсуждении уровня.
type RoadmapComment struct {
	ID        uuid.UUID  `json:"id"`
	Level     string     `json:"level"`
	ParentID  *uuid.UUID `json:"parentId,omitempty"`
	UserID    uuid.UUID  `json:"userId"`
	Author    string     `json:"author"`
	Body      string     `json:"body"`
	CreatedAt time.Time  `json:"createdAt"`
	Mine      bool       `json:"mine"`
}

// ------------------------------------------------------------- пункты карты

// SaveRoadmapItem создаёт пункт или обновляет существующий.
func (s *Store) SaveRoadmapItem(ctx context.Context, item RoadmapItem) (*RoadmapItem, error) {
	level := roadmap.NormalizeLevel(item.Level)
	if level == "" {
		return nil, ErrRoadmapUnknownLevel
	}
	if !roadmap.ValidCategory(item.Category) {
		return nil, ErrRoadmapUnknownCategory
	}
	if !roadmapKinds[item.Kind] {
		return nil, ErrRoadmapUnknownKind
	}
	title := strings.TrimSpace(item.Title)
	if title == "" {
		return nil, ErrRoadmapTitleEmpty
	}
	if len(item.Payload) == 0 {
		item.Payload = json.RawMessage(`{}`)
	}
	status := normalizeRoadmapStatus(item.Status)

	var saved RoadmapItem
	var err error
	if item.ID == uuid.Nil {
		err = s.Pool.QueryRow(ctx, `
			INSERT INTO roadmap_items
			    (level, category, kind, title, summary, body, payload, position, status)
			VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)
			RETURNING id, level, category, kind, title, summary, body, payload,
			          position, status, updated_at`,
			level, item.Category, item.Kind, title, item.Summary, item.Body,
			item.Payload, item.Position, status,
		).Scan(&saved.ID, &saved.Level, &saved.Category, &saved.Kind, &saved.Title,
			&saved.Summary, &saved.Body, &saved.Payload, &saved.Position,
			&saved.Status, &saved.UpdatedAt)
	} else {
		err = s.Pool.QueryRow(ctx, `
			UPDATE roadmap_items
			   SET level=$2, category=$3, kind=$4, title=$5, summary=$6, body=$7,
			       payload=$8, position=$9, status=$10, updated_at=now()
			 WHERE id=$1
			RETURNING id, level, category, kind, title, summary, body, payload,
			          position, status, updated_at`,
			item.ID, level, item.Category, item.Kind, title, item.Summary,
			item.Body, item.Payload, item.Position, status,
		).Scan(&saved.ID, &saved.Level, &saved.Category, &saved.Kind, &saved.Title,
			&saved.Summary, &saved.Body, &saved.Payload, &saved.Position,
			&saved.Status, &saved.UpdatedAt)
	}
	if errors.Is(err, pgx.ErrNoRows) {
		return nil, ErrRoadmapNotFound
	}
	if err != nil {
		return nil, err
	}
	return &saved, nil
}

// DeleteRoadmapItem убирает пункт вместе с упражнениями к нему.
//
// Отметки о пройденном не удаляются: они хранят свои уровень и раздел и не
// зависят от существования пункта. Считать процент они всё равно не будут —
// доля ограничена числом опубликованного содержимого.
func (s *Store) DeleteRoadmapItem(ctx context.Context, id uuid.UUID) error {
	tag, err := s.Pool.Exec(ctx, `DELETE FROM roadmap_items WHERE id=$1`, id)
	if err != nil {
		return err
	}
	if tag.RowsAffected() == 0 {
		return ErrRoadmapNotFound
	}
	return nil
}

// -------------------------------------------------------------- упражнения

// SaveRoadmapExerciseSet создаёт или обновляет набор упражнений.
func (s *Store) SaveRoadmapExerciseSet(
	ctx context.Context, set RoadmapExerciseSet,
) (*RoadmapExerciseSet, error) {
	level := roadmap.NormalizeLevel(set.Level)
	if level == "" {
		return nil, ErrRoadmapUnknownLevel
	}
	if !roadmap.ValidCategory(set.Category) {
		return nil, ErrRoadmapUnknownCategory
	}
	title := strings.TrimSpace(set.Title)
	if title == "" {
		return nil, ErrRoadmapTitleEmpty
	}
	if len(set.Content) == 0 {
		set.Content = json.RawMessage(`{"exercises":[]}`)
	}
	status := normalizeRoadmapStatus(set.Status)

	var saved RoadmapExerciseSet
	var score float32
	var err error
	if set.ID == uuid.Nil {
		err = s.Pool.QueryRow(ctx, `
			INSERT INTO roadmap_exercise_sets
			    (level, category, item_id, title, content, position, status)
			VALUES ($1,$2,$3,$4,$5,$6,$7)
			RETURNING id, level, category, item_id, title, content, position,
			          status, updated_at, 0::real`,
			level, set.Category, set.ItemID, title, set.Content, set.Position, status,
		).Scan(&saved.ID, &saved.Level, &saved.Category, &saved.ItemID, &saved.Title,
			&saved.Content, &saved.Position, &saved.Status, &saved.UpdatedAt, &score)
	} else {
		err = s.Pool.QueryRow(ctx, `
			UPDATE roadmap_exercise_sets
			   SET level=$2, category=$3, item_id=$4, title=$5, content=$6,
			       position=$7, status=$8, updated_at=now()
			 WHERE id=$1
			RETURNING id, level, category, item_id, title, content, position,
			          status, updated_at, 0::real`,
			set.ID, level, set.Category, set.ItemID, title, set.Content,
			set.Position, status,
		).Scan(&saved.ID, &saved.Level, &saved.Category, &saved.ItemID, &saved.Title,
			&saved.Content, &saved.Position, &saved.Status, &saved.UpdatedAt, &score)
	}
	if errors.Is(err, pgx.ErrNoRows) {
		return nil, ErrRoadmapNotFound
	}
	if err != nil {
		return nil, err
	}
	return &saved, nil
}

// DeleteRoadmapExerciseSet убирает набор упражнений.
func (s *Store) DeleteRoadmapExerciseSet(ctx context.Context, id uuid.UUID) error {
	tag, err := s.Pool.Exec(ctx, `DELETE FROM roadmap_exercise_sets WHERE id=$1`, id)
	if err != nil {
		return err
	}
	if tag.RowsAffected() == 0 {
		return ErrRoadmapNotFound
	}
	return nil
}

// ------------------------------------------------------------------- слова

// SaveRoadmapWord создаёт или обновляет слово.
func (s *Store) SaveRoadmapWord(ctx context.Context, word RoadmapWord) (*RoadmapWord, error) {
	level := roadmap.NormalizeLevel(word.Level)
	if level == "" {
		return nil, ErrRoadmapUnknownLevel
	}
	theme := strings.TrimSpace(word.Theme)
	lemma := strings.TrimSpace(word.Lemma)
	if theme == "" || lemma == "" {
		return nil, ErrRoadmapTitleEmpty
	}
	status := normalizeRoadmapStatus(word.Status)

	var saved RoadmapWord
	var err error
	if word.ID == uuid.Nil {
		err = s.Pool.QueryRow(ctx, `
			INSERT INTO roadmap_words
			    (level, theme, lemma, translation, pos, note, rank, position, status)
			VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)
			ON CONFLICT (level, lemma) DO UPDATE
			   SET theme=EXCLUDED.theme, translation=EXCLUDED.translation,
			       pos=EXCLUDED.pos, note=EXCLUDED.note, rank=EXCLUDED.rank,
			       position=EXCLUDED.position, status=EXCLUDED.status,
			       updated_at=now()
			RETURNING id, level, theme, lemma, translation, pos, note, rank,
			          position, status`,
			level, theme, lemma, word.Translation, word.POS, word.Note,
			word.Rank, word.Position, status,
		).Scan(&saved.ID, &saved.Level, &saved.Theme, &saved.Lemma, &saved.Translation,
			&saved.POS, &saved.Note, &saved.Rank, &saved.Position, &saved.Status)
	} else {
		err = s.Pool.QueryRow(ctx, `
			UPDATE roadmap_words
			   SET level=$2, theme=$3, lemma=$4, translation=$5, pos=$6, note=$7,
			       rank=$8, position=$9, status=$10, updated_at=now()
			 WHERE id=$1
			RETURNING id, level, theme, lemma, translation, pos, note, rank,
			          position, status`,
			word.ID, level, theme, lemma, word.Translation, word.POS, word.Note,
			word.Rank, word.Position, status,
		).Scan(&saved.ID, &saved.Level, &saved.Theme, &saved.Lemma, &saved.Translation,
			&saved.POS, &saved.Note, &saved.Rank, &saved.Position, &saved.Status)
	}
	if errors.Is(err, pgx.ErrNoRows) {
		return nil, ErrRoadmapNotFound
	}
	if err != nil {
		return nil, err
	}
	return &saved, nil
}

// DeleteRoadmapWord убирает слово.
func (s *Store) DeleteRoadmapWord(ctx context.Context, id uuid.UUID) error {
	tag, err := s.Pool.Exec(ctx, `DELETE FROM roadmap_words WHERE id=$1`, id)
	if err != nil {
		return err
	}
	if tag.RowsAffected() == 0 {
		return ErrRoadmapNotFound
	}
	return nil
}

// PublishRoadmapWords переводит в публикацию весь черновой словарь уровня.
//
// Слова заводятся сотнями, и открывать их по одному значило бы шестьсот
// нажатий на уровень.
func (s *Store) PublishRoadmapWords(ctx context.Context, level string) (int, error) {
	normalized := roadmap.NormalizeLevel(level)
	if normalized == "" {
		return 0, ErrRoadmapUnknownLevel
	}
	tag, err := s.Pool.Exec(ctx, `
		UPDATE roadmap_words SET status='published', updated_at=now()
		 WHERE level=$1 AND status='draft'`, normalized)
	if err != nil {
		return 0, err
	}
	return int(tag.RowsAffected()), nil
}

// SaveRoadmapIntro записывает вводный текст раздела.
func (s *Store) SaveRoadmapIntro(ctx context.Context, level, category, intro string) error {
	normalized := roadmap.NormalizeLevel(level)
	if normalized == "" {
		return ErrRoadmapUnknownLevel
	}
	if !roadmap.ValidCategory(category) {
		return ErrRoadmapUnknownCategory
	}
	_, err := s.Pool.Exec(ctx, `
		INSERT INTO roadmap_sections (level, category, intro)
		VALUES ($1,$2,$3)
		ON CONFLICT (level, category) DO UPDATE
		   SET intro=EXCLUDED.intro, updated_at=now()`,
		normalized, category, strings.TrimSpace(intro))
	return err
}

// ------------------------------------------------------------- обсуждение

// ListRoadmapComments возвращает обсуждение уровня, старые сверху.
//
// Порядок обратный Вукотоку: там лента реплик, где важна последняя, здесь
// разговор с ответами, который читается сверху вниз.
func (s *Store) ListRoadmapComments(
	ctx context.Context, level string, viewer uuid.UUID, limit int,
) ([]RoadmapComment, error) {
	if limit <= 0 || limit > 500 {
		limit = 200
	}
	rows, err := s.Pool.Query(ctx, `
		SELECT c.id, c.level, c.parent_id, c.user_id,
		       COALESCE(nullif(btrim(u.display_name), ''), 'Читатель'),
		       c.body, c.created_at, (c.user_id = $2) AS mine
		  FROM roadmap_comments c
		  JOIN users u ON u.id = c.user_id
		 WHERE c.level = $1 AND c.deleted_at IS NULL
		 ORDER BY c.created_at
		 LIMIT $3`, level, viewer, limit)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	out := []RoadmapComment{}
	for rows.Next() {
		var comment RoadmapComment
		if err := rows.Scan(
			&comment.ID, &comment.Level, &comment.ParentID, &comment.UserID,
			&comment.Author, &comment.Body, &comment.CreatedAt, &comment.Mine,
		); err != nil {
			return nil, err
		}
		out = append(out, comment)
	}
	return out, rows.Err()
}

// AddRoadmapComment записывает реплику или ответ на неё.
func (s *Store) AddRoadmapComment(
	ctx context.Context, level string, userID uuid.UUID, parentID *uuid.UUID, body string,
) (*RoadmapComment, error) {
	normalized := roadmap.NormalizeLevel(level)
	if normalized == "" {
		return nil, ErrRoadmapUnknownLevel
	}
	body = strings.TrimSpace(body)
	if body == "" {
		return nil, ErrRoadmapCommentEmpty
	}
	if utf8.RuneCountInString(body) > RoadmapCommentMaxRunes {
		return nil, ErrRoadmapCommentLong
	}

	var comment RoadmapComment
	err := s.InTx(ctx, func(tx pgx.Tx) error {
		var recent bool
		if err := tx.QueryRow(ctx, `
			SELECT EXISTS (
				SELECT 1 FROM roadmap_comments
				 WHERE user_id=$1 AND created_at > now()-$2::interval
			)`, userID, roadmapCommentGap.String()).Scan(&recent); err != nil {
			return err
		}
		if recent {
			return ErrRoadmapCommentSoon
		}

		if parentID != nil {
			// Ответ на ответ цепляется к корню ветки, а не вглубь: на телефоне
			// третий уровень отступа не помещается, а разговор от этого не
			// теряется — виден и корень, и все реплики к нему.
			var root *uuid.UUID
			var parentLevel string
			err := tx.QueryRow(ctx, `
				SELECT COALESCE(parent_id, id), level FROM roadmap_comments
				 WHERE id=$1 AND deleted_at IS NULL`, *parentID).Scan(&root, &parentLevel)
			if errors.Is(err, pgx.ErrNoRows) {
				return ErrRoadmapCommentParent
			}
			if err != nil {
				return err
			}
			if parentLevel != normalized {
				return ErrRoadmapCommentParent
			}
			parentID = root
		}

		if err := tx.QueryRow(ctx, `
			INSERT INTO roadmap_comments (level, parent_id, user_id, body)
			VALUES ($1,$2,$3,$4)
			RETURNING id, level, parent_id, user_id, body, created_at`,
			normalized, parentID, userID, body,
		).Scan(&comment.ID, &comment.Level, &comment.ParentID, &comment.UserID,
			&comment.Body, &comment.CreatedAt); err != nil {
			return err
		}

		return tx.QueryRow(ctx, `
			SELECT COALESCE(nullif(btrim(display_name), ''), 'Читатель')
			  FROM users WHERE id=$1`, userID).Scan(&comment.Author)
	})
	if err != nil {
		return nil, err
	}
	comment.Mine = true
	return &comment, nil
}

// DeleteRoadmapComment убирает свою реплику; администратор убирает любую.
func (s *Store) DeleteRoadmapComment(
	ctx context.Context, commentID uuid.UUID, userID uuid.UUID, isAdmin bool,
) error {
	var author uuid.UUID
	err := s.Pool.QueryRow(ctx,
		`SELECT user_id FROM roadmap_comments WHERE id=$1 AND deleted_at IS NULL`,
		commentID).Scan(&author)
	if errors.Is(err, pgx.ErrNoRows) {
		return ErrRoadmapNotFound
	}
	if err != nil {
		return err
	}
	if author != userID && !isAdmin {
		return ErrRoadmapCommentDenied
	}
	_, err = s.Pool.Exec(ctx,
		`UPDATE roadmap_comments SET deleted_at=now() WHERE id=$1`, commentID)
	return err
}

// normalizeRoadmapStatus: всё, кроме явной публикации, — черновик. Опечатка в
// статусе не должна выкладывать наполовину написанный текст читателям.
func normalizeRoadmapStatus(status string) string {
	if strings.TrimSpace(status) == "published" {
		return "published"
	}
	return "draft"
}
