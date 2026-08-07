package store

import (
	"context"
	"crypto/rand"
	"encoding/base64"
	"encoding/json"
	"errors"
	"fmt"
	"strings"
	"time"

	"github.com/citavuk/server/internal/lexicon"
	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
)

var (
	ErrTeacherRequired   = errors.New("нужны права преподавателя")
	ErrLessonNotFound    = errors.New("урок не найден")
	ErrRevisionNotFound  = errors.New("версия урока не найдена")
	ErrApplicationAbsent = errors.New("заявка преподавателя не найдена")
)

type TeacherApplication struct {
	UserID             uuid.UUID       `json:"userId"`
	SerbianLevel       string          `json:"serbianLevel"`
	NativeSpeaker      bool            `json:"nativeSpeaker"`
	RussianLevel       string          `json:"russianLevel"`
	Certificates       string          `json:"certificates"`
	TeachingExperience string          `json:"teachingExperience"`
	SocialLinks        json.RawMessage `json:"socialLinks"`
	MonetizationIntent string          `json:"monetizationIntent"`
	Status             string          `json:"status"`
	AdminComment       string          `json:"adminComment"`
	Email              string          `json:"email,omitempty"`
	DisplayName        string          `json:"displayName,omitempty"`
	CreatedAt          time.Time       `json:"createdAt"`
	UpdatedAt          time.Time       `json:"updatedAt"`
}

type TeacherApplicationInput struct {
	SerbianLevel       string
	NativeSpeaker      bool
	RussianLevel       string
	Certificates       string
	TeachingExperience string
	SocialLinks        json.RawMessage
	MonetizationIntent string
}

func (s *Store) UpsertTeacherApplication(ctx context.Context, userID uuid.UUID, in TeacherApplicationInput) (*TeacherApplication, error) {
	if len(in.SocialLinks) == 0 {
		in.SocialLinks = json.RawMessage("[]")
	}
	_, err := s.Pool.Exec(ctx, `
        INSERT INTO teacher_applications
            (user_id, serbian_level, native_speaker, russian_level, certificates,
             teaching_experience, social_links, monetization_intent)
        VALUES ($1,$2,$3,$4,$5,$6,$7,$8)
        ON CONFLICT (user_id) DO UPDATE SET
            serbian_level = EXCLUDED.serbian_level,
            native_speaker = EXCLUDED.native_speaker,
            russian_level = EXCLUDED.russian_level,
            certificates = EXCLUDED.certificates,
            teaching_experience = EXCLUDED.teaching_experience,
            social_links = EXCLUDED.social_links,
            monetization_intent = EXCLUDED.monetization_intent,
            status = 'pending', admin_comment = '', reviewed_by = NULL,
            reviewed_at = NULL, updated_at = now()
        WHERE teacher_applications.status IN ('rejected','suspended')`,
		userID, in.SerbianLevel, in.NativeSpeaker, in.RussianLevel,
		in.Certificates, in.TeachingExperience, in.SocialLinks, in.MonetizationIntent)
	if err != nil {
		return nil, err
	}
	return s.TeacherApplication(ctx, userID)
}

func (s *Store) TeacherApplication(ctx context.Context, userID uuid.UUID) (*TeacherApplication, error) {
	var a TeacherApplication
	err := s.Pool.QueryRow(ctx, `
        SELECT user_id, serbian_level, native_speaker, russian_level, certificates,
               teaching_experience, social_links, monetization_intent, status,
               admin_comment, created_at, updated_at
          FROM teacher_applications WHERE user_id = $1`, userID).Scan(
		&a.UserID, &a.SerbianLevel, &a.NativeSpeaker, &a.RussianLevel,
		&a.Certificates, &a.TeachingExperience, &a.SocialLinks,
		&a.MonetizationIntent, &a.Status, &a.AdminComment, &a.CreatedAt, &a.UpdatedAt)
	if errors.Is(err, pgx.ErrNoRows) {
		return nil, ErrApplicationAbsent
	}
	return &a, err
}

func (s *Store) IsApprovedTeacher(ctx context.Context, userID uuid.UUID) (bool, error) {
	var approved bool
	err := s.Pool.QueryRow(ctx, `
        SELECT status = 'approved' FROM teacher_applications WHERE user_id = $1`, userID).Scan(&approved)
	if errors.Is(err, pgx.ErrNoRows) {
		return false, nil
	}
	return approved, err
}

func (s *Store) ListTeacherApplications(ctx context.Context, status string) ([]TeacherApplication, error) {
	rows, err := s.Pool.Query(ctx, `
        SELECT a.user_id, a.serbian_level, a.native_speaker, a.russian_level,
               a.certificates, a.teaching_experience, a.social_links,
               a.monetization_intent, a.status, a.admin_comment,
               u.email, u.display_name, a.created_at, a.updated_at
          FROM teacher_applications a JOIN users u ON u.id = a.user_id
         WHERE ($1 = '' OR a.status = $1)
         ORDER BY CASE a.status WHEN 'pending' THEN 0 ELSE 1 END, a.updated_at`, status)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	items := []TeacherApplication{}
	for rows.Next() {
		var a TeacherApplication
		if err := rows.Scan(&a.UserID, &a.SerbianLevel, &a.NativeSpeaker,
			&a.RussianLevel, &a.Certificates, &a.TeachingExperience,
			&a.SocialLinks, &a.MonetizationIntent, &a.Status, &a.AdminComment,
			&a.Email, &a.DisplayName, &a.CreatedAt, &a.UpdatedAt); err != nil {
			return nil, err
		}
		items = append(items, a)
	}
	return items, rows.Err()
}

