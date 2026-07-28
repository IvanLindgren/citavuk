package store

import (
	"context"
	"encoding/json"
	"testing"

	"github.com/google/uuid"
)

func quizTestUser(t *testing.T, s *Store) uuid.UUID {
	t.Helper()
	ctx := context.Background()
	email := "quiz-store-test-" + uuid.NewString() + "@example.test"
	user, err := s.CreateUser(ctx, email, "", "Quiz Test", true)
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() {
		_, _ = s.Pool.Exec(context.Background(), `DELETE FROM users WHERE id = $1`, user.ID)
	})
	return user.ID
}

func TestQuizSavedOncePerMaterial(t *testing.T) {
	s := testStore(t)
	ctx := context.Background()
	if _, err := s.Migrate(ctx); err != nil {
		t.Fatal(err)
	}
	author := quizTestUser(t, s)

	sha := "test-" + uuid.NewString()
	questions := json.RawMessage(
		`[{"question":"Вопрос","options":["а","б","в","г"],"answer":1,` +
			`"explanation":"Потому что.","wrongHint":"Путают с другим."}]`)

	first, err := s.SaveQuiz(ctx, sha, "Тема", "Предмет", "Начало текста", questions, author)
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() {
		_, _ = s.Pool.Exec(context.Background(), `DELETE FROM quizzes WHERE source_sha = $1`, sha)
	})

	// Второй человек с тем же материалом получает тот же тест, а не дубль.
	second, err := s.SaveQuiz(ctx, sha, "Другое имя", "Предмет", "Начало", questions, author)
	if err != nil {
		t.Fatal(err)
	}
	if second.ID != first.ID {
		t.Fatalf("тот же материал сохранён дважды: %s и %s", first.ID, second.ID)
	}

	found, err := s.FindQuizBySource(ctx, sha)
	if err != nil || found.ID != first.ID {
		t.Fatalf("поиск по материалу не нашёл тест: %v", err)
	}
}

func TestQuizListAndAttempts(t *testing.T) {
	s := testStore(t)
	ctx := context.Background()
	if _, err := s.Migrate(ctx); err != nil {
		t.Fatal(err)
	}
	author := quizTestUser(t, s)

	sha := "test-" + uuid.NewString()
	questions := json.RawMessage(
		`[{"question":"Вопрос","options":["а","б","в","г"],"answer":0,` +
			`"explanation":"","wrongHint":""},` +
			`{"question":"Второй","options":["а","б","в","г"],"answer":3,` +
			`"explanation":"","wrongHint":""}]`)

	quiz, err := s.SaveQuiz(ctx, sha, "Тема", "Предмет", "Выдержка", questions, author)
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() {
		_, _ = s.Pool.Exec(context.Background(), `DELETE FROM quizzes WHERE id = $1`, quiz.ID)
	})

	if err := s.SaveAttempt(ctx, quiz.ID, author, 1, 2, []int{1}); err != nil {
		t.Fatal(err)
	}

	list, err := s.ListQuizzes(ctx, author, 60)
	if err != nil {
		t.Fatal(err)
	}
	var mine *QuizSummary
	for i := range list {
		if list[i].ID == quiz.ID {
			mine = &list[i]
			break
		}
	}
	if mine == nil {
		t.Fatal("сохранённый тест не попал в список")
	}
	if mine.Questions != 2 {
		t.Fatalf("неверно посчитаны вопросы: %d", mine.Questions)
	}
	if !mine.Mine || mine.Attempts != 1 || mine.BestScore != 50 {
		t.Fatalf("статистика в списке неверна: %+v", mine)
	}

	attempts, err := s.ListAttempts(ctx, author, 10)
	if err != nil {
		t.Fatal(err)
	}
	if len(attempts) != 1 || attempts[0].Correct != 1 || len(attempts[0].Wrong) != 1 {
		t.Fatalf("история попыток неверна: %+v", attempts)
	}
}
