-- Общая коллекция уроков. Содержание хранится один раз, а при выдаче
-- копируется в персональную колоду: ответы, правки и прогресс не общие.
CREATE TABLE personal_shared_lessons (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    source_key text NOT NULL UNIQUE,
    source_group text NOT NULL,
    level text NOT NULL CHECK (level IN ('A1','A2','B1','B2','C1','C2')),
    kind text NOT NULL CHECK (kind IN ('reading','grammar','vocabulary','listening','writing')),
    theme text NOT NULL,
    content jsonb NOT NULL,
    content_hash text NOT NULL UNIQUE,
    active boolean NOT NULL DEFAULT true,
    created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX personal_shared_lessons_select_idx
    ON personal_shared_lessons (level, kind, theme) WHERE active;

ALTER TABLE personal_lessons
    ADD COLUMN shared_lesson_id uuid REFERENCES personal_shared_lessons(id) ON DELETE SET NULL;
