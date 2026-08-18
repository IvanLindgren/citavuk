package store

import (
	"context"
	"encoding/json"
	"fmt"
	"time"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
)

// «На каждый день»: десять слов, текст с ними и упражнения.
//
// Слова берутся из словаря дорожной карты (`roadmap_words`) — того же, что
// показывает раздел «Словарь». Отдельного списка для окна нет намеренно: два
// списка слов в одном приложении однажды разошлись бы, и человек учил бы в
// окне не то, что потом спросит карта.

// DailyWordCount — сколько слов в наборе. Десять — это «успею за кофе», а не
// «сяду на час».
const DailyWordCount = 10

// DailyWord — слово набора вместе с примером.
type DailyWord struct {
	Lemma       string `json:"lemma"`
	Translation string `json:"translation"`
	Pos         string `json:"pos,omitempty"`
	Note        string `json:"note,omitempty"`
	Theme       string `json:"theme"`
	Example     string `json:"example,omitempty"`
	ExampleRu   string `json:"exampleTranslation,omitempty"`
}

// DailyExercise — задание к тексту.
type DailyExercise struct {
	Kind     string   `json:"kind"`
	Question string   `json:"question"`
	Options  []string `json:"options,omitempty"`
	Answer   string   `json:"answer"`
	Hint     string   `json:"hint,omitempty"`
}

// DailyLesson — то, что сочинила Gemma по словам набора.
type DailyLesson struct {
	Title     string          `json:"title"`
	Text      string          `json:"text"`
	Exercises []DailyExercise `json:"exercises"`
}

// DailySet — набор на один день.
type DailySet struct {
	ID      uuid.UUID    `json:"id"`
	Day     string       `json:"day"`
	Level   string       `json:"level"`
	Words   []DailyWord  `json:"words"`
	Lesson  *DailyLesson `json:"lesson,omitempty"`
	Learned []string     `json:"learned"`
}

// DailySettings — что человек выбрал для окна.
type DailySettings struct {
	Themes  []string `json:"themes"`
	Enabled bool     `json:"enabled"`
}

// DailyTheme — тема словаря вместе с числом слов на уровне.
type DailyTheme struct {
	Theme string `json:"theme"`
	Words int    `json:"words"`
}

// DailyProgress — чем человек занимался сегодня и что пора вспомнить.
type DailyProgress struct {
	// Повторено сегодня и сколько карточек ждёт очереди.
	ReviewedToday int `json:"reviewedToday"`
	DueNow        int `json:"dueNow"`
	// Слов в словаре всего и сколько из них считаются выученными.
	Words  int `json:"words"`
	Strong int `json:"strong"`
	// Забытые: давно выученные слова, у которых срок повторения давно прошёл.
	Faded []FadedWord `json:"faded"`
	// Дней подряд с повторениями. Считается по последним повторениям.
	Streak int `json:"streak"`
}

// FadedWord — слово, которое пора вспомнить.
type FadedWord struct {
	Word        string `json:"word"`
	Translation string `json:"translation"`
	// На сколько дней просрочено повторение.
	OverdueDays int `json:"overdueDays"`
}

// DailySettingsOf читает настройки окна. Их отсутствие — не ошибка: человек
// просто ещё не открывал окно, и тогда оно и спросит про темы.
func (s *Store) DailySettingsOf(ctx context.Context, user uuid.UUID) (DailySettings, bool, error) {
	settings := DailySettings{Themes: []string{}, Enabled: true}
	var themes []string
	err := s.Pool.QueryRow(ctx,
		`SELECT themes, enabled FROM daily_settings WHERE user_id = $1`,
		user).Scan(&themes, &settings.Enabled)
	if err == pgx.ErrNoRows {
		return settings, false, nil
	}
	if err != nil {
		return settings, false, fmt.Errorf("настройки окна дня: %w", err)
	}
	if themes != nil {
		settings.Themes = themes
	}
	return settings, true, nil
}

