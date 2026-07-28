-- Прогресс игрового курса хранится отдельно от общего sync_rev: это один
-- компактный документ на курс, а не поток книг/слов/карточек.
CREATE TABLE course_progress (
    user_id     uuid        NOT NULL REFERENCES users (id) ON DELETE CASCADE,
    course_id   text        NOT NULL,
    payload     jsonb       NOT NULL,
    updated_at  timestamptz NOT NULL,
    PRIMARY KEY (user_id, course_id),
    CHECK (char_length(course_id) BETWEEN 1 AND 80)
);

CREATE INDEX course_progress_updated_idx
    ON course_progress (user_id, updated_at DESC);
