-- Покупаемые украшения сада.
--
-- Отдельно от посадок: украшение принадлежит саду целиком, а не грядке, и не
-- растёт. Ключ по паре «пользователь и предмет» делает повторную покупку
-- невозможной на уровне схемы — списать динары дважды за один куст нельзя даже
-- при двух одновременных запросах.

CREATE TABLE garden_decorations (
    user_id      uuid        NOT NULL REFERENCES users (id) ON DELETE CASCADE,
    decoration   text        NOT NULL,
    purchased_at timestamptz NOT NULL DEFAULT now(),
    PRIMARY KEY (user_id, decoration)
);
