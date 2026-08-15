package store

import (
	"context"
	"strings"
	"time"

	"github.com/google/uuid"
)

// Подробная статистика админки.
//
// Обзор отвечал на вопрос «сколько всего», но не на вопрос «что происходит».
// Тысяча пользователей и три активных за неделю — это одна и та же строка
// «Пользователи: 1000». Поэтому здесь всё считается окнами: сутки, неделя,
// месяц — и рядом с итогом всегда видно движение.

type Window struct {
	Day   int64 `json:"day"`
	Week  int64 `json:"week"`
	Month int64 `json:"month"`
	Total int64 `json:"total"`
}

type SeriesPoint struct {
	Date  string `json:"date"`
	Count int64  `json:"count"`
}

type SectionUse struct {
	Section string `json:"section"`
	Title   string `json:"title"`
	People  int64  `json:"people"`
}

type AdminStats struct {
	Users      Window `json:"users"`
	Active     Window `json:"active"`
	Books      Window `json:"books"`
	Vocabulary Window `json:"vocabulary"`
	Duels      Window `json:"duels"`
	Lessons    Window `json:"lessons"`
	Quizzes    Window `json:"quizzes"`
	Documents  Window `json:"documents"`

	// Знаки, переведённые в документах, — по ним видно, куда уходит квота
	// DeepL: одна книга съедает столько же, сколько тысяча нажатий на слово.
	DocumentChars Window `json:"documentChars"`

	NewUsers []SeriesPoint `json:"newUsers"`
	ActiveBy []SeriesPoint `json:"activeByDay"`

	Sections []SectionUse `json:"sections"`

	// Хранилище: строки таблиц, по которым понятно, что растёт быстрее всего.
	TranslationCache int64 `json:"translationCache"`
	OpenIncidents    int64 `json:"openIncidents"`
	IncidentsToday   int64 `json:"incidentsToday"`
}

