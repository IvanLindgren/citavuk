package study

import (
	"testing"
	"time"
)

func TestTwoFreezesAndIdempotency(t *testing.T) {
	s := State{Timezone: "Europe/Belgrade", Freezes: InitialFreezes}
	s, _, first, err := Advance(s, "2026-09-01", true)
	if err != nil || !first || s.Current != 1 {
		t.Fatalf("первый день: %+v %v", s, err)
	}
	s, days, first, err := Advance(s, "2026-09-04", true)
	if err != nil || !first || s.Freezes != 0 || s.Current != 2 || s.ActiveDays != 2 || len(days) != 3 {
		t.Fatalf("две заморозки: %+v %+v %v", s, days, err)
	}
	again, days, first, err := Advance(s, "2026-09-04", true)
	if err != nil || first || len(days) != 0 || again != s {
		t.Fatalf("повтор: %+v %+v %v", again, days, err)
	}
	s, _, _, _ = Advance(s, "2026-09-06", true)
	if s.Current != 1 || s.Longest != 2 || s.Freezes != 0 {
		t.Fatalf("запас исчерпан: %+v", s)
	}
}

func TestReadingDoesNotCreditAndTodayDoesNotFreeze(t *testing.T) {
	s := State{Timezone: "UTC", Freezes: 2}
	s, _, _, _ = Advance(s, "2026-09-01", false)
	if s.LastDay != "" || s.ActiveDays != 0 || s.Freezes != 2 {
		t.Fatal(s)
	}
	s, _, _, _ = Advance(s, "2026-09-01", true)
	s, days, _, _ := Advance(s, "2026-09-02", false)
	if s.TodayActive || s.Freezes != 2 || len(days) != 0 || s.Current != 1 {
		t.Fatal(s, days)
	}
	s, days, _, _ = Advance(s, "2026-09-03", false)
	if s.Freezes != 1 || len(days) != 1 || days[0].Date != "2026-09-02" {
		t.Fatal(s, days)
	}
	again, days, _, _ := Advance(s, "2026-09-03", false)
	if again != s || len(days) != 0 {
		t.Fatal(again, days)
	}
}

func TestCalendarDSTAndLargeGap(t *testing.T) {
	s := State{Timezone: "Europe/Belgrade", Freezes: 2, Current: 8, Longest: 8, LastDay: "2026-03-28"}
	s, days, _, err := Advance(s, "2026-03-30", true)
	if err != nil || s.Current != 9 || s.Freezes != 1 || len(days) != 2 {
		t.Fatal(s, days, err)
	}
	s, days, _, err = Advance(s, "2036-03-30", false)
	if err != nil || s.Current != 0 || s.Freezes != 0 || len(days) != 1 {
		t.Fatal(s, days, err)
	}
	date, err := Date(time.Date(2026, 9, 1, 22, 30, 0, 0, time.UTC), "Europe/Belgrade")
	if err != nil || date != "2026-09-02" {
		t.Fatal(date, err)
	}
	if _, _, _, err = Advance(s, "2026-01-01", true); err == nil {
		t.Fatal("принята дата из прошлого")
	}
}
