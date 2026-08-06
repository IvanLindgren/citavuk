-- Комментарии к карточкам Вукотока.
--
-- Обсуждение — самый дорогой для человека сигнал из всех, что лента умеет
-- собирать: лайк стоит одного нажатия, комментарий — написанной фразы на чужом
-- языке. Поэтому он и попадает в подбор с весом лайка, и поднимает карточку в
-- «популярном».

CREATE TABLE IF NOT EXISTS micro_feed_comments (
    id         uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
    item_id    uuid        NOT NULL REFERENCES micro_feed_content_items (id) ON DELETE CASCADE,
    -- Комментировать может только вошедший.
    --
    -- У всей остальной ленты действующее лицо — actor_key, то есть годится и
    -- гость по ключу из localStorage. Здесь так нельзя: анонимная запись,
    -- видимая всем, — это приглашение для спама, а модератор в проекте один и
    -- он же автор. Гость по-прежнему читает обсуждение целиком.
    user_id    uuid        NOT NULL REFERENCES users (id) ON DELETE CASCADE,
    body       text        NOT NULL CHECK (length(btrim(body)) BETWEEN 1 AND 600),
    created_at timestamptz NOT NULL DEFAULT now(),
    -- Удаление мягкое: жёсткое стирало бы ответы на реплику вместе с ней и
    -- лишало бы возможности разобраться в жалобе задним числом.
    deleted_at timestamptz
);

-- Лента комментариев одной карточки — единственный запрос, который делается на
-- каждое открытие обсуждения.
CREATE INDEX IF NOT EXISTS micro_feed_comments_item_idx
    ON micro_feed_comments (item_id, created_at DESC)
    WHERE deleted_at IS NULL;

-- Ограничение частоты и «мои комментарии» ходят по автору.
CREATE INDEX IF NOT EXISTS micro_feed_comments_author_idx
    ON micro_feed_comments (user_id, created_at DESC);

-- Счётчик на карточке.
--
-- Считать COUNT(*) на каждый показ ленты нельзя: сортировка «популярного» идёт
-- по всем опубликованным карточкам, и подзапрос на каждую строку превратил бы
-- выдачу ленты в перебор всей таблицы комментариев.
ALTER TABLE micro_feed_content_items
    ADD COLUMN IF NOT EXISTS comments_count integer NOT NULL DEFAULT 0;

UPDATE micro_feed_content_items i
   SET comments_count = c.total
  FROM (
      SELECT item_id, count(*) AS total
        FROM micro_feed_comments
       WHERE deleted_at IS NULL
       GROUP BY item_id
  ) c
 WHERE c.item_id = i.id AND i.comments_count <> c.total;
