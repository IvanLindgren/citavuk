-- Базовая схема: пользователи, сессии и синхронизируемые данные.
--
-- Общая модель синхронизации: у каждого пользователя есть монотонный счётчик
-- users.sync_rev. Любая изменённая запись получает rev = следующее значение
-- счётчика, и клиент запрашивает «всё, что новее моего курсора». Счётчик
-- увеличивается под advisory-локом пользователя, поэтому порядок rev совпадает
-- с порядком фиксации транзакций и запись не может «проскочить» мимо курсора.

CREATE TABLE users (
    id            uuid PRIMARY KEY,
    -- email хранится в нижнем регистре: он же ключ входа.
    email         text        NOT NULL UNIQUE,
    -- NULL означает аккаунт только через OAuth: пароля у него нет вообще,
    -- а не «пустой пароль».
    password_hash text,
    display_name  text        NOT NULL DEFAULT '',
    sync_rev      bigint      NOT NULL DEFAULT 0,
    created_at    timestamptz NOT NULL DEFAULT now(),
    updated_at    timestamptz NOT NULL DEFAULT now()
);

-- Внешние провайдеры входа. Один аккаунт может иметь и пароль, и Google.
CREATE TABLE identities (
    provider     text        NOT NULL,
    provider_uid text        NOT NULL,
    user_id      uuid        NOT NULL REFERENCES users (id) ON DELETE CASCADE,
    email        text        NOT NULL DEFAULT '',
    created_at   timestamptz NOT NULL DEFAULT now(),
    PRIMARY KEY (provider, provider_uid)
);
CREATE INDEX identities_user_idx ON identities (user_id);

-- Сессии. Хранится только SHA-256 токена: утечка дампа базы не даёт войти в
-- чужой аккаунт, потому что восстановить сам токен из хеша нельзя.
CREATE TABLE sessions (
    token_hash   bytea       PRIMARY KEY,
    user_id      uuid        NOT NULL REFERENCES users (id) ON DELETE CASCADE,
    device_id    text        NOT NULL DEFAULT '',
    device_name  text        NOT NULL DEFAULT '',
    platform     text        NOT NULL DEFAULT '',
    created_at   timestamptz NOT NULL DEFAULT now(),
    last_seen_at timestamptz NOT NULL DEFAULT now(),
    expires_at   timestamptz NOT NULL
);
CREATE INDEX sessions_user_idx ON sessions (user_id);
CREATE INDEX sessions_expiry_idx ON sessions (expires_at);

-- Книги: только метаданные. Текст лежит отдельно в book_contents и качается по
-- требованию — на главном экране он не нужен, а весит мегабайты.
CREATE TABLE books (
    id          uuid        PRIMARY KEY,
    user_id     uuid        NOT NULL REFERENCES users (id) ON DELETE CASCADE,
    title       text        NOT NULL DEFAULT '',
    folder      text        NOT NULL DEFAULT '',
    -- Логический ключ импорта (бывший filepath). Позволяет узнать один и тот же
    -- файл, импортированный на двух устройствах.
    source_key  text        NOT NULL DEFAULT '',
    para_count  integer     NOT NULL DEFAULT 0,
    last_para   integer     NOT NULL DEFAULT 0,
    content_sha text        NOT NULL DEFAULT '',
    lead_image  text        NOT NULL DEFAULT '',
    deleted     boolean     NOT NULL DEFAULT false,
    updated_at  timestamptz NOT NULL,
    rev         bigint      NOT NULL
);
CREATE INDEX books_sync_idx ON books (user_id, rev);
CREATE INDEX books_source_idx ON books (user_id, source_key);

-- Текст книги, адресуемый содержимым: одна и та же книга с двух устройств
-- совпадает по sha256 и хранится один раз.
CREATE TABLE book_contents (
    user_id    uuid        NOT NULL REFERENCES users (id) ON DELETE CASCADE,
    sha256     text        NOT NULL,
    body       bytea       NOT NULL,
    bytes      integer     NOT NULL,
    created_at timestamptz NOT NULL DEFAULT now(),
    PRIMARY KEY (user_id, sha256)
);

CREATE TABLE vocabulary (
    id          uuid        PRIMARY KEY,
    user_id     uuid        NOT NULL REFERENCES users (id) ON DELETE CASCADE,
    -- Без внешнего ключа: слово может прийти раньше своей книги, порядок
    -- отправки записей клиентом не гарантирован.
    book_id     uuid,
    word        text        NOT NULL DEFAULT '',
    lemma       text        NOT NULL DEFAULT '',
    pos         text        NOT NULL DEFAULT '',
    translation text        NOT NULL DEFAULT '',
    forms       jsonb       NOT NULL DEFAULT '{}'::jsonb,
    deleted     boolean     NOT NULL DEFAULT false,
    updated_at  timestamptz NOT NULL,
    rev         bigint      NOT NULL
);
CREATE INDEX vocabulary_sync_idx ON vocabulary (user_id, rev);
CREATE INDEX vocabulary_book_idx ON vocabulary (user_id, book_id);

-- Интервальное повторение. Время в миллисекундах эпохи — как в клиентской БД,
-- чтобы синхронизация не переводила единицы туда-сюда и не теряла точность.
CREATE TABLE reviews (
    vocab_id      uuid        PRIMARY KEY,
    user_id       uuid        NOT NULL REFERENCES users (id) ON DELETE CASCADE,
    ease          real        NOT NULL DEFAULT 2.5,
    interval_days integer     NOT NULL DEFAULT 0,
    reps          integer     NOT NULL DEFAULT 0,
    due_at        bigint      NOT NULL DEFAULT 0,
    last_reviewed bigint,
    deleted       boolean     NOT NULL DEFAULT false,
    updated_at    timestamptz NOT NULL,
    rev           bigint      NOT NULL
);
CREATE INDEX reviews_sync_idx ON reviews (user_id, rev);

-- Общий на всех пользователей кеш переводов. Сербские слова повторяются от
-- текста к тексту, поэтому общий кеш кратно снижает расход квоты DeepL.
CREATE TABLE translation_cache (
    source_lang text        NOT NULL,
    target_lang text        NOT NULL,
    text_hash   text        NOT NULL,
    source_text text        NOT NULL,
    translation text        NOT NULL,
    provider    text        NOT NULL,
    hits        bigint      NOT NULL DEFAULT 0,
    created_at  timestamptz NOT NULL DEFAULT now(),
    PRIMARY KEY (source_lang, target_lang, text_hash)
);
