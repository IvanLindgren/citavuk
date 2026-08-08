-- Информативный профиль: дата добавления слова и достижения пользователя.

-- Старый sync-контракт хранил только updated_at. Для уже существующих слов это
-- лучшая доступная дата; новые строки получают настоящую дату создания и при
-- последующей синхронизации её не теряют.
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

CREATE TABLE user_achievements (
    user_id    uuid NOT NULL REFERENCES users (id) ON DELETE CASCADE,
    key        text NOT NULL,
    unlocked_at timestamptz NOT NULL DEFAULT now(),
    PRIMARY KEY (user_id, key)
);

CREATE INDEX user_achievements_recent_idx
    ON user_achievements (user_id, unlocked_at DESC);

-- 0027 могла успеть примениться до появления Тренажёрки. Новая миграция
-- добавляет устойчивую ссылку и на такой базе; на чистой установке обновление
-- просто повторяет уже записанное значение.
UPDATE roadmap_items
   SET payload = payload || jsonb_build_object(
       'trainerTopicId',
       format('grammar-%s-%s', lower(level), lpad(position::text, 2, '0'))
   ),
       updated_at = now()
 WHERE level IN ('A1','A2','B1','B2')
   AND category = 'grammar' AND kind = 'grammar_topic';
