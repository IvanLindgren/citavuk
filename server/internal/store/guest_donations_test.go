package store

import (
	"context"
	"errors"
	"sync"
	"testing"
	"time"

	"github.com/citavuk/server/internal/auth"
	"github.com/google/uuid"
)

func TestGuestDonationClaimsProofAndOneTime(t *testing.T) {
	s := testStore(t)
	ctx := context.Background()
	if _, err := s.Migrate(ctx); err != nil {
		t.Fatal(err)
	}
	_, browser, _ := auth.NewSessionToken()
	_, wrong, _ := auth.NewSessionToken()
	makeUser := func(email string, verified bool) *User {
		u, err := s.CreateUser(ctx, email, "", "Друг", verified)
		if err != nil {
			t.Fatal(err)
		}
		t.Cleanup(func() { _ = s.DeleteUser(ctx, u.ID) })
		return u
	}
	target := makeUser(uuid.NewString()+"@example.com", true)
	other := makeUser(uuid.NewString()+"@example.com", true)
	makeGuest := func(amount int64, paid bool) *Donation {
		d, err := s.CreateDonation(ctx, NewDonation{AmountKopecks: amount})
		if err != nil {
			t.Fatal(err)
		}
		t.Cleanup(func() { _, _ = s.Pool.Exec(ctx, "DELETE FROM donations WHERE id=$1", d.ID) })
		if err = s.RegisterGuestDonation(ctx, d.ID, browser, target.Email); err != nil {
			t.Fatal(err)
		}
		if paid {
			now := time.Now()
			d, err = s.SetDonationStatus(ctx, d.ID, "succeeded", &now)
			if err != nil {
				t.Fatal(err)
			}
		}
		return d
	}
	d := makeGuest(10000, true)
	for _, proof := range [][]byte{nil, wrong} {
		if _, err := s.ClaimGuestDonation(ctx, target.ID, d.ID, proof, nil); !errors.Is(err, ErrGuestDonationProof) {
			t.Fatal("UUID or foreign cookie accepted", err)
		}
	}
	unpaid := makeGuest(50000, false)
	if _, err := s.ClaimGuestDonation(ctx, target.ID, unpaid.ID, browser, nil); !errors.Is(err, ErrGuestDonationProof) {
		t.Fatal("unpaid donation claimed", err)
	}
	if _, err := s.ClaimGuestDonation(ctx, target.ID, d.ID, browser, nil); err != nil {
		t.Fatal(err)
	}
	got, _ := s.UserByID(ctx, target.ID)
	if got.SupporterSince != nil {
		t.Fatal("100 rubles unlocked perks")
	}
	if _, err := s.ClaimGuestDonation(ctx, other.ID, d.ID, browser, nil); !errors.Is(err, ErrGuestDonationProof) {
		t.Fatal("second account claimed payment", err)
	}
	second := makeGuest(10000, true)
	if _, err := s.ClaimGuestDonation(ctx, target.ID, second.ID, browser, nil); err != nil {
		t.Fatal(err)
	}
	got, _ = s.UserByID(ctx, target.ID)
	if got.SupporterSince == nil {
		t.Fatal("two guest donations did not combine")
	}
	items, _ := s.OwnedGuestDonations(ctx, browser)
	for _, item := range items {
		if item.ID == d.ID || item.ID == second.ID {
			t.Fatal("claimed payment still available")
		}
	}
	cross := makeGuest(50000, true)
	_, link, _ := auth.NewSessionToken()
	if err := s.AddGuestDonationLink(ctx, cross.ID, link, target.Email); err != nil {
		t.Fatal(err)
	}
	if _, err := s.ClaimGuestDonation(ctx, other.ID, uuid.Nil, nil, link); !errors.Is(err, ErrGuestDonationEmail) {
		t.Fatal("foreign email claimed payment", err)
	}
	if _, err := s.ClaimGuestDonation(ctx, target.ID, uuid.Nil, nil, link); err != nil {
		t.Fatal(err)
	}
	if _, err := s.ClaimGuestDonation(ctx, target.ID, uuid.Nil, nil, link); !errors.Is(err, ErrGuestDonationProof) {
		t.Fatal("email link reused", err)
	}
	expired := makeGuest(20000, true)
	_, expiredLink, _ := auth.NewSessionToken()
	if err := s.AddGuestDonationLink(ctx, expired.ID, expiredLink, target.Email); err != nil {
		t.Fatal(err)
	}
	_, _ = s.Pool.Exec(ctx, "UPDATE donation_guest_claim_links SET expires_at=now()-interval '1 second' WHERE donation_id=$1", expired.ID)
	if _, err := s.ClaimGuestDonation(ctx, target.ID, uuid.Nil, nil, expiredLink); !errors.Is(err, ErrGuestDonationProof) {
		t.Fatal("expired link accepted", err)
	}
	_, _ = s.Pool.Exec(ctx, "UPDATE donation_guest_ownership SET expires_at=now()-interval '1 second' WHERE donation_id=$1", expired.ID)
	if _, err := s.ClaimGuestDonation(ctx, target.ID, expired.ID, browser, nil); !errors.Is(err, ErrGuestDonationProof) {
		t.Fatal("expired browser proof accepted", err)
	}
	if err := s.PurgeGuestDonationLinks(ctx); err != nil {
		t.Fatal(err)
	}
	var count int
	if err := s.Pool.QueryRow(ctx, "SELECT count(*) FROM donation_guest_ownership WHERE donation_id=$1", expired.ID).Scan(&count); err != nil || count != 0 {
		t.Fatal("expired recovery data retained", err)
	}
	if _, err := s.DonationByID(ctx, expired.ID); err != nil {
		t.Fatal("cleanup deleted payment", err)
	}
	for _, state := range []string{"pending", "canceled", "refunded"} {
		bad := makeGuest(20000, false)
		if _, err := s.SetDonationStatus(ctx, bad.ID, state, nil); err != nil {
			t.Fatal(err)
		}
		if _, err := s.ClaimGuestDonation(ctx, target.ID, bad.ID, browser, nil); !errors.Is(err, ErrGuestDonationProof) {
			t.Fatal("invalid state accepted", state, err)
		}
	}
	unverified := makeUser(uuid.NewString()+"@example.com", false)
	valid := makeGuest(20000, true)
	if _, err := s.ClaimGuestDonation(ctx, unverified.ID, valid.ID, browser, nil); !errors.Is(err, ErrGuestDonationEmail) {
		t.Fatal("unverified account accepted", err)
	}
	if _, err := s.ClaimGuestDonation(ctx, target.ID, valid.ID, browser, nil); err != nil {
		t.Fatal(err)
	}
	if err := s.DeleteUser(ctx, target.ID); err != nil {
		t.Fatal(err)
	}
	if _, err := s.ClaimGuestDonation(ctx, other.ID, valid.ID, browser, nil); !errors.Is(err, ErrGuestDonationProof) {
		t.Fatal("deleted account allowed reassignment", err)
	}
}

