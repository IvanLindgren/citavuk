ALTER TABLE micro_feed_content_items DROP CONSTRAINT micro_feed_content_items_kind_check;
ALTER TABLE micro_feed_content_items ADD CONSTRAINT micro_feed_content_items_kind_check
 CHECK(kind IN ('news','fact','culture','science','fiction','society','book_excerpt','video'));
ALTER TABLE micro_feed_content_items ADD COLUMN video_id text NOT NULL DEFAULT '',
 ADD COLUMN video_duration integer NOT NULL DEFAULT 0,
 ADD COLUMN video_language_confirmed boolean NOT NULL DEFAULT false,
 ADD COLUMN video_checked_at timestamptz;
ALTER TABLE micro_feed_content_items ADD CONSTRAINT micro_video_public_check CHECK(
 kind<>'video' OR status<>'published' OR
 (video_id ~ '^[A-Za-z0-9_-]{11}$' AND video_duration BETWEEN 1 AND 180
 AND video_language_confirmed AND video_checked_at IS NOT NULL AND original_language='sr'));
CREATE UNIQUE INDEX micro_video_id_unique ON micro_feed_content_items(video_id) WHERE video_id<>'';
