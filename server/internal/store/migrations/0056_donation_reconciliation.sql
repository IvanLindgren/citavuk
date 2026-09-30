-- Уведомление или возврат посетителя на сайт может не дойти.
-- Аренда проверки сохраняется в БД и не зависит от перезапуска процесса.
ALTER TABLE donations ADD COLUMN payment_recheck_after timestamptz NOT NULL DEFAULT now();
CREATE INDEX donations_pending_recheck_idx ON donations(payment_recheck_after,created_at)
    WHERE status='pending' AND provider_payment_id IS NOT NULL AND provider_payment_id<>'';
