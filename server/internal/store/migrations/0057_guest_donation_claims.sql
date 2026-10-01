-- Доказательство владения гостевым платежом хранится отдельно от публичных полей.
CREATE TABLE donation_guest_ownership (
    donation_id uuid PRIMARY KEY REFERENCES donations(id) ON DELETE CASCADE,
    browser_hash bytea NOT NULL CHECK(octet_length(browser_hash)=32),
    recovery_email text NOT NULL DEFAULT '',
    expires_at timestamptz NOT NULL DEFAULT now()+interval '90 days',
    claimed_at timestamptz,
    email_sent_at timestamptz,
    email_retry_after timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX donation_guest_browser_idx ON donation_guest_ownership(browser_hash) WHERE claimed_at IS NULL;
CREATE TABLE donation_guest_claim_links (
    token_hash bytea PRIMARY KEY CHECK(octet_length(token_hash)=32),
    donation_id uuid NOT NULL REFERENCES donation_guest_ownership(donation_id) ON DELETE CASCADE,
    expires_at timestamptz NOT NULL
);
CREATE INDEX donation_guest_links_donation_idx ON donation_guest_claim_links(donation_id);
