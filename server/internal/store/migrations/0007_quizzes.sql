-- Тренажёр: тесты, собранные моделью по материалам вуза и гимназии.
--
-- Тест адресуется не автором, а материалом: source_sha — хеш нормализованного
-- текста. Один и тот же конспект, принесённый десятью студентами, даёт один
-- тест, и модель вызывается ровно один раз. Поэтому же тест виден всем сразу
-- после создания: делать его личным значит гонять модель по десятому кругу за
-- тем же результатом.
CREATE TABLE quizzes (
    id             uuid        PRIMARY KEY,
    source_sha     text        NOT NULL UNIQUE,
    title          text        NOT NULL DEFAULT '',
    subject        text        NOT NULL DEFAULT '',
    -- Начало материала: по нему человек узнаёт свой конспект в общем списке.
    excerpt        text        NOT NULL DEFAULT '',
    -- Вопросы целиком: {question, options[], answer, explanation, wrongHint}.
    -- Отдельная таблица вопросов ничего не дала бы — тест всегда читается и
    -- показывается целиком, а вопросы по одному не редактируются.
    questions      jsonb       NOT NULL,
    -- Автор нужен только для показа «ваш тест»; удаление аккаунта не должно
    -- уносить материал, которым уже пользуются другие.
    author_id      uuid        REFERENCES users (id) ON DELETE SET NULL,
    created_at     timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX quizzes_created_idx ON quizzes (created_at DESC);

-- Попытки. Хранится каждая, а не только последняя: без истории не видно, стало
-- ли лучше, а именно это и спрашивают у тренажёра.
CREATE TABLE quiz_attempts (
    id           uuid        PRIMARY KEY,
    quiz_id      uuid        NOT NULL REFERENCES quizzes (id) ON DELETE CASCADE,
    user_id      uuid        NOT NULL REFERENCES users (id) ON DELETE CASCADE,
    correct      int         NOT NULL,
    total        int         NOT NULL,
    -- Номера вопросов, где человек ошибся: из них собирается разбор ошибок.
    wrong        jsonb       NOT NULL DEFAULT '[]'::jsonb,
    created_at   timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX quiz_attempts_user_idx ON quiz_attempts (user_id, created_at DESC);
CREATE INDEX quiz_attempts_quiz_idx ON quiz_attempts (quiz_id);
