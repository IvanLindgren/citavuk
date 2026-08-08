package store

import (
	"context"
	"errors"
	"sort"
	"time"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"

	"github.com/citavuk/server/internal/roadmap"
)

// ProfileStats — единый профиль для web и Flutter. Все счётчики считаются на
// сервере по синхронизированным данным, поэтому два устройства видят одно и то
// же определение «выучено».
type ProfileStats struct {
	Words        ProfileWordStats    `json:"words"`
	Activity     []ProfileActivity   `json:"activity"`
	StreakDays   int                 `json:"streakDays"`
	Goal         ProfileGoalProgress `json:"goal"`
	Achievements []AchievementView   `json:"achievements"`
}

type ProfileWordStats struct {
	Added   int `json:"added"`
	Learned int `json:"learned"`
	Due     int `json:"due"`
}

type ProfileActivity struct {
	Day      string `json:"day"`
	Added    int    `json:"added"`
	Reviewed int    `json:"reviewed"`
}

type ProfileGoalProgress struct {
	Target string  `json:"target"`
	Done   int     `json:"done"`
	Total  int     `json:"total"`
	Ratio  float64 `json:"ratio"`
}

type AchievementView struct {
	Key         string     `json:"key"`
	Title       string     `json:"title"`
	Description string     `json:"description"`
	Icon        string     `json:"icon"`
	UnlockedAt  *time.Time `json:"unlockedAt,omitempty"`
}

type achievementCounters struct {
	Words, Learned, Reviewed, Roadmap, PerfectTrainer, Books int
}

type achievementDefinition struct {
	Key, Title, Description, Icon string
	Unlocked                      func(achievementCounters) bool
}

var achievementDefinitions = []achievementDefinition{
	{"first_word", "Первое слово", "Добавить первое слово в личный словарь.", "bookmark", func(c achievementCounters) bool { return c.Words >= 1 }},
	{"words_25", "Собиратель слов", "Сохранить 25 сербских слов.", "library", func(c achievementCounters) bool { return c.Words >= 25 }},
	{"words_100", "Сто слов ближе", "Сохранить 100 сербских слов.", "books", func(c achievementCounters) bool { return c.Words >= 100 }},
	{"first_review", "Начало повторения", "Повторить первую карточку.", "repeat", func(c achievementCounters) bool { return c.Reviewed >= 1 }},
	{"learned_10", "Первые десять", "Выучить 10 слов по интервальным повторениям.", "sparkles", func(c achievementCounters) bool { return c.Learned >= 10 }},
	{"learned_50", "Крепкий словарь", "Выучить 50 слов по интервальным повторениям.", "medal", func(c achievementCounters) bool { return c.Learned >= 50 }},
	{"first_book", "Открытая книга", "Добавить первую книгу в библиотеку.", "book", func(c achievementCounters) bool { return c.Books >= 1 }},
	{"roadmap_first", "Первый шаг", "Закрыть первый пункт дорожной карты.", "route", func(c achievementCounters) bool { return c.Roadmap >= 1 }},
	{"perfect_trainer", "Без единой ошибки", "Полностью правильно пройти тему Тренажёрки.", "trophy", func(c achievementCounters) bool { return c.PerfectTrainer >= 1 }},
}