func (s *Store) ReviewTeacherApplication(ctx context.Context, userID, adminID uuid.UUID, status, comment string) error {
	return s.InTx(ctx, func(tx pgx.Tx) error {
		tag, err := tx.Exec(ctx, `
            UPDATE teacher_applications SET status=$2, admin_comment=$3,
                   reviewed_by=$4, reviewed_at=now(), updated_at=now()
             WHERE user_id=$1`, userID, status, comment, adminID)
		if err != nil {
			return err
		}
		if tag.RowsAffected() == 0 {
			return ErrApplicationAbsent
		}
		if status == "approved" {
			_, err = tx.Exec(ctx, `
                INSERT INTO teacher_profiles (user_id, public_name)
                SELECT id, display_name FROM users WHERE id=$1
                ON CONFLICT (user_id) DO NOTHING`, userID)
			if err != nil {
				return err
			}
		}
		_, err = tx.Exec(ctx, `
            INSERT INTO user_notifications (id,user_id,kind,title,body,target_url)
            VALUES ($1,$2,'teacher_application',$3,$4,'/teachers')`,
			uuid.New(), userID, "Статус заявки преподавателя изменён", comment)
		return err
	})
}

type TeacherProfile struct {
	UserID       uuid.UUID       `json:"userId"`
	PublicName   string          `json:"publicName"`
	Bio          string          `json:"bio"`
	Organization string          `json:"organization"`
	Languages    []string        `json:"languages"`
	Formats      []string        `json:"formats"`
	Website      string          `json:"website"`
	SocialLinks  json.RawMessage `json:"socialLinks"`
	AvatarURL    string          `json:"avatarUrl"`
}

func (s *Store) UpsertTeacherProfile(ctx context.Context, p TeacherProfile) error {
	if len(p.SocialLinks) == 0 {
		p.SocialLinks = json.RawMessage("[]")
	}
	_, err := s.Pool.Exec(ctx, `
        INSERT INTO teacher_profiles
            (user_id,public_name,bio,organization,languages,formats,website,social_links,avatar_url)
        VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)
        ON CONFLICT (user_id) DO UPDATE SET public_name=$2,bio=$3,organization=$4,
            languages=$5,formats=$6,website=$7,social_links=$8,avatar_url=$9,updated_at=now()`,
		p.UserID, p.PublicName, p.Bio, p.Organization, p.Languages, p.Formats,
		p.Website, p.SocialLinks, p.AvatarURL)
	return err
}

func (s *Store) TeacherProfile(ctx context.Context, userID uuid.UUID) (*TeacherProfile, error) {
	var p TeacherProfile
	err := s.Pool.QueryRow(ctx, `SELECT user_id,public_name,bio,organization,languages,formats,
        website,social_links,avatar_url FROM teacher_profiles WHERE user_id=$1`, userID).Scan(
		&p.UserID, &p.PublicName, &p.Bio, &p.Organization, &p.Languages, &p.Formats, &p.Website, &p.SocialLinks, &p.AvatarURL)
	if errors.Is(err, pgx.ErrNoRows) {
		return nil, ErrTeacherRequired
	}
	return &p, err
}

func randomURLToken() (string, error) {
	b := make([]byte, 18)
	if _, err := rand.Read(b); err != nil {
		return "", err
	}
	return base64.RawURLEncoding.EncodeToString(b), nil
}

type Lesson struct {
	ID                uuid.UUID       `json:"id"`
	AuthorID          uuid.UUID       `json:"authorId"`
	AuthorName        string          `json:"authorName"`
	AuthorAvatar      string          `json:"authorAvatar,omitempty"`
	Slug              string          `json:"slug"`
	ShareToken        string          `json:"shareToken,omitempty"`
	Title             string          `json:"title"`
	Summary           string          `json:"summary"`
	CoverURL          string          `json:"coverUrl,omitempty"`
	Level             string          `json:"level"`
	LessonType        string          `json:"lessonType"`
	Topic             string          `json:"topic"`
	Tags              []string        `json:"tags"`
	EstimatedMinutes  int             `json:"estimatedMinutes"`
	Script            string          `json:"script"`
	Visibility        string          `json:"visibility"`
	PublishedRevision *uuid.UUID      `json:"publishedRevisionId,omitempty"`
	Content           json.RawMessage `json:"content,omitempty"`
	RevisionID        *uuid.UUID      `json:"revisionId,omitempty"`
	RevisionStatus    string          `json:"revisionStatus,omitempty"`
	UpdatedAt         time.Time       `json:"updatedAt"`
}

