-- Поддержка проекта через ЮKassa. Сумма хранится в копейках: деньги не должны
-- проходить через float ни на одном шаге.
CREATE TABLE donations (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id uuid REFERENCES users(id) ON DELETE SET NULL,
    public_name text NOT NULL DEFAULT '',
    show_public boolean NOT NULL DEFAULT true,
    message text NOT NULL DEFAULT '',
    amount_kopecks bigint NOT NULL CHECK (amount_kopecks > 0),
    status text NOT NULL DEFAULT 'pending'
        CHECK (status IN ('pending', 'succeeded', 'canceled', 'refunded')),
    source text NOT NULL DEFAULT 'yookassa' CHECK (source IN ('yookassa', 'manual')),
    provider_payment_id text UNIQUE,
    created_at timestamptz NOT NULL DEFAULT now(),
    paid_at timestamptz
);
CREATE INDEX donations_user_idx ON donations (user_id) WHERE status = 'succeeded';
CREATE INDEX donations_paid_idx ON donations (paid_at) WHERE status IN ('succeeded', 'refunded');

-- Выставляется, когда сумма оплат аккаунта достигла порога, и снимается, если
-- после возврата она стала ниже.
ALTER TABLE users ADD COLUMN supporter_since timestamptz;
