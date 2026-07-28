package auth

import (
	"errors"
	"strings"
	"testing"
)

func TestHashAndVerifyRoundTrip(t *testing.T) {
	const password = "правильный-пароль-42"

	hash, err := HashPassword(password)
	if err != nil {
		t.Fatalf("HashPassword: %v", err)
	}
	if !strings.HasPrefix(hash, "$argon2id$v=19$") {
		t.Fatalf("неожиданный формат хеша: %q", hash)
	}
	if strings.Contains(hash, password) {
		t.Fatal("пароль оказался внутри хеша")
	}
	if err := VerifyPassword(password, hash); err != nil {
		t.Errorf("верный пароль не принят: %v", err)
	}
	if err := VerifyPassword(password+"x", hash); !errors.Is(err, ErrPasswordInvalid) {
		t.Errorf("неверный пароль принят или дал не ту ошибку: %v", err)
	}
}

// Соль обязана быть случайной, иначе одинаковые пароли дадут одинаковые хеши
// и утечка базы сразу покажет, у кого пароли совпадают.
func TestHashIsSaltedPerCall(t *testing.T) {
	a, err := HashPassword("одинаковый-пароль")
	if err != nil {
		t.Fatal(err)
	}
	b, err := HashPassword("одинаковый-пароль")
	if err != nil {
		t.Fatal(err)
	}
	if a == b {
		t.Fatal("два хеша одного пароля совпали — соль не случайна")
	}
}

func TestValidatePassword(t *testing.T) {
	if err := ValidatePassword("короткий"); err != nil {
		t.Errorf("8 кириллических символов должны проходить: %v", err)
	}
	if err := ValidatePassword("1234567"); !errors.Is(err, ErrPasswordTooShort) {
		t.Errorf("7 символов должны отвергаться: %v", err)
	}
	if err := ValidatePassword(strings.Repeat("а", MaxPasswordLen+1)); !errors.Is(err, ErrPasswordTooLong) {
		t.Errorf("слишком длинный пароль должен отвергаться: %v", err)
	}
}

// Длина считается в рунах: «пароль1» — семь символов, а не тринадцать байт.
func TestPasswordLengthCountsRunesNotBytes(t *testing.T) {
	if err := ValidatePassword("пароль1"); !errors.Is(err, ErrPasswordTooShort) {
		t.Errorf("семь кириллических символов должны считаться короткими, получено %v", err)
	}
}

func TestVerifyRejectsMalformedHash(t *testing.T) {
	cases := map[string]string{
		"пусто":            "",
		"не argon2id":      "$argon2i$v=19$m=32768,t=3,p=1$c2FsdA$aGFzaA",
		"мало полей":       "$argon2id$v=19$m=32768,t=3,p=1$c2FsdA",
		"кривые параметры": "$argon2id$v=19$m=,t=,p=$c2FsdA$aGFzaA",
		"не base64":        "$argon2id$v=19$m=32768,t=3,p=1$!!!$aGFzaA",
		"нулевые парам.":   "$argon2id$v=19$m=0,t=0,p=0$c2FsdA$aGFzaA",
		"пустой хеш":       "$argon2id$v=19$m=32768,t=3,p=1$c2FsdA$",
	}
	for name, hash := range cases {
		t.Run(name, func(t *testing.T) {
			if err := VerifyPassword("любой-пароль", hash); err == nil {
				t.Error("повреждённый хеш принят как валидный")
			}
		})
	}
}

// Параметры читаются из строки хеша: аккаунты, созданные при старых настройках,
// обязаны продолжать открываться после ужесточения констант.
func TestVerifyUsesParametersFromHash(t *testing.T) {
	// Хеш с намеренно другими m/t/p, чем текущие константы.
	weak := "$argon2id$v=19$m=8192,t=1,p=1$"
	salt := "c2FsdHNhbHRzYWx0c2Ex"
	// Считаем настоящий хеш с этими параметрами через публичное API проверки:
	// собираем строку и убеждаемся, что она принимается.
	got := argonKeyForTest(t, "старый-пароль", salt, 8192, 1, 1)
	encoded := weak + salt + "$" + got

	if err := VerifyPassword("старый-пароль", encoded); err != nil {
		t.Errorf("хеш со старыми параметрами не принят: %v", err)
	}
	if err := VerifyPassword("другой-пароль", encoded); !errors.Is(err, ErrPasswordInvalid) {
		t.Errorf("ожидалась ErrPasswordInvalid, получено %v", err)
	}
}

func TestNewSessionTokenIsUniqueAndHashed(t *testing.T) {
	token, hash, err := NewSessionToken()
	if err != nil {
		t.Fatal(err)
	}
	if !strings.HasPrefix(token, TokenPrefix) {
		t.Errorf("токен без префикса: %q", token)
	}
	if len(hash) != 32 {
		t.Errorf("длина хеша %d, ожидалось 32", len(hash))
	}
	if strings.Contains(string(hash), token) {
		t.Error("токен восстановим из хеша")
	}
	if want := HashToken(token); string(want) != string(hash) {
		t.Error("HashToken не воспроизводит хеш, выданный NewSessionToken")
	}

	other, _, err := NewSessionToken()
	if err != nil {
		t.Fatal(err)
	}
	if other == token {
		t.Fatal("два вызова выдали одинаковый токен")
	}
}

func TestBearerToken(t *testing.T) {
	cases := []struct{ header, want string }{
		{"Bearer ctv_abc", "ctv_abc"},
		{"bearer ctv_abc", "ctv_abc"}, // схема нечувствительна к регистру (RFC 7235)
		{"  Bearer   ctv_abc  ", "ctv_abc"},
		{"Basic ctv_abc", ""},
		{"ctv_abc", ""},
		{"", ""},
		{"Bearer", ""},
	}
	for _, c := range cases {
		if got := BearerToken(c.header); got != c.want {
			t.Errorf("BearerToken(%q) = %q, want %q", c.header, got, c.want)
		}
	}
}