type LessonInput struct {
	Title            string
	Summary          string
	CoverURL         string
	Level            string
	LessonType       string
	Topic            string
	Tags             []string
	EstimatedMinutes int
	Script           string
	Content          json.RawMessage
}

func (s *Store) CreateLesson(ctx context.Context, authorID uuid.UUID, slug string, in LessonInput) (*Lesson, error) {
	id := uuid.New()
	revisionID := uuid.New()
	share, err := randomURLToken()
	if err != nil {
		return nil, err
	}
	err = s.InTx(ctx, func(tx pgx.Tx) error {
		_, err := tx.Exec(ctx, `
            INSERT INTO teacher_lessons
                (id,author_id,slug,share_token,title,summary,cover_url,level,lesson_type,topic,tags,estimated_minutes,script)
            VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)`, id, authorID, slug,
			share, in.Title, in.Summary, in.CoverURL, in.Level, in.LessonType,
			in.Topic, in.Tags, in.EstimatedMinutes, in.Script)
		if err != nil {
			return err
		}
		_, err = tx.Exec(ctx, `
            INSERT INTO lesson_revisions (id,lesson_id,version,content,created_by)
            VALUES ($1,$2,1,$3,$4)`, revisionID, id, in.Content, authorID)
		return err
	})
	if err != nil {
		return nil, err
	}
	return s.OwnLesson(ctx, authorID, id)
}

func (s *Store) SaveLesson(ctx context.Context, authorID, lessonID uuid.UUID, in LessonInput) (*Lesson, error) {
	err := s.InTx(ctx, func(tx pgx.Tx) error {
		tag, err := tx.Exec(ctx, `
            UPDATE teacher_lessons SET title=$3,summary=$4,level=$5,lesson_type=$6,
                   topic=$7,tags=$8,estimated_minutes=$9,script=$10,cover_url=$11,updated_at=now()
             WHERE id=$1 AND author_id=$2 AND NOT archived`, lessonID, authorID,
			in.Title, in.Summary, in.Level, in.LessonType, in.Topic, in.Tags,
			in.EstimatedMinutes, in.Script, in.CoverURL)
		if err != nil {
			return err
		}
		if tag.RowsAffected() == 0 {
			return ErrLessonNotFound
		}
		_, err = tx.Exec(ctx, `
            INSERT INTO lesson_revisions (id,lesson_id,version,content,created_by)
            SELECT $1,$2,coalesce(max(version),0)+1,$3,$4
              FROM lesson_revisions WHERE lesson_id=$2`, uuid.New(), lessonID, in.Content, authorID)
		return err
	})
	if err != nil {
		return nil, err
	}
	return s.OwnLesson(ctx, authorID, lessonID)
}

func (s *Store) OwnLesson(ctx context.Context, authorID, lessonID uuid.UUID) (*Lesson, error) {
	return s.scanLesson(ctx, `
        SELECT l.id,l.author_id,coalesce(nullif(p.public_name,''),u.display_name),coalesce(p.avatar_url,''),
               l.slug,l.share_token,l.title,l.summary,l.cover_url,l.level,l.lesson_type,l.topic,l.tags,
               l.estimated_minutes,l.script,l.visibility,l.published_revision_id,l.updated_at,
               r.id,r.status,r.content
          FROM teacher_lessons l JOIN users u ON u.id=l.author_id
          LEFT JOIN teacher_profiles p ON p.user_id=l.author_id
          LEFT JOIN LATERAL (SELECT id,status,content FROM lesson_revisions
                              WHERE lesson_id=l.id ORDER BY version DESC LIMIT 1) r ON true
         WHERE l.id=$1 AND l.author_id=$2 AND NOT l.archived`, lessonID, authorID)
}

func (s *Store) ListOwnLessons(ctx context.Context, authorID uuid.UUID) ([]Lesson, error) {
	return s.listLessons(ctx, `
        SELECT l.id,l.author_id,coalesce(nullif(p.public_name,''),u.display_name),coalesce(p.avatar_url,''),
               l.slug,l.share_token,l.title,l.summary,l.cover_url,l.level,l.lesson_type,l.topic,l.tags,
               l.estimated_minutes,l.script,l.visibility,l.published_revision_id,l.updated_at,
               r.id,r.status,r.content
          FROM teacher_lessons l JOIN users u ON u.id=l.author_id
          LEFT JOIN teacher_profiles p ON p.user_id=l.author_id
          LEFT JOIN LATERAL (SELECT id,status,content FROM lesson_revisions
                              WHERE lesson_id=l.id ORDER BY version DESC LIMIT 1) r ON true
         WHERE l.author_id=$1 AND NOT l.archived ORDER BY l.updated_at DESC`, authorID)
}

func (s *Store) PublishUnlisted(ctx context.Context, authorID, lessonID, revisionID uuid.UUID) error {
	return s.publishRevision(ctx, authorID, lessonID, revisionID, "unlisted", false, uuid.Nil, "")
}