func TestGuestDonationParallelClaimOnlyOneAccount(t *testing.T) {
	s := testStore(t)
	ctx := context.Background()
	if _, err := s.Migrate(ctx); err != nil {
		t.Fatal(err)
	}
	_, browser, _ := auth.NewSessionToken()
	var users []*User
	for i := 0; i < 2; i++ {
		u, err := s.CreateUser(ctx, uuid.NewString()+"@example.com", "", "Друг", true)
		if err != nil {
			t.Fatal(err)
		}
		users = append(users, u)
		t.Cleanup(func() { _ = s.DeleteUser(ctx, u.ID) })
	}
	d, err := s.CreateDonation(ctx, NewDonation{AmountKopecks: 20000})
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { _, _ = s.Pool.Exec(ctx, "DELETE FROM donations WHERE id=$1", d.ID) })
	if err = s.RegisterGuestDonation(ctx, d.ID, browser, ""); err != nil {
		t.Fatal(err)
	}
	now := time.Now()
	if _, err = s.SetDonationStatus(ctx, d.ID, "succeeded", &now); err != nil {
		t.Fatal(err)
	}
	start := make(chan struct{})
	results := make(chan error, 2)
	var wg sync.WaitGroup
	for _, u := range users {
		wg.Add(1)
		go func() {
			defer wg.Done()
			<-start
			_, err := s.ClaimGuestDonation(ctx, u.ID, d.ID, browser, nil)
			results <- err
		}()
	}
	close(start)
	wg.Wait()
	close(results)
	success := 0
	for err := range results {
		if err == nil {
			success++
		} else if !errors.Is(err, ErrGuestDonationProof) {
			t.Fatal(err)
		}
	}
	if success != 1 {
		t.Fatalf("claims succeeded %d times", success)
	}
	badges := 0
	for _, u := range users {
		got, _ := s.UserByID(ctx, u.ID)
		if got.SupporterSince != nil {
			badges++
		}
	}
	if badges != 1 {
		t.Fatal("duplicate badge")
	}
}
