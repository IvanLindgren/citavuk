package store

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"math"
	"strconv"
	"strings"
	"time"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
)

var ErrMicroFeedNotFound = errors.New("карточка микро-ленты не найдена")

type MicroFeedSource struct {
	Slug            string     `json:"slug"`
	Title           string     `json:"title"`
	SourceKind      string     `json:"sourceKind"`
	SourceURL       string     `json:"sourceUrl"`
	Language        string     `json:"language"`
	RightsMode      string     `json:"rightsMode"`
	LicenseCode     string     `json:"licenseCode"`
	AttributionName string     `json:"attributionName"`
	AttributionURL  string     `json:"attributionUrl"`
	Enabled         bool       `json:"enabled"`
	LastSyncedAt    *time.Time `json:"lastSyncedAt"`
}

type MicroFeedImport struct {
	ID          uuid.UUID `json:"id"`
	SourceSlug  string    `json:"sourceSlug"`
	SourceTitle string    `json:"sourceTitle"`
	ExternalID  string    `json:"externalId"`
	Title       string    `json:"title"`
	SourceURL   string    `json:"sourceUrl"`
	// ImageURL — картинка из источника. Хранится у заготовки, потому что
	// карточку делает модель, а картинку она не видит и передать не может:
	// без этого поля адрес терялся бы между выборкой и созданием карточки.
	ImageURL          string     `json:"imageUrl"`
	RawText           string     `json:"rawText"`
	SourcePublishedAt *time.Time `json:"sourcePublishedAt"`
	Status            string     `json:"status"`
	RejectionReason   string     `json:"rejectionReason"`
	CreatedAt         time.Time  `json:"createdAt"`
}

type DifficultWord struct {
	Word          string `json:"word"`
	Lemma         string `json:"lemma"`
	Transcription string `json:"transcription"`
	TranslationRU string `json:"translationRu"`
}

type MicroFeedItem struct {
	ID                uuid.UUID       `json:"id"`
	Status            string          `json:"status"`
	Kind              string          `json:"kind"`
	Category          string          `json:"category"`
	TitleCyrillic     string          `json:"titleCyrillic"`
	TitleLatin        string          `json:"titleLatin"`
	TextCyrillic      string          `json:"textCyrillic"`
	TextLatin         string          `json:"textLatin"`
	OriginalLanguage  string          `json:"originalLanguage"`
	OriginalScript    string          `json:"originalScript"`
	CEFR              string          `json:"cefr"`
	Tags              []string        `json:"tags"`
	DifficultWords    []DifficultWord `json:"difficultWords"`
	ImageURL          string          `json:"imageUrl"`
	AudioURL          string          `json:"audioUrl"`
	SourceSlug        string          `json:"sourceSlug"`
	SourceTitle       string          `json:"sourceTitle"`
	SourceURL         string          `json:"sourceUrl"`
	SourcePublishedAt *time.Time      `json:"sourcePublishedAt"`
	LicenseCode       string          `json:"licenseCode"`
	AttributionText   string          `json:"attributionText"`
	SourceBookID      string          `json:"bookId"`
	ChapterID         string          `json:"chapterId"`
	StartPositionChar int             `json:"startPositionChar"`
	BookTargetURL     string          `json:"bookTargetUrl"`
	ViewsCount        int64           `json:"viewsCount"`
	LikesCount        int64           `json:"likesCount"`
	DislikesCount     int64           `json:"dislikesCount"`
	ReadMoreCount     int64           `json:"readMoreCount"`
	CommentsCount     int64           `json:"commentsCount"`
	Reaction          int             `json:"reaction"`
	HasEmbedding      bool            `json:"hasEmbedding"`
	PublishedAt       *time.Time      `json:"publishedAt"`
	CreatedAt         time.Time       `json:"createdAt"`
	UpdatedAt         time.Time       `json:"updatedAt"`
	SourceImportID    *uuid.UUID      `json:"sourceImportId,omitempty"`
}

func (s *Store) ListMicroFeedSources(ctx context.Context) ([]MicroFeedSource, error) {
	rows, err := s.Pool.Query(ctx, `
		SELECT slug, title, source_kind, source_url, language, rights_mode,
		       license_code, attribution_name, attribution_url, enabled, last_synced_at
		FROM micro_feed_sources
		ORDER BY enabled DESC, title`)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	items := make([]MicroFeedSource, 0)
	for rows.Next() {
		var item MicroFeedSource
		if err := rows.Scan(
			&item.Slug, &item.Title, &item.SourceKind, &item.SourceURL,
			&item.Language, &item.RightsMode, &item.LicenseCode,
			&item.AttributionName, &item.AttributionURL, &item.Enabled,
			&item.LastSyncedAt,
		); err != nil {
			return nil, err
		}
		items = append(items, item)
	}
	return items, rows.Err()
}

func (s *Store) GetMicroFeedSource(ctx context.Context, slug string) (*MicroFeedSource, error) {
	var item MicroFeedSource
	err := s.Pool.QueryRow(ctx, `
		SELECT slug, title, source_kind, source_url, language, rights_mode,
		       license_code, attribution_name, attribution_url, enabled, last_synced_at
		FROM micro_feed_sources WHERE slug = $1`, slug).Scan(
		&item.Slug, &item.Title, &item.SourceKind, &item.SourceURL,
		&item.Language, &item.RightsMode, &item.LicenseCode,
		&item.AttributionName, &item.AttributionURL, &item.Enabled,
		&item.LastSyncedAt,
	)
	if errors.Is(err, pgx.ErrNoRows) {
		return nil, ErrMicroFeedNotFound
	}
	return &item, err
}

func (s *Store) SaveMicroFeedImports(
	ctx context.Context,
	sourceSlug string,
	items []MicroFeedImport,
) (int, error) {
	inserted := 0
	err := s.InTx(ctx, func(tx pgx.Tx) error {
		for _, item := range items {
			tag, err := tx.Exec(ctx, `
				INSERT INTO micro_feed_imports (
					id, source_slug, external_id, source_title, source_url,
					raw_text, source_published_at, image_url
				) VALUES ($1,$2,$3,$4,$5,$6,$7,$8)
				ON CONFLICT (source_slug, external_id) DO UPDATE SET
					source_title = EXCLUDED.source_title,
					source_url = EXCLUDED.source_url,
					image_url = EXCLUDED.image_url,
					raw_text = CASE
						WHEN micro_feed_imports.status = 'queued' THEN EXCLUDED.raw_text
						ELSE micro_feed_imports.raw_text
					END,
					source_published_at = EXCLUDED.source_published_at,
					updated_at = now()
				WHERE micro_feed_imports.status = 'queued'`,
				item.ID, sourceSlug, item.ExternalID, item.Title, item.SourceURL,
				item.RawText, item.SourcePublishedAt, item.ImageURL,
			)
			if err != nil {
				return err
			}
			if tag.RowsAffected() > 0 {
				inserted++
			}
		}
		_, err := tx.Exec(ctx, `
			UPDATE micro_feed_sources
			SET last_synced_at = now(), updated_at = now()
			WHERE slug = $1`, sourceSlug)
		return err
	})
	return inserted, err
}

