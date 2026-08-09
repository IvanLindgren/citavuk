package store

import (
	"context"
	"encoding/json"
	"errors"
	"strings"
	"time"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"

	"github.com/citavuk/server/internal/roadmap"
)

// Дорожная карта: содержимое клеток, отметки о пройденном и цель читателя.
//
// Каркас карты (какие уровни и разделы бывают) задан в пакете roadmap. Здесь —
// только то, что автор наполняет и правит на ходу.

var (
	ErrRoadmapUnknownLevel    = errors.New("неизвестный уровень")
	ErrRoadmapUnknownCategory = errors.New("неизвестный раздел")
	ErrRoadmapUnknownKind     = errors.New("неизвестный вид пункта")
	ErrRoadmapNotFound        = errors.New("пункт не найден")
	ErrRoadmapTitleEmpty      = errors.New("пустой заголовок")
)

// RoadmapItem — пункт раздела: книга, ссылка, карточка ленты, свой текст, тема
// грамматики или урок.
type RoadmapItem struct {
	ID       uuid.UUID       `json:"id"`
	Level    string          `json:"level"`
	Category string          `json:"category"`
	Kind     string          `json:"kind"`
	Title    string          `json:"title"`
	Summary  string          `json:"summary"`
	Body     string          `json:"body,omitempty"`
	Payload  json.RawMessage `json:"payload"`
	Position int             `json:"position"`
	Status   string          `json:"status"`
	// Отметил ли текущий читатель. Считается на сервере, а не в браузере.
	Done      bool      `json:"done"`
	UpdatedAt time.Time `json:"updatedAt"`
}

// RoadmapExerciseSet — набор упражнений в формате уроков преподавателей.
type RoadmapExerciseSet struct {
	ID       uuid.UUID       `json:"id"`
	Level    string          `json:"level"`
	Category string          `json:"category"`
	ItemID   *uuid.UUID      `json:"itemId,omitempty"`
	Title    string          `json:"title"`
	Content  json.RawMessage `json:"content"`
	Position int             `json:"position"`
	Status   string          `json:"status"`
	Done     bool            `json:"done"`
	// Лучшая доля верных ответов, 0..1.
	Score     float64   `json:"score"`
	UpdatedAt time.Time `json:"updatedAt"`
}

// RoadmapWord — слово словаря уровня.
type RoadmapWord struct {
	ID          uuid.UUID `json:"id"`
	Level       string    `json:"level"`
	Theme       string    `json:"theme"`
	Lemma       string    `json:"lemma"`
	Translation string    `json:"translation"`
	POS         string    `json:"pos,omitempty"`
	Note        string    `json:"note,omitempty"`
	Example     string    `json:"example"`
	Rank        int       `json:"rank,omitempty"`
	Position    int       `json:"position"`
	Status      string    `json:"status"`
	// Отмечено выученным.
	Known bool `json:"known"`
}

// RoadmapSection — одна клетка карты.
type RoadmapSection struct {
	Level    string           `json:"level"`
	Category string           `json:"category"`
	Intro    string           `json:"intro"`
	Progress roadmap.Progress `json:"progress"`
}

// roadmapKinds — допустимые виды пунктов. Тот же набор, что в CHECK таблицы:
// здесь он нужен, чтобы отказать внятно, а не ошибкой ограничения.
var roadmapKinds = map[string]bool{
	"book": true, "link": true, "feed_card": true,
	"text": true, "grammar_topic": true, "lesson": true,
}

// ---------------------------------------------------------------- чтение карты

// RoadmapOverview — вся карта: по клетке на уровень и раздел.
//
// Один запрос на счётчики и один на отметки, а не по запросу на клетку:
// клеток двадцать четыре, и обход по одной превратил бы показ карты в два
// десятка обращений к базе.
func (s *Store) RoadmapOverview(
	ctx context.Context, viewer uuid.UUID,
) (map[string]map[string]roadmap.Progress, error) {
	totals := map[string]map[string]int{}
	done := map[string]map[string]int{}
	for _, level := range roadmap.Levels {
		totals[level] = map[string]int{}
		done[level] = map[string]int{}
	}

	rows, err := s.Pool.Query(ctx, `
		SELECT level, category, count(*) FROM (
		    SELECT level, category FROM roadmap_items         WHERE status='published'
		    UNION ALL
		    SELECT level, category FROM roadmap_exercise_sets WHERE status='published'
		    UNION ALL
		    -- У слова нет колонки раздела: словарь и есть раздел Vocabulary,
		    -- и отдельное поле повторяло бы одно и то же в каждой из полутора
		    -- тысяч строк.
		    SELECT level, 'vocabulary' FROM roadmap_words     WHERE status='published'
		) all_content
		 GROUP BY level, category`)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	for rows.Next() {
		var level, category string
		var count int
		if err := rows.Scan(&level, &category, &count); err != nil {
			return nil, err
		}
		if totals[level] != nil {
			totals[level][category] = count
		}
	}
	if err := rows.Err(); err != nil {
		return nil, err
	}

	if viewer != uuid.Nil {
		// Отметки считаются отдельно от содержимого: пункт, снятый автором с
		// публикации, не должен уносить с собой чужой процент задним числом,
		// но и добавлять к нему тоже не должен — поэтому done ограничивается
		// сверху totals при подсчёте доли.
		marks, err := s.Pool.Query(ctx, `
			SELECT level, category, count(*)
			  FROM roadmap_completions
			 WHERE user_id = $1
			 GROUP BY level, category`, viewer)
		if err != nil {
			return nil, err
		}
		defer marks.Close()
		for marks.Next() {
			var level, category string
			var count int
			if err := marks.Scan(&level, &category, &count); err != nil {
				return nil, err
			}
			if done[level] != nil {
				done[level][category] = count
			}
		}
		if err := marks.Err(); err != nil {
			return nil, err
		}
	}

	out := map[string]map[string]roadmap.Progress{}
	for _, level := range roadmap.Levels {
		out[level] = map[string]roadmap.Progress{}
		for _, category := range roadmap.Categories {
			out[level][category] = roadmap.Ratio(
				done[level][category], totals[level][category])
		}
	}
	return out, nil
}

