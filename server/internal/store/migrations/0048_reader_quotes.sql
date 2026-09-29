-- Цитаты читателя синхронизируются вместе с книгами. Удаления сохраняются
-- надгробием, чтобы второй клиент не вернул подчёркивание обратно.
CREATE TABLE reader_quotes (
    id uuid PRIMARY KEY,
    user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    book_id uuid NOT NULL,
    page integer NOT NULL,
    paragraph integer NOT NULL,
    start_offset integer NOT NULL,
    end_offset integer NOT NULL,
    text text NOT NULL,
    deleted boolean NOT NULL DEFAULT false,
    updated_at timestamptz NOT NULL,
    rev bigint NOT NULL,
    CHECK (page >= 0 AND paragraph >= 0 AND start_offset >= 0 AND end_offset >= start_offset)
);
CREATE INDEX reader_quotes_sync_idx ON reader_quotes(user_id, rev);
