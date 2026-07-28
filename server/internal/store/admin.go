package store

import (
	"context"
	"encoding/json"
	"errors"
	"strings"
	"time"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
)

var ErrCourseReleaseNotFound = errors.New("версия курса не найдена")

type AdminOverview struct {
	Users            int64        `json:"users"`
	OnlineNow        int64        `json:"onlineNow"`
	Active24Hours    int64        `json:"active24Hours"`
	Books            int64        `json:"books"`
	Vocabulary       int64        `json:"vocabulary"`
	CourseLearners   int64        `json:"courseLearners"`
	PublishedCourses int64        `json:"publishedCourses"`
	OpenIncidents    int64        `json:"openIncidents"`
	NewUsers         []DailyPoint `json:"newUsers"`
}

type DailyPoint struct {
	Date  string `json:"date"`
	Count int64  `json:"count"`
}

type AdminUser struct {
	ID             uuid.UUID  `json:"id"`
	Email          string     `json:"email"`
	DisplayName    string     `json:"displayName"`
	IsAdmin        bool       `json:"isAdmin"`
	CreatedAt      time.Time  `json:"createdAt"`
	LastSeenAt     *time.Time `json:"lastSeenAt"`
	Books          int64      `json:"books"`
	Vocabulary     int64      `json:"vocabulary"`
	CoursesStarted int64      `json:"coursesStarted"`
}

type Incident struct {
	ID          uuid.UUID       `json:"id"`
	Fingerprint string          `json:"fingerprint"`
	Severity    string          `json:"severity"`
	Source      string          `json:"source"`
	Message     string          `json:"message"`
	Details     json.RawMessage `json:"details"`
	Occurrences int64           `json:"occurrences"`
	FirstSeen   time.Time       `json:"firstSeen"`
	LastSeen    time.Time       `json:"lastSeen"`
	ResolvedAt  *time.Time      `json:"resolvedAt"`
}

type CourseRelease struct {
	ID          uuid.UUID       `json:"id"`
	CourseID    string          `json:"courseId"`
	Version     string          `json:"version"`
	Title       string          `json:"title"`
	Bundle      json.RawMessage `json:"bundle,omitempty"`
	Status      string          `json:"status"`
	CreatedAt   time.Time       `json:"createdAt"`
	UpdatedAt   time.Time       `json:"updatedAt"`
	PublishedAt *time.Time      `json:"publishedAt"`
}

func (s *Store) AdminOverview(ctx context.Context) (*AdminOverview, error) {
	var overview AdminOverview
	err := s.Pool.QueryRow(ctx, `
        SELECT
          (SELECT count(*) FROM users),
          (SELECT count(DISTINCT user_id) FROM sessions
            WHERE last_seen_at >= now() - interval '5 minutes'
              AND expires_at > now()),
          (SELECT count(DISTINCT user_id) FROM sessions
            WHERE last_seen_at >= now() - interval '24 hours'
              AND expires_at > now()),
          (SELECT count(*) FROM books WHERE NOT deleted),
          (SELECT count(*) FROM vocabulary WHERE NOT deleted),
          (SELECT count(DISTINCT user_id) FROM course_progress),
          (SELECT count(*) FROM course_releases WHERE status = 'published'),
          (SELECT count(*) FROM incidents WHERE resolved_at IS NULL)`).
		Scan(
			&overview.Users,
			&overview.OnlineNow,
			&overview.Active24Hours,
			&overview.Books,
			&overview.Vocabulary,
			&overview.CourseLearners,
			&overview.PublishedCourses,
			&overview.OpenIncidents,
		)
	if err != nil {
		return nil, err
	}

	rows, err := s.Pool.Query(ctx, `
        WITH days AS (
          SELECT generate_series(
            current_date - interval '13 days',
            current_date,
            interval '1 day'
          )::date AS day
        )
        SELECT to_char(days.day, 'YYYY-MM-DD'), count(users.id)
          FROM days
          LEFT JOIN users ON users.created_at >= days.day
                         AND users.created_at < days.day + interval '1 day'
         GROUP BY days.day
         ORDER BY days.day`)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	for rows.Next() {
		var point DailyPoint
		if err := rows.Scan(&point.Date, &point.Count); err != nil {
			return nil, err
		}
		overview.NewUsers = append(overview.NewUsers, point)
	}
	return &overview, rows.Err()
}

