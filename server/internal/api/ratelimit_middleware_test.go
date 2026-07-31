package api

import (
	"context"
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/citavuk/server/internal/config"
	"github.com/citavuk/server/internal/store"
	"github.com/google/uuid"
)

func TestRateLimitIdentitySeparatesUsers(t *testing.T) {
	s := &Server{cfg: &config.Config{}}
	limit := newLimiter("test_identity", 1, 1, nil)
	handler := s.rateLimitIdentity(limit, func(w http.ResponseWriter, _ *http.Request) {
		w.WriteHeader(http.StatusNoContent)
	})

	request := func(userID uuid.UUID) int {
		req := httptest.NewRequest(http.MethodGet, "/", nil)
		user := &store.User{ID: userID}
		req = req.WithContext(context.WithValue(req.Context(), userKey, user))
		response := httptest.NewRecorder()
		handler(response, req)
		return response.Code
	}

	first := uuid.New()
	second := uuid.New()
	if got := request(first); got != http.StatusNoContent {
		t.Fatalf("первый запрос пользователя: статус %d", got)
	}
	if got := request(first); got != http.StatusTooManyRequests {
		t.Fatalf("повторный запрос того же пользователя: статус %d", got)
	}
	if got := request(second); got != http.StatusNoContent {
		t.Fatalf("другой пользователь попал в чужой bucket: статус %d", got)
	}
}

func TestTranslateLimitHasGlobalSafetyBucket(t *testing.T) {
	s := &Server{
		cfg:                  &config.Config{},
		anonTranslateLimit:   newLimiter("test_anon", 100, 10, nil),
		userTranslateLimit:   newLimiter("test_user", 100, 10, nil),
		translateGlobalLimit: newLimiter("test_global", 1, 2, nil),
	}
	handler := s.rateLimitTranslate(func(w http.ResponseWriter, _ *http.Request) {
		w.WriteHeader(http.StatusNoContent)
	})

	request := func(ip string) int {
		req := httptest.NewRequest(http.MethodPost, "/v1/translate", nil)
		req.RemoteAddr = ip + ":1234"
		response := httptest.NewRecorder()
		handler(response, req)
		return response.Code
	}

	if got := request("192.0.2.1"); got != http.StatusNoContent {
		t.Fatalf("первый запрос: статус %d", got)
	}
	if got := request("192.0.2.2"); got != http.StatusNoContent {
		t.Fatalf("второй запрос: статус %d", got)
	}
	if got := request("192.0.2.3"); got != http.StatusTooManyRequests {
		t.Fatalf("общий safety bucket не сработал: статус %d", got)
	}
}
