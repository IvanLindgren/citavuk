-- Результаты игры «Уничтожь эти падежи»: итог партии и слабые места.
CREATE TABLE case_game_results (
    id uuid PRIMARY KEY,
    user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    scope text NOT NULL,
    limit_seconds integer NOT NULL CHECK (limit_seconds IN (0, 60, 300, 900)),
    elapsed_seconds integer NOT NULL CHECK (elapsed_seconds BETWEEN 1 AND 86400),
    words integer NOT NULL CHECK (words >= 0),
    correct integer NOT NULL CHECK (correct >= 0),
    wrong integer NOT NULL CHECK (wrong >= 0),
    diacritic_slips integer NOT NULL DEFAULT 0 CHECK (diacritic_slips >= 0),
    chars integer NOT NULL DEFAULT 0 CHECK (chars >= 0),
    cpm integer NOT NULL DEFAULT 0 CHECK (cpm >= 0),
    accuracy real NOT NULL CHECK (accuracy BETWEEN 0 AND 100),
    weak jsonb NOT NULL DEFAULT '[]'::jsonb,
    created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX case_game_results_user_idx ON case_game_results (user_id, created_at DESC);
