package api

import (
	"testing"
	"time"

	"github.com/google/uuid"
)

func TestRepeatDelayGrowsWithScore(t *testing.T) {
	cases := []struct {
		score int
		want  time.Duration
	}{
		{0, 24 * time.Hour},
		{59, 24 * time.Hour},
		{60, 3 * 24 * time.Hour},
		{79, 3 * 24 * time.Hour},
		{80, 7 * 24 * time.Hour},
		{99, 7 * 24 * time.Hour},
		{100, 21 * 24 * time.Hour},
	}
	for _, c := range cases {
		if got := repeatDelay(c.score); got != c.want {
			t.Fatalf("результат %d%%: ожидали %v, получили %v", c.score, c.want, got)
		}
	}
}

func TestSortRepeatPutsWorstOverdueFirst(t *testing.T) {
	now := time.Now()
	items := []repeatItem{
		{QuizID: uuid.New(), Title: "не пора", Score: 40, Due: now.Add(time.Hour)},
		{QuizID: uuid.New(), Title: "просрочен хорошо", Score: 90, Due: now.Add(-time.Hour), Overdue: true},
		{QuizID: uuid.New(), Title: "просрочен плохо", Score: 30, Due: now.Add(-time.Hour), Overdue: true},
	}

	sortRepeat(items)

	if items[0].Title != "просрочен плохо" {
		t.Fatalf("первым должен идти худший просроченный, а идёт %q", items[0].Title)
	}
	if items[2].Title != "не пора" {
		t.Fatalf("непросроченный должен быть последним, а он %q", items[2].Title)
	}
}
