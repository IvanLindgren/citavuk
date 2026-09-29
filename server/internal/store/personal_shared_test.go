package store

import (
	"context"
	"testing"

	"github.com/citavuk/server/internal/personal"
	"github.com/google/uuid"
)

func TestSharedPersonalPoolFillsAndRepairsPlan(t *testing.T) {
	s := testStore(t)
	ctx := context.Background()
	if _, err := s.Migrate(ctx); err != nil {
		t.Fatal(err)
	}
	if _, err := s.SeedPersonalSharedFromRoadmap(ctx); err != nil {
		t.Fatal(err)
	}
	for _, level := range []string{"A1", "A2", "B1", "B2", "C1", "C2"} {
		available, err := s.SharedPersonalAvailable(ctx, level)
		if err != nil || !available {
			t.Fatalf("уровень %s: pool available=%v err=%v", level, available, err)
		}
	}
	u, err := s.CreateUser(ctx, "shared-"+uuid.NewString()+"@example.test", "", "Тест", true)
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { _, _ = s.Pool.Exec(context.Background(), `DELETE FROM users WHERE id=$1`, u.ID) })
	p := personal.Profile{Level: "A1", Timezone: "Europe/Belgrade", Answers: map[string]string{}}
	for _, q := range personal.Questions {
		p.Answers[q.ID] = q.Options[0]
	}
	id, err := s.CreatePersonal(ctx, u.ID, p)
	if err != nil {
		t.Fatal(err)
	}
	job, err := s.ClaimPersonal(ctx)
	if err != nil || job == nil || job.ID != id {
		t.Fatalf("claim: %v, %+v", err, job)
	}
	if err = s.FillPersonalFromShared(ctx, job); err != nil {
		t.Fatal(err)
	}
	if err = s.FinishPersonalJob(ctx, job, false); err != nil {
		t.Fatal(err)
	}
	plan, err := s.PersonalPlan(ctx, u.ID, id)
	if err != nil || plan.Status != "ready" || len(plan.Lessons) != 30 || len(plan.Outline) != 30 {
		t.Fatalf("plan: %+v err=%v", plan, err)
	}
	var count, groups int
	if err = s.Pool.QueryRow(ctx, `SELECT count(*),count(DISTINCT p.source_group)
 FROM personal_lessons l JOIN personal_shared_lessons p ON p.id=l.shared_lesson_id
 WHERE l.plan_id=$1`, id).Scan(&count, &groups); err != nil || count != 30 || groups != 30 {
		t.Fatalf("cards=%d unique=%d err=%v", count, groups, err)
	}
	first, err := s.PersonalLesson(ctx, u.ID, id, 1)
	if err != nil {
		t.Fatal(err)
	}
	curated := first.Content
	curated.Title = "Проверенная новая карта"
	entry := SharedPersonalImport{Key: "verified-a1-card-01", Level: "A1", Theme: "Семья", Content: curated}
	if _, err = s.ImportSharedPersonalBatch(ctx, []SharedPersonalImport{entry}, false); err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() {
		_, _ = s.Pool.Exec(context.Background(), `DELETE FROM personal_shared_lessons WHERE source_key='curated-v1:verified-a1-card-01'`)
	})
	var active bool
	if err = s.Pool.QueryRow(ctx, `SELECT active FROM personal_shared_lessons WHERE source_key='curated-v1:verified-a1-card-01'`).Scan(&active); err != nil || active {
		t.Fatalf("черновик доступен читателю: active=%v err=%v", active, err)
	}
	if _, err = s.ImportSharedPersonalBatch(ctx, []SharedPersonalImport{entry}, true); err != nil {
		t.Fatal(err)
	}
	if err = s.Pool.QueryRow(ctx, `SELECT active FROM personal_shared_lessons WHERE source_key='curated-v1:verified-a1-card-01'`).Scan(&active); err != nil || !active {
		t.Fatalf("проверенная карта не активирована: active=%v err=%v", active, err)
	}
	if err = s.EditPersonal(ctx, u.ID, id, 1, first.Revision, first.Content); err != nil {
		t.Fatal(err)
	}
	if _, err = s.Pool.Exec(ctx, `DELETE FROM personal_lessons WHERE plan_id=$1 AND day=30`, id); err != nil {
		t.Fatal(err)
	}
	if _, err = s.Pool.Exec(ctx, `UPDATE personal_plans SET status='error',retries=3,error='old failure' WHERE id=$1`, id); err != nil {
		t.Fatal(err)
	}
	requeued, err := s.RequeueIncompletePersonal(ctx)
	if err != nil || requeued == 0 {
		t.Fatalf("repair queue: %d %v", requeued, err)
	}
	job, err = s.ClaimPersonal(ctx)
	if err != nil || job == nil || job.ID != id {
		t.Fatalf("reclaim: %v, %+v", err, job)
	}
	if err = s.FillPersonalFromShared(ctx, job); err != nil {
		t.Fatal(err)
	}
	if err = s.FinishPersonalJob(ctx, job, false); err != nil {
		t.Fatal(err)
	}
	plan, err = s.PersonalPlan(ctx, u.ID, id)
	if err != nil || plan.Status != "ready" || len(plan.Lessons) != 30 || !plan.Lessons[0].Edited {
		t.Fatalf("repaired plan: %+v err=%v", plan, err)
	}
}