// AdminDetailedStats собирает подробную сводку одним походом в базу на каждый
// блок: запросов немного, а панель открывают редко.
func (s *Store) AdminDetailedStats(ctx context.Context) (*AdminStats, error) {
	stats := &AdminStats{
		NewUsers: []SeriesPoint{},
		ActiveBy: []SeriesPoint{},
		Sections: []SectionUse{},
	}

	// Окна считаются одним запросом: восемь отдельных заходов за теми же
	// цифрами — это восемь round trip'ов ради одной панели.
	err := s.Pool.QueryRow(ctx, `
        SELECT
          (SELECT count(*) FROM users WHERE created_at > now() - interval '24 hours'),
          (SELECT count(*) FROM users WHERE created_at > now() - interval '7 days'),
          (SELECT count(*) FROM users WHERE created_at > now() - interval '30 days'),
          (SELECT count(*) FROM users),

          (SELECT count(DISTINCT user_id) FROM sessions WHERE last_seen_at > now() - interval '24 hours'),
          (SELECT count(DISTINCT user_id) FROM sessions WHERE last_seen_at > now() - interval '7 days'),
          (SELECT count(DISTINCT user_id) FROM sessions WHERE last_seen_at > now() - interval '30 days'),
          (SELECT count(DISTINCT user_id) FROM sessions),

          -- У книг и слов нет даты создания, только последнего изменения:
          -- окна здесь означают «сколько записей трогали», а не «завели».
          (SELECT count(*) FROM books WHERE NOT deleted AND updated_at > now() - interval '24 hours'),
          (SELECT count(*) FROM books WHERE NOT deleted AND updated_at > now() - interval '7 days'),
          (SELECT count(*) FROM books WHERE NOT deleted AND updated_at > now() - interval '30 days'),
          (SELECT count(*) FROM books WHERE NOT deleted),

          (SELECT count(*) FROM vocabulary WHERE NOT deleted AND updated_at > now() - interval '24 hours'),
          (SELECT count(*) FROM vocabulary WHERE NOT deleted AND updated_at > now() - interval '7 days'),
          (SELECT count(*) FROM vocabulary WHERE NOT deleted AND updated_at > now() - interval '30 days'),
          (SELECT count(*) FROM vocabulary WHERE NOT deleted)`).
		Scan(
			&stats.Users.Day, &stats.Users.Week, &stats.Users.Month, &stats.Users.Total,
			&stats.Active.Day, &stats.Active.Week, &stats.Active.Month, &stats.Active.Total,
			&stats.Books.Day, &stats.Books.Week, &stats.Books.Month, &stats.Books.Total,
			&stats.Vocabulary.Day, &stats.Vocabulary.Week, &stats.Vocabulary.Month, &stats.Vocabulary.Total,
		)
	if err != nil {
		return nil, err
	}

	// Комнаты матча уборщик удаляет, поэтому «всего» тут — это «всего живых
	// сейчас», и врать про накопленный итог не нужно.
	err = s.Pool.QueryRow(ctx, `
        SELECT
          (SELECT count(*) FROM duel_rooms WHERE created_at > now() - interval '24 hours'),
          (SELECT count(*) FROM duel_rooms WHERE created_at > now() - interval '7 days'),
          (SELECT count(*) FROM duel_rooms WHERE created_at > now() - interval '30 days'),
          (SELECT count(*) FROM duel_rooms),

          (SELECT count(*) FROM lesson_progress WHERE updated_at > now() - interval '24 hours'),
          (SELECT count(*) FROM lesson_progress WHERE updated_at > now() - interval '7 days'),
          (SELECT count(*) FROM lesson_progress WHERE updated_at > now() - interval '30 days'),
          (SELECT count(*) FROM lesson_progress),

          (SELECT count(*) FROM quiz_attempts WHERE created_at > now() - interval '24 hours'),
          (SELECT count(*) FROM quiz_attempts WHERE created_at > now() - interval '7 days'),
          (SELECT count(*) FROM quiz_attempts WHERE created_at > now() - interval '30 days'),
          (SELECT count(*) FROM quiz_attempts),

          (SELECT count(*) FROM document_translations WHERE created_at > now() - interval '24 hours'),
          (SELECT count(*) FROM document_translations WHERE created_at > now() - interval '7 days'),
          (SELECT count(*) FROM document_translations WHERE created_at > now() - interval '30 days'),
          (SELECT count(*) FROM document_translations)`).
		Scan(
			&stats.Duels.Day, &stats.Duels.Week, &stats.Duels.Month, &stats.Duels.Total,
			&stats.Lessons.Day, &stats.Lessons.Week, &stats.Lessons.Month, &stats.Lessons.Total,
			&stats.Quizzes.Day, &stats.Quizzes.Week, &stats.Quizzes.Month, &stats.Quizzes.Total,
			&stats.Documents.Day, &stats.Documents.Week, &stats.Documents.Month, &stats.Documents.Total,
		)
	if err != nil {
		return nil, err
	}

	err = s.Pool.QueryRow(ctx, `
        SELECT
          (SELECT count(*) FROM translation_cache),
          (SELECT count(*) FROM incidents WHERE resolved_at IS NULL),
          (SELECT count(*) FROM incidents WHERE last_seen > now() - interval '24 hours'),

          (SELECT coalesce(sum(translated_chars), 0) FROM document_translations
            WHERE created_at > now() - interval '24 hours'),
          (SELECT coalesce(sum(translated_chars), 0) FROM document_translations
            WHERE created_at > now() - interval '7 days'),
          (SELECT coalesce(sum(translated_chars), 0) FROM document_translations
            WHERE created_at > now() - interval '30 days'),
          (SELECT coalesce(sum(translated_chars), 0) FROM document_translations)`).
		Scan(
			&stats.TranslationCache, &stats.OpenIncidents, &stats.IncidentsToday,
			&stats.DocumentChars.Day, &stats.DocumentChars.Week,
			&stats.DocumentChars.Month, &stats.DocumentChars.Total,
		)
	if err != nil {
		return nil, err
	}

	if stats.NewUsers, err = s.series(ctx, `
        SELECT to_char(days.day, 'YYYY-MM-DD'), count(users.id)
          FROM days
          LEFT JOIN users ON users.created_at >= days.day
                         AND users.created_at < days.day + interval '1 day'
         GROUP BY days.day ORDER BY days.day`); err != nil {
		return nil, err
	}
	if stats.ActiveBy, err = s.series(ctx, `
        SELECT to_char(days.day, 'YYYY-MM-DD'), count(DISTINCT sessions.user_id)
          FROM days
          LEFT JOIN sessions ON sessions.last_seen_at >= days.day
                            AND sessions.last_seen_at < days.day + interval '1 day'
         GROUP BY days.day ORDER BY days.day`); err != nil {
		return nil, err
	}

	// Разделы: сколько РАЗНЫХ людей трогали каждый за неделю. Именно люди, а не
	// действия: десять книг одного читателя — это один читатель.
	sections := []struct {
		id, title, query string
	}{
		{"reader", "Читалка", `SELECT count(DISTINCT user_id) FROM books
                                 WHERE NOT deleted AND updated_at > now() - interval '7 days'`},
		{"vocabulary", "Словарь", `SELECT count(DISTINCT user_id) FROM vocabulary
                                     WHERE NOT deleted AND updated_at > now() - interval '7 days'`},
		{"course", "Курс", `SELECT count(DISTINCT user_id) FROM course_progress
                              WHERE updated_at > now() - interval '7 days'`},
		{"roadmap", "Дорожная карта", `SELECT count(DISTINCT user_id) FROM roadmap_completions
                                         WHERE done_at > now() - interval '7 days'`},
		{"garden", "Сад", `SELECT count(DISTINCT user_id) FROM garden_profiles
                             WHERE updated_at > now() - interval '7 days'`},
		{"lessons", "Уроки преподавателей", `SELECT count(DISTINCT user_id) FROM lesson_progress
                                               WHERE updated_at > now() - interval '7 days'`},
		{"microfeed", "Вукоток", `SELECT count(DISTINCT user_id) FROM micro_feed_interactions
                                    WHERE created_at > now() - interval '7 days'`},
		{"quiz", "Тесты", `SELECT count(DISTINCT user_id) FROM quiz_attempts
                             WHERE created_at > now() - interval '7 days'`},
	}
	for _, section := range sections {
		var people int64
		if err := s.Pool.QueryRow(ctx, section.query).Scan(&people); err != nil {
			// Раздел, у которого нет своей таблицы на этой базе, просто не
			// показывается: панель не должна падать из-за одной строки.
			continue
		}
		stats.Sections = append(stats.Sections, SectionUse{
			Section: section.id, Title: section.title, People: people,
		})
	}
	return stats, nil
}

