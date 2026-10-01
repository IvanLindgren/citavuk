package api

import (
	"bytes"
	"context"
	"encoding/json"
	"errors"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
	"time"

	"github.com/citavuk/server/internal/auth"
	"github.com/citavuk/server/internal/store"
	"github.com/citavuk/server/internal/yookassa"
	"github.com/google/uuid"
)

func TestGuestCheckoutCookieAndBrowserLogin(t *testing.T) {
	ts, st, srv := testServerWithApp(t)
	c, email := register(t, ts, st)
	var paymentBody map[string]any
	provider := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.Method != "POST" {
			w.WriteHeader(404)
			return
		}
		if err := json.NewDecoder(r.Body).Decode(&paymentBody); err != nil {
			t.Error(err)
		}
		_ = json.NewEncoder(w).Encode(map[string]any{"id": uuid.NewString(), "status": "pending", "confirmation": map[string]string{"confirmation_url": "https://yookassa.ru/fixture"}})
	}))
	defer provider.Close()
	srv.yookassa = yookassa.New("fixture", "live_fixture").WithBaseURL(provider.URL)
	req := httptest.NewRequest("POST", "/v1/donations", strings.NewReader(`{"amountRubles":200,"recoveryEmail":"`+email+`"}`))
	rr := httptest.NewRecorder()
	srv.handleCreateDonation(rr, req)
	if rr.Code != 200 {
		t.Fatalf("checkout %d: %s", rr.Code, rr.Body)
	}
	var started createDonationResponse
	if err := json.Unmarshal(rr.Body.Bytes(), &started); err != nil {
		t.Fatal(err)
	}
	id := uuid.MustParse(started.ID)
	t.Cleanup(func() { _, _ = st.Pool.Exec(context.Background(), "DELETE FROM donations WHERE id=$1", id) })
	var cookie *http.Cookie
	for _, item := range rr.Result().Cookies() {
		if item.Name == guestDonationCookie {
			cookie = item
		}
	}
	if cookie == nil || !cookie.Secure || !cookie.HttpOnly || cookie.SameSite != http.SameSiteStrictMode || cookie.Path != "/" || cookie.Domain != "" || !validDonationProof(cookie.Value) {
		t.Fatal("unsafe or missing ownership cookie")
	}
	metadata := paymentBody["metadata"].(map[string]any)
	if len(metadata) != 1 || metadata["donation_id"] != started.ID {
		t.Fatal("private ownership data sent to payment provider")
	}
	var hash []byte
	if err := st.Pool.QueryRow(context.Background(), "SELECT browser_hash FROM donation_guest_ownership WHERE donation_id=$1", id).Scan(&hash); err != nil {
		t.Fatal(err)
	}
	if !bytes.Equal(hash, auth.HashToken(cookie.Value)) {
		t.Fatal("ownership hash differs")
	}
	now := time.Now()
	if _, err := st.SetDonationStatus(context.Background(), id, "succeeded", &now); err != nil {
		t.Fatal(err)
	}
	// Один UUID не даёт прав; чужой origin не может использовать cookie.
	send := func(token string, proof *http.Cookie, origin string) int {
		r, _ := http.NewRequest("POST", ts.URL+"/v1/donations/guest/claim", strings.NewReader(`{"id":"`+started.ID+`"}`))
		r.Header.Set("Content-Type", "application/json")
		r.Header.Set("X-Citavuk-Client", "web")
		r.Header.Set("Origin", origin)
		if token != "" {
			r.Header.Set("Authorization", "Bearer "+token)
		}
		if proof != nil {
			r.AddCookie(proof)
		}
		res, err := http.DefaultClient.Do(r)
		if err != nil {
			t.Fatal(err)
		}
		defer res.Body.Close()
		return res.StatusCode
	}
	if send("", cookie, "https://citavuk.ru") != 401 {
		t.Fatal("anonymous claim accepted")
	}
	if send(c.token, nil, "https://citavuk.ru") != 404 {
		t.Fatal("payment UUID accepted as proof")
	}
	if send(c.token, cookie, "https://foreign.invalid") != 403 {
		t.Fatal("foreign origin accepted")
	}
	// Вход на сайте в исходном браузере автоматически привязывает подтверждённую оплату.
	r, _ := http.NewRequest("POST", ts.URL+"/v1/auth/login", strings.NewReader(`{"email":"`+email+`","password":"надёжный-пароль-1"}`))
	r.Header.Set("Content-Type", "application/json")
	r.Header.Set("X-Citavuk-Client", "web")
	r.Header.Set("Origin", "https://citavuk.ru")
	r.AddCookie(cookie)
	res, err := http.DefaultClient.Do(r)
	if err != nil {
		t.Fatal(err)
	}
	defer res.Body.Close()
	var login authResponse
	if err = json.NewDecoder(res.Body).Decode(&login); err != nil {
		t.Fatal(err)
	}
	if res.StatusCode != 200 || login.User.SupporterSince == nil || login.Token != "cookie" {
		t.Fatal("login did not return the granted badge")
	}
	if send(c.token, cookie, "https://citavuk.ru") != 404 {
		t.Fatal("claimed donation reused")
	}
}

