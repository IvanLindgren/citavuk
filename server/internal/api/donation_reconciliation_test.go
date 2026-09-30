package api

import (
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"strings"
	"sync/atomic"
	"testing"
	"time"

	"github.com/citavuk/server/internal/store"
	"github.com/citavuk/server/internal/yookassa"
	"github.com/google/uuid"
)

func TestDonationReconciliationWithoutWebhookOrReturn(t *testing.T) {
	_, st := testServer(t)
	ctx := context.Background()
	type fixture struct {
		donation *store.Donation
		user     *store.User
		status   string
		amount   string
		paid     bool
		fail     bool
	}
	fixtures := map[string]fixture{}
	for _, scenario := range []struct {
		name, status, amount string
		paid, fail           bool
	}{
		{"paid", "succeeded", "200.00", true, false},
		{"canceled", "canceled", "200.00", false, false},
		{"unpaid", "pending", "200.00", false, false},
		{"wrong-amount", "succeeded", "100.00", true, false},
		{"outage", "", "", false, true},
	} {
		u, err := st.CreateUser(ctx, uuid.NewString()+"@example.com", "", "Проверка", true)
		if err != nil {
			t.Fatal(err)
		}
		d, err := st.CreateDonation(ctx, store.NewDonation{UserID: &u.ID, AmountKopecks: 200_00, PublicName: "Друг", ShowPublic: true})
		if err != nil {
			t.Fatal(err)
		}
		payment := "test-reconcile-" + scenario.name + "-" + uuid.NewString()
		if err := st.SetDonationPaymentID(ctx, d.ID, payment); err != nil {
			t.Fatal(err)
		}
		if _, err := st.Pool.Exec(ctx, `UPDATE donations SET payment_recheck_after='2000-01-01' WHERE id=$1`, d.ID); err != nil {
			t.Fatal(err)
		}
		fixtures[payment] = fixture{d, u, scenario.status, scenario.amount, scenario.paid, scenario.fail}
		t.Cleanup(func() {
			_, _ = st.Pool.Exec(ctx, "DELETE FROM donations WHERE id=$1", d.ID)
			_ = st.DeleteUser(ctx, u.ID)
		})
	}
	var checked atomic.Int32
	provider := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.Method != http.MethodGet {
			t.Error("сверка не должна создавать платежи")
			w.WriteHeader(405)
			return
		}
		payment := strings.TrimPrefix(r.URL.Path, "/payments/")
		f, ok := fixtures[payment]
		if !ok {
			w.WriteHeader(404)
			return
		}
		checked.Add(1)
		if f.fail {
			w.WriteHeader(503)
			return
		}
		_ = json.NewEncoder(w).Encode(map[string]any{
			"id": payment, "status": f.status, "paid": f.paid, "test": false,
			"amount":      map[string]string{"value": f.amount, "currency": "RUB"},
			"metadata":    map[string]string{"donation_id": f.donation.ID.String()},
			"captured_at": time.Now().UTC(),
		})
	}))
	defer provider.Close()
	app := &Server{store: st, yookassa: yookassa.New("fixture", "fixture").WithBaseURL(provider.URL)}
	app.reconcilePendingDonations(ctx)
	if checked.Load() != 5 {
		t.Fatalf("проверок: %d", checked.Load())
	}
	for _, f := range fixtures {
		d, err := st.DonationByID(ctx, f.donation.ID)
		if err != nil {
			t.Fatal(err)
		}
		want := "pending"
		if f.status == "canceled" || (f.paid && f.amount == "200.00") {
			want = f.status
		}
		if d.Status != want {
			t.Fatalf("статус %s, ожидался %s", d.Status, want)
		}
		u, err := st.UserByID(ctx, f.user.ID)
		if err != nil || (u.SupporterSince != nil) != (want == "succeeded") {
			t.Fatalf("неверный статус друга: %v", err)
		}
	}
	app.reconcilePendingDonations(ctx)
	if checked.Load() != 5 {
		t.Fatal("повторная проверка обошла аренду или проверила завершённый платёж")
	}
}
