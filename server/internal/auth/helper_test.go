package auth

import (
	"encoding/base64"
	"testing"

	"golang.org/x/crypto/argon2"
)

// argonKeyForTest считает argon2id-хеш с произвольными параметрами. Нужен,
// чтобы проверить разбор чужих параметров из строки хеша, а не только тех, что
// зашиты в константы пакета.
func argonKeyForTest(t *testing.T, password, saltB64 string, memory, iters uint32, threads uint8) string {
	t.Helper()
	salt, err := base64.RawStdEncoding.DecodeString(saltB64)
	if err != nil {
		t.Fatalf("соль не декодируется: %v", err)
	}
	key := argon2.IDKey([]byte(password), salt, iters, memory, threads, argonKeyLen)
	return base64.RawStdEncoding.EncodeToString(key)
}