func (s *Store) SubmitPublicLesson(ctx context.Context, authorID, lessonID, revisionID uuid.UUID) error {
	tag, err := s.Pool.Exec(ctx, `
        UPDATE lesson_revisions r SET status='pending',submitted_at=now(),admin_comment=''
         FROM teacher_lessons l
         WHERE r.id=$1 AND r.lesson_id=$2 AND l.id=r.lesson_id AND l.author_id=$3
           AND r.status IN ('draft','rejected')`, revisionID, lessonID, authorID)
	if err == nil && tag.RowsAffected() == 0 {
		return ErrRevisionNotFound
	}
	return err
}

// ArchiveLesson removes a lesson from every reader-facing surface while
// retaining its revisions and submissions for audit and teacher history.
func (s *Store) ArchiveLesson(ctx context.Context, authorID, lessonID uuid.UUID) error {
	return s.InTx(ctx, func(tx pgx.Tx) error {
		tag, err := tx.Exec(ctx, `
            UPDATE teacher_lessons
               SET archived=true,visibility='draft',published_revision_id=NULL,updated_at=now()
             WHERE id=$1 AND author_id=$2 AND NOT archived`, lessonID, authorID)
		if err != nil {
			return err
		}
		if tag.RowsAffected() == 0 {
			return ErrLessonNotFound
		}
		_, err = tx.Exec(ctx, `
            UPDATE lesson_revisions
               SET status='rejected',admin_comment='Урок удалён автором.',reviewed_at=now()
             WHERE lesson_id=$1 AND status='pending'`, lessonID)
		return err
	})
}

// publishRevisionQuery собирает запрос публикации версии урока.
//
// Условия у автора и у модератора разные: автор публикует только свой урок и
// только из черновика, модератор — любой, но лишь отправленный на проверку.
//
// Плейсхолдеры нумеруются по факту использования, а НЕ фиксированным списком.
// PostgreSQL в расширенном протоколе обязан вывести тип каждого параметра, и
// для параметра, которого нет в тексте запроса, вывести его неоткуда: запрос
// падает с «could not determine data type of parameter $N». Именно так и
// ломалась публикация модератором — `author_id` в её ветке не упоминается.
func publishRevisionQuery(
	authorID, lessonID, revisionID uuid.UUID,
	admin bool,
	reviewer uuid.UUID,
	comment string,
) (string, []any) {
	query := `UPDATE lesson_revisions r SET status='published',admin_comment=$3,
                    reviewed_by=NULLIF($4,'00000000-0000-0000-0000-000000000000'::uuid),
                    reviewed_at=CASE WHEN $5 THEN now() ELSE reviewed_at END,published_at=now()
              FROM teacher_lessons l WHERE r.id=$1 AND r.lesson_id=$2 AND l.id=r.lesson_id`
	args := []any{revisionID, lessonID, comment, reviewer, admin}
	if admin {
		query += ` AND r.status='pending'`
		return query, args
	}
	query += ` AND l.author_id=$6 AND r.status IN ('draft','rejected','published')`
	return query, append(args, authorID)
}

// rejectRevision отклоняет ревизию, если она всё ещё на проверке.
//
// Условие в самом UPDATE, а не только в предшествующем чтении: между ними
// ревизию успевает одобрить другой администратор, и тогда отклонять уже нечего.
// Ноль затронутых строк здесь — не сбой, а «кто-то был первым», и вызывающему
// об этом сообщается тем же ErrRevisionNotFound, что и о пропавшей ревизии.
func (s *Store) rejectRevision(ctx context.Context, revisionID, adminID uuid.UUID, comment string) error {
	tag, err := s.Pool.Exec(ctx, `
        UPDATE lesson_revisions SET status='rejected',admin_comment=$2,
               reviewed_by=$3,reviewed_at=now()
         WHERE id=$1 AND status='pending'`, revisionID, comment, adminID)
	if err != nil {
		return err
	}
	if tag.RowsAffected() == 0 {
		return ErrRevisionNotFound
	}
	return nil
}

func (s *Store) publishRevision(ctx context.Context, authorID, lessonID, revisionID uuid.UUID, visibility string, admin bool, reviewer uuid.UUID, comment string) error {
	return s.InTx(ctx, func(tx pgx.Tx) error {
		query, args := publishRevisionQuery(authorID, lessonID, revisionID, admin, reviewer, comment)
		tag, err := tx.Exec(ctx, query, args...)
		if err != nil {
			return err
		}
		if tag.RowsAffected() == 0 {
			return ErrRevisionNotFound
		}
		_, err = tx.Exec(ctx, `
            UPDATE teacher_lessons SET published_revision_id=$2,visibility=$3,updated_at=now()
             WHERE id=$1`, lessonID, revisionID, visibility)
		return err
	})
}