// SaveDailySettings сохраняет выбор тем.
func (s *Store) SaveDailySettings(ctx context.Context, user uuid.UUID, settings DailySettings) error {
	themes := settings.Themes
	if themes == nil {
		themes = []string{}
	}
	_, err := s.Pool.Exec(ctx, `
        INSERT INTO daily_settings (user_id, themes, enabled)
             VALUES ($1, $2, $3)
        ON CONFLICT (user_id) DO UPDATE
                SET themes = EXCLUDED.themes,
                    enabled = EXCLUDED.enabled,
                    updated_at = now()`,
		user, themes, settings.Enabled)
	if err != nil {
		return fmt.Errorf("сохранение настроек окна дня: %w", err)
	}
	return nil
}

// DailyThemes — темы словаря на уровне вместе с числом слов.
//
// Список приходит с сервера, а не зашит в клиентах: темы правятся в админке, и
// вторая копия в приложении разошлась бы с сайтом на первой же правке.
func (s *Store) DailyThemes(ctx context.Context, level string) ([]DailyTheme, error) {
	rows, err := s.Pool.Query(ctx, `
        SELECT theme, count(*)
          FROM roadmap_words
         WHERE status = 'published' AND ($1 = '' OR level = $1)
      GROUP BY theme
      ORDER BY count(*) DESC, theme`, level)
	if err != nil {
		return nil, fmt.Errorf("темы словаря: %w", err)
	}
	defer rows.Close()

	themes := []DailyTheme{}
	for rows.Next() {
		var theme DailyTheme
		if err := rows.Scan(&theme.Theme, &theme.Words); err != nil {
			return nil, err
		}
		themes = append(themes, theme)
	}
	return themes, rows.Err()
}

// TodayDailySet отдаёт набор на сегодня или nil, если его ещё не собирали.
func (s *Store) TodayDailySet(ctx context.Context, user uuid.UUID, day time.Time) (*DailySet, error) {
	var (
		set     DailySet
		words   []byte
		lesson  []byte
		learned []byte
		date    time.Time
	)
	err := s.Pool.QueryRow(ctx, `
        SELECT id, day, level, words, lesson, learned
          FROM daily_sets
         WHERE user_id = $1 AND day = $2`,
		user, day.Format("2006-01-02")).
		Scan(&set.ID, &date, &set.Level, &words, &lesson, &learned)
	if err == pgx.ErrNoRows {
		return nil, nil
	}
	if err != nil {
		return nil, fmt.Errorf("набор дня: %w", err)
	}

	set.Day = date.Format("2006-01-02")
	if err := json.Unmarshal(words, &set.Words); err != nil {
		set.Words = []DailyWord{}
	}
	if err := json.Unmarshal(learned, &set.Learned); err != nil || set.Learned == nil {
		set.Learned = []string{}
	}
	if len(lesson) > 0 {
		var parsed DailyLesson
		if json.Unmarshal(lesson, &parsed) == nil && parsed.Text != "" {
			set.Lesson = &parsed
		}
	}
	return &set, nil
}

// PickDailyWords выбирает слова, которых человек ещё не видел в окне.
//
// Уровень берётся с аккаунта, темы — из настроек. Пустой список тем означает
// «всё подряд»: выбирать все темы поимённо ради этого незачем.
func (s *Store) PickDailyWords(
	ctx context.Context,
	user uuid.UUID,
	level string,
	themes []string,
	limit int,
) ([]DailyWord, error) {
	if limit <= 0 {
		limit = DailyWordCount
	}
	if themes == nil {
		themes = []string{}
	}

	// Условие «не показывать виденное» включается параметром, а не склейкой
	// строк. Дописанное строкой, на втором круге оно из запроса выпадало — и
	// уносило с собой единственное упоминание $1. Сам параметр при этом
	// продолжал уходить в базу, а Postgres не мог вывести тип того, чего в
	// тексте запроса нет (42P18): окно дня отвечало 500 ровно тем, у кого
	// слова уровня кончились или выбрана узкая тема.
	//
	// Случайный порядок нужен, чтобы слова темы не шли по алфавиту: иначе
	// первые дни человек учил бы только «а».
	const query = `
        SELECT w.lemma, w.translation, w.pos, w.note, w.theme,
               w.example, w.example_translation
          FROM roadmap_words w
         WHERE w.status = 'published'
           AND ($2 = '' OR w.level = $2)
           AND (cardinality($3::text[]) = 0 OR w.theme = ANY($3))
           AND (NOT $5::boolean OR NOT EXISTS (
                 SELECT 1 FROM daily_seen s
                  WHERE s.user_id = $1 AND s.lemma = w.lemma))
      ORDER BY random()
         LIMIT $4`

	pick := func(skipSeen bool) ([]DailyWord, error) {
		rows, err := s.Pool.Query(ctx, query, user, level, themes, limit, skipSeen)
		if err != nil {
			return nil, fmt.Errorf("подбор слов дня: %w", err)
		}
		defer rows.Close()

		words := []DailyWord{}
		for rows.Next() {
			var word DailyWord
			if err := rows.Scan(&word.Lemma, &word.Translation, &word.Pos,
				&word.Note, &word.Theme, &word.Example, &word.ExampleRu); err != nil {
				return nil, err
			}
			words = append(words, word)
		}
		return words, rows.Err()
	}

	words, err := pick(true)
	if err != nil {
		return nil, err
	}
	// Слова уровня кончились — начинаем круг заново, а не показываем пустое
	// окно. Повторить выученное полезнее, чем не открыть раздел вовсе.
	if len(words) < limit {
		repeat, err := pick(false)
		if err != nil {
			return nil, err
		}
		have := map[string]bool{}
		for _, word := range words {
			have[word.Lemma] = true
		}
		for _, word := range repeat {
			if len(words) >= limit {
				break
			}
			if !have[word.Lemma] {
				words = append(words, word)
				have[word.Lemma] = true
			}
		}
	}
	return words, nil
}