func (s *Store) ListMicroFeedImports(ctx context.Context, status string, limit int) ([]MicroFeedImport, error) {
	if limit <= 0 || limit > 200 {
		limit = 80
	}
	rows, err := s.Pool.Query(ctx, `
		SELECT i.id, i.source_slug, s.title, i.external_id, i.source_title,
		       i.source_url, i.image_url, i.raw_text, i.source_published_at,
		       i.status, i.rejection_reason, i.created_at
		FROM micro_feed_imports i
		JOIN micro_feed_sources s ON s.slug = i.source_slug
		WHERE ($1 = '' OR i.status = $1)
		ORDER BY i.created_at DESC
		LIMIT $2`, status, limit)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	items := make([]MicroFeedImport, 0)
	for rows.Next() {
		item, err := scanMicroFeedImport(rows)
		if err != nil {
			return nil, err
		}
		items = append(items, *item)
	}
	return items, rows.Err()
}

func (s *Store) GetMicroFeedImport(ctx context.Context, id uuid.UUID) (*MicroFeedImport, error) {
	item, err := scanMicroFeedImport(s.Pool.QueryRow(ctx, `
		SELECT i.id, i.source_slug, s.title, i.external_id, i.source_title,
		       i.source_url, i.image_url, i.raw_text, i.source_published_at,
		       i.status, i.rejection_reason, i.created_at
		FROM micro_feed_imports i
		JOIN micro_feed_sources s ON s.slug = i.source_slug
		WHERE i.id = $1`, id))
	if errors.Is(err, pgx.ErrNoRows) {
		return nil, ErrMicroFeedNotFound
	}
	return item, err
}

type microRow interface{ Scan(...any) error }

func scanMicroFeedImport(row microRow) (*MicroFeedImport, error) {
	var item MicroFeedImport
	err := row.Scan(
		&item.ID, &item.SourceSlug, &item.SourceTitle, &item.ExternalID,
		&item.Title, &item.SourceURL, &item.ImageURL, &item.RawText,
		&item.SourcePublishedAt, &item.Status, &item.RejectionReason,
		&item.CreatedAt,
	)
	return &item, err
}

func (s *Store) RejectMicroFeedImport(ctx context.Context, id uuid.UUID, reason string) error {
	tag, err := s.Pool.Exec(ctx, `
		UPDATE micro_feed_imports
		SET status = 'rejected', rejection_reason = $2, updated_at = now()
		WHERE id = $1 AND status = 'queued'`, id, reason)
	if err == nil && tag.RowsAffected() == 0 {
		return ErrMicroFeedNotFound
	}
	return err
}

func (s *Store) CreateMicroFeedItem(
	ctx context.Context,
	item *MicroFeedItem,
	createdBy uuid.UUID,
	embedding []float32,
) (*MicroFeedItem, error) {
	if item.ID == uuid.Nil {
		item.ID = uuid.New()
	}
	words, err := json.Marshal(item.DifficultWords)
	if err != nil {
		return nil, err
	}
	vector, err := microVectorLiteral(embedding)
	if err != nil {
		return nil, err
	}
	var creator any
	if createdBy != uuid.Nil {
		creator = createdBy
	}
	var importID any
	if item.SourceImportID != nil {
		importID = *item.SourceImportID
	}

	err = s.InTx(ctx, func(tx pgx.Tx) error {
		_, err := tx.Exec(ctx, `
			INSERT INTO micro_feed_content_items (
				id, status, kind, category, title_cyrillic, title_latin,
				text_cyrillic, text_latin, original_language, original_script,
				cefr, tags, difficult_words, image_url, audio_url, source_slug,
				source_import_id, source_title, source_url, source_published_at,
				license_code, attribution_text, source_book_id, chapter_id,
				start_position_char, book_target_url, embedding, created_by
			) VALUES (
				$1,'draft',$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,
				NULLIF($15,''),$16,$17,$18,$19,$20,$21,$22,$23,$24,$25,$26::vector,$27
			)`,
			item.ID, item.Kind, item.Category, item.TitleCyrillic, item.TitleLatin,
			item.TextCyrillic, item.TextLatin, item.OriginalLanguage,
			item.OriginalScript, item.CEFR, item.Tags, words, item.ImageURL,
			item.AudioURL, item.SourceSlug, importID, item.SourceTitle,
			item.SourceURL, item.SourcePublishedAt, item.LicenseCode,
			item.AttributionText, item.SourceBookID, item.ChapterID,
			item.StartPositionChar, item.BookTargetURL, vector, creator,
		)
		if err != nil {
			return err
		}
		if item.SourceImportID != nil {
			_, err = tx.Exec(ctx, `
				UPDATE micro_feed_imports
				SET status = 'processed', updated_at = now()
				WHERE id = $1`, *item.SourceImportID)
		}
		return err
	})
	if err != nil {
		return nil, err
	}
	return s.GetMicroFeedItem(ctx, item.ID, "")
}

