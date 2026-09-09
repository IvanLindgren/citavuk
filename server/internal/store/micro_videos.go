package store

import (
	"context"
	"github.com/citavuk/server/internal/lexicon"
	"github.com/google/uuid"
	"time"
)

func (s *Store) CreateMicroVideo(ctx context.Context, id, title, author, category, cefr string, tags []string) (*MicroFeedItem, error) {
	tags = append(tags, category)
	var itemID uuid.UUID
	err := s.Pool.QueryRow(ctx, `INSERT INTO micro_feed_content_items(id,kind,category,title_cyrillic,title_latin,text_cyrillic,text_latin,original_language,original_script,cefr,tags,difficult_words,source_title,source_url,license_code,attribution_text,video_id)
 VALUES($1,'video',$2,$3,$4,'','','sr','latin',$5,$6,'[]',$7,$8,'YOUTUBE-EMBED',$7,$9)
 ON CONFLICT(video_id) WHERE video_id<>'' DO UPDATE SET video_id=EXCLUDED.video_id RETURNING id`, uuid.New(), category, lexicon.ToCyrillic(title), lexicon.ToLatin(title), cefr, tags, author, "https://www.youtube.com/watch?v="+id, id).Scan(&itemID)
	if err != nil {
		return nil, err
	}
	return s.GetMicroFeedItem(ctx, itemID, "")
}
func (s *Store) PublishMicroVideo(ctx context.Context, id uuid.UUID, duration int) error {
	tag, err := s.Pool.Exec(ctx, `UPDATE micro_feed_content_items SET video_duration=$2,video_language_confirmed=true,video_checked_at=$3,status='published',published_at=coalesce(published_at,$3),updated_at=$3 WHERE id=$1 AND kind='video'`, id, duration, time.Now())
	if err == nil && tag.RowsAffected() == 0 {
		return ErrMicroFeedNotFound
	}
	return err
}
func (s *Store) ListMicroVideos(ctx context.Context) ([]MicroFeedItem, error) {
	rows, err := s.Pool.Query(ctx, `SELECT `+microFeedItemColumns+` FROM micro_feed_content_items i LEFT JOIN micro_feed_reactions r ON false WHERE i.kind='video' ORDER BY i.created_at DESC LIMIT 200`)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	return collectMicroFeedItems(rows)
}
