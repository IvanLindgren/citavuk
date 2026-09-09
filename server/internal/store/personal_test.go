package store

import (
	"context"
	"errors"
	"sync"
	"testing"

	"github.com/citavuk/server/internal/daily"
	"github.com/citavuk/server/internal/personal"
	"github.com/google/uuid"
)

func TestPersonalOwnershipRevisionsAndStudy(t *testing.T) {
	s := testStore(t)
	ctx := context.Background()
	if _, err := s.Migrate(ctx); err != nil {
		t.Fatal(err)
	}
	u, err := s.CreateUser(ctx, "personal-"+uuid.NewString()+"@example.test", "", "Тест", true)
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { _, _ = s.Pool.Exec(context.Background(), `DELETE FROM users WHERE id=$1`, u.ID) })
	p := personal.Profile{Level: "A2", Timezone: "Europe/Belgrade", Answers: map[string]string{}}
	for _, q := range personal.Questions {
		p.Answers[q.ID] = q.Options[0]
	}
	p.Answers["goal"] = "Работа\nКультура"
	id, err := s.CreatePersonal(ctx, u.ID, p)
	if err != nil {
		t.Fatal(err)
	}
	id2, err := s.CreatePersonal(ctx, u.ID, p)
	if err != nil || id2 != id {
		t.Fatal("двойная колода", id2, err)
	}
	history, err := s.PersonalHistory(ctx, u.ID)
	if err != nil || len(history) != 1 || history[0].ID != id {
		t.Fatal("архив владельца", history, err)
	}
	otherHistory, err := s.PersonalHistory(ctx, uuid.New())
	if err != nil || len(otherHistory) != 0 {
		t.Fatal("утечка архива", otherHistory, err)
	}
	if _, err = s.PersonalPlan(ctx, uuid.New(), id); !errors.Is(err, ErrPersonalMissing) {
		t.Fatal("чужая колода", err)
	}
	job, err := s.ClaimPersonal(ctx)
	if err != nil || job == nil || job.ID != id {
		t.Fatal("очередь", job, err)
	}
	if job.Profile.Answers["goal"] != p.Answers["goal"] {
		t.Fatal("множественный выбор потерян в очереди")
	}
	outline := make([]personal.Outline, 30)
	if err = s.RenewPersonalLease(ctx, job); err != nil {
		t.Fatal("аренда не продлена", err)
	}
	stale := *job
	stale.Token = uuid.New()
	if err = s.RenewPersonalLease(ctx, &stale); !errors.Is(err, ErrPersonalLease) {
		t.Fatal("чужая аренда продлена", err)
	}
	if _, err = s.Pool.Exec(ctx, `UPDATE personal_plans SET lease_until=now()-interval '1 second' WHERE id=$1`, id); err != nil {
		t.Fatal(err)
	}
	if err = s.RenewPersonalLease(ctx, job); !errors.Is(err, ErrPersonalLease) {
		t.Fatal("истёкшая аренда ожила", err)
	}
	job, err = s.ClaimPersonal(ctx)
	if err != nil || job == nil {
		t.Fatal("повторный захват", err)
	}
	for i := range outline {
		outline[i] = personal.Outline{Day: i + 1, Title: "Поздороваемся", Kind: "vocabulary", Goal: "Приветствие"}
	}
	if err = s.SavePersonalOutline(ctx, job, outline); err != nil {
		t.Fatal(err)
	}
	l := personal.Lesson{Title: "Приветствие", Kind: "vocabulary", Theme: "Общение", Text: "Zdravo!", Rules: []string{"Zdravo — привет"}, Scheme: personal.Scheme{Title: "Запомним", Columns: []string{"Слово", "Перевод"}, Rows: [][]string{{"zdravo", "привет"}}}}
	for range 4 {
		l.Exercises = append(l.Exercises, daily.Exercise{Kind: "fill", Question: "Впиши приветствие: ___", Answer: "zdravo"})
	}
	for _, day := range []int{1, 2} {
		if err = s.SavePersonalGenerated(ctx, job, day, l); err != nil {
			t.Fatal(err)
		}
	}
	if _, err = s.PersonalLesson(ctx, u.ID, id, 2); !errors.Is(err, ErrPersonalLocked) {
		t.Fatal("будущий урок", err)
	}
	if err = s.EditPersonal(ctx, u.ID, id, 1, 99, l); !errors.Is(err, ErrPersonalConflict) {
		t.Fatal("чужая ревизия", err)
	}
	if err = s.EditPersonal(ctx, u.ID, id, 1, 1, l); err != nil {
		t.Fatal(err)
	}
	if _, err = s.CompletePersonal(ctx, u.ID, id, 1, 1, []string{"zdravo", "zdravo", "zdravo", "zdravo"}); !errors.Is(err, ErrPersonalConflict) {
		t.Fatal("устаревшее прохождение", err)
	}
	var wg sync.WaitGroup
	results := make(chan PersonalResult, 2)
	errs := make(chan error, 2)
	for range 2 {
		wg.Add(1)
		go func() {
			defer wg.Done()
			r, e := s.CompletePersonal(ctx, u.ID, id, 1, 2, []string{"здраво", "zdravo", "zdravo", "zdravo"})
			results <- r
			errs <- e
		}()
	}
	wg.Wait()
	close(results)
	close(errs)
	for e := range errs {
		if e != nil {
			t.Fatal(e)
		}
	}
	newDays := 0
	for r := range results {
		if r.Study.NewDay {
			newDays++
		}
		if r.Score != 4 || r.Study.Freezes != 2 || r.Study.Current != 1 {
			t.Fatal(r)
		}
	}
	if newDays != 1 {
		t.Fatal("серия засчиталась дважды", newDays)
	}
	if _, err = s.GetStudy(ctx, u.ID, "America/New_York"); !errors.Is(err, ErrStudyTimezone) {
		t.Fatal("смена пояса после занятия", err)
	}
	if err = s.EditPersonal(ctx, u.ID, id, 1, 2, l); err != nil {
		t.Fatal(err)
	}
	var revision int
	if err = s.Pool.QueryRow(ctx, `SELECT completed_revision FROM personal_lessons WHERE plan_id=$1 AND day=1`, id).Scan(&revision); err != nil || revision != 2 {
		t.Fatal("потерян слепок результата", revision, err)
	}
	job.Token = uuid.New()
	if err = s.SavePersonalGenerated(ctx, job, 2, l); !errors.Is(err, ErrPersonalLease) {
		t.Fatal("устаревший worker", err)
	}
}
