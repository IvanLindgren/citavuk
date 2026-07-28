package api

import (
	"io"
	"net/http"
	"net/http/httptest"
	"testing"
)

func TestUpstreamProxyDoesNotDuplicateCORSHeaders(t *testing.T) {
	upstream := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) {
		w.Header().Set("Access-Control-Allow-Origin", "*")
		w.Header().Set("Access-Control-Expose-Headers", "X-Upstream")
		_, _ = io.WriteString(w, `{"ok":true}`)
	}))
	defer upstream.Close()

	proxy, err := newUpstreamProxy(upstream.URL)
	if err != nil {
		t.Fatal(err)
	}

	response := httptest.NewRecorder()
	response.Header().Set("Access-Control-Allow-Origin", "https://www.citavuk.ru")
	request := httptest.NewRequest(http.MethodGet, "/audio/lessons", nil)
	proxy.ServeHTTP(response, request)

	values := response.Result().Header.Values("Access-Control-Allow-Origin")
	if len(values) != 1 || values[0] != "https://www.citavuk.ru" {
		t.Fatalf("CORS origin должен задаваться один раз внешним сервером: %q", values)
	}
	if got := response.Header().Get("Access-Control-Expose-Headers"); got != "" {
		t.Fatalf("CORS-заголовок upstream просочился наружу: %q", got)
	}
}