func (s *Store) UpdateMicroFeedItem(ctx context.Context, item *MicroFeedItem) (*MicroFeedItem, error) {
	words, err := json.Marshal(item.DifficultWords)
	if err != nil {
		return nil, err
	}
	tag, err := s.Pool.Exec(ctx, `
		UPDATE micro_feed_content_items SET
			kind=$2, category=$3, title_cyrillic=$4, title_latin=$5,
			text_cyrillic=$6, text_latin=$7, original_language=$8,
			original_script=$9, cefr=$10, tags=$11, difficult_words=$12,
			image_url=$13, audio_url=$14, source_title=$15, source_url=$16,
			source_published_at=$17, license_code=$18, attribution_text=$19,
			source_book_id=$20, chapter_id=$21, start_position_char=$22,
			book_target_url=$23, embedding=NULL, updated_at=now()
		WHERE id=$1 AND status='draft'`,
		item.ID, item.Kind, item.Category, item.TitleCyrillic, item.TitleLatin,
		item.TextCyrillic, item.TextLatin, item.OriginalLanguage,
		item.OriginalScript, item.CEFR, item.Tags, words, item.ImageURL,
		item.AudioURL, item.SourceTitle, item.SourceURL,
		item.SourcePublishedAt, item.LicenseCode, item.AttributionText,
		item.SourceBookID, item.ChapterID, item.StartPositionChar,
		item.BookTargetURL,
	)
	if err == nil && tag.RowsAffected() == 0 {
		return nil, ErrMicroFeedNotFound
	}
	if err != nil {
		return nil, err
	}
	return s.GetMicroFeedItem(ctx, item.ID, "")
}

func (s *Store) SetMicroFeedEmbedding(ctx context.Context, id uuid.UUID, embedding []float32) error {
	vector, err := microVectorLiteral(embedding)
	if err != nil {
		return err
	}
	_, err = s.Pool.Exec(ctx, `
		UPDATE micro_feed_content_items
		SET embedding=$2::vector, updated_at=now()
		WHERE id=$1`, id, vector)
	return err
}

func (s *Store) PublishMicroFeedItem(ctx context.Context, id uuid.UUID) (*MicroFeedItem, error) {
	tag, err := s.Pool.Exec(ctx, `
		UPDATE micro_feed_content_items
		SET status='published', published_at=now(), updated_at=now()
		WHERE id=$1 AND status='draft'`, id)
	if err == nil && tag.RowsAffected() == 0 {
		return nil, ErrMicroFeedNotFound
	}
	if err != nil {
		return nil, err
	}
	return s.GetMicroFeedItem(ctx, id, "")
}

func (s *Store) ArchiveMicroFeedItem(ctx context.Context, id uuid.UUID) error {
	tag, err := s.Pool.Exec(ctx, `
		UPDATE micro_feed_content_items
		SET status='archived', updated_at=now()
		WHERE id=$1 AND status <> 'archived'`, id)
	if err == nil && tag.RowsAffected() == 0 {
		return ErrMicroFeedNotFound
	}
	return err
}

func (s *Store) DeleteMicroFeedItem(ctx context.Context, id uuid.UUID) error {
	tag, err := s.Pool.Exec(ctx, `DELETE FROM micro_feed_content_items WHERE id=$1`, id)
	if err == nil && tag.RowsAffected() == 0 {
		return ErrMicroFeedNotFound
	}
	return err
}

const microFeedItemColumns = `
	i.id, i.status, i.kind, i.category, i.title_cyrillic, i.title_latin,
	i.text_cyrillic, i.text_latin, i.original_language, i.original_script,
	i.cefr, i.tags, i.difficult_words, i.image_url, i.audio_url,
	COALESCE(i.source_slug,''), i.source_import_id, i.source_title, i.source_url,
	i.source_published_at, i.license_code, i.attribution_text, i.source_book_id,
	i.chapter_id, i.start_position_char, i.book_target_url, i.views_count,
	i.likes_count, i.dislikes_count, i.read_more_count, i.comments_count,
	COALESCE(r.reaction,0),
	(i.embedding IS NOT NULL), i.published_at, i.created_at, i.updated_at`

func (s *Store) GetMicroFeedItem(ctx context.Context, id uuid.UUID, actorKey string) (*MicroFeedItem, error) {
	item, err := scanMicroFeedItem(s.Pool.QueryRow(ctx, `
		SELECT `+microFeedItemColumns+`
		FROM micro_feed_content_items i
		LEFT JOIN micro_feed_reactions r ON r.item_id=i.id AND r.actor_key=$2
		WHERE i.id=$1`, id, actorKey))
	if errors.Is(err, pgx.ErrNoRows) {
		return nil, ErrMicroFeedNotFound
	}
	return item, err
}

func (s *Store) ListAdminMicroFeedItems(ctx context.Context, status string, limit int) ([]MicroFeedItem, error) {
	if limit <= 0 || limit > 200 {
		limit = 100
	}
	rows, err := s.Pool.Query(ctx, `
		SELECT `+microFeedItemColumns+`
		FROM micro_feed_content_items i
		LEFT JOIN micro_feed_reactions r ON false
		WHERE ($1='' OR i.status=$1)
		ORDER BY i.created_at DESC LIMIT $2`, status, limit)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	return collectMicroFeedItems(rows)
}

func scanMicroFeedItem(row microRow) (*MicroFeedItem, error) {
	var item MicroFeedItem
	var words []byte
	err := row.Scan(
		&item.ID, &item.Status, &item.Kind, &item.Category,
		&item.TitleCyrillic, &item.TitleLatin, &item.TextCyrillic,
		&item.TextLatin, &item.OriginalLanguage, &item.OriginalScript,
		&item.CEFR, &item.Tags, &words, &item.ImageURL, &item.AudioURL,
		&item.SourceSlug, &item.SourceImportID, &item.SourceTitle,
		&item.SourceURL, &item.SourcePublishedAt, &item.LicenseCode,
		&item.AttributionText, &item.SourceBookID, &item.ChapterID,
		&item.StartPositionChar, &item.BookTargetURL, &item.ViewsCount,
		&item.LikesCount, &item.DislikesCount, &item.ReadMoreCount,
		&item.CommentsCount, &item.Reaction, &item.HasEmbedding, &item.PublishedAt,
		&item.CreatedAt, &item.UpdatedAt,
	)
	if err != nil {
		return nil, err
	}
	if len(words) > 0 {
		if err := json.Unmarshal(words, &item.DifficultWords); err != nil {
			return nil, err
		}
	}
	if item.Tags == nil {
		item.Tags = []string{}
	}
	if item.DifficultWords == nil {
		item.DifficultWords = []DifficultWord{}
	}
	return &item, nil
}

type rowsScanner interface {
	Next() bool
	Scan(...any) error
	Err() error
}

func collectMicroFeedItems(rows rowsScanner) ([]MicroFeedItem, error) {
	items := make([]MicroFeedItem, 0)
	for rows.Next() {
		item, err := scanMicroFeedItem(rows)
		if err != nil {
			return nil, err
		}
		items = append(items, *item)
	}
	return items, rows.Err()
}

