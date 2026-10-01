package store

import (
	"context"
	"github.com/google/uuid"
	"testing"
	"time"
)

func TestBookPositionOffsetAndOldClients(t *testing.T) {
	s := testStore(t)
	u := newTestUser(t, s)
	ctx := context.Background()
	offset := 4200
	book := Book{ID: uuid.New(), Title: "Глава одним абзацем", ParaCount: 2, LastPara: 0, LastOffset: &offset, UpdatedAt: time.Now().UTC()}
	push := func() {
		t.Helper()
		if _, err := s.Push(ctx, u.ID, &Changes{Books: []Book{book}}); err != nil {
			t.Fatal(err)
		}
	}
	check := func(want int) {
		t.Helper()
		got, err := s.Pull(ctx, u.ID, 0, 500)
		if err != nil {
			t.Fatal(err)
		}
		if len(got.Books) != 1 || got.Books[0].LastOffset == nil || *got.Books[0].LastOffset != want {
			t.Fatalf("reading offset lost: %+v", got.Books)
		}
	}
	push()
	check(4200)
	// Старый клиент переименовал книгу, но не менял абзац: точное место остаётся.
	book.LastOffset = nil
	book.Title = "Другое имя"
	book.UpdatedAt = book.UpdatedAt.Add(time.Second)
	push()
	check(4200)
	// Старый клиент действительно перешёл к другому абзацу.
	book.LastPara = 1
	book.UpdatedAt = book.UpdatedAt.Add(time.Second)
	push()
	check(0)
	offset = 37
	book.LastOffset = &offset
	book.UpdatedAt = book.UpdatedAt.Add(time.Second)
	push()
	check(37)
	book.UpdatedAt = book.UpdatedAt.Add(-time.Hour)
	offset = 100
	push()
	check(37)
}
