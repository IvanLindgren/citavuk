-- Закрытая библиотека для друзей Читавука: книги и подкасты. Текст книги и
-- расшифровка подкаста лежат в body, аудио — файлом на диске сервера.
CREATE TABLE supporter_library_items (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    kind text NOT NULL CHECK (kind IN ('book', 'podcast')),
    title text NOT NULL CHECK (title <> ''),
    author text NOT NULL DEFAULT '',
    description text NOT NULL DEFAULT '',
    level text NOT NULL DEFAULT '' CHECK (level IN ('', 'A1', 'A2', 'B1', 'B2', 'C1', 'C2')),
    cover_url text NOT NULL DEFAULT '',
    body text NOT NULL DEFAULT '',
    audio_file text NOT NULL DEFAULT '',
    audio_mime text NOT NULL DEFAULT '',
    audio_size bigint NOT NULL DEFAULT 0,
    published boolean NOT NULL DEFAULT false,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX supporter_library_published_idx ON supporter_library_items (created_at DESC) WHERE published;