// actorUserID — учётная запись за ключом читателя, если он вошёл.
//
// Ключ имеет вид `user:<uuid>` для аккаунта и `guest:<uuid>` для браузера
// (см. microFeedActor). Комментарии хранятся по учётной записи, а не по ключу:
// гостю писать нельзя, и связать его записи с ключом не через что.
func actorUserID(actorKey string) any {
	rest, found := strings.CutPrefix(actorKey, "user:")
	if !found {
		return nil
	}
	id, err := uuid.Parse(rest)
	if err != nil {
		return nil
	}
	return id
}

// MicroFeedPreferences — то, что читатель сказал о себе сам.
type MicroFeedPreferences struct {
	Categories []string `json:"categories"`
	CEFR       string   `json:"cefr"`
	Onboarded  bool     `json:"onboarded"`
	// LevelFromAccount — уровень взят из аккаунта, где он задан один раз для
	// всего приложения. Тогда анкета ленты про уровень не спрашивает: человек
	// уже ответил, и повторный вопрос выглядит так, будто его не услышали.
	LevelFromAccount bool `json:"levelFromAccount"`
}

// MicroFeedCategories — темы, о которых спрашивают в анкете. Список повторяет
// CHECK на колонке category (0014 + 0021): тема не из него никогда ничего не
// найдёт, а карточка с такой темой не сохранится вовсе.
var MicroFeedCategories = []string{
	"history", "culture", "science", "fiction", "society", "news",
	"travel", "food", "sport", "music", "language",
}

// MicroFeedLevels — уровни, из которых читатель выбирает свой.
var MicroFeedLevels = []string{"A1", "A2", "B1", "B2", "C1"}

// feedLevelIndex переводит уровень в номер ступени, как в array_position.
// Неизвестный уровень считается B1 — серединой шкалы.
func feedLevelIndex(cefr string) int {
	for index, level := range MicroFeedLevels {
		if level == cefr {
			return index + 1
		}
	}
	return 3
}

func allowedFeedValue(value string, allowed []string) bool {
	for _, item := range allowed {
		if item == value {
			return true
		}
	}
	return false
}

// GetMicroFeedPreferences читает ответы анкеты.
//
// userID не пуст у вошедшего. Тогда уровень берётся с аккаунта — там он задан
// один раз на всё приложение, — а профиль ленты хранит только темы. Иначе
// уровень жил бы в двух местах и расходился: поменял в настройках, а лента
// подбирает по старому.
func (s *Store) GetMicroFeedPreferences(
	ctx context.Context, actorKey string, userID uuid.UUID,
) (MicroFeedPreferences, error) {
	prefs := MicroFeedPreferences{Categories: []string{}, CEFR: "B1"}
	var onboardedAt *time.Time
	err := s.Pool.QueryRow(ctx, `
		SELECT declared_categories, cefr, onboarded_at
		FROM micro_feed_profiles_embeddings WHERE actor_key=$1`, actorKey).Scan(
		&prefs.Categories, &prefs.CEFR, &onboardedAt)
	if err != nil && !errors.Is(err, pgx.ErrNoRows) {
		return prefs, err
	}
	prefs.Onboarded = onboardedAt != nil

	if userID != uuid.Nil {
		account, err := s.GetSerbianLevel(ctx, userID)
		if err != nil {
			return prefs, err
		}
		if account.Known() {
			prefs.CEFR = account.Level
			prefs.LevelFromAccount = true
		}
	}
	return prefs, nil
}

// AdoptMicroFeedGuestProfile переносит профиль гостя на аккаунт при входе.
//
// Профиль ленты ключуется актором: до входа это устройство («guest:…»), после —
// аккаунт («user:…»). Без переноса вход означал бы чистый лист: анкета,
// заполненная пять минут назад, спрашивалась заново — ровно на этом читатели и
// спотыкались.
//
// Переносится только профиль, не реакции: лайк — публичный счётчик, и
// переписывать его автора задним числом значит менять уже показанные цифры.
// Профиль же виден одному человеку и никому кроме.
func (s *Store) AdoptMicroFeedGuestProfile(
	ctx context.Context, userKey, guestKey string, userID uuid.UUID,
) error {
	_, err := s.Pool.Exec(ctx, `
		INSERT INTO micro_feed_profiles_embeddings
			(actor_key, user_id, embedding, preferred_tags, avoided_tags,
			 preferred_script, cefr, declared_categories, onboarded_at)
		SELECT $1, $3, embedding, preferred_tags, avoided_tags,
		       preferred_script, cefr, declared_categories, onboarded_at
		  FROM micro_feed_profiles_embeddings
		 WHERE actor_key = $2 AND onboarded_at IS NOT NULL
		ON CONFLICT (actor_key) DO NOTHING`, userKey, guestKey, userID)
	return err
}

// SaveMicroFeedPreferences записывает ответы анкеты.
//
// Именно UPDATE полей анкеты, а не полная перезапись строки: рядом в ней лежат
// вектор и накопленные темы, и затереть их ответом на анкету значило бы
// обнулить всю историю чтения одним нажатием.
func (s *Store) SaveMicroFeedPreferences(
	ctx context.Context,
	actorKey string,
	userID uuid.UUID,
	categories []string,
	cefr string,
) (MicroFeedPreferences, error) {
	clean := make([]string, 0, len(MicroFeedCategories))
	seen := map[string]bool{}
	for _, value := range categories {
		value = strings.ToLower(strings.TrimSpace(value))
		if allowedFeedValue(value, MicroFeedCategories) && !seen[value] {
			seen[value] = true
			clean = append(clean, value)
		}
	}
	cefr = strings.ToUpper(strings.TrimSpace(cefr))
	// Уровень аккаунта главнее ответа анкеты: он задан один раз для всего
	// приложения, а анкета вошедшего про уровень уже не спрашивает и просто
	// возвращает то, что ей показали. C2 опускается до потолка шкалы ленты —
	// иначе он не прошёл бы проверку и стал бы B1, то есть серединой.
	if userID != uuid.Nil {
		if account, err := s.GetSerbianLevel(ctx, userID); err == nil && account.Known() {
			if clamped := ClampToFeedLevel(account.Level); clamped != "" {
				cefr = clamped
			}
		}
	}
	if !allowedFeedValue(cefr, MicroFeedLevels) {
		cefr = "B1"
	}
	var user any
	if userID != uuid.Nil {
		user = userID
	}

	_, err := s.Pool.Exec(ctx, `
		INSERT INTO micro_feed_profiles_embeddings
			(actor_key, user_id, declared_categories, cefr, onboarded_at)
		VALUES ($1,$2,$3,$4,now())
		ON CONFLICT (actor_key) DO UPDATE SET
			user_id=COALESCE(EXCLUDED.user_id, micro_feed_profiles_embeddings.user_id),
			declared_categories=EXCLUDED.declared_categories,
			cefr=EXCLUDED.cefr,
			onboarded_at=now(),
			updated_at=now()`, actorKey, user, clean, cefr)
	if err != nil {
		return MicroFeedPreferences{}, err
	}

	// Уровень, названный в анкете ленты, ложится и на аккаунт — но только если
	// там его ещё нет. Спросили один раз, знают везде; а перетирать уже
	// заданный уровень лента не вправе, он не её.
	saved := MicroFeedPreferences{Categories: clean, CEFR: cefr, Onboarded: true}
	if userID != uuid.Nil {
		account, err := s.GetSerbianLevel(ctx, userID)
		if err != nil {
			return saved, err
		}
		if account.Known() {
			saved.CEFR = account.Level
			saved.LevelFromAccount = true
		} else if _, err := s.SetSerbianLevel(
			ctx, userID, cefr, LevelSourceDeclared,
		); err == nil {
			saved.LevelFromAccount = true
		}
	}
	return saved, nil
}