// RoadmapIntros возвращает вводные тексты разделов: level -> category -> текст.
func (s *Store) RoadmapIntros(ctx context.Context) (map[string]map[string]string, error) {
	rows, err := s.Pool.Query(ctx,
		`SELECT level, category, intro FROM roadmap_sections WHERE intro <> ''`)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	out := map[string]map[string]string{}
	for rows.Next() {
		var level, category, intro string
		if err := rows.Scan(&level, &category, &intro); err != nil {
			return nil, err
		}
		if out[level] == nil {
			out[level] = map[string]string{}
		}
		out[level][category] = intro
	}
	return out, rows.Err()
}

// RoadmapItems возвращает пункты одной клетки.
//
// includeDrafts доступен только администратору: читателю черновик показывать
// нельзя, а считать его в проценте — тем более.
func (s *Store) RoadmapItems(
	ctx context.Context, level, category string, viewer uuid.UUID, includeDrafts bool,
) ([]RoadmapItem, error) {
	rows, err := s.Pool.Query(ctx, `
		SELECT i.id, i.level, i.category, i.kind, i.title, i.summary, i.body,
		       i.payload, i.position, i.status, i.updated_at,
		       (c.ref_id IS NOT NULL) AS done
		  FROM roadmap_items i
		  LEFT JOIN roadmap_completions c
		         ON c.ref_id = i.id AND c.kind = 'item' AND c.user_id = $3
		 WHERE i.level = $1 AND i.category = $2
		   AND ($4 OR i.status = 'published')
		 ORDER BY i.position, i.created_at`,
		level, category, viewer, includeDrafts)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	out := []RoadmapItem{}
	for rows.Next() {
		var item RoadmapItem
		if err := rows.Scan(
			&item.ID, &item.Level, &item.Category, &item.Kind, &item.Title,
			&item.Summary, &item.Body, &item.Payload, &item.Position,
			&item.Status, &item.UpdatedAt, &item.Done,
		); err != nil {
			return nil, err
		}
		out = append(out, item)
	}
	return out, rows.Err()
}

// RoadmapExercises возвращает наборы упражнений клетки.
func (s *Store) RoadmapExercises(
	ctx context.Context, level, category string, viewer uuid.UUID, includeDrafts bool,
) ([]RoadmapExerciseSet, error) {
	rows, err := s.Pool.Query(ctx, `
		SELECT e.id, e.level, e.category, e.item_id, e.title, e.content,
		       e.position, e.status, e.updated_at,
		       (c.ref_id IS NOT NULL) AS done, COALESCE(c.score, 0)
		  FROM roadmap_exercise_sets e
		  LEFT JOIN roadmap_completions c
		         ON c.ref_id = e.id AND c.kind = 'exercise' AND c.user_id = $3
		 WHERE e.level = $1 AND e.category = $2
		   AND ($4 OR e.status = 'published')
		 ORDER BY e.position, e.created_at`,
		level, category, viewer, includeDrafts)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	out := []RoadmapExerciseSet{}
	for rows.Next() {
		var set RoadmapExerciseSet
		var score float32
		if err := rows.Scan(
			&set.ID, &set.Level, &set.Category, &set.ItemID, &set.Title,
			&set.Content, &set.Position, &set.Status, &set.UpdatedAt,
			&set.Done, &score,
		); err != nil {
			return nil, err
		}
		set.Score = float64(score)
		out = append(out, set)
	}
	return out, rows.Err()
}

