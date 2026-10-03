package auth

import (
	"context"
	"crypto/ecdsa"
	"crypto/elliptic"
	"crypto/rand"
	"crypto/x509"
	"encoding/json"
	"encoding/pem"
	"errors"
	"net/http"
	"net/http/httptest"
	"testing"
	"time"

	"github.com/golang-jwt/jwt/v5"
)

const testBundle = "com.srbskiread.srbskiRead"

// appleStub: ключи «как у Apple», подпись токенов и поддельные token/revoke.
type appleStub struct {
	google  *googleStub
	ecKey   *ecdsa.PrivateKey
	apple   *Apple
	forms   []map[string]string
	refresh string
}

func newAppleStub(t *testing.T) *appleStub {
	t.Helper()
	s := &appleStub{google: newGoogleStub(t), refresh: "r-token"}
	ec, err := ecdsa.GenerateKey(elliptic.P256(), rand.Reader)
	if err != nil {
		t.Fatal(err)
	}
	s.ecKey = ec
	der, err := x509.MarshalPKCS8PrivateKey(ec)
	if err != nil {
		t.Fatal(err)
	}
	pemKey := pem.EncodeToMemory(&pem.Block{Type: "PRIVATE KEY", Bytes: der})

	endpoint := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		_ = r.ParseForm()
		form := map[string]string{"path": r.URL.Path}
		for k := range r.PostForm {
			form[k] = r.PostForm.Get(k)
		}
		s.forms = append(s.forms, form)
		if r.URL.Path == "/token" {
			_ = json.NewEncoder(w).Encode(map[string]string{
				"id_token":      s.sign(t, appleClaims()),
				"refresh_token": s.refresh,
			})
		}
	}))
	t.Cleanup(endpoint.Close)

	a, err := NewApple(AppleConfig{
		TeamID: "TEAM123456", KeyID: "KEY1234567", PrivateKey: pemKey,
		BundleIDs: []string{testBundle}, ServicesID: "ru.citavuk.signin",
		RedirectURI: "https://citavuk.ru/api/v1/auth/apple/callback",
	})
	if err != nil {
		t.Fatal(err)
	}
	a.keysURL = s.google.server.URL
	a.tokenURL = endpoint.URL + "/token"
	a.revokeURL = endpoint.URL + "/revoke"
	s.apple = a
	return s
}

func (s *appleStub) sign(t *testing.T, claims jwt.MapClaims) string { return s.google.sign(t, claims) }

func appleClaims() jwt.MapClaims {
	now := time.Now()
	return jwt.MapClaims{
		"iss":            "https://appleid.apple.com",
		"aud":            testBundle,
		"sub":            "001234.abcdef.1234",
		"email":          "x7y8@privaterelay.appleid.com",
		"email_verified": "true",
		"iat":            now.Unix(),
		"exp":            now.Add(time.Hour).Unix(),
	}
}

func TestAppleVerify(t *testing.T) {
	s := newAppleStub(t)
	ctx := context.Background()

	claims, err := s.apple.Verify(ctx, s.sign(t, appleClaims()), []string{testBundle})
	if err != nil {
		t.Fatal(err)
	}
	if claims.Subject != "001234.abcdef.1234" || !claims.EmailVerified || claims.Audience != testBundle {
		t.Fatalf("неверные claims: %+v", claims)
	}

	wrongAud := appleClaims()
	wrongAud["aud"] = "com.evil.app"
	if _, err := s.apple.Verify(ctx, s.sign(t, wrongAud), []string{testBundle}); !errors.Is(err, ErrAppleAudience) {
		t.Fatalf("чужое приложение: %v", err)
	}
	wrongIss := appleClaims()
	wrongIss["iss"] = "https://accounts.google.com"
	if _, err := s.apple.Verify(ctx, s.sign(t, wrongIss), []string{testBundle}); err == nil {
		t.Fatal("чужой издатель принят")
	}
	expired := appleClaims()
	expired["exp"] = time.Now().Add(-time.Hour).Unix()
	if _, err := s.apple.Verify(ctx, s.sign(t, expired), []string{testBundle}); err == nil {
		t.Fatal("просроченный токен принят")
	}
}

func TestAppleExchangeAndRevokeSignClientSecret(t *testing.T) {
	s := newAppleStub(t)
	ctx := context.Background()

	tokens, err := s.apple.Exchange(ctx, "auth-code", testBundle, "")
	if err != nil {
		t.Fatal(err)
	}
	if tokens.RefreshToken != "r-token" || tokens.IDToken == "" {
		t.Fatalf("токены: %+v", tokens)
	}
	if err := s.apple.Revoke(ctx, testBundle, tokens.RefreshToken); err != nil {
		t.Fatal(err)
	}
	if len(s.forms) != 2 || s.forms[0]["code"] != "auth-code" || s.forms[1]["token"] != "r-token" {
		t.Fatalf("запросы к Apple: %+v", s.forms)
	}
	if _, ok := s.forms[0]["redirect_uri"]; ok {
		t.Fatal("нативный код не должен нести redirect_uri")
	}

	// client_secret подписан ключом .p8 и представляет команду и приложение.
	secret := s.forms[0]["client_secret"]
	parsed, err := jwt.Parse(secret, func(*jwt.Token) (any, error) { return &s.ecKey.PublicKey, nil },
		jwt.WithValidMethods([]string{"ES256"}))
	if err != nil {
		t.Fatal(err)
	}
	claims := parsed.Claims.(jwt.MapClaims)
	if claims["iss"] != "TEAM123456" || claims["sub"] != testBundle || parsed.Header["kid"] != "KEY1234567" {
		t.Fatalf("client_secret: %v %v", claims, parsed.Header)
	}
}

func TestAppleDisabledWithoutKey(t *testing.T) {
	a, err := NewApple(AppleConfig{BundleIDs: []string{testBundle}})
	if err != nil {
		t.Fatal(err)
	}
	if a.Enabled() || a.WebEnabled() {
		t.Fatal("без ключа вход должен быть выключен")
	}
	if _, err := a.Verify(context.Background(), "x", []string{testBundle}); !errors.Is(err, ErrAppleDisabled) {
		t.Fatalf("ожидался ErrAppleDisabled: %v", err)
	}
	if _, err := NewApple(AppleConfig{TeamID: "T", KeyID: "K", PrivateKey: []byte("not pem")}); err == nil {
		t.Fatal("испорченный ключ принят молча")
	}
}
