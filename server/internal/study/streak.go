// Package study считает календарную серию, общую для всех устройств.
package study

import (
	"fmt"
	"time"
	_ "time/tzdata"
)

const InitialFreezes = 2

type State struct {
	Timezone    string `json:"timezone"`
	Current     int    `json:"current"`
	Longest     int    `json:"longest"`
	Freezes     int    `json:"freezes"`
	ActiveDays  int    `json:"activeDays"`
	LastDay     string `json:"lastDay,omitempty"`
	TodayActive bool   `json:"todayActive"`
}

type Day struct {
	Date string `json:"date"`
	Kind string `json:"kind"` // active либо frozen; заморозка не является занятием.
}

func ValidTimezone(zone string) bool {
	if zone == "" || zone == "Local" || len(zone) > 80 {
		return false
	}
	_, err := time.LoadLocation(zone)
	return err == nil
}

func Date(now time.Time, zone string) (string, error) {
	if !ValidTimezone(zone) {
		return "", fmt.Errorf("неизвестный часовой пояс")
	}
	loc, _ := time.LoadLocation(zone)
	return now.In(loc).Format(time.DateOnly), nil
}

// Advance закрывает только прошедшие сутки. Сегодняшний день никогда не
// замораживается заранее. После большого перерыва цикл ограничен запасом, а
// не числом пропущенных лет. Все операции выполняются внутри блокировки БД.
func Advance(s State, today string, credit bool) (State, []Day, bool, error) {
	d, err := time.Parse(time.DateOnly, today)
	if err != nil || s.Freezes < 0 || s.Freezes > InitialFreezes {
		return s, nil, false, fmt.Errorf("некорректная серия")
	}
	changes := []Day{}
	if s.LastDay != "" {
		last, parseErr := time.Parse(time.DateOnly, s.LastDay)
		if parseErr != nil || last.After(d) {
			return s, nil, false, fmt.Errorf("дата серии из будущего")
		}
		if last.Equal(d) {
			return s, changes, false, nil
		}
		s.TodayActive = false
		for missing := last.AddDate(0, 0, 1); missing.Before(d); missing = missing.AddDate(0, 0, 1) {
			if s.Current == 0 || s.Freezes == 0 {
				s.Current = 0
				s.LastDay = d.AddDate(0, 0, -1).Format(time.DateOnly)
				break
			}
			s.Freezes--
			s.LastDay = missing.Format(time.DateOnly)
			changes = append(changes, Day{Date: s.LastDay, Kind: "frozen"})
		}
	}
	if !credit {
		return s, changes, false, nil
	}
	s.Current++
	s.ActiveDays++
	if s.Current > s.Longest {
		s.Longest = s.Current
	}
	s.LastDay, s.TodayActive = today, true
	changes = append(changes, Day{Date: today, Kind: "active"})
	return s, changes, true, nil
}