func (s *Store) ListAdminUsers(
	ctx context.Context,
	query string,
	limit int,
	offset int,
) ([]AdminUser, error) {
	if limit < 1 || limit > 200 {
		limit = 50
	}
	if offset < 0 {
		offset = 0
	}
	query = strings.TrimSpace(query)
	rows, err := s.Pool.Query(ctx, `
        SELECT u.id, u.email, u.display_name, u.is_admin, u.created_at,
               session_stats.last_seen,
               (SELECT count(*) FROM books b
                 WHERE b.user_id = u.id AND NOT b.deleted),
               (SELECT count(*) FROM vocabulary v
                 WHERE v.user_id = u.id AND NOT v.deleted),
               (SELECT count(*) FROM course_progress cp
                 WHERE cp.user_id = u.id)
          FROM users u
          LEFT JOIN LATERAL (
            SELECT max(last_seen_at) AS last_seen
              FROM sessions s
             WHERE s.user_id = u.id
          ) session_stats ON true
         WHERE $1 = ''
            OR u.email ILIKE '%' || $1 || '%'
            OR u.display_name ILIKE '%' || $1 || '%'
         ORDER BY coalesce(session_stats.last_seen, u.created_at) DESC
         LIMIT $2 OFFSET $3`,
		query, limit, offset,
	)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	users := make([]AdminUser, 0)
	for rows.Next() {
		var user AdminUser
		if err := rows.Scan(
			&user.ID,
			&user.Email,
			&user.DisplayName,
			&user.IsAdmin,
			&user.CreatedAt,
			&user.LastSeenAt,
			&user.Books,
			&user.Vocabulary,
			&user.CoursesStarted,
		); err != nil {
			return nil, err
		}
		users = append(users, user)
	}
	return users, rows.Err()
}

func (s *Store) RecordIncident(
	ctx context.Context,
	fingerprint string,
	severity string,
	source string,
	message string,
	details json.RawMessage,
) error {
	if !json.Valid(details) {
		details = json.RawMessage(`{}`)
	}
	_, err := s.Pool.Exec(ctx, `
        INSERT INTO incidents (
          id, fingerprint, severity, source, message, details
        )
        VALUES ($1, $2, $3, $4, $5, $6)
        ON CONFLICT (fingerprint) DO UPDATE SET
          severity = EXCLUDED.severity,
          source = EXCLUDED.source,
          message = EXCLUDED.message,
          details = EXCLUDED.details,
          occurrences = incidents.occurrences + 1,
          last_seen = now(),
          resolved_at = NULL,
          resolved_by = NULL`,
		uuid.New(),
		trunc(fingerprint, 300),
		severity,
		trunc(source, 80),
		trunc(message, 1000),
		[]byte(details),
	)
	return err
}

func (s *Store) ListIncidents(
	ctx context.Context,
	openOnly bool,
	limit int,
) ([]Incident, error) {
	if limit < 1 || limit > 200 {
		limit = 100
	}
	rows, err := s.Pool.Query(ctx, `
        SELECT id, fingerprint, severity, source, message, details,
               occurrences, first_seen, last_seen, resolved_at
          FROM incidents
         WHERE NOT $1 OR resolved_at IS NULL
         ORDER BY resolved_at NULLS FIRST, last_seen DESC
         LIMIT $2`,
		openOnly, limit,
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
			&incident.ID,
			&incident.Fingerprint,
			&incident.Severity,
			&incident.Source,
			&incident.Message,
			&details,
			&incident.Occurrences,
			&incident.FirstSeen,
			&incident.LastSeen,
			&incident.ResolvedAt,
		); err != nil {
			return nil, err
		}
		incident.Details = json.RawMessage(details)
		incidents = append(incidents, incident)
	}
	return incidents, rows.Err()
}

func (s *Store) ResolveIncident(
	ctx context.Context,
	id uuid.UUID,
	adminID uuid.UUID,
) error {
	tag, err := s.Pool.Exec(ctx, `
        UPDATE incidents
           SET resolved_at = now(), resolved_by = $2
         WHERE id = $1`,
		id, adminID,
	)
	if err != nil {
		return err
	}
	if tag.RowsAffected() == 0 {
		return pgx.ErrNoRows
	}
	return nil
}