// ListLikedMicroFeed возвращает карточки, которые читатель отметил лайком.
//
// Лайк в ленте до сих пор был сигналом подбора и ничем больше: нажал — карточка
// уехала вверх и найти её было негде. Раздел с сохранённым делает лайк ещё и
// закладкой, а это ровно то, зачем его чаще всего и нажимают на чужом языке —
// «вернусь и разберу».
func (s *Store) ListLikedMicroFeed(
	ctx context.Context,
	actorKey string,
	limit int,
) ([]MicroFeedItem, error) {
	if limit <= 0 || limit > 100 {
		limit = 50
	}
	rows, err := s.Pool.Query(ctx, `
		SELECT `+microFeedItemColumns+`
		FROM micro_feed_reactions r
		JOIN micro_feed_content_items i ON i.id=r.item_id
		WHERE r.actor_key=$1 AND r.reaction=1 AND i.status='published'
		ORDER BY r.updated_at DESC
		LIMIT $2`, actorKey, limit)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	return collectMicroFeedItems(rows)
}

type microProfile struct {
	Embedding string
	Tags      []string
	// Avoided — темы, которые читатель раз за разом пролистывает не читая.
	Avoided []string
	// Declared — темы и уровень, названные читателем в анкете.
	Declared []string
	CEFR     string
	Warm     bool
}

func (s *Store) microFeedProfile(ctx context.Context, actorKey string) microProfile {
	profile := microProfile{CEFR: "B1"}
	var embedding *string
	// «Тёплым» читатель становится по любому осмысленному сигналу, а не по
	// трём лайкам. Лайк ставит меньшинство: большинство листает, дочитывает
	// то, что зацепило, и не нажимает ничего. По прежнему условию такой
	// читатель оставался холодным навсегда, сколько бы он ни читал.
	err := s.Pool.QueryRow(ctx, `
		SELECT embedding::text, preferred_tags, avoided_tags,
		       declared_categories, cefr,
		       (
		         (SELECT count(*) FROM micro_feed_reactions
		           WHERE actor_key=$1 AND reaction=1)
		         + (SELECT count(*) FROM micro_feed_interactions
		             WHERE actor_key=$1 AND event IN ('complete','read_more_clicked')
		               AND created_at > now()-interval '90 days')
		         + (SELECT count(*) FROM micro_feed_comments c
		            WHERE c.user_id=$2 AND c.deleted_at IS NULL
		              AND c.created_at > now()-interval '90 days')
		       ) >= 3
		FROM micro_feed_profiles_embeddings WHERE actor_key=$1`, actorKey, actorUserID(actorKey)).Scan(
		&embedding, &profile.Tags, &profile.Avoided,
		&profile.Declared, &profile.CEFR, &profile.Warm,
	)
	if err == nil && embedding != nil {
		profile.Embedding = *embedding
	}
	return profile
}

func (s *Store) ListMicroFeed(
	ctx context.Context,
	actorKey string,
	exclude []uuid.UUID,
	limit int,
) ([]MicroFeedItem, string, error) {
	if limit <= 0 || limit > 20 {
		limit = 8
	}
	profile := s.microFeedProfile(ctx, actorKey)
	seen := make(map[uuid.UUID]bool, len(exclude)+limit)
	for _, id := range exclude {
		seen[id] = true
	}
	result := make([]MicroFeedItem, 0, limit)
	add := func(items []MicroFeedItem, want int) {
		for _, item := range items {
			if len(result) >= limit || want <= 0 {
				return
			}
			if seen[item.ID] {
				continue
			}
			seen[item.ID] = true
			result = append(result, item)
			want--
		}
	}

	strategy := "cold"
	// Названные темы работают, ПОКА нет поведения: анкета — это обещание, а
	// подбор по прочитанному знает про читателя больше, чем он сам сказал о
	// себе в первую минуту. Поэтому у «тёплого» она уходит в фон и остаётся
	// лишь подстраховкой, если своих карточек не набралось.
	if !profile.Warm && len(profile.Declared) > 0 {
		strategy = "declared"
		declaredWant := int(math.Ceil(float64(limit) * .7))
		items, err := s.microFeedCandidates(ctx, actorKey, exclude, "declared", profile, declaredWant*3)
		if err != nil {
			return nil, strategy, err
		}
		add(items, declaredWant)
	}
	if profile.Warm {
		strategy = "personalized"
		semanticWant := int(math.Ceil(float64(limit) * .7))
		if profile.Embedding != "" {
			items, err := s.microFeedCandidates(ctx, actorKey, exclude, "semantic", profile, semanticWant*3)
			if err != nil {
				return nil, strategy, err
			}
			add(items, semanticWant)
		}
		tagWant := int(math.Ceil(float64(limit) * .2))
		items, err := s.microFeedCandidates(ctx, actorKey, exclude, "tags", profile, tagWant*4)
		if err != nil {
			return nil, strategy, err
		}
		add(items, tagWant)
		items, err = s.microFeedCandidates(ctx, actorKey, exclude, "explore", profile, limit*2)
		if err != nil {
			return nil, strategy, err
		}
		add(items, limit-len(result))
	} else {
		trendingWant := int(math.Ceil(float64(limit) * .5))
		items, err := s.microFeedCandidates(ctx, actorKey, exclude, "trending", profile, trendingWant*3)
		if err != nil {
			return nil, strategy, err
		}
		add(items, trendingWant)
		easyWant := int(math.Ceil(float64(limit) * .3))
		items, err = s.microFeedCandidates(ctx, actorKey, exclude, "easy", profile, easyWant*4)
		if err != nil {
			return nil, strategy, err
		}
		add(items, easyWant)
		items, err = s.microFeedCandidates(ctx, actorKey, exclude, "explore", profile, limit*2)
		if err != nil {
			return nil, strategy, err
		}
		add(items, limit-len(result))
	}

	if len(result) < limit {
		items, err := s.microFeedCandidates(ctx, actorKey, exclude, "trending", profile, limit*3)
		if err != nil {
			return nil, strategy, err
		}
		add(items, limit-len(result))
	}
	return spreadCategories(result), strategy, nil
}

