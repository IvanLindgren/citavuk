package store

import (
	"context"
	"fmt"
	"sync"
	"testing"
	"time"

	"github.com/citavuk/server/internal/personal"
	"github.com/google/uuid"
)

// Создание колоды и зачёт упражнений с разных устройств не должны
// взаимно блокироваться на внешнем ключе users.
func TestStudyConcurrentWithPersonalCreation(t *testing.T) {
	s := testStore(t)
	ctx, cancel := context.WithTimeout(context.Background(), 20*time.Second)
	defer cancel()
	if _, err := s.Migrate(ctx); err != nil {
		t.Fatal(err)
	}
	u, err := s.CreateUser(ctx, "streak-race-"+uuid.NewString()+"@example.test", "", "Тест", true)
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { _, _ = s.Pool.Exec(context.Background(), `DELETE FROM users WHERE id=$1`, u.ID) })
	profile := personal.Profile{Level: "A2", Timezone: "UTC", Answers: map[string]string{}}
	for _, q := range personal.Questions {
		profile.Answers[q.ID] = q.Options[0]
	}
	start := make(chan struct{})
	errs := make(chan error, 24)
	var wg sync.WaitGroup
	for i := 0; i < 24; i++ {
		wg.Add(1)
		go func(i int) {
			defer wg.Done()
			<-start
			if i%2 == 0 {
				_, e := s.CreatePersonal(ctx, u.ID, profile)
				errs <- e
			} else {
				_, e := s.RecordStudy(ctx, u.ID, fmt.Sprintf("test:%d", i))
				errs <- e
			}
		}(i)
	}
	close(start)
	wg.Wait()
	close(errs)
	for e := range errs {
		if e != nil {
			t.Error(e)
		}
	}
	view, err := s.GetStudy(ctx, u.ID, "")
	if err != nil {
		t.Fatal(err)
	}
	if view.ActiveDays != 1 {
		t.Fatalf("повторный зачёт дня: %d", view.ActiveDays)
	}
}
