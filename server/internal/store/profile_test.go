package store

import (
	"context"
	"testing"
	"time"

	"github.com/google/uuid"
)

func TestProfileStatsRunsOnMigratedDatabase(t *testing.T) {
	s := testStore(t)
	ctx := context.Background()
	if _, err := s.Migrate(ctx); err != nil {
		t.Fatal(err)
	}
	user, err := s.CreateUser(ctx,
		"profile-stats-"+uuid.NewString()+"@example.test", "", "Profile Stats", true)
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() {
		_, _ = s.Pool.Exec(context.Background(), `DELETE FROM users WHERE id=$1`, user.ID)
	})

	stats, err := s.GetProfileStats(ctx, user.ID)
	if err != nil {
		t.Fatalf("GetProfileStats: %v", err)
	}
	if len(stats.Activity) != 14 {
		t.Fatalf("activity days = %d, want 14", len(stats.Activity))
	}
	if len(stats.Achievements) == 0 {
		t.Fatal("achievement catalogue is empty")
	}
}

func TestCurrentStreakAllowsTodayOrYesterday(t *testing.T) {
	now := time.Date(2026, 8, 9, 14, 0, 0, 0, time.UTC)
	for _, test := range []struct {
		name string
		days []time.Time
		want int
	}{
		{"сегодня", []time.Time{now, now.AddDate(0, 0, -1), now.AddDate(0, 0, -2)}, 3},
		{"ещё не занимался сегодня", []time.Time{now.AddDate(0, 0, -1), now.AddDate(0, 0, -2)}, 2},
		{"серия прервалась", []time.Time{now.AddDate(0, 0, -2)}, 0},
		{"дубль дня не считается", []time.Time{now, now.Add(2 * time.Hour), now.AddDate(0, 0, -1)}, 2},
	} {
		t.Run(test.name, func(t *testing.T) {
			if got := currentStreak(test.days, now); got != test.want {
				t.Fatalf("currentStreak()=%d, ожидалось %d", got, test.want)
			}
		})
	}
}
