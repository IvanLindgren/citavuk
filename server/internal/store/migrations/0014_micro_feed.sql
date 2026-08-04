-- Web-only experimental micro-feed. Raw imports are deliberately separated
-- from published cards: automatic collection and LLM generation may only
-- create drafts, while publication always remains an administrator action.

CREATE EXTENSION IF NOT EXISTS vector;

CREATE TABLE micro_feed_sources (
    slug             text PRIMARY KEY,
    title            text        NOT NULL,
    source_kind      text        NOT NULL CHECK (source_kind IN ('rss', 'mediawiki', 'manual')),
    source_url       text        NOT NULL,
    language         text        NOT NULL DEFAULT 'sr',
    rights_mode      text        NOT NULL CHECK (rights_mode IN ('reuse', 'summary_only', 'manual_review')),
    license_code     text        NOT NULL DEFAULT '',
    attribution_name text        NOT NULL DEFAULT '',
    attribution_url  text        NOT NULL DEFAULT '',
    enabled          boolean     NOT NULL DEFAULT true,
    last_synced_at   timestamptz,
    created_at       timestamptz NOT NULL DEFAULT now(),
    updated_at       timestamptz NOT NULL DEFAULT now()
);

INSERT INTO micro_feed_sources (
    slug, title, source_kind, source_url, language, rights_mode,
    license_code, attribution_name, attribution_url, enabled
) VALUES
    (
        'sr-wikipedia', 'Википедија на српском', 'mediawiki',
        'https://sr.wikipedia.org/w/api.php', 'sr', 'reuse',
        'CC-BY-SA-4.0', 'Википедија', 'https://sr.wikipedia.org/', true
    ),
    (
        'simple-wikipedia', 'Simple English Wikipedia', 'mediawiki',
        'https://simple.wikipedia.org/w/api.php', 'en', 'reuse',
        'CC-BY-SA-4.0', 'Simple English Wikipedia', 'https://simple.wikipedia.org/', true
    ),
    (
        'rts-news', 'РТС Вести', 'rss',
        'https://www.rts.rs/vesti/rss.html', 'sr', 'summary_only',
        'ALL-RIGHTS-RESERVED', 'Радио-телевизија Србије', 'https://www.rts.rs/vesti/', true
    ),
    (
        'rts-radio', 'Радио Београд', 'rss',
        'https://www.rts.rs/radio/rss.html', 'sr', 'summary_only',
        'ALL-RIGHTS-RESERVED', 'Радио Београд', 'https://www.rts.rs/radio/', true
    ),
    (
        'open-data-serbia', 'Портал отворених података Србије', 'manual',
        'https://data.gov.rs/', 'sr', 'manual_review',
        'RS-OPEN-DATA-LICENSE', 'Портал отворених података', 'https://data.gov.rs/sr/terms/', false
    )
ON CONFLICT (slug) DO NOTHING;

CREATE TABLE micro_feed_imports (
    id                  uuid PRIMARY KEY,
    source_slug         text        NOT NULL REFERENCES micro_feed_sources (slug),
    external_id         text        NOT NULL,
    source_title        text        NOT NULL DEFAULT '',
    source_url          text        NOT NULL DEFAULT '',
    raw_text            text        NOT NULL DEFAULT '',
    source_published_at timestamptz,
    status              text        NOT NULL DEFAULT 'queued'
        CHECK (status IN ('queued', 'processed', 'rejected')),
    rejection_reason    text        NOT NULL DEFAULT '',
    created_at          timestamptz NOT NULL DEFAULT now(),
    updated_at          timestamptz NOT NULL DEFAULT now(),
    UNIQUE (source_slug, external_id)
);
CREATE INDEX micro_feed_imports_queue_idx
    ON micro_feed_imports (status, created_at DESC);