// ReviewLessonRevision записывает решение модератора: одобрить или отклонить.
//
// «Ещё на проверке» проверяется дважды — при чтении и в самом UPDATE, — и
// второй раз обязателен. Между чтением и записью ревизию успевает рассудить
// другой администратор, а модераторов больше одного. Одобрение эту проверку
// уже несло (см. publishRevisionQuery), отказ — нет: пара «одобрил, следом
// отклонил» переводила ревизию в rejected, тогда как teacher_lessons.
// published_revision_id продолжал на неё ссылаться. Урок оставался
// опубликованным ревизией, помеченной отклонённой.
func (s *Store) ReviewLessonRevision(ctx context.Context, revisionID, adminID uuid.UUID, approve bool, comment string) error {
	var lessonID, authorID uuid.UUID
	err := s.Pool.QueryRow(ctx, `
        SELECT r.lesson_id,l.author_id FROM lesson_revisions r
        JOIN teacher_lessons l ON l.id=r.lesson_id WHERE r.id=$1 AND r.status='pending'`, revisionID).Scan(&lessonID, &authorID)
	if errors.Is(err, pgx.ErrNoRows) {
		return ErrRevisionNotFound
	}
	if err != nil {
		return err
	}
	if approve {
		err = s.publishRevision(ctx, authorID, lessonID, revisionID, "public", true, adminID, comment)
	} else {
		err = s.rejectRevision(ctx, revisionID, adminID, comment)
	}
	if err != nil {
		return err
	}
	_, err = s.Pool.Exec(ctx, `INSERT INTO user_notifications
        (id,user_id,kind,title,body,target_url) VALUES ($1,$2,'lesson_review',$3,$4,$5)`,
		uuid.New(), authorID, "Модерация урока завершена", comment, "/teachers/lessons/"+lessonID.String())
	return err
}

func (s *Store) LessonRevisionOwner(ctx context.Context, revisionID uuid.UUID) (uuid.UUID, error) {
	var id uuid.UUID
	err := s.Pool.QueryRow(ctx, `SELECT l.author_id FROM lesson_revisions r JOIN teacher_lessons l ON l.id=r.lesson_id WHERE r.id=$1`, revisionID).Scan(&id)
	return id, err
}

type LessonFilter struct {
	Level, LessonType, Topic, Author, Script string
	Limit, Offset                            int
}

func (s *Store) ListPublicLessons(ctx context.Context, f LessonFilter) ([]Lesson, error) {
	return s.listLessons(ctx, `
        SELECT l.id,l.author_id,coalesce(nullif(p.public_name,''),u.display_name),coalesce(p.avatar_url,''),
               l.slug,''::text,l.title,l.summary,l.cover_url,l.level,l.lesson_type,l.topic,l.tags,
               l.estimated_minutes,l.script,l.visibility,l.published_revision_id,l.updated_at,
               r.id,r.status,NULL::jsonb
          FROM teacher_lessons l JOIN users u ON u.id=l.author_id
          LEFT JOIN teacher_profiles p ON p.user_id=l.author_id
          JOIN lesson_revisions r ON r.id=l.published_revision_id
         WHERE l.visibility='public' AND NOT l.archived
           AND ($1='' OR l.level=$1) AND ($2='' OR l.lesson_type=$2)
           AND ($3='' OR l.topic=$3) AND ($4='' OR l.author_id::text=$4)
           AND ($5='' OR l.script=$5 OR l.script='both')
         ORDER BY l.updated_at DESC LIMIT $6 OFFSET $7`,
		f.Level, f.LessonType, f.Topic, f.Author, f.Script, f.Limit, f.Offset)
}

func (s *Store) PublicLesson(ctx context.Context, slug string) (*Lesson, error) {
	return s.publishedLesson(ctx, `l.slug=$1 AND l.visibility='public'`, slug)
}

func (s *Store) UnlistedLesson(ctx context.Context, token string) (*Lesson, error) {
	return s.publishedLesson(ctx, `l.share_token=$1 AND l.visibility='unlisted'`, token)
}

func (s *Store) publishedLesson(ctx context.Context, where string, arg any) (*Lesson, error) {
	return s.scanLesson(ctx, fmt.Sprintf(`
        SELECT l.id,l.author_id,coalesce(nullif(p.public_name,''),u.display_name),coalesce(p.avatar_url,''),
               l.slug,''::text,l.title,l.summary,l.cover_url,l.level,l.lesson_type,l.topic,l.tags,
               l.estimated_minutes,l.script,l.visibility,l.published_revision_id,l.updated_at,
               r.id,r.status,r.content
          FROM teacher_lessons l JOIN users u ON u.id=l.author_id
          LEFT JOIN teacher_profiles p ON p.user_id=l.author_id
          JOIN lesson_revisions r ON r.id=l.published_revision_id
         WHERE %s AND NOT l.archived`, where), arg)
}

// SitemapLesson — строка карты сайта для опубликованного урока.
type SitemapLesson struct {
	Slug      string
	UpdatedAt time.Time
}