// SaveDailySet записывает собранный набор и помечает слова показанными.
func (s *Store) SaveDailySet(
	ctx context.Context,
	user uuid.UUID,
	day time.Time,
	level string,
	words []DailyWord,
) (*DailySet, error) {
	payload, err := json.Marshal(words)
	if err != nil {
		return nil, err
	}

	tx, err := s.Pool.Begin(ctx)
	if err != nil {
		return nil, err
	}
	defer tx.Rollback(ctx)

	var id uuid.UUID
	// Гонка двух вкладок: набор на день один, второй запрос забирает первый.
	err = tx.QueryRow(ctx, `
        INSERT INTO daily_sets (user_id, day, level, words)
             VALUES ($1, $2, $3, $4)
        ON CONFLICT (user_id, day) DO UPDATE SET updated_at = now()
          RETURNING id`,
		user, day.Format("2006-01-02"), level, payload).Scan(&id)
	if err != nil {
		return nil, fmt.Errorf("сохранение набора дня: %w", err)
	}

	for _, word := range words {
		if _, err := tx.Exec(ctx, `
            INSERT INTO daily_seen (user_id, lemma, level)
                 VALUES ($1, $2, $3)
            ON CONFLICT (user_id, lemma) DO NOTHING`,
			user, word.Lemma, level); err != nil {
			return nil, fmt.Errorf("отметка показанного слова: %w", err)
		}
	}

	if err := tx.Commit(ctx); err != nil {
		return nil, err
	}
	return &DailySet{
		ID:      id,
		Day:     day.Format("2006-01-02"),
		Level:   level,
		Words:   words,
		Learned: []string{},
	}, nil
}

// SaveDailyLesson докладывает к набору текст и упражнения.
func (s *Store) SaveDailyLesson(ctx context.Context, id uuid.UUID, lesson DailyLesson) error {
	payload, err := json.Marshal(lesson)
	if err != nil {
		return err
	}
	_, err = s.Pool.Exec(ctx,
		`UPDATE daily_sets SET lesson = $2, updated_at = now() WHERE id = $1`,
		id, payload)
	if err != nil {
		return fmt.Errorf("сохранение текста дня: %w", err)
	}
	return nil
}

// MarkDailyLearned отмечает слово выученным. Повторная отметка ничего не
// меняет: человек может нажать дважды, и это не повод для ошибки.
func (s *Store) MarkDailyLearned(ctx context.Context, id uuid.UUID, lemma string) ([]string, error) {
	var raw []byte
	err := s.Pool.QueryRow(ctx, `
        UPDATE daily_sets
           SET learned = CASE
                   WHEN learned @> to_jsonb(array[$2::text]) THEN learned
                   ELSE learned || to_jsonb(array[$2::text])
               END,
               updated_at = now()
         WHERE id = $1
     RETURNING learned`, id, lemma).Scan(&raw)
	if err != nil {
		return nil, fmt.Errorf("отметка выученного: %w", err)
	}
	learned := []string{}
	_ = json.Unmarshal(raw, &learned)
	return learned, nil
}

