-- Исправления перевода слов: жалобы читателей, правки редакторов и итоговые
-- переводы, которые сервер отдаёт поверх DeepL и Google.

-- Кто может исправлять перевод сразу, без модерации. Отдельно от одобренных
-- преподавателей: право переписывать перевод для всех даётся осознанно.
CREATE TABLE translation_editors (
    user_id uuid PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
    granted_by uuid REFERENCES users(id) ON DELETE SET NULL,
    granted_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE translation_feedback (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id uuid REFERENCES users(id) ON DELETE SET NULL,
    source text NOT NULL,
    target text NOT NULL,
    -- Слово ровно в том виде, как его нажали, и предложение вокруг.
    word text NOT NULL,
    sentence text NOT NULL,
    span_start integer NOT NULL,
    span_end integer NOT NULL,
    -- Что Читавук показал и кто это перевёл.
    shown text NOT NULL,
    provider text NOT NULL DEFAULT '',
    -- Как правильно; пусто — «перевод неверный», а какой верный, автор не знает.
    suggestion text NOT NULL DEFAULT '',
    comment text NOT NULL DEFAULT '',
    -- sentence — только в этом предложении, form — эта форма слова везде.
    scope text NOT NULL CHECK (scope IN ('sentence', 'form')),
    -- Ключ будущего исправления: считается при приёме жалобы, чтобы решение
    -- из админки и из Telegram ничего не пересчитывало.
    override_key text NOT NULL,
    status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'accepted', 'rejected')),
    decided_by uuid REFERENCES users(id) ON DELETE SET NULL,
    decided_at timestamptz,
    -- Сообщение в Telegram: по нему бот правит карточку после решения.
    telegram_message_id bigint,
    created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX translation_feedback_pending ON translation_feedback(created_at) WHERE status = 'pending';

-- Принятые исправления. Ключ — нормализованная форма слова или отпечаток
-- предложения с границами слова, см. store.FeedbackKey.
CREATE TABLE translation_overrides (
    scope text NOT NULL CHECK (scope IN ('sentence', 'form')),
    source text NOT NULL,
    target text NOT NULL,
    key text NOT NULL,
    translation text NOT NULL,
    feedback_id uuid REFERENCES translation_feedback(id) ON DELETE SET NULL,
    author_id uuid REFERENCES users(id) ON DELETE SET NULL,
    updated_at timestamptz NOT NULL DEFAULT now(),
    PRIMARY KEY (scope, source, target, key)
);
