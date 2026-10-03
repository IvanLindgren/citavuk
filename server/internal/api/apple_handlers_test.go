package api

import (
	"crypto/ecdsa"
	"crypto/elliptic"
	"crypto/rand"
	"crypto/rsa"
	"crypto/x509"
	"encoding/base64"
	"encoding/json"
	"encoding/pem"
	"math/big"
	"net/http"
	"net/http/httptest"
	"sync"
	"testing"
	"time"

	"github.com/citavuk/server/internal/auth"
	"github.com/golang-jwt/jwt/v5"
	"github.com/google/uuid"
)

const appleTestBundle = "com.srbskiread.srbskiRead"

// fakeApple — поддельный appleid.apple.com: ключи, обмен кода и отзыв.
type fakeApple struct {
	key     *rsa.PrivateKey
	subject string
	email   string

	mu      sync.Mutex
	revoked []string
}

func newFakeApple(t *testing.T, srv *Server) *fakeApple {
	t.Helper()
	key, err := rsa.GenerateKey(rand.Reader, 2048)
	if err != nil {
		t.Fatal(err)
	}
	f := &fakeApple{key: key, subject: "001.apple." + uuid.NewString(), email: uuid.NewString() + "@privaterelay.appleid.com"}

	mux := http.NewServeMux()
	mux.HandleFunc("/keys", func(w http.ResponseWriter, _ *http.Request) {
		_ = json.NewEncoder(w).Encode(map[string]any{"keys": []map[string]string{{
			"kid": "k1", "kty": "RSA", "alg": "RS256",
			"n": base64.RawURLEncoding.EncodeToString(key.N.Bytes()),
			"e": base64.RawURLEncoding.EncodeToString(big.NewInt(int64(key.E)).Bytes()),
		}}})
	})
	mux.HandleFunc("/token", func(w http.ResponseWriter, r *http.Request) {
		_ = r.ParseForm()
		_ = json.NewEncoder(w).Encode(map[string]string{
			"id_token":      f.token(t, r.PostForm.Get("client_id")),
			"refresh_token": "refresh-" + r.PostForm.Get("code"),
		})
	})
	mux.HandleFunc("/revoke", func(_ http.ResponseWriter, r *http.Request) {
		_ = r.ParseForm()
		f.mu.Lock()
		f.revoked = append(f.revoked, r.PostForm.Get("token"))
		f.mu.Unlock()
	})
	endpoint := httptest.NewServer(mux)
	t.Cleanup(endpoint.Close)

	ec, _ := ecdsa.GenerateKey(elliptic.P256(), rand.Reader)
	der, _ := x509.MarshalPKCS8PrivateKey(ec)
	apple, err := auth.NewApple(auth.AppleConfig{
		TeamID: "TEAM", KeyID: "KEY",
		PrivateKey: pem.EncodeToMemory(&pem.Block{Type: "PRIVATE KEY", Bytes: der}),
		BundleIDs:  []string{appleTestBundle},
	})
	if err != nil {
		t.Fatal(err)
	}
	srv.apple = apple.WithEndpoints(endpoint.URL+"/keys", endpoint.URL+"/token", endpoint.URL+"/revoke")
	srv.cfg.AppleBundleIDs = []string{appleTestBundle}
	return f
}

func (f *fakeApple) token(t *testing.T, audience string) string {
	t.Helper()
	token := jwt.NewWithClaims(jwt.SigningMethodRS256, jwt.MapClaims{
		"iss": "https://appleid.apple.com", "aud": audience, "sub": f.subject,
		"email": f.email, "email_verified": "true",
		"iat": time.Now().Unix(), "exp": time.Now().Add(time.Hour).Unix(),
	})
	token.Header["kid"] = "k1"
	signed, err := token.SignedString(f.key)
	if err != nil {
		t.Fatal(err)
	}
	return signed
}

func TestAppleNativeLoginAndRevokeOnDelete(t *testing.T) {
	ts, st, srv := testServerWithApp(t)
	f := newFakeApple(t, srv)
	t.Cleanup(func() {
		_, _ = st.Pool.Exec(t.Context(), `DELETE FROM users WHERE email = $1`, f.email)
	})
	c := &client{t: t, base: ts.URL}

	login := func() authResponse {
		status, raw := c.do(http.MethodPost, "/v1/auth/apple", map[string]any{
			"identityToken":     f.token(t, appleTestBundle),
			"authorizationCode": "code-1",
			"givenName":         "Ana",
			"familyName":        "Petrović",
			"device":            map[string]string{"id": "iphone-1", "name": "iPhone", "platform": "ios"},
		})
		var res authResponse
		c.mustJSON(status, raw, &res)
		return res
	}
	first := login()
	if first.User.DisplayName != "Ana Petrović" {
		t.Fatalf("имя при первом входе: %+v", first.User)
	}
	// Второй вход узнаёт того же человека.
	if second := login(); second.User.ID != first.User.ID {
		t.Fatalf("второй вход завёл новый аккаунт")
	}

	// Чужое приложение не пускаем.
	status, _ := c.do(http.MethodPost, "/v1/auth/apple", map[string]any{"identityToken": f.token(t, "com.evil.app")})
	if status != http.StatusUnauthorized {
		t.Fatalf("токен чужого приложения: %d", status)
	}

	// Удаление аккаунта отзывает доступ у Apple.
	c.token = first.Token
	status, raw := c.do(http.MethodPost, "/v1/auth/account/delete", map[string]any{"confirm": "УДАЛИТЬ"})
	if status != http.StatusOK {
		t.Fatalf("удаление: %d %s", status, raw)
	}
	f.mu.Lock()
	defer f.mu.Unlock()
	if len(f.revoked) == 0 || f.revoked[0] != "refresh-code-1" {
		t.Fatalf("доступ Apple не отозван: %v", f.revoked)
	}
}
