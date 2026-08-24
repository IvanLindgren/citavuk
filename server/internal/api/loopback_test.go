package api

import (
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/citavuk/server/internal/config"
	"github.com/citavuk/server/internal/store"
)

func TestParseLoopbackURLAccepts(t *testing.T) {
	cases := []struct {
		raw  string
		want string
	}{
		{"http://127.0.0.1:52341", "http://127.0.0.1:52341"},
		{"http://127.0.0.1:52341/", "http://127.0.0.1:52341/"},
		{"http://localhost:8123/auth/yandex", "http://localhost:8123/auth/yandex"},
		{"http://[::1]:49999/callback", "http://[::1]:49999/callback"},
		{"  http://127.0.0.1:1024/x  ", "http://127.0.0.1:1024/x"},
		// Строка запроса отбрасывается: параметры дописывает сервер, и заранее
		// подложенный error или code не должен пережить проверку.
		{"http://127.0.0.1:50000/cb?error=fake", "http://127.0.0.1:50000/cb"},
		{"http://127.0.0.1:50000/cb#anchor", "http://127.0.0.1:50000/cb"},
	}
	for _, c := range cases {
		got, err := parseLoopbackURL(c.raw)
		if err != nil {
			t.Errorf("parseLoopbackURL(%q) вернул ошибку: %v", c.raw, err)
			continue
		}
		if got != c.want {
			t.Errorf("parseLoopbackURL(%q) = %q, ожидалось %q", c.raw, got, c.want)
		}
	}
}

func TestParseLoopbackURLRejects(t *testing.T) {
	// Каждый случай — способ увести одноразовый код входа наружу либо запустить
	// в браузере что-то помимо возврата в приложение.
	cases := map[string]string{
		"пустая строка":          "",
		"чужой узел":             "http://evil.example.com:8080/cb",
		"похожий узел":           "http://127.0.0.1.evil.com:8080/cb",
		"внешний адрес":          "http://85.137.89.21:8080/cb",
		"без порта":              "http://127.0.0.1/cb",
		"привилегированный порт": "http://127.0.0.1:80/cb",
		"порт вне диапазона":     "http://127.0.0.1:99999/cb",
		"https":                  "https://127.0.0.1:8080/cb",
		"схема javascript":       "javascript:alert(1)",
		"файловая схема":         "file:///c:/windows",
		"deep link":              "citavuk://auth/yandex",
		"учётные данные в URL":   "http://user:pass@127.0.0.1:8080/cb",
		"без схемы":              "127.0.0.1:8080",
		"пробел вместо адреса":   "   ",
	}
	for name, raw := range cases {
		if got, err := parseLoopbackURL(raw); err == nil {
			t.Errorf("%s: parseLoopbackURL(%q) принят как %q, а должен быть отклонён",
				name, raw, got)
		}
	}
}

func TestParseTrustedWebReturn(t *testing.T) {
	allowed := []string{"https://citavuk.ru", "https://wolfy.citavuk.ru"}
	got, err := parseTrustedWebReturn(
		"https://wolfy.citavuk.ru/auth/return?provider=yandex&next=%2Faccount&code=fake",
		allowed,
	)
	if err != nil {
		t.Fatal(err)
	}
	if got != "https://wolfy.citavuk.ru/auth/return?next=%2Faccount&provider=yandex" {
		t.Fatalf("параметры возврата разобраны неверно: %q", got)
	}

	for _, raw := range []string{
		"https://evil.example/auth/return",
		"https://wolfy.citavuk.ru/auth/return-evil",
		"https://wolfy.citavuk.ru/auth/return#fragment",
		"http://wolfy.citavuk.ru/auth/return",
	} {
		if value, err := parseTrustedWebReturn(raw, allowed); err == nil {
			t.Errorf("небезопасный адрес %q принят как %q", raw, value)
		}
	}
}

// TestRedirectOAuthResultTargets проверяет, что результат входа уходит именно
// тому приложению, которое его начинало.
func TestRedirectOAuthResultTargets(t *testing.T) {
	s := &Server{cfg: &config.Config{WebURL: "https://citavuk.ru"}}

	cases := []struct {
		name  string
		state store.OAuthState
		want  string
	}{
		{
			name:  "android получает deep link",
			state: store.OAuthState{ReturnTarget: "mobile"},
			want:  "citavuk://auth/yandex?code=abc",
		},
		{
			name: "десктоп получает свой локальный сокет",
			state: store.OAuthState{
				ReturnTarget: "desktop",
				ReturnURL:    "http://127.0.0.1:52341/callback",
			},
			want: "http://127.0.0.1:52341/callback?code=abc",
		},
		{
			name:  "сайт получает свою страницу",
			state: store.OAuthState{ReturnTarget: "web"},
			want:  "https://citavuk.ru/auth/yandex?code=abc",
		},
		{
			name: "доверенное web-приложение получает свой callback",
			state: store.OAuthState{
				ReturnTarget: "web",
				ReturnURL:    "https://wolfy.citavuk.ru/auth/return?provider=yandex&next=%2Faccount",
			},
			want: "https://wolfy.citavuk.ru/auth/return?code=abc&next=%2Faccount&provider=yandex",
		},
		{
			// Если адрес почему-то не сохранился, вход обязан завершиться на
			// сайте, а не уйти в никуда.
			name:  "десктоп без адреса откатывается на сайт",
			state: store.OAuthState{ReturnTarget: "desktop"},
			want:  "https://citavuk.ru/auth/yandex?code=abc",
		},
	}

	for _, c := range cases {
		t.Run(c.name, func(t *testing.T) {
			w := httptest.NewRecorder()
			r := httptest.NewRequest(http.MethodGet, "/v1/auth/yandex/callback", nil)
			s.redirectOAuthResult(w, r, &c.state, "abc", "")

			if w.Code != http.StatusSeeOther {
				t.Fatalf("код ответа %d, ожидался %d", w.Code, http.StatusSeeOther)
			}
			if got := w.Header().Get("Location"); got != c.want {
				t.Errorf("Location = %q, ожидалось %q", got, c.want)
			}
		})
	}
}
