package auth

import (
	"context"
	"crypto/rand"
	"crypto/rsa"
	"encoding/base64"
	"encoding/json"
	"errors"
	"math/big"
	"net/http"
	"net/http/httptest"
	"testing"
	"time"

	"github.com/golang-jwt/jwt/v5"
)

const testAudience = "111-desktop.apps.googleusercontent.com"

// googleStub поднимает поддельный источник ключей и умеет подписывать токены
// «как Google». Позволяет проверить, что подделанный токен отвергается, не
// обращаясь к настоящему Google.
type googleStub struct {
	key    *rsa.PrivateKey
	kid    string
	server *httptest.Server
}

func newGoogleStub(t *testing.T) *googleStub {
	t.Helper()
	key, err := rsa.GenerateKey(rand.Reader, 2048)
	if err != nil {
		t.Fatal(err)
	}
	s := &googleStub{key: key, kid: "test-key-1"}

	s.server = httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) {
		e := big.NewInt(int64(key.PublicKey.E)).Bytes()
		w.Header().Set("Cache-Control", "public, max-age=3600")
		w.Header().Set("Content-Type", "application/json")
		_ = json.NewEncoder(w).Encode(map[string]any{
			"keys": []map[string]string{{
				"kid": s.kid,
				"kty": "RSA",
				"alg": "RS256",
				"use": "sig",
				"n":   base64.RawURLEncoding.EncodeToString(key.PublicKey.N.Bytes()),
				"e":   base64.RawURLEncoding.EncodeToString(e),
			}},
		})
	}))
	t.Cleanup(s.server.Close)
	return s
}

func (s *googleStub) verifier(audiences ...string) *GoogleVerifier {
	v := NewGoogleVerifier(audiences)
	v.certsURL = s.server.URL
	return v
}

// sign выпускает токен с указанными claims, подписанный ключом стенда.
func (s *googleStub) sign(t *testing.T, claims jwt.MapClaims) string {
	t.Helper()
	token := jwt.NewWithClaims(jwt.SigningMethodRS256, claims)
	token.Header["kid"] = s.kid
	signed, err := token.SignedString(s.key)
	if err != nil {
		t.Fatal(err)
	}
	return signed
}

func validClaims() jwt.MapClaims {
	now := time.Now()
	return jwt.MapClaims{
		"iss":            "https://accounts.google.com",
		"aud":            testAudience,
		"sub":            "1029384756",
		"email":          "denis@example.com",
		"email_verified": true,
		"name":           "Денис",
		"iat":            now.Unix(),
		"exp":            now.Add(time.Hour).Unix(),
	}
}

func TestVerifyAcceptsGenuineToken(t *testing.T) {
	stub := newGoogleStub(t)
	v := stub.verifier(testAudience)

	claims, err := v.Verify(context.Background(), stub.sign(t, validClaims()))
	if err != nil {
		t.Fatalf("настоящий токен отвергнут: %v", err)
	}
	if claims.Subject != "1029384756" || claims.Email != "denis@example.com" {
		t.Errorf("разобранные поля неверны: %+v", claims)
	}
	if claims.Name != "Денис" {
		t.Errorf("имя исказилось: %q", claims.Name)
	}
}

// Токен, подписанный чужим ключом, — основной сценарий подделки.
func TestVerifyRejectsTokenSignedByAnotherKey(t *testing.T) {
	stub := newGoogleStub(t)
	attacker, err := rsa.GenerateKey(rand.Reader, 2048)
	if err != nil {
		t.Fatal(err)
	}

	token := jwt.NewWithClaims(jwt.SigningMethodRS256, validClaims())
	token.Header["kid"] = stub.kid // выдаём чужую подпись за ключ Google
	signed, err := token.SignedString(attacker)
	if err != nil {
		t.Fatal(err)
	}

	if _, err := stub.verifier(testAudience).Verify(context.Background(), signed); err == nil {
		t.Fatal("токен с чужой подписью принят")
	}
}

// alg=none — классический обход проверки подписи.
func TestVerifyRejectsAlgNone(t *testing.T) {
	stub := newGoogleStub(t)

	token := jwt.NewWithClaims(jwt.SigningMethodNone, validClaims())
	token.Header["kid"] = stub.kid
	signed, err := token.SignedString(jwt.UnsafeAllowNoneSignatureType)
	if err != nil {
		t.Fatal(err)
	}

	if _, err := stub.verifier(testAudience).Verify(context.Background(), signed); err == nil {
		t.Fatal("токен с alg=none принят")
	}
}

