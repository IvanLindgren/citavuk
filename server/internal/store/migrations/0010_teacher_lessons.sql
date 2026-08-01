-- Пользовательские уроки преподавателей. Встроенный игровой курс хранится
-- отдельно в course_releases: у этих сущностей разные жизненные циклы.

CREATE TABLE teacher_applications (
    user_id             uuid PRIMARY KEY REFERENCES users (id) ON DELETE CASCADE,
    serbian_level       text NOT NULL CHECK (serbian_level IN ('A1','A2','B1','B2','C1','C2')),
    native_speaker      boolean NOT NULL DEFAULT false,
    russian_level       text NOT NULL DEFAULT '',
    certificates        text NOT NULL DEFAULT '',
    teaching_experience text NOT NULL DEFAULT '',
    social_links        jsonb NOT NULL DEFAULT '[]'::jsonb,
    monetization_intent text NOT NULL DEFAULT 'free'
                               CHECK (monetization_intent IN ('free','paid','both')),
    status              text NOT NULL DEFAULT 'pending'
                               CHECK (status IN ('pending','approved','rejected','suspended')),
    admin_comment       text NOT NULL DEFAULT '',
    reviewed_by         uuid REFERENCES users (id) ON DELETE SET NULL,
    reviewed_at         timestamptz,
    created_at          timestamptz NOT NULL DEFAULT now(),
    updated_at          timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX teacher_applications_status_idx
    ON teacher_applications (status, updated_at DESC);

CREATE TABLE teacher_profiles (
    user_id      uuid PRIMARY KEY REFERENCES users (id) ON DELETE CASCADE,
    public_name  text NOT NULL DEFAULT '',
    bio          text NOT NULL DEFAULT '',
    organization text NOT NULL DEFAULT '',
    languages    text[] NOT NULL DEFAULT '{}',
    formats      text[] NOT NULL DEFAULT '{}',
    website      text NOT NULL DEFAULT '',
    social_links jsonb NOT NULL DEFAULT '[]'::jsonb,
    avatar_url   text NOT NULL DEFAULT '',
    updated_at   timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE teacher_lessons (
    id                    uuid PRIMARY KEY,
    author_id             uuid NOT NULL REFERENCES users (id) ON DELETE CASCADE,
    slug                  text NOT NULL UNIQUE,
    share_token           text NOT NULL UNIQUE,
    title                 text NOT NULL,
    summary               text NOT NULL DEFAULT '',
    level                 text NOT NULL CHECK (level IN ('A1','A2','B1','B2','C1','C2')),
    lesson_type           text NOT NULL CHECK (lesson_type IN ('lexicon','grammar','speaking','writing')),
    topic                 text NOT NULL,
    tags                  text[] NOT NULL DEFAULT '{}',
    estimated_minutes     int NOT NULL DEFAULT 10 CHECK (estimated_minutes BETWEEN 1 AND 240),
    script                text NOT NULL DEFAULT 'both' CHECK (script IN ('latin','cyrillic','both')),
    visibility            text NOT NULL DEFAULT 'draft' CHECK (visibility IN ('draft','public','unlisted')),
    published_revision_id uuid,
    archived              boolean NOT NULL DEFAULT false,
    created_at            timestamptz NOT NULL DEFAULT now(),
    updated_at            timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX teacher_lessons_author_idx ON teacher_lessons (author_id, updated_at DESC);
CREATE INDEX teacher_lessons_catalog_idx
    ON teacher_lessons (visibility, archived, level, lesson_type, updated_at DESC);

CREATE TABLE lesson_revisions (
    id            uuid PRIMARY KEY,
    lesson_id     uuid NOT NULL REFERENCES teacher_lessons (id) ON DELETE CASCADE,
    version       int NOT NULL,
    content       jsonb NOT NULL,
    status        text NOT NULL DEFAULT 'draft'
                       CHECK (status IN ('draft','pending','published','rejected')),
    admin_comment text NOT NULL DEFAULT '',
    created_by    uuid REFERENCES users (id) ON DELETE SET NULL,
    reviewed_by   uuid REFERENCES users (id) ON DELETE SET NULL,
    created_at    timestamptz NOT NULL DEFAULT now(),
    submitted_at  timestamptz,
    reviewed_at   timestamptz,
    published_at  timestamptz,
    UNIQUE (lesson_id, version)
);
ALTER TABLE teacher_lessons
    ADD CONSTRAINT teacher_lessons_published_revision_fk
    FOREIGN KEY (published_revision_id) REFERENCES lesson_revisions (id) ON DELETE SET NULL;
CREATE INDEX lesson_revisions_queue_idx ON lesson_revisions (status, submitted_at);

CREATE TABLE teacher_media (
    id          uuid PRIMARY KEY,
    owner_id    uuid NOT NULL REFERENCES users (id) ON DELETE CASCADE,
    object_key  text NOT NULL UNIQUE,
    public_url  text NOT NULL,
    media_type  text NOT NULL CHECK (media_type IN ('image','avatar')),
    mime_type   text NOT NULL,
    size_bytes  bigint NOT NULL CHECK (size_bytes BETWEEN 1 AND 10485760),
    status      text NOT NULL DEFAULT 'approved'
                     CHECK (status IN ('pending','approved','rejected')),
    created_at  timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE lesson_progress (
    user_id    uuid NOT NULL REFERENCES users (id) ON DELETE CASCADE,
    lesson_id  uuid NOT NULL REFERENCES teacher_lessons (id) ON DELETE CASCADE,
    payload    jsonb NOT NULL DEFAULT '{}'::jsonb,
    updated_at timestamptz NOT NULL DEFAULT now(),
    PRIMARY KEY (user_id, lesson_id)
);

CREATE TABLE lesson_submissions (
    id            uuid PRIMARY KEY,
    lesson_id     uuid NOT NULL REFERENCES teacher_lessons (id) ON DELETE CASCADE,
    revision_id   uuid NOT NULL REFERENCES lesson_revisions (id) ON DELETE CASCADE,
    exercise_id   text NOT NULL,
    student_id    uuid NOT NULL REFERENCES users (id) ON DELETE CASCADE,
    answer        text NOT NULL,
    status        text NOT NULL DEFAULT 'submitted'
                       CHECK (status IN ('submitted','reviewing','reviewed')),
    feedback      text NOT NULL DEFAULT '',
    score         int CHECK (score BETWEEN 0 AND 100),
    reviewed_by   uuid REFERENCES users (id) ON DELETE SET NULL,
    created_at    timestamptz NOT NULL DEFAULT now(),
    updated_at    timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX lesson_submissions_teacher_idx
    ON lesson_submissions (lesson_id, status, created_at);

CREATE TABLE lesson_reports (
    id          uuid PRIMARY KEY,
    lesson_id   uuid NOT NULL REFERENCES teacher_lessons (id) ON DELETE CASCADE,
    reporter_id uuid REFERENCES users (id) ON DELETE SET NULL,
    reason      text NOT NULL,
    details     text NOT NULL DEFAULT '',
    status      text NOT NULL DEFAULT 'open' CHECK (status IN ('open','resolved','dismissed')),
    reviewed_by uuid REFERENCES users (id) ON DELETE SET NULL,
    created_at  timestamptz NOT NULL DEFAULT now(),
    reviewed_at timestamptz
);
CREATE INDEX lesson_reports_status_idx ON lesson_reports (status, created_at);

CREATE TABLE user_notifications (
    id         uuid PRIMARY KEY,
    user_id    uuid NOT NULL REFERENCES users (id) ON DELETE CASCADE,
    kind       text NOT NULL,
    title      text NOT NULL,
    body       text NOT NULL DEFAULT '',
    target_url text NOT NULL DEFAULT '',
    read_at    timestamptz,
    created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX user_notifications_unread_idx
    ON user_notifications (user_id, read_at, created_at DESC);
