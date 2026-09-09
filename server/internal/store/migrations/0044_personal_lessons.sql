CREATE TABLE personal_plans (
 id uuid PRIMARY KEY, user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
 profile jsonb NOT NULL, outline jsonb NOT NULL DEFAULT '[]',
 started_at timestamptz NOT NULL DEFAULT now(), status text NOT NULL DEFAULT 'queued'
 CHECK(status IN ('queued','running','ready','error')),
 generation integer NOT NULL DEFAULT 1, regenerations integer NOT NULL DEFAULT 0,
 feedback text NOT NULL DEFAULT '', feedback_at timestamptz, error text NOT NULL DEFAULT '',
 lease_until timestamptz, lease_token uuid, attempts integer NOT NULL DEFAULT 0,
 retries integer NOT NULL DEFAULT 0,
 created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX personal_plans_user ON personal_plans(user_id, created_at DESC);
CREATE INDEX personal_plans_queue ON personal_plans(status, lease_until);
CREATE TABLE personal_lessons (
 plan_id uuid NOT NULL REFERENCES personal_plans(id) ON DELETE CASCADE,
 day integer NOT NULL CHECK(day BETWEEN 1 AND 30), content jsonb NOT NULL,
 revision integer NOT NULL DEFAULT 1, generated_for integer NOT NULL DEFAULT 1,
 edited boolean NOT NULL DEFAULT false,
 original_content jsonb, completed_at timestamptz, score integer, total integer,
 completed_revision integer, completed_content jsonb, answers jsonb,
 rating integer NOT NULL DEFAULT 0 CHECK(rating BETWEEN -1 AND 1), rated_at timestamptz,
 updated_at timestamptz NOT NULL DEFAULT now(), PRIMARY KEY(plan_id, day)
);
