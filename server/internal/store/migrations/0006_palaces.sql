-- Дворцы памяти: комната, по предметам которой развешаны слова.
--
-- Развеска хранится одним значением, а не таблицей «гвоздь — слово». Отдельная
-- таблица дала бы возможность слить два устройства по отдельным предметам, но
-- эта возможность здесь не нужна и вредна: дворец — цельная картина, и
-- «половина расстановки с телефона, половина с компьютера» — не то, что человек
-- имел в виду. Слияние идёт по времени изменения дворца целиком, как у книг.
CREATE TABLE palaces (
    id         uuid        PRIMARY KEY,
    user_id    uuid        NOT NULL REFERENCES users (id) ON DELETE CASCADE,
    name       text        NOT NULL DEFAULT '',
    -- Идентификатор комнаты из web/src/palace/scenes.tsx. Сервер его не
    -- проверяет: набор комнат меняется выпусками клиента, и сервер, знающий
    -- этот список, пришлось бы выкатывать раньше каждого такого выпуска.
    scene_id   text        NOT NULL DEFAULT '',
    pins       jsonb       NOT NULL DEFAULT '{}'::jsonb,
    deleted    boolean     NOT NULL DEFAULT false,
    updated_at timestamptz NOT NULL,
    rev        bigint      NOT NULL
);

CREATE INDEX palaces_sync_idx ON palaces (user_id, rev);