// PublicLessonSitemap отдаёт адреса уроков для карты сайта.
//
// Отдельный запрос вместо ListPublicLessons: карте нужны только адрес и дата,
// а тянуть ради неё содержимое всех уроков — лишняя работа и память.
func (s *Store) PublicLessonSitemap(ctx context.Context) ([]SitemapLesson, error) {
	rows, err := s.Pool.Query(ctx, `
        SELECT l.slug,l.updated_at FROM teacher_lessons l
          JOIN lesson_revisions r ON r.id=l.published_revision_id
         WHERE l.visibility='public' AND NOT l.archived
         ORDER BY l.updated_at DESC LIMIT 5000`)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	items := []SitemapLesson{}
	for rows.Next() {
		var item SitemapLesson
		if err := rows.Scan(&item.Slug, &item.UpdatedAt); err != nil {
			return nil, err
		}
		items = append(items, item)
	}
	return items, rows.Err()
}

func (s *Store) PendingLessonRevisions(ctx context.Context) ([]Lesson, error) {
	return s.listLessons(ctx, `
        SELECT l.id,l.author_id,coalesce(nullif(p.public_name,''),u.display_name),coalesce(p.avatar_url,''),
               l.slug,l.share_token,l.title,l.summary,l.cover_url,l.level,l.lesson_type,l.topic,l.tags,
               l.estimated_minutes,l.script,l.visibility,l.published_revision_id,l.updated_at,
               r.id,r.status,r.content
          FROM lesson_revisions r JOIN teacher_lessons l ON l.id=r.lesson_id
          JOIN users u ON u.id=l.author_id LEFT JOIN teacher_profiles p ON p.user_id=l.author_id
         WHERE r.status='pending' AND NOT l.archived ORDER BY r.submitted_at`)
}

func (s *Store) scanLesson(ctx context.Context, query string, args ...any) (*Lesson, error) {
	row := s.Pool.QueryRow(ctx, query, args...)
	l, err := scanLessonRow(row)
	if errors.Is(err, pgx.ErrNoRows) {
		return nil, ErrLessonNotFound
	}
	return l, err
}

type rowScanner interface{ Scan(...any) error }

func scanLessonRow(row rowScanner) (*Lesson, error) {
	var l Lesson
	err := row.Scan(&l.ID, &l.AuthorID, &l.AuthorName, &l.AuthorAvatar, &l.Slug,
		&l.ShareToken, &l.Title, &l.Summary, &l.CoverURL, &l.Level, &l.LessonType, &l.Topic,
		&l.Tags, &l.EstimatedMinutes, &l.Script, &l.Visibility,
		&l.PublishedRevision, &l.UpdatedAt, &l.RevisionID, &l.RevisionStatus, &l.Content)
	return &l, err
}

func (s *Store) listLessons(ctx context.Context, query string, args ...any) ([]Lesson, error) {
	rows, err := s.Pool.Query(ctx, query, args...)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	items := []Lesson{}
	for rows.Next() {
		l, err := scanLessonRow(rows)
		if err != nil {
			return nil, err
		}
		items = append(items, *l)
	}
	return items, rows.Err()
}

func (s *Store) PutLessonProgress(ctx context.Context, userID, lessonID uuid.UUID, payload json.RawMessage) error {
	_, err := s.Pool.Exec(ctx, `INSERT INTO lesson_progress (user_id,lesson_id,payload)
        VALUES ($1,$2,$3) ON CONFLICT (user_id,lesson_id) DO UPDATE SET payload=$3,updated_at=now()`,
		userID, lessonID, payload)
	return err
}

func (s *Store) LessonProgress(ctx context.Context, userID, lessonID uuid.UUID) (json.RawMessage, error) {
	var payload json.RawMessage
	err := s.Pool.QueryRow(ctx, `SELECT payload FROM lesson_progress WHERE user_id=$1 AND lesson_id=$2`, userID, lessonID).Scan(&payload)
	if errors.Is(err, pgx.ErrNoRows) {
		return json.RawMessage("{}"), nil
	}
	return payload, err
}

type LessonSubmission struct {
	ID          uuid.UUID `json:"id"`
	LessonID    uuid.UUID `json:"lessonId"`
	RevisionID  uuid.UUID `json:"revisionId"`
	ExerciseID  string    `json:"exerciseId"`
	StudentID   uuid.UUID `json:"studentId"`
	StudentName string    `json:"studentName"`
	LessonTitle string    `json:"lessonTitle"`
	Answer      string    `json:"answer"`
	Status      string    `json:"status"`
	Feedback    string    `json:"feedback"`
	Score       *int      `json:"score,omitempty"`
	CreatedAt   time.Time `json:"createdAt"`
	UpdatedAt   time.Time `json:"updatedAt"`
}

func (s *Store) CreateLessonSubmission(ctx context.Context, studentID, lessonID, revisionID uuid.UUID, exerciseID, answer string) (*LessonSubmission, error) {
	submission := LessonSubmission{ID: uuid.New(), LessonID: lessonID, RevisionID: revisionID,
		ExerciseID: exerciseID, StudentID: studentID, Answer: answer, Status: "submitted"}
	err := s.Pool.QueryRow(ctx, `
        INSERT INTO lesson_submissions (id,lesson_id,revision_id,exercise_id,student_id,answer)
        SELECT $1,$2,$3,$4,$5,$6 FROM teacher_lessons l
         WHERE l.id=$2 AND l.published_revision_id=$3 AND l.visibility IN ('public','unlisted')
        RETURNING created_at,updated_at`, submission.ID, lessonID, revisionID, exerciseID, studentID, answer).
		Scan(&submission.CreatedAt, &submission.UpdatedAt)
	if errors.Is(err, pgx.ErrNoRows) {
		return nil, ErrLessonNotFound
	}
	return &submission, err
}

