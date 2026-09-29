-- Платежи тестового магазина ЮKassa не считаются настоящими: они не попадают в
-- публичный список друзей и в суммы для чеков. До этой миграции магазин был
-- только тестовым, поэтому все прежние платежи через ЮKassa — тестовые.
ALTER TABLE donations ADD COLUMN is_test boolean NOT NULL DEFAULT false;
UPDATE donations SET is_test = true WHERE source = 'yookassa';
