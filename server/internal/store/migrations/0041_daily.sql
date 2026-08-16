-- «На каждый день»: десять слов, текст с ними и упражнения.
--
-- Набор хранится, а не собирается заново при каждом открытии. Иначе человек,
-- заглянувший в раздел дважды, получал бы два разных набора и не мог доучить
-- начатое, а виджет на телефоне показывал бы третий.

CREATE TABLE daily_settings (
    user_id    uuid        PRIMARY KEY REFERENCES users (id) ON DELETE CASCADE,
    -- Пустой список — «всё подряд». Отдельного признака «выбрал всё» нет:
    -- темы в справочнике добавляются, и выбравший всё однажды не должен
    -- застревать на списке годовой давности.
    themes     text[]      NOT NULL DEFAULT '{}',
    enabled    boolean     NOT NULL DEFAULT true,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE daily_sets (
    id         uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id    uuid        NOT NULL REFERENCES users (id) ON DELETE CASCADE,
    -- День по часам сервера. Набор живёт сутки: «слово дня» без дня — просто
    -- случайное слово.
    day        date        NOT NULL,
    level      text        NOT NULL,
    words      jsonb       NOT NULL DEFAULT '[]'::jsonb,
    -- Текст с этими словами и упражнения к нему. NULL — Gemma ещё не отвечала:
    -- слова показываются сразу, а текст догоняет.
    lesson     jsonb,
    -- Леммы, отмеченные как выученные сегодня.
    learned    jsonb       NOT NULL DEFAULT '[]'::jsonb,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now(),
    UNIQUE (user_id, day)
);

CREATE INDEX daily_sets_user_idx ON daily_sets (user_id, day DESC);

-- Что человеку уже показывали.
--
-- Отдельной таблицей, а не поиском по jsonb прошлых наборов: подбор слов идёт
-- при каждом первом заходе за день, и разбирать месяц наборов ради десяти слов
-- — это работа на ровном месте.
CREATE TABLE daily_seen (
    user_id uuid NOT NULL REFERENCES users (id) ON DELETE CASCADE,
    lemma   text NOT NULL,
    level   text NOT NULL DEFAULT '',
    seen_at timestamptz NOT NULL DEFAULT now(),
    PRIMARY KEY (user_id, lemma)
);