type guestMailFixture struct {
	calls       int
	email, path string
	fail        bool
}

func (m *guestMailFixture) Enabled() bool { return true }
func (m *guestMailFixture) SendVerification(context.Context, string, string, string) error {
	return nil
}
func (m *guestMailFixture) SendNotification(_ context.Context, email, _, _, _, _, path string) error {
	m.calls++
	m.email = email
	m.path = path
	if m.fail {
		return errors.New("fixture temporary outage")
	}
	return nil
}

func TestGuestEmailDeliveryAndOtherDeviceClaim(t *testing.T) {
	ts, st, _ := testServerWithApp(t)
	ctx := context.Background()
	c, email := register(t, ts, st)
	other, _ := register(t, ts, st)
	_, browser, _ := auth.NewSessionToken()
	d, err := st.CreateDonation(ctx, store.NewDonation{AmountKopecks: 20000})
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { _, _ = st.Pool.Exec(ctx, "DELETE FROM donations WHERE id=$1", d.ID) })
	if err = st.RegisterGuestDonation(ctx, d.ID, browser, email); err != nil {
		t.Fatal(err)
	}
	mail := &guestMailFixture{fail: true}
	worker := &Server{store: st, mailer: mail}
	worker.sendGuestDonationLinks(ctx)
	if mail.calls != 0 {
		t.Fatal("mail sent before successful payment")
	}
	now := time.Now()
	if _, err = st.SetDonationStatus(ctx, d.ID, "succeeded", &now); err != nil {
		t.Fatal(err)
	}
	worker.sendGuestDonationLinks(ctx)
	if mail.calls != 1 {
		t.Fatal("confirmed payment not queued")
	}
	worker.sendGuestDonationLinks(ctx)
	if mail.calls != 1 {
		t.Fatal("lease allowed immediate duplicate mail")
	}
	if _, err = st.Pool.Exec(ctx, "UPDATE donation_guest_ownership SET email_retry_after=now()-interval '1 second' WHERE donation_id=$1", d.ID); err != nil {
		t.Fatal(err)
	}
	mail.fail = false
	worker.sendGuestDonationLinks(ctx)
	if mail.calls != 2 || mail.email != email || !strings.HasPrefix(mail.path, "/support/claim#token=") {
		t.Fatal("retry or fragment-only email link failed")
	}
	token := strings.TrimPrefix(mail.path, "/support/claim#token=")
	if !validDonationProof(token) {
		t.Fatal("invalid email proof")
	}
	worker.sendGuestDonationLinks(ctx)
	if mail.calls != 2 {
		t.Fatal("successful email resent without request")
	}
	claim := func(c *client) int {
		r, _ := http.NewRequest("POST", ts.URL+"/v1/donations/guest/claim", strings.NewReader(`{"token":"`+token+`"}`))
		r.Header.Set("Content-Type", "application/json")
		r.Header.Set("Origin", "https://citavuk.ru")
		r.Header.Set("X-Citavuk-Client", "web")
		r.Header.Set("Authorization", "Bearer "+c.token)
		res, err := http.DefaultClient.Do(r)
		if err != nil {
			t.Fatal(err)
		}
		defer res.Body.Close()
		return res.StatusCode
	}
	if claim(other) != 403 {
		t.Fatal("wrong verified email accepted")
	}
	if claim(c) != 200 {
		t.Fatal("other device with matching verified email rejected")
	}
	if claim(c) != 404 {
		t.Fatal("one-time link reused")
	}
	var links int
	if err = st.Pool.QueryRow(ctx, "SELECT count(*) FROM donation_guest_claim_links WHERE donation_id=$1", d.ID).Scan(&links); err != nil || links != 0 {
		t.Fatal("outstanding links not invalidated")
	}
}

func TestDonationProofFormat(t *testing.T) {
	token, _, _ := auth.NewSessionToken()
	if !validDonationProof(token) {
		t.Fatal("generated proof rejected")
	}
	for _, bad := range []string{"", uuid.NewString(), "ctv_" + strings.Repeat("!", 43), token + "x"} {
		if validDonationProof(bad) {
			t.Fatal("malformed proof accepted")
		}
	}
}
