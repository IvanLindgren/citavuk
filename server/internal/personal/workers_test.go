package personal

import (
	"context"
	"errors"
	"sync/atomic"
	"testing"
)

func TestGenerateDaysContinuesAfterInvalidLesson(t *testing.T) {
	var visited atomic.Int32
	err := GenerateDays(context.Background(), []int{1, 2, 3, 4, 5}, func(_ context.Context, day int) error {
		visited.Add(1)
		if day == 2 {
			return ErrInvalid
		}
		return nil
	})
	if visited.Load() != 5 || !errors.Is(err, ErrInvalid) {
		t.Fatal(visited.Load(), err)
	}
}

func TestGenerateDaysBoundsConcurrencyAndCancels(t *testing.T) {
	ctx, cancel := context.WithCancel(context.Background())
	defer cancel()
	started := make(chan struct{}, 10)
	done := make(chan error, 1)
	go func() {
		done <- GenerateDays(ctx, []int{1, 2, 3, 4, 5, 6}, func(ctx context.Context, _ int) error {
			started <- struct{}{}
			<-ctx.Done()
			return ctx.Err()
		})
	}()
	for range 3 {
		<-started
	}
	select {
	case <-started:
		t.Fatal("more than three concurrent requests")
	default:
	}
	cancel()
	if err := <-done; !errors.Is(err, context.Canceled) {
		t.Fatal(err)
	}
}
