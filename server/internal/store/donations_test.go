package store

import (
	"context"
	"sync"
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
	name := "Ана-" + u.ID.String()
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

	pay(100_00, name)
	if since() != nil {
		t.Fatal("100 ₽ не должны давать значок")
	}
	second := pay(150_00, name+" П.")
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
		if sp.Name == name+" П." {
			found = true
		}
		if sp.Name == name {
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

func TestConcurrentSmallDonationsReachSupporterThreshold(t *testing.T) {
	s := testStore(t)
	ctx := context.Background()
	if _, err := s.Migrate(ctx); err != nil {
		t.Fatal(err)
	}
	u, err := s.CreateUser(ctx, uuid.NewString()+"@example.com", "", "Друг", true)
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { _ = s.DeleteUser(ctx, u.ID) })
	var payments []*Donation
	for i := 0; i < 2; i++ {
		d, err := s.CreateDonation(ctx, NewDonation{UserID: &u.ID, AmountKopecks: 100_00})
		if err != nil {
			t.Fatal(err)
		}
		payments = append(payments, d)
		t.Cleanup(func() { _, _ = s.Pool.Exec(ctx, "DELETE FROM donations WHERE id=$1", d.ID) })
	}
	start := make(chan struct{})
	errs := make(chan error, 2)
	var wg sync.WaitGroup
	for _, d := range payments {
		wg.Add(1)
		go func() {
			defer wg.Done()
			<-start
			now := time.Now()
			_, err := s.SetDonationStatus(ctx, d.ID, "succeeded", &now)
			errs <- err
		}()
	}
	close(start)
	wg.Wait()
	close(errs)
	for err := range errs {
		if err != nil {
			t.Fatal(err)
		}
	}
	u, err = s.UserByID(ctx, u.ID)
	if err != nil || u.SupporterSince == nil {
		t.Fatal("две одновременные оплаты по 100 ₽ не выдали статус", err)
	}
}

func TestSupportersRankByContributionWithoutRevealingHiddenAmounts(t *testing.T) {
	s := testStore(t)
	ctx := context.Background()
	if _, err := s.Migrate(ctx); err != nil {
		t.Fatal(err)
	}
	names := []string{"Первый-" + uuid.NewString(), "Второй-" + uuid.NewString(), "Третий-" + uuid.NewString()}
	for i, amount := range []int64{1000_00, 500_00, 200_00} {
		u, err := s.CreateUser(ctx, uuid.NewString()+"@example.com", "", names[i], true)
		if err != nil {
			t.Fatal(err)
		}
		t.Cleanup(func() { _ = s.DeleteUser(ctx, u.ID) })
		pay := func(amount int64, public bool) {
			d, err := s.CreateDonation(ctx, NewDonation{UserID: &u.ID, PublicName: names[i], AmountKopecks: amount, ShowPublic: public, ShowAmount: false})
			if err != nil {
				t.Fatal(err)
			}
			t.Cleanup(func() { _, _ = s.Pool.Exec(ctx, "DELETE FROM donations WHERE id=$1", d.ID) })
			now := time.Now()
			if _, err = s.SetDonationStatus(ctx, d.ID, "succeeded", &now); err != nil {
				t.Fatal(err)
			}
		}
		pay(amount, true)
		if i == 2 {
			pay(10000_00, false)
		} // Анонимный вклад не раскрывает себя сменой места.
	}
	list, err := s.Supporters(ctx, 1000)
	if err != nil {
		t.Fatal(err)
	}
	var ordered []string
	for _, p := range list {
		for _, name := range names {
			if p.Name == name {
				ordered = append(ordered, p.Name)
				if p.AmountKopecks != 0 {
					t.Fatal("скрытая сумма раскрыта")
				}
			}
		}
	}
	if len(ordered) != 3 || ordered[0] != names[0] || ordered[1] != names[1] || ordered[2] != names[2] {
		t.Fatalf("неверный порядок: %v", ordered)
	}
}
