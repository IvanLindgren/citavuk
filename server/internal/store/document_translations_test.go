package store

import (
	"context"
	"errors"
	"testing"

	"github.com/google/uuid"
)

// Суточный предел — единственная защита внешнего переводчика от одного
// усердного человека, и одновременно самое обидное место для ошибки: потерянный
// впустую день никак не восполнить, а человек видит только «не удалось
// перевести».

func translationTestUser(t *testing.T, s *Store) uuid.UUID {
	t.Helper()
	ctx := context.Background()
	email := "doc-translation-test-" + uuid.NewString() + "@example.test"
	user, err := s.CreateUser(ctx, email, "", "Translation Test", true)
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() {
		_, _ = s.Pool.Exec(context.Background(), `DELETE FROM users WHERE id = $1`, user.ID)
	})
	return user.ID
}

// Заявка, по которой ничего не переведено, предел не тратит.
//
// Так выглядит отказ переводчика на первом куске: заявка заведена, аванс за
// кусок возвращён, переведено ноль знаков. Раньше такая заявка съедала день.
func TestFailedTranslationDoesNotSpendLimit(t *testing.T) {
	s := testStore(t)
	ctx := context.Background()
	if _, err := s.Migrate(ctx); err != nil {
		t.Fatal(err)
	}
	user := translationTestUser(t, s)

	first, err := s.StartDocumentTranslation(ctx, user, "Книга", "en", "deepl", 5_000, 1)
	if err != nil {
		t.Fatalf("первая заявка отклонена: %v", err)
	}

	// Кусок засчитан авансом и тут же возвращён: переводчик отказал.
	if _, err := s.AddTranslatedChars(ctx, first.ID, 5_000); err != nil {
		t.Fatal(err)
	}
	if err := s.ReleaseTranslatedChars(ctx, first.ID, 5_000); err != nil {
		t.Fatal(err)
	}

	if _, err := s.StartDocumentTranslation(ctx, user, "Книга", "en", "deepl", 5_000, 1); err != nil {
		t.Fatalf("повтор после неудачи отклонён: %v", err)
	}

	next, err := s.NextDocumentTranslationAt(ctx, user, 1)
	if err != nil {
		t.Fatal(err)
	}
	if !next.IsZero() {
		t.Errorf("предел показан занятым до %v, хотя не переведено ни знака", next)
	}
}

// Успешный перевод предел тратит — иначе ограничения нет вовсе.
func TestSuccessfulTranslationSpendsLimit(t *testing.T) {
	s := testStore(t)
	ctx := context.Background()
	if _, err := s.Migrate(ctx); err != nil {
		t.Fatal(err)
	}
	user := translationTestUser(t, s)

	job, err := s.StartDocumentTranslation(ctx, user, "Книга", "en", "google", 40_000, 1)
	if err != nil {
		t.Fatalf("заявка отклонена: %v", err)
	}
	if _, err := s.AddTranslatedChars(ctx, job.ID, 40_000); err != nil {
		t.Fatal(err)
	}

	if _, err := s.StartDocumentTranslation(
		ctx, user, "Вторая книга", "en", "google", 40_000, 1,
	); !errors.Is(err, ErrTranslationLimit) {
		t.Errorf("вторая заявка за сутки дала %v, ожидался ErrTranslationLimit", err)
	}

	next, err := s.NextDocumentTranslationAt(ctx, user, 1)
	if err != nil {
		t.Fatal(err)
	}
	if next.IsZero() {
		t.Error("предел израсходован, но время следующего перевода не названо")
	}
}

// Оборванный на середине перевод предел всё-таки тратит: квота внешнего
// переводчика на переведённые куски уже израсходована, и повторять их
// бесконечно нельзя.
func TestPartialTranslationStillSpendsLimit(t *testing.T) {
	s := testStore(t)
	ctx := context.Background()
	if _, err := s.Migrate(ctx); err != nil {
		t.Fatal(err)
	}
	user := translationTestUser(t, s)

	job, err := s.StartDocumentTranslation(ctx, user, "Книга", "en", "google", 40_000, 1)
	if err != nil {
		t.Fatalf("заявка отклонена: %v", err)
	}
	// Первый кусок прошёл, второй — нет.
	if _, err := s.AddTranslatedChars(ctx, job.ID, 8_000); err != nil {
		t.Fatal(err)
	}
	if _, err := s.AddTranslatedChars(ctx, job.ID, 8_000); err != nil {
		t.Fatal(err)
	}
	if err := s.ReleaseTranslatedChars(ctx, job.ID, 8_000); err != nil {
		t.Fatal(err)
	}

	if _, err := s.StartDocumentTranslation(
		ctx, user, "Вторая книга", "en", "google", 40_000, 1,
	); !errors.Is(err, ErrTranslationLimit) {
		t.Errorf("после частичного перевода заявка дала %v, ожидался ErrTranslationLimit", err)
	}
}

// Повторный возврат не должен уводить счётчик ниже нуля: иначе двойной ответ об
// ошибке открыл бы переводы без предела.
func TestReleaseNeverGoesNegative(t *testing.T) {
	s := testStore(t)
	ctx := context.Background()
	if _, err := s.Migrate(ctx); err != nil {
		t.Fatal(err)
	}
	user := translationTestUser(t, s)

	job, err := s.StartDocumentTranslation(ctx, user, "Книга", "en", "google", 40_000, 1)
	if err != nil {
		t.Fatalf("заявка отклонена: %v", err)
	}
	if _, err := s.AddTranslatedChars(ctx, job.ID, 8_000); err != nil {
		t.Fatal(err)
	}
	for range 3 {
		if err := s.ReleaseTranslatedChars(ctx, job.ID, 8_000); err != nil {
			t.Fatal(err)
		}
	}

	after, err := s.DocumentTranslationForUpdate(ctx, user, job.ID)
	if err != nil {
		t.Fatal(err)
	}
	if after.TranslatedChars != 0 {
		t.Errorf("после трёх возвратов счётчик равен %d, ожидался 0", after.TranslatedChars)
	}
}
