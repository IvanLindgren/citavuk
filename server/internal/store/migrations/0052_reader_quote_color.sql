-- Цветное выделение — та же цитата с цветом. Пустой цвет — прежнее
-- подчёркивание: старые клиенты не знают поля и продолжают работать как раньше.
ALTER TABLE reader_quotes ADD COLUMN color text NOT NULL DEFAULT ''
    CHECK (color IN ('', 'red', 'yellow', 'green', 'blue', 'purple'));