// RoadmapWords возвращает словарь уровня, разложенный по темам.
func (s *Store) RoadmapWords(
	ctx context.Context, level string, viewer uuid.UUID, includeDrafts bool,
) ([]RoadmapWord, error) {
	rows, err := s.Pool.Query(ctx, `
		SELECT w.id, w.level, w.theme, w.lemma, w.translation, w.pos, w.note,
		       w.example, w.rank, w.position, w.status,
		       (c.ref_id IS NOT NULL) AS known
		  FROM roadmap_words w
		  LEFT JOIN roadmap_completions c
		         ON c.ref_id = w.id AND c.kind = 'word' AND c.user_id = $2
		 WHERE w.level = $1 AND ($3 OR w.status = 'published')
		 ORDER BY w.theme, w.position, w.rank, w.lemma`,
		level, viewer, includeDrafts)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	out := []RoadmapWord{}
	for rows.Next() {
		var word RoadmapWord
		if err := rows.Scan(
			&word.ID, &word.Level, &word.Theme, &word.Lemma, &word.Translation,
			&word.POS, &word.Note, &word.Example, &word.Rank, &word.Position, &word.Status,
			&word.Known,
		); err != nil {
			return nil, err
		}
		out = append(out, word)
	}
	return out, rows.Err()
}

// ------------------------------------------------------------------- отметки

// MarkRoadmapDone отмечает пункт, набор упражнений или слово пройденным.
//
// Уровень и раздел берутся из самой сущности, а не от клиента: иначе отметку
// можно было бы записать в чужую клетку и набрать проценты, не открывая её.
func (s *Store) MarkRoadmapDone(
	ctx context.Context, userID uuid.UUID, kind string, refID uuid.UUID, score float64,
	source string,
) error {
	if score < 0 {
		score = 0
	}
	if score > 1 {
		score = 1
	}
	if source != "trainer" {
		source = "manual"
	}

	var table string
	switch kind {
	case "item":
		table = "roadmap_items"
	case "exercise":
		table = "roadmap_exercise_sets"
	case "word":
		table = "roadmap_words"
	default:
		return ErrRoadmapUnknownKind
	}

	var level, category string
	// Раздел слова определяется его природой, а не колонкой: словарь и есть
	// раздел Vocabulary, отдельного поля у слова нет.
	query := `SELECT level, category FROM ` + table + ` WHERE id=$1 AND status='published'`
	if kind == "word" {
		query = `SELECT level, 'vocabulary' FROM roadmap_words
		          WHERE id=$1 AND status='published'`
	}
	if err := s.Pool.QueryRow(ctx, query, refID).Scan(&level, &category); err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return ErrRoadmapNotFound
		}
		return err
	}

	// Повторная отметка не сбрасывает достигнутое: пройдя упражнение на 90% и
	// перепройдя на 40%, человек не должен терять зачёт — иначе повторение
	// наказывается, а оно и есть цель.
	_, err := s.Pool.Exec(ctx, `
		INSERT INTO roadmap_completions (user_id, kind, ref_id, level, category, score, source)
		VALUES ($1, $2, $3, $4, $5, $6, $7)
		ON CONFLICT (user_id, kind, ref_id) DO UPDATE
		   SET score = GREATEST(roadmap_completions.score, EXCLUDED.score),
		       source = CASE WHEN EXCLUDED.source='trainer' THEN 'trainer'
		                     ELSE roadmap_completions.source END,
		       done_at = now()`,
		userID, kind, refID, level, category, score, source)
	return err
}

// UnmarkRoadmapDone снимает отметку. Нужна словарю: «выучил» — обратимое
// суждение, и человек вправе передумать.
func (s *Store) UnmarkRoadmapDone(
	ctx context.Context, userID uuid.UUID, kind string, refID uuid.UUID,
) error {
	_, err := s.Pool.Exec(ctx,
		`DELETE FROM roadmap_completions WHERE user_id=$1 AND kind=$2 AND ref_id=$3`,
		userID, kind, refID)
	return err
}

// --------------------------------------------------------------------- цель

// GetRoadmapTarget возвращает уровень, к которому идёт человек.
func (s *Store) GetRoadmapTarget(ctx context.Context, userID uuid.UUID) (string, error) {
	var target string
	err := s.Pool.QueryRow(ctx,
		`SELECT roadmap_target_level FROM users WHERE id=$1`, userID).Scan(&target)
	if errors.Is(err, pgx.ErrNoRows) {
		return "", nil
	}
	return target, err
}

// SetRoadmapTarget записывает цель. Пустая строка снимает её: отказаться от
// цели — такое же законное действие, как выбрать.
func (s *Store) SetRoadmapTarget(ctx context.Context, userID uuid.UUID, level string) (string, error) {
	target := ""
	if strings.TrimSpace(level) != "" {
		target = roadmap.NormalizeLevel(level)
		if target == "" {
			return "", ErrRoadmapUnknownLevel
		}
	}
	_, err := s.Pool.Exec(ctx,
		`UPDATE users SET roadmap_target_level=$2 WHERE id=$1`, userID, target)
	return target, err
}
