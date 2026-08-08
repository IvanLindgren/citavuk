package store

import (
	"testing"
	"time"
)

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
