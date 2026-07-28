package store

import (
	"context"
	"crypto/sha256"
	"encoding/hex"
	"strings"
)

// TranslationCache — общий на всех пользователей кеш переводов.
//
// Кеш намеренно не разделён по пользователям: перевод сербского слова не
// содержит ничего личного, а тексты, которые читают разные люди, пересекаются
// сильно. Общий кеш кратно снижает расход квоты DeepL.
type TranslationCache struct {
	s *Store
}

// Translations возвращает кеш переводов.
func (s *Store) Translations() *TranslationCache { return &TranslationCache{s: s} }

// cacheKey нормализует текст для ключа.
//
// Регистр приводится к нижнему, потому что «Kuća» и «kuća» — одно слово. А вот
// диакритика сохраняется: в сербском č, ć, đ, dž — разные буквы, и «нормализация»
// их в c и d слепила бы разные слова в одно.
func cacheKey(text string) string {
	sum := sha256.Sum256([]byte(strings.ToLower(strings.TrimSpace(text))))
	return hex.EncodeToString(sum[:])
}

// Get ищет готовый перевод.
func (c *TranslationCache) Get(ctx context.Context, source, target, text string) (string, string, bool) {
	var translation, provider string
	err := c.s.Pool.QueryRow(ctx, `
        UPDATE translation_cache
           SET hits = hits + 1
         WHERE source_lang = $1 AND target_lang = $2 AND text_hash = $3
        RETURNING translation, provider`,
		norm(source), norm(target), cacheKey(text)).Scan(&translation, &provider)
	if err != nil {
		return "", "", false
	}
	return translation, provider, true
}

// Put сохраняет перевод.
//
// При повторе перевод перезаписывается: провайдер мог смениться на лучший, и
// новый ответ достовернее старого.
func (c *TranslationCache) Put(ctx context.Context, source, target, text, translation, provider string) error {
	if strings.TrimSpace(translation) == "" {
		return nil
	}
	_, err := c.s.Pool.Exec(ctx, `
        INSERT INTO translation_cache (source_lang, target_lang, text_hash, source_text,
                                       translation, provider)
        VALUES ($1, $2, $3, $4, $5, $6)
        ON CONFLICT (source_lang, target_lang, text_hash) DO UPDATE SET
            translation = EXCLUDED.translation,
            provider    = EXCLUDED.provider`,
		norm(source), norm(target), cacheKey(text), trunc(text, 4000), translation, provider)
	return err
}

// Stats возвращает размер кеша — для страницы состояния сервера.
func (c *TranslationCache) Stats(ctx context.Context) (entries, hits int64, err error) {
	err = c.s.Pool.QueryRow(ctx,
		`SELECT count(*), COALESCE(sum(hits), 0) FROM translation_cache`).Scan(&entries, &hits)
	return
}

// norm приводит код языка к каноническому виду ключа. Подстановка значений по
// умолчанию здесь не делается: перепутать местами язык оригинала и перевода —
// значит навсегда положить в кеш перевод под чужим ключом.
func norm(lang string) string {
	return strings.ToLower(strings.TrimSpace(lang))
}