// EvaluateAchievements открывает новые достижения и создаёт обычные серверные
// уведомления. Детерминированный id не допускает дублей при двух одновременных
// синхронизациях.
func (s *Store) EvaluateAchievements(ctx context.Context, userID uuid.UUID) ([]string, error) {
	counters, err := s.achievementCounters(ctx, userID)
	if err != nil {
		return nil, err
	}
	tx, err := s.Pool.Begin(ctx)
	if err != nil {
		return nil, err
	}
	defer tx.Rollback(ctx) //nolint:errcheck

	newKeys := make([]string, 0)
	for _, definition := range achievementDefinitions {
		if !definition.Unlocked(counters) {
			continue
		}
		var key string
		err := tx.QueryRow(ctx, `
			INSERT INTO user_achievements (user_id,key) VALUES ($1,$2)
			ON CONFLICT DO NOTHING RETURNING key`, userID, definition.Key).Scan(&key)
		if errors.Is(err, pgx.ErrNoRows) {
			// Отсутствие RETURNING означает, что достижение уже было открыто.
			continue
		}
		if err != nil {
			return nil, err
		}
		newKeys = append(newKeys, key)
		notificationID := uuid.NewSHA1(userID, []byte("achievement:"+key))
		if _, err := tx.Exec(ctx, `
			INSERT INTO user_notifications (id,user_id,kind,title,body,target_url)
			VALUES ($1,$2,'achievement',$3,$4,'/account')
			ON CONFLICT (id) DO NOTHING`, notificationID, userID,
			"Новое достижение: "+definition.Title, definition.Description); err != nil {
			return nil, err
		}
	}
	if err := tx.Commit(ctx); err != nil {
		return nil, err
	}
	return newKeys, nil
}

func (s *Store) achievementCounters(ctx context.Context, userID uuid.UUID) (achievementCounters, error) {
	var counters achievementCounters
	err := s.Pool.QueryRow(ctx, `
		SELECT
		  (SELECT count(*) FROM vocabulary WHERE user_id=$1 AND NOT deleted),
		  (SELECT count(*) FROM reviews r JOIN vocabulary v ON v.id=r.vocab_id
		    WHERE r.user_id=$1 AND NOT r.deleted AND NOT v.deleted
		      AND r.reps>=3 AND r.interval_days>=7),
		  (SELECT count(*) FROM reviews WHERE user_id=$1 AND NOT deleted AND reps>0),
		  (SELECT count(*) FROM roadmap_completions WHERE user_id=$1),
		  (SELECT count(*) FROM roadmap_completions
		    WHERE user_id=$1 AND category='grammar' AND score>=1 AND source='trainer'),
		  (SELECT count(*) FROM books WHERE user_id=$1 AND NOT deleted)`, userID).Scan(
		&counters.Words, &counters.Learned, &counters.Reviewed,
		&counters.Roadmap, &counters.PerfectTrainer, &counters.Books,
	)
	return counters, err
}