// spreadCategories растаскивает подряд идущие карточки одной темы.
//
// Порция собирается из нескольких выборок, и каждая отсортирована по-своему:
// «популярное» вперемешку не идёт, поэтому пять новостей подряд — обычный
// исход. Листать такую ленту скучно ровно так же, как смотреть пять роликов
// одного автора подряд.
//
// Порядок внутри темы сохраняется: подбор решает, ЧТО показать, а эта
// перестановка — лишь когда именно, и переставлять карточки внутри одной темы
// значило бы спорить с подбором.
func spreadCategories(items []MicroFeedItem) []MicroFeedItem {
	if len(items) < 3 {
		return items
	}
	queues := make(map[string][]MicroFeedItem, 6)
	order := make([]string, 0, 6)
	for _, item := range items {
		if _, seen := queues[item.Category]; !seen {
			order = append(order, item.Category)
		}
		queues[item.Category] = append(queues[item.Category], item)
	}
	if len(order) < 2 {
		return items
	}

	out := make([]MicroFeedItem, 0, len(items))
	previous := ""
	for len(out) < len(items) {
		// Из самой длинной очереди, кроме темы предыдущей карточки: длинная
		// очередь, оставленная напоследок, всё равно вылилась бы подряд.
		best := ""
		for _, category := range order {
			if category == previous || len(queues[category]) == 0 {
				continue
			}
			if best == "" || len(queues[category]) > len(queues[best]) {
				best = category
			}
		}
		// Осталась одна тема — расставлять больше нечего.
		if best == "" {
			for _, category := range order {
				if len(queues[category]) > 0 {
					best = category
					break
				}
			}
		}
		out = append(out, queues[best][0])
		queues[best] = queues[best][1:]
		previous = best
	}
	return out
}

func (s *Store) microFeedCandidates(
	ctx context.Context,
	actorKey string,
	exclude []uuid.UUID,
	mode string,
	profile microProfile,
	limit int,
) ([]MicroFeedItem, error) {
	if limit <= 0 {
		return []MicroFeedItem{}, nil
	}
	extra := ""
	args := []any{actorKey, exclude, limit}

	// Номер следующего параметра. Раньше здесь стояла зашитая «$4», и добавить
	// хоть один параметр было нельзя, не сломав молча соседний режим.
	next := func(value any) string {
		args = append(args, value)
		return fmt.Sprintf("$%d", len(args))
	}

	// Обсуждение весит больше всего: комментарий стоит написанной фразы на
	// чужом языке, и карточка, вокруг которой спорят, интереснее карточки,
	// которую молча лайкнули. Дизлайк вычитается вдвое заметнее прежнего —
	// внутри логарифма он бы почти ничего не значил, поэтому стоит снаружи.
	trending := "(ln(2 + i.comments_count*10 + i.likes_count*3 + i.read_more_count*4)" +
		" - i.dislikes_count*.5" +
		" + 1/(1+extract(epoch from (now()-COALESCE(i.published_at,i.created_at)))/86400)) DESC"
	order := trending

	switch mode {
	case "semantic":
		extra = " AND i.embedding IS NOT NULL"
		order = "i.embedding <=> " + next(profile.Embedding) + "::vector, i.published_at DESC"
	case "tags":
		if len(profile.Tags) == 0 {
			return []MicroFeedItem{}, nil
		}
		order = "(SELECT count(*) FROM unnest(i.tags) tag WHERE tag=ANY(" +
			next(profile.Tags) + "::text[])) DESC, i.likes_count DESC"
	case "declared":
		if len(profile.Declared) == 0 {
			return []MicroFeedItem{}, nil
		}
		extra = " AND i.category = ANY(" + next(profile.Declared) + "::text[])"
		// Внутри названных тем — сначала подходящие по уровню, потом свежесть.
		// Уровень выражен расстоянием по шкале, а не точным совпадением: карточек
		// ровно своего уровня может не быть вовсе, и требовать их значило бы
		// показать пустую ленту вместо соседней ступени.
		order = "abs(" + next(feedLevelIndex(profile.CEFR)) +
			" - array_position(ARRAY['A1','A2','B1','B2','C1'], i.cefr)), " + trending
	case "easy":
		// «Лёгкое» отсчитывается от названного уровня: для C1 «лёгкое» — это B1,
		// а не A2, и подсовывать ему детские тексты незачем.
		extra = " AND array_position(ARRAY['A1','A2','B1','B2','C1'], i.cefr) <= " +
			next(feedLevelIndex(profile.CEFR))
		order = "md5(i.id::text || $1 || current_date::text)"
	case "explore":
		order = "md5(i.category || i.id::text || $1 || current_date::text)"
	}

	// Темы, которые читатель раз за разом пролистывает, отодвигаются в конец
	// выборки, но не вычёркиваются. Вычеркнуть значило бы запереть человека в
	// том, что он читал в первый вечер: интерес меняется, а узнать об этом
	// иначе, чем изредка показав такую тему снова, нельзя.
	//
	// В режиме «explore» отодвигать нечего: он и существует ради того, чтобы
	// показать непохожее.
	if len(profile.Avoided) > 0 && mode != "explore" {
		order = "(i.tags && " + next(profile.Avoided) + "::text[]), " + order
	}

	query := `SELECT ` + microFeedItemColumns + `
		FROM micro_feed_content_items i
		LEFT JOIN micro_feed_reactions r ON r.item_id=i.id AND r.actor_key=$1
		WHERE i.status='published'
		  AND NOT (i.id=ANY($2::uuid[]))
		  AND NOT EXISTS (
			SELECT 1 FROM micro_feed_interactions recent
			WHERE recent.actor_key=$1 AND recent.item_id=i.id
			  AND recent.created_at > now()-interval '14 days'
			  AND recent.event IN ('view','quick_skip')
		  )` + extra + `
		ORDER BY ` + order + ` LIMIT $3`
	rows, err := s.Pool.Query(ctx, query, args...)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	return collectMicroFeedItems(rows)
}