// series считает ряд по дням за две недели. Дни берутся из generate_series,
// чтобы в графике были и пустые сутки: без них провал выглядит как отсутствие
// данных, а не как отсутствие людей.
func (s *Store) series(ctx context.Context, query string) ([]SeriesPoint, error) {
	rows, err := s.Pool.Query(ctx, `
        WITH days AS (
          SELECT generate_series(
            current_date - interval '13 days', current_date, interval '1 day'
          )::date AS day
        )`+query)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	points := []SeriesPoint{}
	for rows.Next() {
		var point SeriesPoint
		if err := rows.Scan(&point.Date, &point.Count); err != nil {
			return nil, err
		}
		points = append(points, point)
	}
	return points, rows.Err()
}

// IncidentFilter — отбор для журнала ошибок.
type IncidentFilter struct {
	OpenOnly bool
	Severity string
	Source   string
	Query    string
	Hours    int
	Limit    int
}

// IncidentFacet — сколько чего в журнале. По нему в панели рисуются кнопки
// отбора с числами, и видно, где именно горит.
type IncidentFacet struct {
	Value string `json:"value"`
	Count int64  `json:"count"`
}

// ListIncidentsFiltered возвращает журнал с отбором.
//
// Раньше отбор был один — «показать закрытые». На живом сервере это список из
// сотни строк, в котором одна и та же ручка встречается тридцать раз, и найти
// в нём новую ошибку нельзя.
func (s *Store) ListIncidentsFiltered(
	ctx context.Context,
	filter IncidentFilter,
) ([]Incident, error) {
	limit := filter.Limit
	if limit < 1 || limit > 300 {
		limit = 100
	}
	hours := filter.Hours
	if hours < 0 || hours > 24*90 {
		hours = 0
	}
	rows, err := s.Pool.Query(ctx, `
        SELECT id, fingerprint, severity, source, message, details,
               occurrences, first_seen, last_seen, resolved_at
          FROM incidents
         WHERE (NOT $1 OR resolved_at IS NULL)
           AND ($2 = '' OR severity = $2)
           AND ($3 = '' OR source = $3)
           AND ($4 = '' OR message ILIKE '%' || $4 || '%'
                        OR fingerprint ILIKE '%' || $4 || '%'
                        OR details::text ILIKE '%' || $4 || '%')
           AND ($5 = 0 OR last_seen > now() - make_interval(hours => $5))
         ORDER BY resolved_at NULLS FIRST, last_seen DESC
         LIMIT $6`,
		filter.OpenOnly,
		strings.TrimSpace(filter.Severity),
		strings.TrimSpace(filter.Source),
		strings.TrimSpace(filter.Query),
		hours,
		limit,
	)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	incidents := make([]Incident, 0)
	for rows.Next() {
		var incident Incident
		var details []byte
		if err := rows.Scan(
			&incident.ID, &incident.Fingerprint, &incident.Severity, &incident.Source,
			&incident.Message, &details, &incident.Occurrences,
			&incident.FirstSeen, &incident.LastSeen, &incident.ResolvedAt,
		); err != nil {
			return nil, err
		}
		incident.Details = details
		incidents = append(incidents, incident)
	}
	return incidents, rows.Err()
}

