package auth

import (
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"net/url"
	"testing"
)

func TestYandexAuthorizationURL(t *testing.T) {
	client := NewYandexClient(
		"client-id",
		"client-secret",
		"https://api.citavuk.ru/v1/auth/yandex/callback",
	)

	rawURL, err := client.AuthorizationURL("csrf-state")
	if err != nil {
		t.Fatal(err)
	}
	parsed, err := url.Parse(rawURL)
	if err != nil {
		t.Fatal(err)
	}
	query := parsed.Query()
	if parsed.Scheme != "https" || parsed.Host != "oauth.yandex.ru" {
		t.Fatalf("неожиданный OAuth endpoint: %s", rawURL)
	}
	if query.Get("client_id") != "client-id" ||
		query.Get("state") != "csrf-state" ||
		query.Get("response_type") != "code" {
		t.Fatalf("OAuth параметры потеряны: %v", query)
	}
	if query.Get("redirect_uri") != "https://api.citavuk.ru/v1/auth/yandex/callback" {
		t.Fatalf("неверный redirect_uri: %q", query.Get("redirect_uri"))
	}
}

func TestYandexExchange(t *testing.T) {
	mux := http.NewServeMux()
	server := httptest.NewServer(mux)
	t.Cleanup(server.Close)

	mux.HandleFunc("/token", func(w http.ResponseWriter, r *http.Request) {
		if r.Method != http.MethodPost {
			t.Errorf("token method = %s", r.Method)
		}
		clientID, secret, ok := r.BasicAuth()
		if !ok || clientID != "client-id" || secret != "client-secret" {
			t.Errorf("неверная Basic-аутентификация: %q %q %v", clientID, secret, ok)
		}
		if err := r.ParseForm(); err != nil {
			t.Fatal(err)
		}
		if r.Form.Get("code") != "authorization-code" ||
			r.Form.Get("grant_type") != "authorization_code" ||
			r.Form.Get("redirect_uri") != "https://api.example/callback" {
			t.Errorf("неверная форма обмена: %v", r.Form)
		}
		_ = json.NewEncoder(w).Encode(map[string]string{
			"access_token": "access-token",
			"token_type":   "bearer",
		})
	})
	mux.HandleFunc("/info", func(w http.ResponseWriter, r *http.Request) {
		if r.Header.Get("Authorization") != "OAuth access-token" {
			t.Errorf("неверный профильный Authorization: %q", r.Header.Get("Authorization"))
		}
		if r.URL.Query().Get("format") != "json" {
			t.Errorf("профиль запрошен не в JSON: %v", r.URL.Query())
		}
		_ = json.NewEncoder(w).Encode(map[string]any{
			"id":            "yandex-subject",
			"default_email": "reader@example.com",
			"real_name":     "Иван Читатель",
		})
	})

	client := NewYandexClient(
		"client-id",
		"client-secret",
		"https://api.example/callback",
	)
	client.tokenURL = server.URL + "/token"
	client.infoURL = server.URL + "/info"
	client.client = server.Client()

	claims, err := client.Exchange(context.Background(), "authorization-code")
	if err != nil {
		t.Fatal(err)
	}
	if claims.Subject != "yandex-subject" ||
		claims.Email != "reader@example.com" ||
		claims.Name != "Иван Читатель" {
		t.Fatalf("профиль разобран неверно: %+v", claims)
	}
}

func TestYandexExchangeRequiresEmail(t *testing.T) {
	mux := http.NewServeMux()
	server := httptest.NewServer(mux)
	t.Cleanup(server.Close)

	mux.HandleFunc("/token", func(w http.ResponseWriter, _ *http.Request) {
		_, _ = w.Write([]byte(`{"access_token":"token"}`))
	})
	mux.HandleFunc("/info", func(w http.ResponseWriter, _ *http.Request) {
		_, _ = w.Write([]byte(`{"id":"subject"}`))
	})

	client := NewYandexClient("id", "secret", "https://api.example/callback")
	client.tokenURL = server.URL + "/token"
	client.infoURL = server.URL + "/info"
	client.client = server.Client()

	if _, err := client.Exchange(context.Background(), "code"); err != ErrYandexEmail {
		t.Fatalf("ожидалась ErrYandexEmail, получено %v", err)
	}
}
