-- Дорожная карта сербского языка: шесть уровней CEFR × четыре раздела.
--
-- Каркас (какие уровни и разделы бывают) живёт в коде: он не меняется от
-- правки к правке, и хранить шесть строк ради этого незачем. В базе — то, что
-- автор добавляет и правит на ходу: вводные тексты разделов, пункты, слова,
-- упражнения, отметки читателей и обсуждение.

-- Вводный текст раздела. Строка появляется только когда автор её написал:
-- пустой раздел показывается с общим описанием категории из кода.
CREATE TABLE roadmap_sections (
    level      text NOT NULL CHECK (level IN ('A1','A2','B1','B2','C1','C2')),
    category   text NOT NULL CHECK (category IN ('reading','grammar','vocabulary','writing')),
    intro      text NOT NULL DEFAULT '',
    updated_at timestamptz NOT NULL DEFAULT now(),
    PRIMARY KEY (level, category)
);

-- Пункт раздела: книга, ссылка, карточка Вукотока, свой текст, тема грамматики
-- или урок преподавателя.
--
-- Виды не разнесены по таблицам намеренно. Их роднит всё, что с ними делают:
-- показывают в одном списке, переставляют одним перетаскиванием, отмечают одной
-- галочкой и считают в одном проценте. Различается только payload, и это ровно
-- тот случай, для которого существует jsonb.
CREATE TABLE roadmap_items (
    id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    level      text NOT NULL CHECK (level IN ('A1','A2','B1','B2','C1','C2')),
    category   text NOT NULL CHECK (category IN ('reading','grammar','vocabulary','writing')),
    kind       text NOT NULL CHECK (kind IN
                    ('book','link','feed_card','text','grammar_topic','lesson')),
    title      text NOT NULL CHECK (length(btrim(title)) BETWEEN 1 AND 200),
    summary    text NOT NULL DEFAULT '',
    -- Тело пункта: разметка темы грамматики или сам адаптированный текст.
    body       text NOT NULL DEFAULT '',
    -- Что открывать: {bookId} | {url} | {itemId} | {slug}. Своё поле на каждый
    -- вид дало бы шесть колонок, из которых пять всегда пусты.
    payload    jsonb NOT NULL DEFAULT '{}'::jsonb,
    position   int NOT NULL DEFAULT 0,
    status     text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','published')),
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now()
);

-- Единственный запрос, который делает страница: содержимое одной клетки.
CREATE INDEX roadmap_items_cell_idx
    ON roadmap_items (level, category, position, created_at)
    WHERE status = 'published';

