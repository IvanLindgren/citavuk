-- Sign in with Apple. Apple требует при удалении аккаунта отзывать доступ
-- приложения к Apple ID, а для отзыва нужен refresh token из обмена кода и
-- client_id, которым код обменивали (bundle id приложения или Services ID сайта).
ALTER TABLE identities
    ADD COLUMN refresh_token text,
    ADD COLUMN client_id text;
