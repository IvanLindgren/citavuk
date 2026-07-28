-- Администрирование: роль, агрегированные инциденты и версии курсов.

ALTER TABLE users
    ADD COLUMN is_admin boolean NOT NULL DEFAULT false;

CREATE TABLE incidents (
    id          uuid PRIMARY KEY,
    fingerprint text        NOT NULL UNIQUE,
    severity    text        NOT NULL CHECK (severity IN ('info', 'warning', 'error', 'critical')),
    source      text        NOT NULL DEFAULT 'server',
    message     text        NOT NULL,
    details     jsonb       NOT NULL DEFAULT '{}'::jsonb,
    occurrences bigint      NOT NULL DEFAULT 1,
    first_seen  timestamptz NOT NULL DEFAULT now(),
    last_seen   timestamptz NOT NULL DEFAULT now(),
    resolved_at timestamptz,
    resolved_by uuid REFERENCES users (id) ON DELETE SET NULL
);
CREATE INDEX incidents_open_idx ON incidents (resolved_at, last_seen DESC);

CREATE TABLE course_releases (
    id           uuid PRIMARY KEY,
    course_id    text        NOT NULL,
    version      text        NOT NULL,
    title        text        NOT NULL,
    bundle       jsonb       NOT NULL,
    status       text        NOT NULL DEFAULT 'draft'
                             CHECK (status IN ('draft', 'published', 'archived')),
    created_by   uuid REFERENCES users (id) ON DELETE SET NULL,
    created_at   timestamptz NOT NULL DEFAULT now(),
    updated_at   timestamptz NOT NULL DEFAULT now(),
    published_at timestamptz,
    UNIQUE (course_id, version)
);
CREATE UNIQUE INDEX course_one_published_idx
    ON course_releases (course_id)
    WHERE status = 'published';
CREATE INDEX course_releases_updated_idx
    ON course_releases (updated_at DESC);