CREATE TABLE micro_feed_content_items (
    id                     uuid PRIMARY KEY,
    status                 text        NOT NULL DEFAULT 'draft'
        CHECK (status IN ('draft', 'published', 'archived')),
    kind                   text        NOT NULL
        CHECK (kind IN ('news', 'fact', 'culture', 'science', 'fiction', 'society', 'book_excerpt')),
    category               text        NOT NULL
        CHECK (category IN ('history', 'culture', 'science', 'fiction', 'society', 'news')),
    title_cyrillic         text        NOT NULL,
    title_latin            text        NOT NULL,
    text_cyrillic          text        NOT NULL,
    text_latin             text        NOT NULL,
    original_language      text        NOT NULL DEFAULT 'sr',
    original_script        text        NOT NULL DEFAULT 'cyrillic'
        CHECK (original_script IN ('cyrillic', 'latin', 'translated')),
    cefr                   text        NOT NULL CHECK (cefr IN ('A1', 'A2', 'B1', 'B2', 'C1')),
    tags                   text[]      NOT NULL DEFAULT '{}',
    difficult_words        jsonb       NOT NULL DEFAULT '[]'::jsonb,
    image_url              text        NOT NULL DEFAULT '',
    audio_url              text        NOT NULL DEFAULT '',
    source_slug            text REFERENCES micro_feed_sources (slug),
    source_import_id       uuid REFERENCES micro_feed_imports (id) ON DELETE SET NULL,
    source_title           text        NOT NULL DEFAULT '',
    source_url             text        NOT NULL DEFAULT '',
    source_published_at    timestamptz,
    license_code           text        NOT NULL DEFAULT '',
    attribution_text       text        NOT NULL DEFAULT '',
    source_book_id         text        NOT NULL DEFAULT '',
    chapter_id             text        NOT NULL DEFAULT '',
    start_position_char    integer     NOT NULL DEFAULT 0 CHECK (start_position_char >= 0),
    book_target_url        text        NOT NULL DEFAULT '',
    embedding              vector(1536),
    views_count            bigint      NOT NULL DEFAULT 0,
    likes_count            bigint      NOT NULL DEFAULT 0,
    dislikes_count         bigint      NOT NULL DEFAULT 0,
    read_more_count        bigint      NOT NULL DEFAULT 0,
    created_by             uuid REFERENCES users (id) ON DELETE SET NULL,
    published_at           timestamptz,
    created_at             timestamptz NOT NULL DEFAULT now(),
    updated_at             timestamptz NOT NULL DEFAULT now(),
    CHECK (jsonb_typeof(difficult_words) = 'array')
);
CREATE INDEX micro_feed_published_idx
    ON micro_feed_content_items (status, published_at DESC);
CREATE INDEX micro_feed_category_idx
    ON micro_feed_content_items (category, cefr, published_at DESC)
    WHERE status = 'published';
CREATE INDEX micro_feed_tags_idx
    ON micro_feed_content_items USING gin (tags);
CREATE INDEX micro_feed_embedding_hnsw_idx
    ON micro_feed_content_items USING hnsw (embedding vector_cosine_ops)
    WITH (m = 16, ef_construction = 64)
    WHERE embedding IS NOT NULL AND status = 'published';

-- actor_key is user:<uuid> for an account and guest:<uuid> for a browser.
-- No IP or fingerprint is persisted for anonymous recommendations.
CREATE TABLE micro_feed_interactions (
    id          bigserial PRIMARY KEY,
    item_id     uuid        NOT NULL REFERENCES micro_feed_content_items (id) ON DELETE CASCADE,
    actor_key   text        NOT NULL,
    user_id     uuid REFERENCES users (id) ON DELETE CASCADE,
    event       text        NOT NULL
        CHECK (event IN ('impression', 'view', 'like', 'dislike', 'reaction_cleared', 'read_more_clicked', 'quick_skip', 'complete', 'audio_play')),
    dwell_ms    integer     NOT NULL DEFAULT 0 CHECK (dwell_ms >= 0 AND dwell_ms <= 3600000),
    created_at  timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX micro_feed_interactions_actor_recent_idx
    ON micro_feed_interactions (actor_key, created_at DESC, item_id);
CREATE INDEX micro_feed_interactions_item_idx
    ON micro_feed_interactions (item_id, created_at DESC);

CREATE TABLE micro_feed_reactions (
    item_id     uuid        NOT NULL REFERENCES micro_feed_content_items (id) ON DELETE CASCADE,
    actor_key   text        NOT NULL,
    user_id     uuid REFERENCES users (id) ON DELETE CASCADE,
    reaction    smallint    NOT NULL CHECK (reaction IN (-1, 1)),
    updated_at  timestamptz NOT NULL DEFAULT now(),
    PRIMARY KEY (item_id, actor_key)
);
CREATE INDEX micro_feed_reactions_actor_idx
    ON micro_feed_reactions (actor_key, updated_at DESC);

CREATE TABLE micro_feed_profiles_embeddings (
    actor_key        text PRIMARY KEY,
    user_id          uuid REFERENCES users (id) ON DELETE CASCADE,
    embedding        vector(1536),
    preferred_tags   text[]      NOT NULL DEFAULT '{}',
    preferred_script text        NOT NULL DEFAULT 'latin'
        CHECK (preferred_script IN ('cyrillic', 'latin')),
    cefr              text        NOT NULL DEFAULT 'B1'
        CHECK (cefr IN ('A1', 'A2', 'B1', 'B2', 'C1')),
    updated_at        timestamptz NOT NULL DEFAULT now()
);
