// Package auth отвечает за пароли, сессионные токены и вход через Google.
package auth

import (
	"crypto/rand"
	"crypto/subtle"
	"encoding/base64"
	"errors"
	"fmt"
	"strings"
	"unicode/utf8"

	"golang.org/x/crypto/argon2"
)

// Параметры argon2id.
//
// Значения подобраны под целевую машину: одно ядро и меньше гигабайта
// свободной памяти. 32 МиБ на хеш заметно выше минимума OWASP (19 МиБ) и при
// этом даже десяток одновременных входов не выселит рабочий набор сервера в
// swap. Параметры пишутся в саму строку хеша, поэтому их можно поднять позже:
// старые пароли продолжат проверяться со своими значениями.
const (
	argonMemoryKiB = 32 * 1024
	argonTime      = 3
	argonThreads   = 1
	argonSaltLen   = 16
	argonKeyLen    = 32
)

// Ограничения пароля.
//
// Верхняя граница нужна не для «стойкости», а против отказа в обслуживании:
// argon2 честно обработает и мегабайтный пароль, заняв ядро на всё это время.
const (
	MinPasswordLen = 8
	MaxPasswordLen = 256
)

// ErrPasswordTooShort и соседи возвращаются при валидации пароля.
var (
	ErrPasswordTooShort = fmt.Errorf("пароль короче %d символов", MinPasswordLen)
	ErrPasswordTooLong  = fmt.Errorf("пароль длиннее %d символов", MaxPasswordLen)
	ErrPasswordInvalid  = errors.New("неверный пароль")
	errHashMalformed    = errors.New("повреждённая строка хеша пароля")
)

// ValidatePassword проверяет пароль до хеширования.
//
// Длина считается в рунах: пароль из восьми кириллических букв — это восемь
// символов для пользователя, и отвергать его как «короткий» было бы неверно.
func ValidatePassword(password string) error {
	n := utf8.RuneCountInString(password)
	switch {
	case n < MinPasswordLen:
		return ErrPasswordTooShort
	case n > MaxPasswordLen:
		return ErrPasswordTooLong
	}
	return nil
}

// HashPassword возвращает хеш в формате PHC:
//
//	$argon2id$v=19$m=32768,t=3,p=1$<соль>$<хеш>
func HashPassword(password string) (string, error) {
	if err := ValidatePassword(password); err != nil {
		return "", err
	}
	salt := make([]byte, argonSaltLen)
	if _, err := rand.Read(salt); err != nil {
		return "", fmt.Errorf("генерация соли: %w", err)
	}
	key := argon2.IDKey([]byte(password), salt, argonTime, argonMemoryKiB, argonThreads, argonKeyLen)

	b64 := base64.RawStdEncoding
	return fmt.Sprintf("$argon2id$v=%d$m=%d,t=%d,p=%d$%s$%s",
		argon2.Version, argonMemoryKiB, argonTime, argonThreads,
		b64.EncodeToString(salt), b64.EncodeToString(key)), nil
}

// VerifyPassword сравнивает пароль с хешем за постоянное время.
//
// Параметры берутся из самой строки хеша, а не из констант выше: иначе после
// изменения констант перестали бы открываться все ранее созданные аккаунты.
func VerifyPassword(password, encoded string) error {
	if utf8.RuneCountInString(password) > MaxPasswordLen {
		return ErrPasswordTooLong
	}

	parts := strings.Split(encoded, "$")
	if len(parts) != 6 || parts[0] != "" || parts[1] != "argon2id" {
		return errHashMalformed
	}

	var version int
	if _, err := fmt.Sscanf(parts[2], "v=%d", &version); err != nil {
		return errHashMalformed
	}
	if version != argon2.Version {
		return fmt.Errorf("%w: неподдерживаемая версия argon2 %d", errHashMalformed, version)
	}

	var memory, iters uint32
	var threads uint8
	if _, err := fmt.Sscanf(parts[3], "m=%d,t=%d,p=%d", &memory, &iters, &threads); err != nil {
		return errHashMalformed
	}
	if memory == 0 || iters == 0 || threads == 0 {
		return errHashMalformed
	}

	b64 := base64.RawStdEncoding
	salt, err := b64.DecodeString(parts[4])
	if err != nil {
		return errHashMalformed
	}
	want, err := b64.DecodeString(parts[5])
	if err != nil || len(want) == 0 {
		return errHashMalformed
	}

	got := argon2.IDKey([]byte(password), salt, iters, memory, threads, uint32(len(want)))
	if subtle.ConstantTimeCompare(got, want) != 1 {
		return ErrPasswordInvalid
	}
	return nil
}
