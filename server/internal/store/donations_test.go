package store

import (
	"context"
	"testing"
	"time"

	"github.com/google/uuid"
)

func TestDonationsSupporterThreshold(t *testing.T) {
	s := testStore(t)
	ctx := context.Background()
	if _, err := s.Migrate(ctx); err != nil {
		t.Fatal(err)
	}
	u, err := s.CreateUser(ctx, "donor-"+uuid.NewString()[:8]+"@example.com", "", "Донатер", true)
	if err != nil {
		t.Fatal(err)
	}
	pay := func(kopecks int64, name string) *Donation {
		d, err := s.CreateDonation(ctx, NewDonation{UserID: &u.ID, PublicName: name, ShowPublic: true, AmountKopecks: kopecks})
		if err != nil {
			t.Fatal(err)
		}
		now := time.Now()
		d, err = s.SetDonationStatus(ctx, d.ID, "succeeded", &now)
		if err != nil {
			t.Fatal(err)
		}
		return d
	}
	since := func() *time.Time {
		got, err := s.UserByID(ctx, u.ID)
		if err != nil {
			t.Fatal(err)
		}
		return got.SupporterSince
	}

	pay(100_00, "Ана")
	if since() != nil {
		t.Fatal("100 ₽ не должны давать значок")
	}
	second := pay(150_00, "Ана П.")
	if since() == nil {
		t.Fatal("сумма 250 ₽ должна дать значок")
	}
	if total, err := s.UserDonationTotal(ctx, u.ID); err != nil || total != 250_00 {
		t.Fatalf("сумма аккаунта = %d, %v; want 25000", total, err)
	}
	list, err := s.Supporters(ctx, 1000)
	if err != nil {
		t.Fatal(err)
	}
	found := false
	for _, sp := range list {
		if sp.Name == "Ана П." {
			found = true
		}
		if sp.Name == "Ана" {
			t.Error("аккаунт должен быть в списке один раз под последним именем")
		}
	}
	if !found {
		t.Errorf("нет в списке: %+v", list)
	}

	if _, err := s.SetDonationStatus(ctx, second.ID, "refunded", nil); err != nil {
		t.Fatal(err)
	}
	if since() != nil {
		t.Fatal("после возврата сумма ниже порога — значок снимается")
	}
	now := time.Now().UTC()
	rows, err := s.DonationsForMonth(ctx, time.Date(now.Year(), now.Month(), 1, 0, 0, 0, 0, time.UTC))
	if err != nil {
		t.Fatal(err)
	}
	if len(rows) < 2 {
		t.Errorf("в выборке месяца должны быть и оплата, и возврат: %d", len(rows))
	}
	if err := s.DeleteUser(ctx, u.ID); err != nil {
		t.Fatal(err)
	}
}