func (s *Store) RecordMicroFeedInteraction(
	ctx context.Context,
	itemID uuid.UUID,
	actorKey string,
	userID uuid.UUID,
	event string,
	dwellMS int,
) error {
	var user any
	if userID != uuid.Nil {
		user = userID
	}
	return s.InTx(ctx, func(tx pgx.Tx) error {
		var exists bool
		if err := tx.QueryRow(ctx, `
			SELECT true FROM micro_feed_content_items
			WHERE id=$1 AND status='published'`, itemID).Scan(&exists); err != nil {
			if errors.Is(err, pgx.ErrNoRows) {
				return ErrMicroFeedNotFound
			}
			return err
		}

		if event == "like" || event == "dislike" || event == "reaction_cleared" {
			if err := updateMicroFeedReaction(ctx, tx, itemID, actorKey, user, event); err != nil {
				return err
			}
		}
		_, err := tx.Exec(ctx, `
			INSERT INTO micro_feed_interactions (item_id, actor_key, user_id, event, dwell_ms)
			VALUES ($1,$2,$3,$4,$5)`, itemID, actorKey, user, event, dwellMS)
		if err != nil {
			return err
		}
		switch event {
		case "view":
			_, err = tx.Exec(ctx, `UPDATE micro_feed_content_items SET views_count=views_count+1 WHERE id=$1`, itemID)
		case "read_more_clicked":
			_, err = tx.Exec(ctx, `UPDATE micro_feed_content_items SET read_more_count=read_more_count+1 WHERE id=$1`, itemID)
		}
		if err != nil {
			return err
		}

		// Профиль пересобирается и от поведения, а не только от лайков.
		// Реакции обработаны выше и профиль уже обновили; здесь остаются
		// события, которые раньше записывались и не влияли ни на что.
		//
		// «view» и «impression» сюда не входят намеренно: карточка попала на
		// экран не потому, что читатель её выбрал, и считать это одобрением
		// значит подстраивать ленту под собственную выдачу.
		switch event {
		case "complete", "read_more_clicked", "quick_skip":
			return refreshMicroFeedProfile(ctx, tx, actorKey, user)
		}
		return nil
	})
}

func updateMicroFeedReaction(
	ctx context.Context,
	tx pgx.Tx,
	itemID uuid.UUID,
	actorKey string,
	user any,
	event string,
) error {
	previous := 0
	err := tx.QueryRow(ctx, `
		SELECT reaction FROM micro_feed_reactions
		WHERE item_id=$1 AND actor_key=$2 FOR UPDATE`, itemID, actorKey).Scan(&previous)
	if err != nil && !errors.Is(err, pgx.ErrNoRows) {
		return err
	}
	next := 0
	if event == "like" {
		next = 1
	} else if event == "dislike" {
		next = -1
	}
	if next == 0 {
		_, err = tx.Exec(ctx, `DELETE FROM micro_feed_reactions WHERE item_id=$1 AND actor_key=$2`, itemID, actorKey)
	} else {
		_, err = tx.Exec(ctx, `
			INSERT INTO micro_feed_reactions (item_id, actor_key, user_id, reaction)
			VALUES ($1,$2,$3,$4)
			ON CONFLICT (item_id,actor_key) DO UPDATE SET
				user_id=EXCLUDED.user_id, reaction=EXCLUDED.reaction, updated_at=now()`,
			itemID, actorKey, user, next)
	}
	if err != nil {
		return err
	}

	// Публичный счётчик растёт только от вошедших.
	//
	// Реакция гостя по-прежнему сохраняется и по-прежнему формирует ЕГО подбор:
	// лайк ставит меньшинство, и требовать вход ради рекомендаций значило бы
	// оставить большинство читателей без них. Но «популярное» — это общий
	// рейтинг, а не личная лента: гостевой токен подписан сервером, однако
	// набрать пачку токенов может кто угодно, и накрутить выдачу для ВСЕХ так
	// было бы по-прежнему дёшево. Аккаунт стоит подтверждённой почты, и это
	// единственная граница, которая здесь действительно держит.
	if user != nil {
		likesDelta := boolInt(next == 1) - boolInt(previous == 1)
		dislikesDelta := boolInt(next == -1) - boolInt(previous == -1)
		_, err = tx.Exec(ctx, `
			UPDATE micro_feed_content_items SET
				likes_count=greatest(0,likes_count+$2),
				dislikes_count=greatest(0,dislikes_count+$3)
			WHERE id=$1`, itemID, likesDelta, dislikesDelta)
		if err != nil {
			return err
		}
	}

	return refreshMicroFeedProfile(ctx, tx, actorKey, user)
}

