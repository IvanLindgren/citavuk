-- Комнаты игры «Ты против переводчика» на несколько человек и подбор соперников.
--
-- Комната живёт минуты, а не годы: три раунда идут около десяти минут, и после
-- матча запись нужна лишь для того, чтобы последний игрок дочитал итог.
-- Поэтому состояние лежит одним документом: запроса «покажи все матчи игрока» в
-- игре нет ни одного, зато каждый опрос читает и переписывает комнату целиком.

CREATE TABLE duel_rooms (
    code      text     PRIMARY KEY,
    -- Версия для оптимистичной записи: комнату опрашивают до шести человек
    -- разом, и без неё ответ одного затирал бы ход другого.
    version   integer  NOT NULL DEFAULT 1,
    phase     text     NOT NULL,
    level     text     NOT NULL,
    direction text     NOT NULL,
    seats     smallint NOT NULL CHECK (seats BETWEEN 2 AND 6),
    -- Комнату показывает подбор. У созданной по ссылке — false.
    listed     boolean     NOT NULL DEFAULT false,
    state      jsonb       NOT NULL,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now()
);

-- По нему убираются доигранные и брошенные комнаты.
CREATE INDEX duel_rooms_updated_idx ON duel_rooms (updated_at);

-- Очередь подбора. Гость тоже стоит в очереди, поэтому ключ — идентификатор
-- участника, а не аккаунт.
CREATE TABLE duel_queue (
    id        text     PRIMARY KEY,
    user_id   uuid     REFERENCES users (id) ON DELETE CASCADE,
    name      text     NOT NULL,
    level     text     NOT NULL,
    direction text     NOT NULL,
    seats     smallint NOT NULL CHECK (seats BETWEEN 2 AND 6),
    -- Момент попадания в очередь: по нему решается очерёдность и смягчение
    -- размера комнаты. Он переживает уход играть с DeepL, поэтому отдельный
    -- от seen.
    since timestamptz NOT NULL DEFAULT now(),
    -- Последний опрос. Закрытая вкладка перестаёт участвовать в подборе.
    seen timestamptz NOT NULL DEFAULT now(),
    -- Комната, в которую человека уже позвали.
    room_code text REFERENCES duel_rooms (code) ON DELETE SET NULL
);

-- Один аккаунт стоит в очереди один раз: иначе с двух вкладок можно набрать
-- комнату самому себе.
CREATE UNIQUE INDEX duel_queue_user_idx ON duel_queue (user_id) WHERE user_id IS NOT NULL;
CREATE INDEX duel_queue_search_idx ON duel_queue (level, direction, since) WHERE room_code IS NULL;
