-- Восстановление профильной схемы для баз, где 0028 была отмечена выполненной
-- до появления всех её полей. Все операции идемпотентны и безопасны также для
-- чистой установки, уже получившей полную 0028.
ALTER TABLE vocabulary ADD COLUMN IF NOT EXISTS created_at timestamptz;
UPDATE vocabulary SET created_at = updated_at WHERE created_at IS NULL;
ALTER TABLE vocabulary ALTER COLUMN created_at SET DEFAULT now();
ALTER TABLE vocabulary ALTER COLUMN created_at SET NOT NULL;

ALTER TABLE roadmap_completions
    ADD COLUMN IF NOT EXISTS source text NOT NULL DEFAULT 'manual';
DO $$
BEGIN
    ALTER TABLE roadmap_completions ADD CONSTRAINT roadmap_completion_source_check
        CHECK (source IN ('manual', 'trainer'));
EXCEPTION
    WHEN duplicate_object THEN NULL;
END
$$;

CREATE TABLE IF NOT EXISTS user_achievements (
    user_id     uuid NOT NULL REFERENCES users (id) ON DELETE CASCADE,
    key         text NOT NULL,
    unlocked_at timestamptz NOT NULL DEFAULT now(),
    PRIMARY KEY (user_id, key)
);

CREATE INDEX IF NOT EXISTS user_achievements_recent_idx
    ON user_achievements (user_id, unlocked_at DESC);
