-- Книга, которой поделились по ссылке, и обсуждение её страниц.
--
-- Ссылка непубличная: каталога таких книг нет и в поиске они не появляются.
-- Причина не в приватности, а в праве: текст загрузил пользователь, и мы не
-- знаем, вправе ли он его распространять. Доступ по ссылке — то же, что
-- переслать файл знакомому; публичная витрина чужих загрузок — уже другое.
CREATE TABLE shared_books (
    -- Короткий непредсказуемый токен из ссылки. Он же первичный ключ: искать
    -- по нему, а не по числовому id, — единственный способ обращения.
    token        text        PRIMARY KEY,
    -- Адрес текста в book_contents. Сам текст не дублируется: он уже лежит там,
    -- выгруженный синхронизацией.
    content_sha  text        NOT NULL,
    title        text        NOT NULL DEFAULT '',
    paragraphs   int         NOT NULL DEFAULT 0,
    -- Кто поделился. Нужен, чтобы найти текст в его book_contents и чтобы
    -- человек мог отозвать ссылку. Удаление аккаунта уносит и ссылку.
    owner_id     uuid        NOT NULL REFERENCES users (id) ON DELETE CASCADE,
    created_at   timestamptz NOT NULL DEFAULT now(),
    -- Сколько раз открывали: владельцу видно, живёт ли ссылка.
    opened       bigint      NOT NULL DEFAULT 0
);

CREATE INDEX shared_books_owner_idx ON shared_books (owner_id, created_at DESC);

-- Обсуждение страницы книги.
--
-- Привязка к странице, а не к книге целиком: разговор про начало третьей главы
-- посреди общей ленты никому не найти.
CREATE TABLE book_comments (
    id         uuid        PRIMARY KEY,
    token      text        NOT NULL REFERENCES shared_books (token) ON DELETE CASCADE,
    -- Номер страницы в том виде, в каком её показывает клиент. Разбивка на
    -- страницы у платформ разная, поэтому договорённость одна: это индекс
    -- ПЕРВОГО АБЗАЦА страницы — он одинаков везде.
    paragraph  int         NOT NULL,
    user_id    uuid        NOT NULL REFERENCES users (id) ON DELETE CASCADE,
    -- Имя на момент отправки: переименование аккаунта не должно переписывать
    -- подписи под старыми сообщениями.
    author     text        NOT NULL DEFAULT '',
    body       text        NOT NULL,
    -- Скрытое сообщение остаётся в базе: удалять чужую запись насовсем нельзя,
    -- пока не разобрались, за что её скрыли.
    hidden     boolean     NOT NULL DEFAULT false,
    created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX book_comments_page_idx
    ON book_comments (token, paragraph, created_at);