// IncidentFacets считает открытые инциденты по источникам и важности.
func (s *Store) IncidentFacets(ctx context.Context) (map[string][]IncidentFacet, error) {
	facets := map[string][]IncidentFacet{"source": {}, "severity": {}}
	for key, column := range map[string]string{"source": "source", "severity": "severity"} {
		rows, err := s.Pool.Query(ctx, `
            SELECT `+column+`, count(*)
              FROM incidents
             WHERE resolved_at IS NULL
             GROUP BY 1 ORDER BY 2 DESC`)
		if err != nil {
			return nil, err
		}
		for rows.Next() {
			var facet IncidentFacet
			if err := rows.Scan(&facet.Value, &facet.Count); err != nil {
				rows.Close()
				return nil, err
			}
			facets[key] = append(facets[key], facet)
		}
		err = rows.Err()
		rows.Close()
		if err != nil {
			return nil, err
		}
	}
	return facets, nil
}

// ResolveIncidentsBySource закрывает все открытые инциденты одного источника.
// Пригождается после починки: тридцать строк одной и той же ручки закрываются
// одним движением, а не тридцатью нажатиями.
func (s *Store) ResolveIncidentsBySource(
	ctx context.Context,
	source string,
	adminID uuid.UUID,
) (int64, error) {
	tag, err := s.Pool.Exec(ctx, `
        UPDATE incidents
           SET resolved_at = now(), resolved_by = $2
         WHERE resolved_at IS NULL AND source = $1`,
		strings.TrimSpace(source), adminID,
	)
	if err != nil {
		return 0, err
	}
	return tag.RowsAffected(), nil
}

// PurgeResolvedIncidents убирает закрытые инциденты старше срока.
func (s *Store) PurgeResolvedIncidents(ctx context.Context, olderThan time.Duration) (int64, error) {
	tag, err := s.Pool.Exec(ctx, `
        DELETE FROM incidents
         WHERE resolved_at IS NOT NULL
           AND resolved_at < now() - make_interval(secs => $1)`,
		olderThan.Seconds(),
	)
	if err != nil {
		return 0, err
	}
	return tag.RowsAffected(), nil
}
