-- Подтверждение почты и одноразовые данные OAuth.
--
-- Существующие аккаунты считаем подтверждёнными: раньше приложение не
-- отправляло писем, и внезапно закрывать доступ уже зарегистрированным людям
-- нельзя. У новых парольных аккаунтов поле остаётся NULL до перехода по ссылке.
ALTER TABLE users
    ADD COLUMN email_verified_at timestamptz;

UPDATE users
   SET email_verified_at = created_at
 WHERE email_verified_at IS NULL;

CREATE TABLE email_verification_tokens (
    user_id    uuid        PRIMARY KEY REFERENCES users (id) ON DELETE CASCADE,
    token_hash bytea       NOT NULL UNIQUE,
    expires_at timestamptz NOT NULL,
    created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX email_verification_expiry_idx
    ON email_verification_tokens (expires_at);

-- State защищает OAuth callback от подмены и хранит устройство, для которого
-- начат вход. В URL находится случайный токен, в базе — только его хеш.
CREATE TABLE oauth_states (
    token_hash      bytea       PRIMARY KEY,
    provider        text        NOT NULL,
    return_target   text        NOT NULL,
    device_id       text        NOT NULL DEFAULT '',
    device_name     text        NOT NULL DEFAULT '',
    device_platform text        NOT NULL DEFAULT '',
    expires_at      timestamptz NOT NULL,
    created_at      timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX oauth_states_expiry_idx ON oauth_states (expires_at);

-- После callback сервер не кладёт долгоживущий session token в URL. Вместо
-- него браузер или приложение получает короткоживущий одноразовый код и
-- обменивает его на сессию отдельным POST-запросом.
CREATE TABLE oauth_completions (
    token_hash      bytea       PRIMARY KEY,
    user_id         uuid        NOT NULL REFERENCES users (id) ON DELETE CASCADE,
    device_id       text        NOT NULL DEFAULT '',
    device_name     text        NOT NULL DEFAULT '',
    device_platform text        NOT NULL DEFAULT '',
    expires_at      timestamptz NOT NULL,
    created_at      timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX oauth_completions_expiry_idx ON oauth_completions (expires_at);
