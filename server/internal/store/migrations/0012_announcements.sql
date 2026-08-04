-- Серверные объявления, центр уведомлений и награды за кампании.

CREATE TABLE announcements (
    id               uuid PRIMARY KEY,
    status           text NOT NULL DEFAULT 'draft'
                     CHECK (status IN ('draft', 'published', 'archived')),
    kind             text NOT NULL DEFAULT 'news'
                     CHECK (kind IN ('news', 'campaign', 'maintenance')),
    title            text NOT NULL,
    body             text NOT NULL DEFAULT '',
    banner_text      text NOT NULL DEFAULT '',
    image_url        text NOT NULL DEFAULT '',
    action_label     text NOT NULL DEFAULT '',
    action_url       text NOT NULL DEFAULT '',
    starts_at        timestamptz,
    ends_at          timestamptz,
    banner_enabled   boolean NOT NULL DEFAULT true,
    notify_users     boolean NOT NULL DEFAULT true,
    share_required   boolean NOT NULL DEFAULT false,
    share_text       text NOT NULL DEFAULT '',
    reward_key       text NOT NULL DEFAULT '',
    reward_asset_url text NOT NULL DEFAULT '',
    created_by       uuid REFERENCES users (id) ON DELETE SET NULL,
    published_at     timestamptz,
    created_at       timestamptz NOT NULL DEFAULT now(),
    updated_at       timestamptz NOT NULL DEFAULT now(),
    CHECK (ends_at IS NULL OR starts_at IS NULL OR ends_at > starts_at),
    CHECK (NOT share_required OR reward_key <> '')
);
CREATE INDEX announcements_active_idx
    ON announcements (status, starts_at, ends_at, published_at DESC);

CREATE TABLE user_announcement_states (
    announcement_id uuid NOT NULL REFERENCES announcements (id) ON DELETE CASCADE,
    user_id          uuid NOT NULL REFERENCES users (id) ON DELETE CASCADE,
    read_at          timestamptz,
    dismissed_at     timestamptz,
    claimed_at       timestamptz,
    social_network   text NOT NULL DEFAULT '',
    proof_url        text NOT NULL DEFAULT '',
    PRIMARY KEY (announcement_id, user_id)
);
CREATE INDEX user_announcement_claims_idx
    ON user_announcement_states (announcement_id, claimed_at)
    WHERE claimed_at IS NOT NULL;

-- Первое объявление намеренно остаётся черновиком. Администратор публикует
-- его только после появления в web/public/img указанной SVG-иллюстрации.
INSERT INTO announcements (
    id, status, kind, title, body, banner_text, image_url, action_label,
    banner_enabled, notify_users, share_required, share_text,
    reward_key, reward_asset_url
) VALUES (
    '10000000-0000-4000-8000-000000000100',
    'draft',
    'campaign',
    'Нас уже 100!',
    'У Читавука появились первые 100 пользователей. Спасибо, что читаете и учите сербский вместе с нами. Поделитесь Читавуком в Instagram, Threads, Facebook, X/Twitter, ВКонтакте или Telegram, добавьте ссылку на публикацию и получите специальный фон для читалки. Можно использовать готовый текст или рассказать своими словами, чем Читавук оказался полезен.',
    'У Читавука первые 100 пользователей. Поделитесь сайтом и получите специальный фон для читалки.',
    'https://citavuk.ru/img/citavuk-100-readers.svg',
    'Получить фон',
    true,
    true,
    true,
    'Я учу сербский с Читавуком: читаю тексты, нажимаю на незнакомые слова и сразу вижу перевод и разбор формы. Попробуйте: https://citavuk.ru',
    'reader_background_100',
    'https://citavuk.ru/img/citavuk-100-readers.svg'
);