// refreshMicroFeedProfile пересобирает профиль читателя по его поведению.
//
// Профиль строится заново, а не дополняется: так он не уползает после снятого
// лайка, и одна случайная карточка в начале не определяет ленту навсегда.
//
// Сигналы взвешены по тому, чего они стоили читателю.
//
//	комментарий  6 — написанная фраза на чужом языке, дороже всего остального;
//	лайк         6 — намеренное «да», одно нажатие;
//	«дальше»     2 — человек открыл полный текст, но ничего не сказал;
//	дочитывание  1 — самый слабый по отдельности и самый частый.
//
// Разрыв между лайком и дочитыванием намеренно шестикратный: дочитывание
// делает подбор возможным для тех, кто не нажимает ничего, но приравнивать
// молчаливое «прочитал» к сказанному «нравится» неверно — шесть дочитанных
// карточек одной темы весят ровно один лайк.
//
// Вес выражен повторами строки: pgvector умеет усреднять векторы, но не
// взвешивать их, а собирать взвешенную сумму вручную здесь незачем.
func refreshMicroFeedProfile(ctx context.Context, tx pgx.Tx, actorKey string, user any) error {
	_, err := tx.Exec(ctx, `
		WITH signals AS (
			-- Скобки обязательны: ORDER BY с LIMIT внутри ветки UNION ALL
			-- без них относится ко всему объединению, а не к ветке.
			(SELECT item_id, 6 AS weight FROM micro_feed_reactions
			  WHERE actor_key=$1 AND reaction=1
			  ORDER BY updated_at DESC LIMIT 50)
			UNION ALL
			(SELECT c.item_id, 6 FROM micro_feed_comments c
			  WHERE c.user_id=$2 AND c.deleted_at IS NULL
			  ORDER BY c.created_at DESC LIMIT 50)
			UNION ALL
			(SELECT item_id, 2 FROM micro_feed_interactions
			  WHERE actor_key=$1 AND event='read_more_clicked'
			    AND created_at > now()-interval '90 days'
			  ORDER BY created_at DESC LIMIT 50)
			UNION ALL
			(SELECT item_id, 1 FROM micro_feed_interactions
			  WHERE actor_key=$1 AND event='complete'
			    AND created_at > now()-interval '90 days'
			  ORDER BY created_at DESC LIMIT 100)
		),
		weighted AS (
			SELECT s.item_id FROM signals s, generate_series(1, s.weight)
		),
		liked AS (
			SELECT i.* FROM weighted w JOIN micro_feed_content_items i ON i.id=w.item_id
		),
		-- Отталкивающие темы: читатель раз за разом пролистывает их не читая
		-- или прямо отмечает «не показывать похожее».
		--
		-- Пролистывание весит 1, и одного мало: пролистать можно и по
		-- случайности. Дизлайк весит 3 и закрывает тему сразу — это сказанное
		-- вслух «не показывать похожее», и просить сказать это трижды значит
		-- не слушать с первого раза.
		avoided AS (
			SELECT tag FROM (
				SELECT unnest(i.tags) tag, count(*) AS hits
				  FROM micro_feed_interactions x
				  JOIN micro_feed_content_items i ON i.id=x.item_id
				 WHERE x.actor_key=$1 AND x.event='quick_skip'
				   AND x.created_at > now()-interval '90 days'
				 GROUP BY tag
				UNION ALL
				SELECT unnest(i.tags) tag, count(*)*3 AS hits
				  FROM micro_feed_reactions r
				  JOIN micro_feed_content_items i ON i.id=r.item_id
				 WHERE r.actor_key=$1 AND r.reaction=-1
				 GROUP BY tag
			) skipped
			GROUP BY tag HAVING sum(hits) >= 3
			ORDER BY sum(hits) DESC LIMIT 12
		)
		INSERT INTO micro_feed_profiles_embeddings
			(actor_key, user_id, embedding, preferred_tags, avoided_tags)
		SELECT $1, $2,
		       (SELECT avg(embedding) FROM liked WHERE embedding IS NOT NULL),
		       COALESCE((SELECT array_agg(tag ORDER BY uses DESC, tag) FROM (
					SELECT tag, count(*) uses FROM (
						SELECT unnest(tags) tag FROM liked
					) tags GROUP BY tag ORDER BY uses DESC LIMIT 12
				) preferred), '{}'::text[]),
		       COALESCE((SELECT array_agg(tag) FROM avoided), '{}'::text[])
		ON CONFLICT (actor_key) DO UPDATE SET
			user_id=EXCLUDED.user_id, embedding=EXCLUDED.embedding,
			preferred_tags=EXCLUDED.preferred_tags,
			avoided_tags=EXCLUDED.avoided_tags, updated_at=now()`, actorKey, user)
	return err
}

func boolInt(value bool) int {
	if value {
		return 1
	}
	return 0
}

func microVectorLiteral(values []float32) (any, error) {
	if len(values) == 0 {
		return nil, nil
	}
	if len(values) != 1536 {
		return nil, fmt.Errorf("ожидался embedding размерности 1536, получено %d", len(values))
	}
	var b strings.Builder
	b.Grow(len(values) * 10)
	b.WriteByte('[')
	for i, value := range values {
		if i > 0 {
			b.WriteByte(',')
		}
		b.WriteString(strconv.FormatFloat(float64(value), 'g', -1, 32))
	}
	b.WriteByte(']')
	return b.String(), nil
}

// MicroFeedImageURL возвращает адрес картинки опубликованной карточки.
//
// Отдельный запрос вместо чтения всей карточки нужен ручке-прокси: ей нужен
// один адрес, а карточка — это ещё и два варианта текста по тысяче знаков.
//
// Здесь же лежит вся защита прокси: наружу передаётся не адрес, а
// идентификатор карточки, и сервер идёт только туда, куда он сам когда-то
// записал при выборке из источника. Принимай ручка адрес от браузера — она
// стала бы открытым прокси, через который можно постучаться и во внутреннюю
// сеть.
func (s *Store) MicroFeedImageURL(ctx context.Context, id uuid.UUID) (string, error) {
	var image string
	err := s.Pool.QueryRow(ctx, `
		SELECT image_url FROM micro_feed_content_items
		WHERE id = $1 AND status = 'published'`, id).Scan(&image)
	if errors.Is(err, pgx.ErrNoRows) {
		return "", ErrMicroFeedNotFound
	}
	return image, err
}

// MicroFeedItemsWithoutEmbedding возвращает опубликованные карточки без профиля.
//
// Нужен для дозаполнения: рекомендатель подбирает похожее по embedding, и
// карточка без него участвует только в «случайной» части ленты. Пока
// пакетный наполнитель создавал карточки без профиля, такими оказались почти
// все — раздел выглядел работающим, а подбор молча не работал.
func (s *Store) MicroFeedItemsWithoutEmbedding(
	ctx context.Context,
	limit int,
) ([]MicroFeedItem, error) {
	if limit <= 0 || limit > 500 {
		limit = 200
	}
	rows, err := s.Pool.Query(ctx, `
		SELECT `+microFeedItemColumns+`
		FROM micro_feed_content_items i
		LEFT JOIN micro_feed_reactions r ON false
		WHERE i.status='published' AND i.embedding IS NULL
		ORDER BY i.created_at
		LIMIT $1`, limit)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	return collectMicroFeedItems(rows)
}