func (s *Store) ListTeacherSubmissions(ctx context.Context, teacherID uuid.UUID, status string) ([]LessonSubmission, error) {
	rows, err := s.Pool.Query(ctx, `
        SELECT s.id,s.lesson_id,s.revision_id,s.exercise_id,s.student_id,
               coalesce(nullif(u.display_name,''),'Ученик'),l.title,s.answer,s.status,
               s.feedback,s.score,s.created_at,s.updated_at
          FROM lesson_submissions s JOIN teacher_lessons l ON l.id=s.lesson_id
          JOIN users u ON u.id=s.student_id
         WHERE l.author_id=$1 AND ($2='' OR s.status=$2)
         ORDER BY CASE s.status WHEN 'submitted' THEN 0 WHEN 'reviewing' THEN 1 ELSE 2 END,s.created_at`, teacherID, status)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	items := []LessonSubmission{}
	for rows.Next() {
		var item LessonSubmission
		if err := rows.Scan(&item.ID, &item.LessonID, &item.RevisionID, &item.ExerciseID, &item.StudentID, &item.StudentName, &item.LessonTitle, &item.Answer, &item.Status, &item.Feedback, &item.Score, &item.CreatedAt, &item.UpdatedAt); err != nil {
			return nil, err
		}
		items = append(items, item)
	}
	return items, rows.Err()
}

func (s *Store) ReviewLessonSubmission(ctx context.Context, teacherID, submissionID uuid.UUID, status, feedback string, score *int) error {
	return s.InTx(ctx, func(tx pgx.Tx) error {
		var studentID uuid.UUID
		err := tx.QueryRow(ctx, `UPDATE lesson_submissions s SET status=$3,feedback=$4,score=$5,
            reviewed_by=$1,updated_at=now() FROM teacher_lessons l
            WHERE s.id=$2 AND l.id=s.lesson_id AND l.author_id=$1 RETURNING s.student_id`, teacherID, submissionID, status, feedback, score).Scan(&studentID)
		if errors.Is(err, pgx.ErrNoRows) {
			return ErrLessonNotFound
		}
		if err != nil {
			return err
		}
		// Уведомление — только о завершённой проверке. Статус `reviewing`
		// означает «преподаватель взял работу», и сообщать ученику, что её уже
		// проверили, нельзя: отзыва ещё нет, и письмо на этом статусе тоже не
		// уходит — два канала расходились бы между собой.
		if status != "reviewed" {
			return nil
		}
		_, err = tx.Exec(ctx, `INSERT INTO user_notifications (id,user_id,kind,title,body,target_url)
            VALUES ($1,$2,'letter_review',$3,$4,'/account')`, uuid.New(), studentID, "Преподаватель проверил письменную работу", feedback)
		return err
	})
}

func (s *Store) SubmissionStudent(ctx context.Context, submissionID uuid.UUID) (uuid.UUID, error) {
	var id uuid.UUID
	err := s.Pool.QueryRow(ctx, `SELECT student_id FROM lesson_submissions WHERE id=$1`, submissionID).Scan(&id)
	return id, err
}

type LessonReport struct {
	ID            uuid.UUID `json:"id"`
	LessonID      uuid.UUID `json:"lessonId"`
	LessonTitle   string    `json:"lessonTitle"`
	ReporterEmail string    `json:"reporterEmail"`
	Reason        string    `json:"reason"`
	Details       string    `json:"details"`
	Status        string    `json:"status"`
	CreatedAt     time.Time `json:"createdAt"`
}

func (s *Store) CreateLessonReport(ctx context.Context, reporterID, lessonID uuid.UUID, reason, details string) error {
	tag, err := s.Pool.Exec(ctx, `INSERT INTO lesson_reports (id,lesson_id,reporter_id,reason,details)
        SELECT $1,id,$2,$3,$4 FROM teacher_lessons WHERE id=$5 AND visibility IN ('public','unlisted')`, uuid.New(), reporterID, reason, details, lessonID)
	if err == nil && tag.RowsAffected() == 0 {
		return ErrLessonNotFound
	}
	return err
}

func (s *Store) ListLessonReports(ctx context.Context, status string) ([]LessonReport, error) {
	rows, err := s.Pool.Query(ctx, `SELECT r.id,r.lesson_id,l.title,coalesce(u.email,''),r.reason,r.details,r.status,r.created_at
        FROM lesson_reports r JOIN teacher_lessons l ON l.id=r.lesson_id LEFT JOIN users u ON u.id=r.reporter_id
        WHERE ($1='' OR r.status=$1) ORDER BY r.created_at`, status)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	items := []LessonReport{}
	for rows.Next() {
		var item LessonReport
		if err := rows.Scan(&item.ID, &item.LessonID, &item.LessonTitle, &item.ReporterEmail, &item.Reason, &item.Details, &item.Status, &item.CreatedAt); err != nil {
			return nil, err
		}
		items = append(items, item)
	}
	return items, rows.Err()
}

