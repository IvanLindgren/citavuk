package mailer

import (
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
)

func TestSendVerification(t *testing.T) {
	var received map[string]any
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.Method != http.MethodPost {
			t.Errorf("method = %s", r.Method)
		}
		if r.Header.Get("Authorization") != "Bearer resend-key" {
			t.Errorf("Authorization = %q", r.Header.Get("Authorization"))
		}
		if r.Header.Get("Content-Type") != "application/json" {
			t.Errorf("Content-Type = %q", r.Header.Get("Content-Type"))
		}
		if err := json.NewDecoder(r.Body).Decode(&received); err != nil {
			t.Fatal(err)
		}
		w.WriteHeader(http.StatusOK)
		_, _ = w.Write([]byte(`{"id":"mail-id"}`))
	}))
	t.Cleanup(server.Close)

	sender := NewResend(
		"resend-key",
		"Читавук <noreply@citavuk.ru>",
		"https://citavuk.ru/",
	)
	sender.endpoint = server.URL
	sender.client = server.Client()

	if err := sender.SendVerification(
		context.Background(),
		"reader@example.com",
		"Иван <читатель>",
		"token with symbols/+",
	); err != nil {
		t.Fatal(err)
	}

	if received["from"] != "Читавук <noreply@citavuk.ru>" {
		t.Errorf("from = %#v", received["from"])
	}
	recipients, ok := received["to"].([]any)
	if !ok || len(recipients) != 1 || recipients[0] != "reader@example.com" {
		t.Errorf("to = %#v", received["to"])
	}
	text, _ := received["text"].(string)
	htmlBody, _ := received["html"].(string)
	wantLink := "https://citavuk.ru/verify-email?token=token+with+symbols%2F%2B"
	if !strings.Contains(text, wantLink) || !strings.Contains(htmlBody, wantLink) {
		t.Errorf("ссылка подтверждения отсутствует: text=%q html=%q", text, htmlBody)
	}
	if strings.Contains(htmlBody, "Иван <читатель>") ||
		!strings.Contains(htmlBody, "Иван &lt;читатель&gt;") {
		t.Errorf("имя не экранировано в HTML: %q", htmlBody)
	}
}

func TestDisabledResendDoesNotSend(t *testing.T) {
	sender := NewResend("", "Читавук <noreply@citavuk.ru>", "https://citavuk.ru")
	if sender.Enabled() {
		t.Fatal("отправитель без API-ключа считается настроенным")
	}
	if err := sender.SendVerification(context.Background(), "a@b.example", "", "token"); err == nil {
		t.Fatal("отключённый отправитель не вернул ошибку")
	}
}