// Токен для другого приложения не должен пускать в наше.
func TestVerifyRejectsWrongAudience(t *testing.T) {
	stub := newGoogleStub(t)
	claims := validClaims()
	claims["aud"] = "999-чужое.apps.googleusercontent.com"

	_, err := stub.verifier(testAudience).Verify(context.Background(), stub.sign(t, claims))
	if !errors.Is(err, ErrGoogleAudience) {
		t.Fatalf("ожидалась ErrGoogleAudience, получено %v", err)
	}
}

// aud допустимо в виде массива — этот вариант тоже обязан работать.
func TestVerifyAcceptsAudienceArray(t *testing.T) {
	stub := newGoogleStub(t)
	claims := validClaims()
	claims["aud"] = []any{"другое.apps.googleusercontent.com", testAudience}

	if _, err := stub.verifier(testAudience).Verify(context.Background(), stub.sign(t, claims)); err != nil {
		t.Fatalf("aud массивом отвергнут: %v", err)
	}
}

func TestVerifyRejectsWrongIssuer(t *testing.T) {
	stub := newGoogleStub(t)
	claims := validClaims()
	claims["iss"] = "https://accounts.evil.example"

	_, err := stub.verifier(testAudience).Verify(context.Background(), stub.sign(t, claims))
	if !errors.Is(err, ErrGoogleIssuer) {
		t.Fatalf("ожидалась ErrGoogleIssuer, получено %v", err)
	}
}

func TestVerifyRejectsExpiredToken(t *testing.T) {
	stub := newGoogleStub(t)
	claims := validClaims()
	claims["iat"] = time.Now().Add(-2 * time.Hour).Unix()
	claims["exp"] = time.Now().Add(-time.Hour).Unix()

	if _, err := stub.verifier(testAudience).Verify(context.Background(), stub.sign(t, claims)); err == nil {
		t.Fatal("просроченный токен принят")
	}
}

// Неподтверждённая почта позволила бы завести Google-аккаунт на чужой адрес и
// войти в уже существующий аккаунт Citavuk.
func TestVerifyRejectsUnverifiedEmail(t *testing.T) {
	stub := newGoogleStub(t)
	claims := validClaims()
	claims["email_verified"] = false

	_, err := stub.verifier(testAudience).Verify(context.Background(), stub.sign(t, claims))
	if !errors.Is(err, ErrEmailNotVerified) {
		t.Fatalf("ожидалась ErrEmailNotVerified, получено %v", err)
	}
}

// Google присылает email_verified то булевым, то строкой.
func TestVerifyAcceptsStringEmailVerified(t *testing.T) {
	stub := newGoogleStub(t)
	claims := validClaims()
	claims["email_verified"] = "true"

	if _, err := stub.verifier(testAudience).Verify(context.Background(), stub.sign(t, claims)); err != nil {
		t.Fatalf("email_verified строкой отвергнут: %v", err)
	}
}

func TestVerifyRejectsGarbage(t *testing.T) {
	stub := newGoogleStub(t)
	v := stub.verifier(testAudience)
	for _, token := range []string{"", "   ", "не.токен.вовсе", "a.b", "eyJ..."} {
		if _, err := v.Verify(context.Background(), token); err == nil {
			t.Errorf("мусор %q принят как токен", token)
		}
	}
}

func TestDisabledVerifierRejectsEverything(t *testing.T) {
	stub := newGoogleStub(t)
	v := stub.verifier() // без audiences

	if v.Enabled() {
		t.Error("проверяющий без client_id считает себя настроенным")
	}
	_, err := v.Verify(context.Background(), stub.sign(t, validClaims()))
	if !errors.Is(err, ErrGoogleDisabled) {
		t.Fatalf("ожидалась ErrGoogleDisabled, получено %v", err)
	}
}

func TestCacheLifetime(t *testing.T) {
	cases := map[string]time.Duration{
		"public, max-age=3600":       time.Hour,
		"max-age=300":                5 * time.Minute,
		"":                           time.Hour,
		"no-cache":                   time.Hour,
		"public, max-age=999999":     24 * time.Hour, // ограничение сверху
		"public, max-age=не-число":   time.Hour,
		"must-revalidate, max-age=0": time.Hour,
	}
	for header, want := range cases {
		if got := cacheLifetime(header); got != want {
			t.Errorf("cacheLifetime(%q) = %v, want %v", header, got, want)
		}
	}
}
