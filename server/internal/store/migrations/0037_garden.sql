-- Башта Читавука: сад, цветочные динары и соседи.

CREATE TABLE garden_profiles (
    user_id      uuid        PRIMARY KEY REFERENCES users (id) ON DELETE CASCADE,
    -- Пустой никнейм означает закрытый сад: в лидерборд и по ссылке он не
    -- отдаётся. Публиковать имя и факт учёбы без спроса нельзя.
    nickname     text        NOT NULL DEFAULT '',
    public       boolean     NOT NULL DEFAULT false,
    coins        bigint      NOT NULL DEFAULT 0 CHECK (coins >= 0),
    earned_total bigint      NOT NULL DEFAULT 0,
    created_at   timestamptz NOT NULL DEFAULT now(),
    updated_at   timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX garden_nickname_idx
    ON garden_profiles (lower(nickname)) WHERE nickname <> '';

-- Сколько единиц каждого источника уже оплачено. Не уменьшается никогда:
-- слово может выпасть из выученных, а читатель — пролистать книгу назад.
CREATE TABLE garden_accruals (
    user_id uuid   NOT NULL REFERENCES users (id) ON DELETE CASCADE,
    source  text   NOT NULL,
    counted bigint NOT NULL DEFAULT 0 CHECK (counted >= 0),
    PRIMARY KEY (user_id, source)
);

-- Дневные потолки.
CREATE TABLE garden_earnings (
    user_id uuid    NOT NULL REFERENCES users (id) ON DELETE CASCADE,
    day     date    NOT NULL,
    source  text    NOT NULL,
    coins   integer NOT NULL DEFAULT 0 CHECK (coins >= 0),
    PRIMARY KEY (user_id, day, source)
);

CREATE INDEX garden_earnings_day_idx ON garden_earnings (user_id, day);

CREATE TABLE garden_plantings (
    user_id    uuid        NOT NULL REFERENCES users (id) ON DELETE CASCADE,
    slot       integer     NOT NULL CHECK (slot BETWEEN 0 AND 11),
    species    text        NOT NULL,
    -- Единица роста — одна стадия. Пять стадий, дальше цветок не растёт.
    growth     real        NOT NULL DEFAULT 0 CHECK (growth >= 0),
    planted_at timestamptz NOT NULL DEFAULT now(),
    grown_at   timestamptz NOT NULL DEFAULT now(),
    watered_at timestamptz,
    PRIMARY KEY (user_id, slot)
);

-- События, которые сервер раньше не видел: дуэль нигде не сохранялась, прогресс
-- курса приходит клиентским блобом. Ключ держит повторную отправку от двойной
-- оплаты.
CREATE TABLE garden_events (
    user_id    uuid        NOT NULL REFERENCES users (id) ON DELETE CASCADE,
    kind       text        NOT NULL CHECK (kind IN ('duel', 'course')),
    key        text        NOT NULL,
    created_at timestamptz NOT NULL DEFAULT now(),
    PRIMARY KEY (user_id, kind, key)
);

CREATE INDEX garden_events_kind_idx ON garden_events (user_id, kind);

-- Полив соседа: один раз в сутки одному саду.
CREATE TABLE garden_visits (
    user_id uuid NOT NULL REFERENCES users (id) ON DELETE CASCADE,
    host_id uuid NOT NULL REFERENCES users (id) ON DELETE CASCADE,
    day     date NOT NULL,
    PRIMARY KEY (user_id, host_id, day)
);

CREATE INDEX garden_visits_day_idx ON garden_visits (user_id, day);
