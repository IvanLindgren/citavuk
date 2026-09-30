package store

import (
	"context"
	"github.com/google/uuid"
	"testing"
	"time"
)

func TestNextMonthlyCharge(t *testing.T) {
	jan := time.Date(2027, 1, 31, 12, 30, 0, 0, time.FixedZone("Moscow", 10800))
	feb := NextMonthlyCharge(jan, 31)
	march := NextMonthlyCharge(feb, 31)
	if feb.Day() != 28 || march.Day() != 31 || march.Month() != time.March {
		t.Fatalf("calendar drift: %v %v", feb, march)
	}
}

func TestSupportSubscriptionLifecycle(t *testing.T) {
	s := testStore(t)
	ctx := context.Background()
	if _, err := s.Migrate(ctx); err != nil {
		t.Fatal(err)
	}
	u, err := s.CreateUser(ctx, "monthly-"+uuid.NewString()+"@example.com", "", "Друг", true)
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { _ = s.DeleteUser(context.Background(), u.ID) })
	d, err := s.CreateDonation(ctx, NewDonation{UserID: &u.ID, PublicName: "Друг", ShowPublic: true, ShowAmount: true, AmountKopecks: 50000})
	if err != nil {
		t.Fatal(err)
	}
	if err = s.CreateSupportSubscription(ctx, d); err != nil {
		t.Fatal(err)
	}
	at := time.Now()
	paid, err := s.SetDonationStatus(ctx, d.ID, "succeeded", &at)
	if err != nil {
		t.Fatal(err)
	}
	if err = s.SyncSupportSubscription(ctx, paid, "saved-method", true); err != nil {
		t.Fatal(err)
	}
	list, err := s.SupportSubscriptions(ctx, u.ID)
	if err != nil || len(list) != 1 || list[0].Status != "active" {
		t.Fatalf("list=%+v err=%v", list, err)
	}
	first := *list[0].NextChargeAt
	if err = s.SyncSupportSubscription(ctx, paid, "saved-method", true); err != nil {
		t.Fatal(err)
	}
	list, _ = s.SupportSubscriptions(ctx, u.ID)
	if !first.Equal(*list[0].NextChargeAt) {
		t.Fatal("duplicate webhook moved renewal")
	}
	// Чужой аккаунт не может отключить подписку.
	if err = s.CancelSupportSubscription(ctx, uuid.New(), list[0].ID); err != ErrDonationNotFound {
		t.Fatalf("foreign cancellation: %v", err)
	}
	_, err = s.Pool.Exec(ctx, `UPDATE support_subscriptions SET next_charge_at=now()-interval '1 minute' WHERE id=$1`, list[0].ID)
	if err != nil {
		t.Fatal(err)
	}
	calls := 0
	charge := func(d *Donation, method string) (string, error) {
		calls++
		if method != "saved-method" || d.AmountKopecks != 50000 {
			t.Fatal("wrong recurring charge")
		}
		return "pay-" + d.ID.String(), nil
	}
	cycle, err := s.ChargeNextSupportSubscription(ctx, charge)
	if err != nil || cycle == nil {
		t.Fatalf("charge: %v", err)
	}
	duplicate, err := s.ChargeNextSupportSubscription(ctx, charge)
	if err != nil || duplicate.ID != cycle.ID || calls != 1 {
		t.Fatal("renewal duplicated")
	}
	if err = s.CancelSupportSubscription(ctx, u.ID, list[0].ID); err != nil {
		t.Fatal(err)
	}
	cycle, err = s.ChargeNextSupportSubscription(ctx, charge)
	if err != nil || cycle != nil || calls != 1 {
		t.Fatal("charged canceled subscription")
	}
}

func TestSupportSpotlightPrivacy(t *testing.T) {
	s := testStore(t)
	ctx := context.Background()
	if _, err := s.Migrate(ctx); err != nil {
		t.Fatal(err)
	}
	// Далёкая дата изолирует тест от платежей соседних тестов.
	now := time.Date(2040, 5, 5, 12, 0, 0, 0, time.FixedZone("Moscow", 10800))
	paid := now.AddDate(0, 0, -1)
	d, err := s.CreateDonation(ctx, NewDonation{PublicName: "Публичное имя", ShowPublic: true, Message: "Не проверено", ShowMessage: true, AmountKopecks: 50000})
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { _, _ = s.Pool.Exec(context.Background(), `DELETE FROM donations WHERE id=$1`, d.ID) })
	if _, err = s.SetDonationStatus(ctx, d.ID, "succeeded", &paid); err != nil {
		t.Fatal(err)
	}
	p, err := s.Spotlight(ctx, now)
	if err != nil || p == nil || p.Message != "" || p.AmountKopecks != 0 {
		t.Fatalf("private data leaked: %+v %v", p, err)
	}
	if err = s.ApproveDonationMessage(ctx, d.ID, true); err != nil {
		t.Fatal(err)
	}
	p, _ = s.Spotlight(ctx, now)
	if p.Message != "Не проверено" {
		t.Fatal("approved message missing")
	}
	if _, err = s.SetDonationStatus(ctx, d.ID, "refunded", nil); err != nil {
		t.Fatal(err)
	}
	p, _ = s.Spotlight(ctx, now)
	if p != nil {
		t.Fatal("refunded donation shown")
	}
}