func (s *Store) ReviewLessonReport(ctx context.Context, adminID, reportID uuid.UUID, status string) error {
	tag, err := s.Pool.Exec(ctx, `UPDATE lesson_reports SET status=$3,reviewed_by=$2,reviewed_at=now() WHERE id=$1 AND status='open'`, reportID, adminID, status)
	if err == nil && tag.RowsAffected() == 0 {
		return ErrLessonNotFound
	}
	return err
}

// asciiFold убирает диакритику сербской латиницы: в адресе урока её быть не
// может, а выбрасывать букву целиком нельзя — «Čitanje» превратилось бы в
// «itanje».
var asciiFold = strings.NewReplacer(
	"š", "s", "đ", "dj", "ž", "z", "č", "c", "ć", "c",
	"Š", "s", "Đ", "dj", "Ž", "z", "Č", "c", "Ć", "c",
)

// SlugifyLessonTitle строит адрес урока из названия.
//
// Кириллица сначала переводится в латиницу, а не выбрасывается: сайт про
// сербский, и большинство названий кириллические. Без этого шага от названия
// не оставалось ничего, и все такие уроки получали адреса вида
// «lesson-3f2a91bc», неразличимые ни для человека, ни для поиска.
func SlugifyLessonTitle(title string) string {
	normalized := asciiFold.Replace(lexicon.ToLatin(strings.TrimSpace(title)))

	var b strings.Builder
	dash := false
	for _, r := range strings.ToLower(normalized) {
		if (r >= 'a' && r <= 'z') || (r >= '0' && r <= '9') {
			b.WriteRune(r)
			dash = false
		} else if b.Len() > 0 && !dash {
			b.WriteByte('-')
			dash = true
		}
	}
	slug := strings.Trim(b.String(), "-")
	// Длинное название не должно давать бесконечный адрес; режем по границе
	// слова, чтобы обрывок оставался читаемым.
	if len(slug) > 80 {
		slug = strings.Trim(slug[:80], "-")
		if cut := strings.LastIndexByte(slug, '-'); cut > 20 {
			slug = slug[:cut]
		}
	}
	if slug == "" {
		slug = "lesson"
	}
	return slug + "-" + strings.ToLower(uuid.NewString()[:8])
}

// PublicDialogue — диалог из опубликованного урока для страницы диалогов.
//
// Отдельный тип, а не Lesson: странице нужны обложка, автор и размер сценария,
// а содержимое урока целиком — это теория, упражнения и сам диалог, то есть
// десятки килобайт на каждую карточку списка.
type PublicDialogue struct {
	Slug       string `json:"slug"`
	Title      string `json:"title"`
	Summary    string `json:"summary"`
	AuthorName string `json:"authorName"`
	CoverURL   string `json:"coverUrl,omitempty"`
	Level      string `json:"level"`
	Script     string `json:"script"`
	// Lines — сколько реплик в сценарии. По нему видно, это короткая сценка
	// или разговор на десять минут.
	Lines     int       `json:"lines"`
	UpdatedAt time.Time `json:"updatedAt"`
}

// ListPublicDialogues возвращает диалоги опубликованных уроков.
//
// Отбор идёт по тому же правилу, что и каталог уроков: только `public` и не
// архивные. Урок «по ссылке» на общую страницу попадать не должен — автор
// намеренно не делал его публичным, и вынести его в общий список значило бы
// решить за него.
func (s *Store) ListPublicDialogues(ctx context.Context, limit int) ([]PublicDialogue, error) {
	if limit <= 0 || limit > 200 {
		limit = 60
	}
	rows, err := s.Pool.Query(ctx, `
        SELECT l.slug, l.title, l.summary,
               coalesce(nullif(p.public_name,''), u.display_name),
               l.cover_url, l.level, l.script,
               coalesce(jsonb_array_length(r.content->'dialogue'->'nodes'), 0),
               l.updated_at
          FROM teacher_lessons l
          JOIN users u ON u.id = l.author_id
          LEFT JOIN teacher_profiles p ON p.user_id = l.author_id
          JOIN lesson_revisions r ON r.id = l.published_revision_id
         WHERE l.visibility = 'public' AND NOT l.archived
           AND jsonb_typeof(r.content->'dialogue'->'nodes') = 'array'
           AND jsonb_array_length(r.content->'dialogue'->'nodes') > 0
         ORDER BY l.updated_at DESC
         LIMIT $1`, limit)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	items := make([]PublicDialogue, 0)
	for rows.Next() {
		var item PublicDialogue
		if err := rows.Scan(
			&item.Slug, &item.Title, &item.Summary, &item.AuthorName,
			&item.CoverURL, &item.Level, &item.Script, &item.Lines, &item.UpdatedAt,
		); err != nil {
			return nil, err
		}
		items = append(items, item)
	}
	return items, rows.Err()
}
