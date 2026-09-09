CREATE TABLE study_streaks (
 user_id uuid PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
 timezone text NOT NULL DEFAULT 'UTC', current integer NOT NULL DEFAULT 0,
 longest integer NOT NULL DEFAULT 0, freezes integer NOT NULL DEFAULT 2 CHECK(freezes BETWEEN 0 AND 2),
 active_days integer NOT NULL DEFAULT 0, last_day date,
 today_active boolean NOT NULL DEFAULT false, updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE study_days (
 user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
 day date NOT NULL, kind text NOT NULL CHECK(kind IN ('active','frozen')),
 PRIMARY KEY(user_id, day)
);
-- Стабильный ключ события не даёт повторной синхронизации вчерашнего задания
-- зажечь новую серию сегодня. Дата определяется сервером, не payload клиента.
CREATE TABLE study_events (
 user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
 event_key text NOT NULL, created_at timestamptz NOT NULL DEFAULT now(),
 PRIMARY KEY(user_id,event_key)
);
