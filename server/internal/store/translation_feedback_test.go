package store

import (
	"context"
	"errors"
	"testing"

	"github.com/google/uuid"
)

// Принятая жалоба «для этой формы везде» исправляет слово и в другом тексте,
// и в кириллице; исправление для предложения точнее и потому главнее.
func TestTranslationOverrideScopes(t *testing.T) {
	s := testStore(t)
	ctx := context.Background()
	if _, err := s.Migrate(ctx); err != nil {
		t.Fatal(err)
	}
	user, err := s.CreateUser(ctx, "fb-"+uuid.NewString()+"@example.test", "", "Читатель", true)
	if err != nil {
		t.Fatal(err)
	}
	// Своё слово: тест не должен видеть исправлений из других прогонов.
	word := "tezx" + uuid.NewString()[:8]
	t.Cleanup(func() {
		_, _ = s.Pool.Exec(context.Background(), `DELETE FROM translation_overrides WHERE feedback_id IN (SELECT id FROM translation_feedback WHERE user_id = $1)`, user.ID)
		_, _ = s.Pool.Exec(context.Background(), `DELETE FROM translation_feedback WHERE user_id = $1`, user.ID)
		_, _ = s.Pool.Exec(context.Background(), `DELETE FROM users WHERE id = $1`, user.ID)
	})

	sentence := "Ova " + word + " je velika."
	start, end := 4, 4+len(word)

	form, err := s.CreateTranslationFeedback(ctx, FeedbackInput{
		UserID: user.ID, Source: "sr", Target: "ru", Word: word, Sentence: sentence,
		Start: start, End: end, Shown: "тяжесть", Provider: "deepl",
		Suggestion: "полушарие", Scope: FeedbackScopeForm,
	})
	if err != nil {
		t.Fatal(err)
	}
	if _, ok, _ := s.TranslationOverride(ctx, "sr", "ru", word, sentence, start, end); ok {
		t.Fatal("исправление действует до решения")
	}
	if _, err := s.DecideTranslationFeedback(ctx, form.ID, uuid.Nil, true, ""); err != nil {
		t.Fatal(err)
	}
	if _, err := s.DecideTranslationFeedback(ctx, form.ID, uuid.Nil, false, ""); !errors.Is(err, ErrFeedbackDecided) {
		t.Fatalf("второе решение: %v", err)
	}

	other := "Druga rečenica: " + word + "."
	got, ok, err := s.TranslationOverride(ctx, "sr", "ru", word, other, 16, 16+len(word))
	if err != nil || !ok || got != "полушарие" {
		t.Fatalf("форма в другом предложении: %q %v %v", got, ok, err)
	}

	exact, err := s.CreateTranslationFeedback(ctx, FeedbackInput{
		UserID: user.ID, Source: "sr", Target: "ru", Word: word, Sentence: sentence,
		Start: start, End: end, Shown: "полушарие", Suggestion: "полусфера", Scope: FeedbackScopeSentence,
	})
	if err != nil {
		t.Fatal(err)
	}
	if _, err := s.DecideTranslationFeedback(ctx, exact.ID, user.ID, true, ""); err != nil {
		t.Fatal(err)
	}
	if got, _, _ := s.TranslationOverride(ctx, "sr", "ru", word, sentence, start, end); got != "полусфера" {
		t.Fatalf("в своём предложении ждали «полусфера», получили %q", got)
	}
	if got, _, _ := s.TranslationOverride(ctx, "sr", "ru", word, other, 16, 16+len(word)); got != "полушарие" {
		t.Fatalf("в чужом предложении исправление предложения действовать не должно: %q", got)
	}
}

func TestTranslationFeedbackRejectAndEditors(t *testing.T) {
	s := testStore(t)
	ctx := context.Background()
	if _, err := s.Migrate(ctx); err != nil {
		t.Fatal(err)
	}
	user, err := s.CreateUser(ctx, "fb-"+uuid.NewString()+"@example.test", "", "Читатель", true)
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() {
		_, _ = s.Pool.Exec(context.Background(), `DELETE FROM translation_feedback WHERE user_id = $1`, user.ID)
		_, _ = s.Pool.Exec(context.Background(), `DELETE FROM users WHERE id = $1`, user.ID)
	})

	f, err := s.CreateTranslationFeedback(ctx, FeedbackInput{
		UserID: user.ID, Source: "sr", Target: "ru", Word: "kuća", Sentence: "Velika kuća.",
		Start: 7, End: 12, Shown: "дом", Comment: "не уверен", Scope: FeedbackScopeSentence,
	})
	if err != nil {
		t.Fatal(err)
	}
	// Без верного варианта принять нечего.
	if _, err := s.DecideTranslationFeedback(ctx, f.ID, uuid.Nil, true, ""); err == nil {
		t.Fatal("приняли жалобу без перевода")
	}
	got, err := s.DecideTranslationFeedback(ctx, f.ID, uuid.Nil, false, "")
	if err != nil || got.Status != "rejected" {
		t.Fatalf("отклонение: %+v %v", got, err)
	}
	pending, err := s.ListTranslationFeedback(ctx, "pending", 500)
	if err != nil {
		t.Fatal(err)
	}
	for _, p := range pending {
		if p.ID == f.ID {
			t.Fatal("отклонённая жалоба осталась в ожидающих")
		}
	}

	if ok, _ := s.IsTranslationEditor(ctx, user.ID); ok {
		t.Fatal("редактор без выдачи права")
	}
	if err := s.SetTranslationEditor(ctx, user.ID, uuid.Nil, true); err != nil {
		t.Fatal(err)
	}
	if ok, _ := s.IsTranslationEditor(ctx, user.ID); !ok {
		t.Fatal("право не выдалось")
	}
	if err := s.SetTranslationEditor(ctx, user.ID, uuid.Nil, false); err != nil {
		t.Fatal(err)
	}
	if ok, _ := s.IsTranslationEditor(ctx, user.ID); ok {
		t.Fatal("право не забралось")
	}
}