-- Упражнения. Формат тот же, что у уроков преподавателей (LessonExercise):
-- редактор, проверка ответов и проигрыватель уже написаны на обеих платформах,
-- и второй формат означал бы второй проигрыватель во Flutter.
--
-- Набор хранится целиком в одной строке, как в lesson_revisions: он всегда
-- читается и проходится целиком, а по одному упражнению никто не правит.
CREATE TABLE roadmap_exercise_sets (
    id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    level      text NOT NULL CHECK (level IN ('A1','A2','B1','B2','C1','C2')),
    category   text NOT NULL CHECK (category IN ('reading','grammar','vocabulary','writing')),
    -- Упражнение к конкретному тексту или теме. NULL — упражнение уровня,
    -- не привязанное ни к чему. Удаление текста уносит и упражнения к нему.
    item_id    uuid REFERENCES roadmap_items (id) ON DELETE CASCADE,
    title      text NOT NULL CHECK (length(btrim(title)) BETWEEN 1 AND 200),
    -- {exercises: [...]} в формате LessonContent.exercises.
    content    jsonb NOT NULL DEFAULT '{"exercises":[]}'::jsonb,
    position   int NOT NULL DEFAULT 0,
    status     text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','published')),
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX roadmap_exercise_sets_cell_idx
    ON roadmap_exercise_sets (level, category, position, created_at)
    WHERE status = 'published';
CREATE INDEX roadmap_exercise_sets_item_idx
    ON roadmap_exercise_sets (item_id) WHERE item_id IS NOT NULL;

-- Словарь уровня, разложенный по темам.
--
-- Уровень слова взят из частоты по корпусу (те же полосы, что оценивают
-- сложность книги), тема и перевод — от автора. Ранг хранится рядом: по нему
-- видно, откуда взялся уровень, и его можно пересчитать, не гадая.
CREATE TABLE roadmap_words (
    id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    level       text NOT NULL CHECK (level IN ('A1','A2','B1','B2','C1','C2')),
    theme       text NOT NULL CHECK (length(btrim(theme)) BETWEEN 1 AND 80),
    -- Слово в словарной форме, латиницей: так его находит морфология.
    lemma       text NOT NULL CHECK (length(btrim(lemma)) BETWEEN 1 AND 80),
    translation text NOT NULL DEFAULT '',
    pos         text NOT NULL DEFAULT '',
    -- Пометы: род существительного, вид глагола. Показываются рядом со словом.
    note        text NOT NULL DEFAULT '',
    rank        int  NOT NULL DEFAULT 0,
    position    int  NOT NULL DEFAULT 0,
    status      text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','published')),
    created_at  timestamptz NOT NULL DEFAULT now(),
    updated_at  timestamptz NOT NULL DEFAULT now(),
    -- Одно слово на уровень. На разных уровнях одно и то же слово бессмысленно:
    -- выучив его на A1, человек не должен встречать его снова как новое на B1.
    UNIQUE (level, lemma)
);

CREATE INDEX roadmap_words_level_idx
    ON roadmap_words (level, theme, position) WHERE status = 'published';

-- Отметки о пройденном.
--
-- Одна таблица на все виды, а не по таблице на сущность: считать проценты по
-- четырём разделам приходится одним запросом на каждый показ карты, и четыре
-- источника отметок превратили бы его в четыре объединения.
CREATE TABLE roadmap_completions (
    user_id uuid NOT NULL REFERENCES users (id) ON DELETE CASCADE,
    kind    text NOT NULL CHECK (kind IN ('item','exercise','word')),
    ref_id  uuid NOT NULL,
    -- Уровень и раздел записаны здесь же. Без них подсчёт процента требовал бы
    -- присоединения всех трёх таблиц содержимого, причём для строк, которые
    -- могли быть уже удалены автором.
    level    text NOT NULL CHECK (level IN ('A1','A2','B1','B2','C1','C2')),
    category text NOT NULL CHECK (category IN ('reading','grammar','vocabulary','writing')),
    -- Для упражнений: доля верных ответов. Пункт и слово всегда 1.
    score    real NOT NULL DEFAULT 1 CHECK (score BETWEEN 0 AND 1),
    done_at  timestamptz NOT NULL DEFAULT now(),
    PRIMARY KEY (user_id, kind, ref_id)
);

CREATE INDEX roadmap_completions_progress_idx
    ON roadmap_completions (user_id, level, category);

-- Цель: к какому уровню человек идёт.
--
-- Отдельно от users.serbian_level, который отвечает на другой вопрос — где
-- человек сейчас. Слить их нельзя: уровнем аккаунта меряется сложность книг, и
-- «стремлюсь к B2» тогда означало бы «я и есть B2», отчего предупреждение о
-- трудной книге замолчало бы раньше времени.
ALTER TABLE users
    ADD COLUMN IF NOT EXISTS roadmap_target_level text NOT NULL DEFAULT '';

DO $$
BEGIN
    ALTER TABLE users ADD CONSTRAINT users_roadmap_target_level_check
        CHECK (roadmap_target_level IN ('', 'A1', 'A2', 'B1', 'B2', 'C1', 'C2'));
EXCEPTION
    WHEN duplicate_object THEN NULL;
END
$$;

-- Обсуждение карты: своя ветка на каждый уровень.
--
-- Ветка на клетку (уровень × раздел) была бы точнее в адресации, но при
-- нынешней посещаемости большинство из двадцати четырёх осталось бы пустыми, а
-- пустая ветка отбивает желание писать первым.
CREATE TABLE roadmap_comments (
    id        uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    level     text NOT NULL CHECK (level IN ('A1','A2','B1','B2','C1','C2')),
    -- Ответ на реплику. Глубина ограничена одним уровнем: ответ на ответ
    -- цепляется к тому же корню (проверяется на сервере). Дерево произвольной
    -- глубины на телефоне всё равно упирается в ширину экрана.
    parent_id uuid REFERENCES roadmap_comments (id) ON DELETE CASCADE,
    -- Писать может только вошедший — по той же причине, что и в Вукотоке:
    -- анонимная запись, видимая всем, это приглашение для спама, а модератор
    -- в проекте один. Читают все.
    user_id   uuid NOT NULL REFERENCES users (id) ON DELETE CASCADE,
    body      text NOT NULL CHECK (length(btrim(body)) BETWEEN 1 AND 2000),
    created_at timestamptz NOT NULL DEFAULT now(),
    -- Удаление мягкое: жёсткое уносило бы ответы вместе с репликой.
    deleted_at timestamptz
);

CREATE INDEX roadmap_comments_level_idx
    ON roadmap_comments (level, created_at) WHERE deleted_at IS NULL;
CREATE INDEX roadmap_comments_author_idx
    ON roadmap_comments (user_id, created_at DESC);
