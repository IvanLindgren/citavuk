-- Публикация суммы и сообщения требуют отдельного согласия.
ALTER TABLE donations ADD COLUMN show_amount boolean NOT NULL DEFAULT false;
ALTER TABLE donations ADD COLUMN show_message boolean NOT NULL DEFAULT false;
ALTER TABLE donations ADD COLUMN message_approved boolean NOT NULL DEFAULT false;
ALTER TABLE donations ADD COLUMN subscription_id uuid;

CREATE TABLE support_subscriptions (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    initial_donation_id uuid NOT NULL UNIQUE REFERENCES donations(id),
    amount_kopecks bigint NOT NULL CHECK (amount_kopecks BETWEEN 5000 AND 10000000),
    public_name text NOT NULL DEFAULT '',
    show_public boolean NOT NULL DEFAULT false,
    show_amount boolean NOT NULL DEFAULT false,
    payment_method_id text,
    status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','active','paused','canceled')),
    consent_version text NOT NULL DEFAULT 'monthly-v1',
    consent_at timestamptz NOT NULL DEFAULT now(),
    anchor_day integer NOT NULL DEFAULT 1 CHECK (anchor_day BETWEEN 1 AND 31),
    next_charge_at timestamptz,
    cycle_donation_id uuid REFERENCES donations(id),
    canceled_at timestamptz,
    created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE donations ADD CONSTRAINT donations_subscription_fk FOREIGN KEY (subscription_id) REFERENCES support_subscriptions(id) ON DELETE SET NULL;
CREATE INDEX support_subscriptions_due ON support_subscriptions(next_charge_at) WHERE status = 'active';
