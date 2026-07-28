package store

import (
	"context"
	"testing"

	"github.com/google/uuid"
)

func TestUserByIdentityQualifiesJoinedColumns(t *testing.T) {
	s := testStore(t)
	ctx := context.Background()
	if _, err := s.Migrate(ctx); err != nil {
		t.Fatal(err)
	}

	email := "google-store-test-" + uuid.NewString() + "@example.test"
	user, err := s.CreateUser(ctx, email, "", "Google Test", true)
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() {
		_, _ = s.Pool.Exec(context.Background(), `DELETE FROM users WHERE id = $1`, user.ID)
	})

	providerUID := uuid.NewString()
	if err := s.LinkIdentity(ctx, user.ID, "google", providerUID, email); err != nil {
		t.Fatal(err)
	}

	found, err := s.UserByIdentity(ctx, "google", providerUID)
	if err != nil {
		t.Fatalf("UserByIdentity: %v", err)
	}
	if found.ID != user.ID || found.Email != email {
		t.Fatalf("найден другой пользователь: id=%s email=%q", found.ID, found.Email)
	}
}
