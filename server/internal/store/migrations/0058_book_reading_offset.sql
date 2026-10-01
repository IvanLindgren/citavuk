-- UTF-16 смещение внутри абзаца: один абзац может занимать много страниц.
ALTER TABLE books ADD COLUMN last_offset integer NOT NULL DEFAULT 0 CHECK (last_offset >= 0);
