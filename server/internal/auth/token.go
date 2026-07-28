package auth

import (
	"crypto/rand"
	"crypto/sha256"
	"encoding/base64"
	"fmt"
	"strings"
)

// tokenBytes — длина случайной части сессионного токена. 32 байта дают 256 бит
// энтропии: подобрать такой токен перебором невозможно.
const tokenBytes = 32

// TokenPrefix помечает токены Citavuk. Нужен только для читаемости логов и
// быстрой отбраковки явного мусора; на стойкость не влияет.
const TokenPrefix = "ctv_"

// NewSessionToken возвращает токен для клиента и его SHA-256 для хранения.
//
// Сам токен на сервере не сохраняется нигде, кроме ответа на запрос входа:
// в базе лежит только хеш. Токен — не пароль пользователя, поэтому обычного
// SHA-256 достаточно: у него 256 бит случайности, и словарной атаки, от которой
// защищает argon2, здесь не существует.
func NewSessionToken() (token string, hash []byte, err error) {
	raw := make([]byte, tokenBytes)
	if _, err := rand.Read(raw); err != nil {
		return "", nil, fmt.Errorf("генерация токена: %w", err)
	}
	token = TokenPrefix + base64.RawURLEncoding.EncodeToString(raw)
	return token, HashToken(token), nil
}

// HashToken считает хеш токена для поиска сессии в базе.
func HashToken(token string) []byte {
	sum := sha256.Sum256([]byte(token))
	return sum[:]
}

// BearerToken достаёт токен из заголовка Authorization.
//
// Схема сравнивается без учёта регистра: RFC 7235 объявляет её
// case-insensitive, и разные HTTP-клиенты действительно шлют то "Bearer",
// то "bearer".
func BearerToken(header string) string {
	scheme, value, ok := strings.Cut(strings.TrimSpace(header), " ")
	if !ok || !strings.EqualFold(scheme, "Bearer") {
		return ""
	}
	return strings.TrimSpace(value)
}