// DailyProgressOf считает, чем человек занимался сегодня и что пора вспомнить.
//
// Всё берётся из синхронизированных карточек: это те же данные, по которым
// работает повторение в приложении, поэтому виджет и окно не могут разойтись.
func (s *Store) DailyProgressOf(ctx context.Context, user uuid.UUID, now time.Time) (DailyProgress, error) {
	progress := DailyProgress{Faded: []FadedWord{}}
	dayStart := time.Date(now.Year(), now.Month(), now.Day(), 0, 0, 0, 0, now.Location())

	err := s.Pool.QueryRow(ctx, `
        SELECT
            count(*) FILTER (WHERE r.last_reviewed >= $2),
            count(*) FILTER (WHERE r.due_at <= $3),
            count(*),
            count(*) FILTER (WHERE r.interval_days >= 21)
          FROM reviews r
         WHERE r.user_id = $1 AND NOT r.deleted`,
		user, dayStart.UnixMilli(), now.UnixMilli()).
		Scan(&progress.ReviewedToday, &progress.DueNow, &progress.Words, &progress.Strong)
	if err != nil {
		return progress, fmt.Errorf("сводка повторений: %w", err)
	}

	// Забытые: те, что человек когда-то знал (интервал вырос), но срок ушёл
	// далеко назад. Просто «просроченные» сюда не годятся — их бывают сотни, и
	// среди них теряется то, что действительно жалко потерять.
	rows, err := s.Pool.Query(ctx, `
        SELECT v.word, v.translation,
               ($3 - r.due_at) / 86400000 AS overdue
          FROM reviews r
          JOIN vocabulary v ON v.id = r.vocab_id AND NOT v.deleted
         WHERE r.user_id = $1
           AND NOT r.deleted
           AND r.interval_days >= 7
           AND r.due_at < $2
      ORDER BY r.due_at
         LIMIT 5`,
		user, now.Add(-3*24*time.Hour).UnixMilli(), now.UnixMilli())
	if err != nil {
		return progress, fmt.Errorf("забытые слова: %w", err)
	}
	defer rows.Close()

	for rows.Next() {
		var word FadedWord
		if err := rows.Scan(&word.Word, &word.Translation, &word.OverdueDays); err != nil {
			return progress, err
		}
		progress.Faded = append(progress.Faded, word)
	}
	if err := rows.Err(); err != nil {
		return progress, err
	}

	progress.Streak, err = s.dailyStreak(ctx, user, now)
	if err != nil {
		return progress, err
	}
	return progress, nil
}

// dailyStreak — сколько дней подряд человек что-то повторял, считая сегодня.
//
// Пропущенный вчера день не обнуляет счёт сразу: пока сегодняшний день не
// кончился, «вчера и сегодня» и «только вчера» — одинаково живая серия.
func (s *Store) dailyStreak(ctx context.Context, user uuid.UUID, now time.Time) (int, error) {
	rows, err := s.Pool.Query(ctx, `
        SELECT DISTINCT (to_timestamp(r.last_reviewed / 1000)::date) AS day
          FROM reviews r
         WHERE r.user_id = $1 AND r.last_reviewed IS NOT NULL
      ORDER BY day DESC
         LIMIT 400`, user)
	if err != nil {
		return 0, fmt.Errorf("серия дней: %w", err)
	}
	defer rows.Close()

	today := time.Date(now.Year(), now.Month(), now.Day(), 0, 0, 0, 0, time.UTC)
	streak := 0
	expect := today
	for rows.Next() {
		var day time.Time
		if err := rows.Scan(&day); err != nil {
			return 0, err
		}
		day = time.Date(day.Year(), day.Month(), day.Day(), 0, 0, 0, 0, time.UTC)
		if day.Equal(expect) {
			streak++
			expect = expect.AddDate(0, 0, -1)
			continue
		}
		// Сегодня ещё не занимались — серия считается со вчера.
		if streak == 0 && day.Equal(today.AddDate(0, 0, -1)) {
			streak++
			expect = day.AddDate(0, 0, -1)
			continue
		}
		break
	}
	return streak, rows.Err()
}
