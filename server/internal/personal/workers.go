package personal

import (
	"context"
	"errors"
	"fmt"
	"sync"
)

// GenerateDays ограничивает нагрузку на шлюз тремя запросами. Невалидный
// урок не блокирует остальные дни; следующая попытка заберёт только недостающие.
// Сбой сети/хранилища отменяет партию, чтобы не отправлять заведомо бесполезные запросы.
func GenerateDays(ctx context.Context, days []int, generate func(context.Context, int) error) error {
	ctx, cancel := context.WithCancelCause(ctx)
	defer cancel(nil)
	jobs := make(chan int, len(days))
	for _, day := range days {
		jobs <- day
	}
	close(jobs)
	failures := make(chan error, len(days))
	var workers sync.WaitGroup
	for range min(3, len(days)) {
		workers.Add(1)
		go func() {
			defer workers.Done()
			for day := range jobs {
				if ctx.Err() != nil {
					return
				}
				if err := generate(ctx, day); err != nil {
					failure := fmt.Errorf("day %d: %w", day, err)
					failures <- failure
					if !errors.Is(err, ErrInvalid) {
						cancel(failure)
						return
					}
				}
			}
		}()
	}
	workers.Wait()
	close(failures)
	if cause := context.Cause(ctx); cause != nil {
		return cause
	}
	var errs []error
	for err := range failures {
		errs = append(errs, err)
	}
	return errors.Join(errs...)
}
