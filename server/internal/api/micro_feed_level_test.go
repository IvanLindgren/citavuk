package api

import (
	"net/http"
	"net/http/httptest"
	"testing"
)

func TestMicroFeedRejectsInvalidReaderLevelBeforeIdentity(t *testing.T) {
	for _, level := range []string{"C2", "unknown", "A0"} {
		t.Run(level, func(t *testing.T) {
			response := httptest.NewRecorder()
			server := &Server{}
			server.handleMicroFeed(response, httptest.NewRequest(http.MethodGet, "/v1/micro-feed?readerLevel="+level, nil))
			if response.Code != http.StatusBadRequest {
				t.Fatalf("status %d", response.Code)
			}
		})
	}
}
