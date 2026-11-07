package api

import (
	"net/http"
	"net/http/httptest"
	"net/url"
	"os"
	"strings"
	"testing"

	"github.com/citavuk/server/internal/news"
)

func newsMux() *http.ServeMux {
	s := &Server{news: news.New()}
	mux := http.NewServeMux()
	mux.HandleFunc("GET /v1/news", s.handleNewsIssue)
	mux.HandleFunc("GET /v1/news/article", s.handleNewsArticle)
	mux.HandleFunc("GET /v1/news/image/{id}", s.handleNewsImage)
	mux.HandleFunc("GET /v1/videos/picks", s.handleVideoPicks)
	mux.HandleFunc("GET /v1/videos/thumb/{id}", s.handleVideoThumb)
	return mux
}

func TestNewsHandlersRefuseForeignTargets(t *testing.T) {
	mux := newsMux()
	cases := []struct {
		path string
		code int
	}{
		// Заметка с чужого сайта: ручка не должна становиться открытым прокси.
		{"/v1/news/article?url=" + url.QueryEscape("https://example.com/vest"), http.StatusBadRequest},
		{"/v1/news/article?url=" + url.QueryEscape("http://n1info.rs/vesti/x"), http.StatusBadRequest},
		{"/v1/news/article?url=" + url.QueryEscape("https://user@n1info.rs/vesti/x"), http.StatusBadRequest},
		// Снимок отдаётся только по id из номера.
		{"/v1/news/image/0123456789abcdef01234567", http.StatusNotFound},
		{"/v1/videos/thumb/not-a-video", http.StatusNotFound},
		{"/v1/videos/thumb/" + url.PathEscape("../../etc"), http.StatusNotFound},
	}
	for _, tc := range cases {
		rec := httptest.NewRecorder()
		mux.ServeHTTP(rec, httptest.NewRequest(http.MethodGet, tc.path, nil))
		if rec.Code != tc.code {
			t.Errorf("%s: код %d, ждали %d (%s)", tc.path, rec.Code, tc.code, strings.TrimSpace(rec.Body.String()))
		}
	}
}

func TestNewsHandlersLive(t *testing.T) {
	if os.Getenv("CITAVUK_NETWORK_TESTS") != "1" {
		t.Skip("сеть: CITAVUK_NETWORK_TESTS=1")
	}
	mux := newsMux()
	rec := httptest.NewRecorder()
	mux.ServeHTTP(rec, httptest.NewRequest(http.MethodGet, "/v1/news", nil))
	if rec.Code != http.StatusOK {
		t.Fatalf("номер: %d %s", rec.Code, rec.Body.String())
	}
	body := rec.Body.String()
	start := strings.Index(body, `"image":"`)
	if start < 0 {
		t.Fatal("в номере нет ни одного снимка")
	}
	id := body[start+len(`"image":"`):]
	id = id[:strings.IndexByte(id, '"')]

	rec = httptest.NewRecorder()
	mux.ServeHTTP(rec, httptest.NewRequest(http.MethodGet, "/v1/news/image/"+id, nil))
	if rec.Code != http.StatusOK || !strings.HasPrefix(rec.Header().Get("Content-Type"), "image/") {
		t.Fatalf("снимок: %d %q", rec.Code, rec.Header().Get("Content-Type"))
	}
}
