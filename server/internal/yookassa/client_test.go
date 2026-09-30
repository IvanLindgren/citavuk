package yookassa

import (
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"testing"
)

func TestAmountKopecks(t *testing.T) {
	cases := map[string]int64{"200.00": 20000, "200": 20000, "0.5": 50, "1234.07": 123407}
	for in, want := range cases {
		got, err := Amount{Value: in, Currency: "RUB"}.Kopecks()
		if err != nil || got != want {
			t.Errorf("%q: got %d, %v; want %d", in, got, err, want)
		}
	}
	if RUB(20005).Value != "200.05" {
		t.Errorf("RUB(20005) = %q", RUB(20005).Value)
	}
}

func TestCreateSendsAuthAndIdempotenceKey(t *testing.T) {
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		user, pass, ok := r.BasicAuth()
		if !ok || user != "shop" || pass != "secret" {
			t.Errorf("basic auth: %q %q %v", user, pass, ok)
		}
		if r.Header.Get("Idempotence-Key") != "key-1" {
			t.Errorf("Idempotence-Key = %q", r.Header.Get("Idempotence-Key"))
		}
		var body CreatePayment
		if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
			t.Fatal(err)
		}
		if !body.Capture || body.Amount.Value != "200.00" || body.Confirmation.Type != "redirect" {
			t.Errorf("body = %+v", body)
		}
		_, _ = w.Write([]byte(`{"id":"pay-1","status":"pending","amount":{"value":"200.00","currency":"RUB"},
			"confirmation":{"type":"redirect","confirmation_url":"https://yoomoney.ru/checkout/x"}}`))
	}))
	defer srv.Close()

	c := New("shop", "secret").WithBaseURL(srv.URL)
	p, err := c.Create(context.Background(), "key-1", RUB(20000), "Поддержка", "https://citavuk.ru/support/thanks", nil)
	if err != nil {
		t.Fatal(err)
	}
	if p.ID != "pay-1" || p.Confirmation.ConfirmationURL == "" {
		t.Errorf("payment = %+v", p)
	}
}

func TestErrorsAndDisabled(t *testing.T) {
	if _, err := New("", "").Payment(context.Background(), "x"); err != ErrDisabled {
		t.Errorf("disabled: %v", err)
	}
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(http.StatusUnauthorized)
		_, _ = w.Write([]byte(`{"type":"error","code":"invalid_credentials","description":"bad"}`))
	}))
	defer srv.Close()
	_, err := New("a", "b").WithBaseURL(srv.URL).Payment(context.Background(), "x")
	if e, ok := err.(*apiError); !ok || e.Code != "invalid_credentials" {
		t.Errorf("err = %v", err)
	}
}

func TestRecurringPaymentDoesNotAskForConfirmation(t *testing.T) {
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		var body map[string]any
		if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
			t.Fatal(err)
		}
		if body["payment_method_id"] != "saved" || body["confirmation"] != nil || r.Header.Get("Idempotence-Key") != "cycle" {
			t.Errorf("unsafe recurring request: %+v", body)
		}
		_, _ = w.Write([]byte(`{"id":"renewal","status":"succeeded","paid":true}`))
	}))
	defer srv.Close()
	if _, err := New("shop", "secret").WithBaseURL(srv.URL).Charge(context.Background(), "cycle", RUB(50000), "saved", nil); err != nil {
		t.Fatal(err)
	}
}