func (s *Store) GetProfileStats(ctx context.Context, userID uuid.UUID) (ProfileStats, error) {
	if _, err := s.EvaluateAchievements(ctx, userID); err != nil {
		return ProfileStats{}, err
	}
	counters, err := s.achievementCounters(ctx, userID)
	if err != nil {
		return ProfileStats{}, err
	}
	stats := ProfileStats{
		Words:    ProfileWordStats{Added: counters.Words, Learned: counters.Learned},
		Activity: make([]ProfileActivity, 0, 14),
	}
	if err := s.Pool.QueryRow(ctx, `
		SELECT count(*) FROM reviews r JOIN vocabulary v ON v.id=r.vocab_id
		 WHERE r.user_id=$1 AND NOT r.deleted AND NOT v.deleted
		   AND r.due_at <= $2`, userID, time.Now().UnixMilli()).Scan(&stats.Words.Due); err != nil {
		return ProfileStats{}, err
	}

	rows, err := s.Pool.Query(ctx, `
		WITH days AS (
		  SELECT generate_series(current_date-13,current_date,'1 day')::date AS day
		), added AS (
		  SELECT created_at::date AS day,count(*) AS value FROM vocabulary
		   WHERE user_id=$1 AND NOT deleted AND created_at>=current_date-13
		   GROUP BY created_at::date
		), reviewed AS (
		  SELECT (to_timestamp(last_reviewed/1000.0) AT TIME ZONE 'UTC')::date AS day,
		         count(*) AS value FROM reviews
		   WHERE user_id=$1 AND NOT deleted AND last_reviewed IS NOT NULL
		     AND last_reviewed >= extract(epoch FROM current_date-13)*1000
		   GROUP BY 1
		)
		SELECT to_char(days.day,'YYYY-MM-DD'),coalesce(added.value,0),coalesce(reviewed.value,0)
		  FROM days LEFT JOIN added USING(day) LEFT JOIN reviewed USING(day)
		 ORDER BY days.day`, userID)
	if err != nil {
		return ProfileStats{}, err
	}
	for rows.Next() {
		var point ProfileActivity
		if err := rows.Scan(&point.Day, &point.Added, &point.Reviewed); err != nil {
			rows.Close()
			return ProfileStats{}, err
		}
		stats.Activity = append(stats.Activity, point)
	}
	rows.Close()

	var reviewDays []time.Time
	dayRows, err := s.Pool.Query(ctx, `
		SELECT DISTINCT (to_timestamp(last_reviewed/1000.0) AT TIME ZONE 'UTC')::date
		  FROM reviews WHERE user_id=$1 AND NOT deleted AND last_reviewed IS NOT NULL
		 ORDER BY 1 DESC LIMIT 366`, userID)
	if err != nil {
		return ProfileStats{}, err
	}
	for dayRows.Next() {
		var day time.Time
		if err := dayRows.Scan(&day); err != nil {
			dayRows.Close()
			return ProfileStats{}, err
		}
		reviewDays = append(reviewDays, day)
	}
	dayRows.Close()
	stats.StreakDays = currentStreak(reviewDays, time.Now().UTC())

	target, err := s.GetRoadmapTarget(ctx, userID)
	if err != nil {
		return ProfileStats{}, err
	}
	stats.Goal.Target = target
	if target != "" {
		overview, err := s.RoadmapOverview(ctx, userID)
		if err != nil {
			return ProfileStats{}, err
		}
		for _, category := range roadmap.Categories {
			progress := overview[target][category]
			if progress.Total == 0 || roadmap.Planned(category) {
				continue
			}
			stats.Goal.Done += progress.Done
			stats.Goal.Total += progress.Total
		}
		if stats.Goal.Total > 0 {
			stats.Goal.Ratio = float64(stats.Goal.Done) / float64(stats.Goal.Total)
		}
	}

	unlocked := map[string]time.Time{}
	achievementRows, err := s.Pool.Query(ctx, `
		SELECT key,unlocked_at FROM user_achievements WHERE user_id=$1`, userID)
	if err != nil {
		return ProfileStats{}, err
	}
	for achievementRows.Next() {
		var key string
		var at time.Time
		if err := achievementRows.Scan(&key, &at); err != nil {
			achievementRows.Close()
			return ProfileStats{}, err
		}
		unlocked[key] = at
	}
	achievementRows.Close()
	for _, definition := range achievementDefinitions {
		view := AchievementView{Key: definition.Key, Title: definition.Title,
			Description: definition.Description, Icon: definition.Icon}
		if at, ok := unlocked[definition.Key]; ok {
			copy := at
			view.UnlockedAt = &copy
		}
		stats.Achievements = append(stats.Achievements, view)
	}
	return stats, nil
}

func currentStreak(days []time.Time, now time.Time) int {
	if len(days) == 0 {
		return 0
	}
	unique := make(map[string]time.Time, len(days))
	for _, day := range days {
		normalized := time.Date(day.Year(), day.Month(), day.Day(), 0, 0, 0, 0, time.UTC)
		unique[normalized.Format("2006-01-02")] = normalized
	}
	ordered := make([]time.Time, 0, len(unique))
	for _, day := range unique {
		ordered = append(ordered, day)
	}
	sort.Slice(ordered, func(i, j int) bool { return ordered[i].After(ordered[j]) })
	today := time.Date(now.Year(), now.Month(), now.Day(), 0, 0, 0, 0, time.UTC)
	// Серия не сгорает утром до первой карточки: вчера считается допустимым
	// концом, сегодня — естественным продолжением.
	if gap := int(today.Sub(ordered[0]).Hours() / 24); gap > 1 {
		return 0
	}
	streak := 1
	for i := 1; i < len(ordered); i++ {
		if int(ordered[i-1].Sub(ordered[i]).Hours()/24) != 1 {
			break
		}
		streak++
	}
	return streak
}
