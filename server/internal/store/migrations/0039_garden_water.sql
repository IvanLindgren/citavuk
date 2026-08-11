-- Лейка, река, гербарий и задание дня.
--
-- Полив был бесконечным: раз ресурс не кончается, выбирать нечего, и остаётся
-- прокликивать двенадцать грядок каждые шесть часов. Теперь вода конечна и
-- берётся из реки, а река течёт только в день, когда человек занимался.

ALTER TABLE garden_profiles
    -- Сколько поливов осталось в лейке. Старым садам достаётся полная: лейка
    -- появилась после того, как они уже играли.
    ADD COLUMN water       smallint NOT NULL DEFAULT 3 CHECK (water >= 0),
    ADD COLUMN water_day   date,
    ADD COLUMN water_taken smallint NOT NULL DEFAULT 0 CHECK (water_taken >= 0),
    -- День, когда дождь уже полил этот сад: иначе каждое обращение к саду в
    -- дождь заново обновляло бы полив и он не кончался бы никогда.
    ADD COLUMN rain_day    date;

-- Срезанные цветы. Грядка освобождается, цветок остаётся в коллекции: без
-- этого сад из двенадцати грядок заканчивается за неделю и деньги девать
-- некуда.
CREATE TABLE garden_herbarium (
    user_id  uuid        NOT NULL REFERENCES users (id) ON DELETE CASCADE,
    species  text        NOT NULL,
    count    integer     NOT NULL DEFAULT 0 CHECK (count >= 0),
    first_at timestamptz NOT NULL DEFAULT now(),
    last_at  timestamptz NOT NULL DEFAULT now(),
    PRIMARY KEY (user_id, species)
);

-- Задание дня. Хранится, а не считается на лету: набор заданий зависит от
-- состояния сада в момент выдачи, и менять уже выданное задание нельзя.
CREATE TABLE garden_tasks (
    user_id  uuid        NOT NULL REFERENCES users (id) ON DELETE CASCADE,
    day      date        NOT NULL,
    kind     text        NOT NULL,
    target   integer     NOT NULL CHECK (target > 0),
    progress integer     NOT NULL DEFAULT 0 CHECK (progress >= 0),
    reward   integer     NOT NULL CHECK (reward >= 0),
    paid     boolean     NOT NULL DEFAULT false,
    PRIMARY KEY (user_id, day)
);
