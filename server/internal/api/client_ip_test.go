package api

import (
	"net/http"
	"net/http/httptest"
	"testing"
)

// Адрес клиента — ключ почти всех ограничителей частоты, поэтому подделка
// заголовка здесь равносильна их отключению.
func TestClientIP(t *testing.T) {
	cases := []struct {
		name       string
		remote     string
		headers    map[string]string
		trustProxy bool
		want       string
	}{{
		name:   "без прокси заголовки игнорируются",
		remote: "203.0.113.7:5555",
		headers: map[string]string{
			"X-Forwarded-For": "1.2.3.4",
			"X-Real-IP":       "5.6.7.8",
		},
		want: "203.0.113.7",
	}, {
		// nginx подставляет $remote_addr и затирает всё, что прислал клиент.
		name:       "X-Real-IP имеет приоритет",
		remote:     "127.0.0.1:5555",
		headers:    map[string]string{"X-Real-IP": "203.0.113.7"},
		trustProxy: true,
		want:       "203.0.113.7",
	}, {
		// $proxy_add_x_forwarded_for дописывает настоящий адрес В КОНЕЦ, а
		// начало цепочки прислал сам клиент и верить ему нельзя.
		name:       "из цепочки берётся последний адрес",
		remote:     "127.0.0.1:5555",
		headers:    map[string]string{"X-Forwarded-For": "1.2.3.4, 9.9.9.9, 203.0.113.7"},
		trustProxy: true,
		want:       "203.0.113.7",
	}, {
		name:       "цепочка из одного адреса",
		remote:     "127.0.0.1:5555",
		headers:    map[string]string{"X-Forwarded-For": "203.0.113.7"},
		trustProxy: true,
		want:       "203.0.113.7",
	}, {
		name:       "IPv6 из RemoteAddr",
		remote:     "[2001:db8::1]:5555",
		trustProxy: false,
		want:       "2001:db8::1",
	}}

	for _, c := range cases {
		t.Run(c.name, func(t *testing.T) {
			req := httptest.NewRequest(http.MethodGet, "/", nil)
			req.RemoteAddr = c.remote
			for key, value := range c.headers {
				req.Header.Set(key, value)
			}
			if got := clientIP(req, c.trustProxy); got != c.want {
				t.Fatalf("clientIP = %q, ожидался %q", got, c.want)
			}
		})
	}
}

// Подделанный заголовок не должен давать новое ведро токенов.
func TestSpoofedForwardedForShareOneBucket(t *testing.T) {
	limit := newLimiter("test_spoof", 1, 1, nil)

	allow := func(forwarded string) bool {
		req := httptest.NewRequest(http.MethodGet, "/", nil)
		req.RemoteAddr = "127.0.0.1:5555"
		req.Header.Set("X-Forwarded-For", forwarded+", 203.0.113.7")
		return limit.allow(req.Context(), clientIP(req, true))
	}

	if !allow("1.2.3.4") {
		t.Fatal("первый запрос должен пройти")
	}
	if allow("5.6.7.8") {
		t.Fatal("смена X-Forwarded-For выдала новое ведро токенов")
	}
}
