package personal

import (
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"testing"
	"time"
)

func TestGeneratorBudgetAndCancellation(t *testing.T) {
	g := New("test", "http://example.invalid")
	if g.client.Timeout != 4*time.Minute {
		t.Fatal("изменился ограниченный бюджет ожидания")
	}
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		var input struct {
			Model    string `json:"model"`
			Messages []struct {
				Content string `json:"content"`
			} `json:"messages"`
		}
		if err := json.NewDecoder(r.Body).Decode(&input); err != nil {
			t.Error(err)
		}
		if input.Model != Model {
			t.Error("подменена модель")
		}
		<-r.Context().Done()
	}))
	defer server.Close()
	g.url = server.URL
	ctx, cancel := context.WithTimeout(context.Background(), 50*time.Millisecond)
	defer cancel()
	if _, err := g.Outline(ctx, Profile{}); err == nil {
		t.Fatal("потеря аренды/остановка не отменяет запрос")
	}
}
