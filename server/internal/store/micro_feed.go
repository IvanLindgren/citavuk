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
	ID                uuid.UUID  `json:"id"`
	SourceSlug        string     `json:"sourceSlug"`
	SourceTitle       string     `json:"sourceTitle"`
	ExternalID        string     `json:"externalId"`
	Title             string     `json:"title"`
	SourceURL         string     `json:"sourceUrl"`
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
					raw_text, source_published_at
				) VALUES ($1,$2,$3,$4,$5,$6,$7)
				ON CONFLICT (source_slug, external_id) DO UPDATE SET
					source_title = EXCLUDED.source_title,
					source_url = EXCLUDED.source_url,
					raw_text = CASE
						WHEN micro_feed_imports.status = 'queued' THEN EXCLUDED.raw_text
						ELSE micro_feed_imports.raw_text
					END,
					source_published_at = EXCLUDED.source_published_at,
					updated_at = now()
				WHERE micro_feed_imports.status = 'queued'`,
				item.ID, sourceSlug, item.ExternalID, item.Title, item.SourceURL,
				item.RawText, item.SourcePublishedAt,
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
		       i.source_url, i.raw_text, i.source_published_at, i.status,
		       i.rejection_reason, i.created_at
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
		       i.source_url, i.raw_text, i.source_published_at, i.status,
		       i.rejection_reason, i.created_at
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
		&item.Title, &item.SourceURL, &item.RawText, &item.SourcePublishedAt,
		&item.Status, &item.RejectionReason, &item.CreatedAt,
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
	i.likes_count, i.dislikes_count, i.read_more_count, COALESCE(r.reaction,0),
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
		&item.Reaction, &item.HasEmbedding, &item.PublishedAt,
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

type microProfile struct {
	Embedding string
	Tags      []string
	Warm      bool
}

func (s *Store) microFeedProfile(ctx context.Context, actorKey string) microProfile {
	var profile microProfile
	var embedding *string
	err := s.Pool.QueryRow(ctx, `
		SELECT embedding::text, preferred_tags,
		       (SELECT count(*) >= 3 FROM micro_feed_reactions WHERE actor_key=$1 AND reaction=1)
		FROM micro_feed_profiles_embeddings WHERE actor_key=$1`, actorKey).Scan(
		&embedding, &profile.Tags, &profile.Warm,
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
	return result, strategy, nil
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
	order := "(ln(2 + i.likes_count*3 + i.read_more_count*4) - i.dislikes_count*.25 + 1/(1+extract(epoch from (now()-COALESCE(i.published_at,i.created_at)))/86400)) DESC"
	args := []any{actorKey, exclude, limit}
	switch mode {
	case "semantic":
		extra = " AND i.embedding IS NOT NULL"
		order = "i.embedding <=> $4::vector, i.published_at DESC"
		args = append(args, profile.Embedding)
	case "tags":
		if len(profile.Tags) == 0 {
			return []MicroFeedItem{}, nil
		}
		order = "(SELECT count(*) FROM unnest(i.tags) tag WHERE tag=ANY($4::text[])) DESC, i.likes_count DESC"
		args = append(args, profile.Tags)
	case "easy":
		extra = " AND i.cefr IN ('A2','B1')"
		order = "md5(i.id::text || $1 || current_date::text)"
	case "explore":
		order = "md5(i.category || i.id::text || $1 || current_date::text)"
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
		return err
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

	// A profile is rebuilt from recent positive reactions. This avoids drift
	// after unlikes and keeps one bad early choice from defining the feed.
	_, err = tx.Exec(ctx, `
		INSERT INTO micro_feed_profiles_embeddings (actor_key,user_id,embedding,preferred_tags)
		SELECT $1,$2,
		       (SELECT avg(i.embedding) FROM (
				SELECT item_id FROM micro_feed_reactions
				WHERE actor_key=$1 AND reaction=1 ORDER BY updated_at DESC LIMIT 50
			) liked JOIN micro_feed_content_items i ON i.id=liked.item_id
			WHERE i.embedding IS NOT NULL),
		       COALESCE((SELECT array_agg(tag ORDER BY uses DESC, tag) FROM (
				SELECT tag, count(*) uses FROM (
					SELECT unnest(i.tags) tag FROM micro_feed_reactions r
					JOIN micro_feed_content_items i ON i.id=r.item_id
					WHERE r.actor_key=$1 AND r.reaction=1
				) tags GROUP BY tag ORDER BY uses DESC LIMIT 12
			) preferred),'{}'::text[])
		ON CONFLICT (actor_key) DO UPDATE SET
			user_id=EXCLUDED.user_id, embedding=EXCLUDED.embedding,
			preferred_tags=EXCLUDED.preferred_tags, updated_at=now()`, actorKey, user)
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
