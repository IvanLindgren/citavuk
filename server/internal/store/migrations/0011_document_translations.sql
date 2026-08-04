-- Перевод загруженного документа на сербский.
--
-- Таблица нужна не ради истории, а ради предела «одна книга в сутки»: без
-- записи о начатом переводе предел было бы нечем считать. Заодно по ней видно,
-- сколько знаков ушло каждому провайдеру — это единственный способ заметить,
-- что квота DeepL расходуется быстрее ожидаемого, до того как она кончится.

CREATE TABLE IF NOT EXISTS document_translations (
    id              uuid PRIMARY KEY,
    user_id         uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    title           text NOT NULL DEFAULT '',
    -- Язык оригинала записывается как предположение клиента: точного ответа
    -- нет ни у нас, ни у провайдера, а «auto» в отчёте бесполезен.
    source_lang     text NOT NULL DEFAULT '',
    provider        text NOT NULL DEFAULT '',
    -- Заявленный объём документа. По нему выбран провайдер, и по нему же
    -- ограничивается, сколько всего разрешено перевести в рамках этой заявки.
    chars           integer NOT NULL,
    translated_chars integer NOT NULL DEFAULT 0,
    created_at      timestamptz NOT NULL DEFAULT now(),
    finished_at     timestamptz
);

-- Предел считается запросом «сколько переводов у пользователя за сутки», и он
-- выполняется перед каждым новым переводом. Без индекса это последовательный
-- просмотр всей таблицы.
CREATE INDEX IF NOT EXISTS document_translations_user_created_idx
    ON document_translations (user_id, created_at DESC);