func scanCourseRelease(row pgx.Row, withBundle bool) (*CourseRelease, error) {
	var release CourseRelease
	var bundle []byte
	var err error
	if withBundle {
		err = row.Scan(
			&release.ID,
			&release.CourseID,
			&release.Version,
			&release.Title,
			&bundle,
			&release.Status,
			&release.CreatedAt,
			&release.UpdatedAt,
			&release.PublishedAt,
		)
		release.Bundle = json.RawMessage(bundle)
	} else {
		err = row.Scan(
			&release.ID,
			&release.CourseID,
			&release.Version,
			&release.Title,
			&release.Status,
			&release.CreatedAt,
			&release.UpdatedAt,
			&release.PublishedAt,
		)
	}
	if errors.Is(err, pgx.ErrNoRows) {
		return nil, ErrCourseReleaseNotFound
	}
	return &release, err
}

func (s *Store) ListCourseReleases(ctx context.Context) ([]CourseRelease, error) {
	rows, err := s.Pool.Query(ctx, `
        SELECT id, course_id, version, title, status,
               created_at, updated_at, published_at
          FROM course_releases
         ORDER BY updated_at DESC`)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	releases := make([]CourseRelease, 0)
	for rows.Next() {
		release, err := scanCourseRelease(rows, false)
		if err != nil {
			return nil, err
		}
		releases = append(releases, *release)
	}
	return releases, rows.Err()
}

func (s *Store) CourseReleaseByID(
	ctx context.Context,
	id uuid.UUID,
) (*CourseRelease, error) {
	return scanCourseRelease(s.Pool.QueryRow(ctx, `
        SELECT id, course_id, version, title, bundle, status,
               created_at, updated_at, published_at
          FROM course_releases
         WHERE id = $1`,
		id,
	), true)
}

func (s *Store) PublishedCourse(
	ctx context.Context,
	courseID string,
) (*CourseRelease, error) {
	return scanCourseRelease(s.Pool.QueryRow(ctx, `
        SELECT id, course_id, version, title, bundle, status,
               created_at, updated_at, published_at
          FROM course_releases
         WHERE course_id = $1 AND status = 'published'`,
		courseID,
	), true)
}

func (s *Store) CreateCourseRelease(
	ctx context.Context,
	adminID uuid.UUID,
	courseID string,
	version string,
	title string,
	bundle json.RawMessage,
) (*CourseRelease, error) {
	id := uuid.New()
	_, err := s.Pool.Exec(ctx, `
        INSERT INTO course_releases (
          id, course_id, version, title, bundle, created_by
        )
        VALUES ($1, $2, $3, $4, $5, $6)`,
		id, courseID, version, title, []byte(bundle), adminID,
	)
	if err != nil {
		return nil, err
	}
	return s.CourseReleaseByID(ctx, id)
}

func (s *Store) UpdateCourseRelease(
	ctx context.Context,
	id uuid.UUID,
	courseID string,
	version string,
	title string,
	bundle json.RawMessage,
) (*CourseRelease, error) {
	tag, err := s.Pool.Exec(ctx, `
        UPDATE course_releases
           SET course_id = $2,
               version = $3,
               title = $4,
               bundle = $5,
               updated_at = now()
         WHERE id = $1 AND status = 'draft'`,
		id, courseID, version, title, []byte(bundle),
	)
	if err != nil {
		return nil, err
	}
	if tag.RowsAffected() == 0 {
		return nil, ErrCourseReleaseNotFound
	}
	return s.CourseReleaseByID(ctx, id)
}

func (s *Store) PublishCourseRelease(
	ctx context.Context,
	id uuid.UUID,
) (*CourseRelease, error) {
	err := s.InTx(ctx, func(tx pgx.Tx) error {
		var courseID string
		if err := tx.QueryRow(ctx, `
            SELECT course_id FROM course_releases WHERE id = $1`,
			id,
		).Scan(&courseID); err != nil {
			if errors.Is(err, pgx.ErrNoRows) {
				return ErrCourseReleaseNotFound
			}
			return err
		}
		if _, err := tx.Exec(ctx, `
            UPDATE course_releases
               SET status = 'archived', updated_at = now()
             WHERE course_id = $1 AND status = 'published'`,
			courseID,
		); err != nil {
			return err
		}
		_, err := tx.Exec(ctx, `
            UPDATE course_releases
               SET status = 'published',
                   published_at = now(),
                   updated_at = now()
             WHERE id = $1`,
			id,
		)
		return err
	})
	if err != nil {
		return nil, err
	}
	return s.CourseReleaseByID(ctx, id)
}
