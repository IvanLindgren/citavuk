package store

import (
	"context"
	"testing"
	"time"

	"github.com/google/uuid"
)

// Второй круг: слов по фильтру меньше десяти, и набор добирается уже
// показанными — повторить выученное полезнее, чем не открыть раздел вовсе.
//
// Здесь же ловится ошибка, из-за которой окно дня отвечало 500: условие «не
// показывать виденное» дописывалось к запросу строкой, на втором круге
// выпадало и уносило единственное упоминание $1, а параметр продолжал уходить
// в базу. Postgres отвечал 42P18 — и так каждый день у всех, кто прошёл свой
// уровень или выбрал узкую тему.
func TestPickDailyWordsGoesRoundAgainOnASmallTheme(t *testing.T) {
	s := testStore(t)
	ctx := context.Background()
	if _, err := s.Migrate(ctx); err != nil {
		t.Fatal(err)
	}

	user, err := s.CreateUser(ctx, "daily-"+uuid.NewString()+"@example.test", "", "Читатель", true)
	if err != nil {
		t.Fatal(err)
	}
	// Своя тема вместо общей: тест не должен зависеть от того, сколько слов
	// налили миграции наполнения.
	theme := "тест-" + uuid.NewString()
	t.Cleanup(func() {
		_, _ = s.Pool.Exec(context.Background(), `DELETE FROM roadmap_words WHERE theme=$1`, theme)
		_, _ = s.Pool.Exec(context.Background(), `DELETE FROM users WHERE id=$1`, user.ID)
	})

	lemmas := []string{"pekara-" + uuid.NewString(), "apoteka-" + uuid.NewString()}
	for _, lemma := range lemmas {
		if _, err := s.Pool.Exec(ctx, `
            INSERT INTO roadmap_words (level, theme, lemma, translation, status)
                 VALUES ('A1', $1, $2, 'перевод', 'published')`,
			theme, lemma); err != nil {
			t.Fatal(err)
		}
	}

	words, err := s.PickDailyWords(ctx, user.ID, "A1", []string{theme}, DailyWordCount)
	if err != nil {
		t.Fatalf("первый подбор: %v", err)
	}
	if len(words) != len(lemmas) {
		t.Fatalf("в теме %d слов, а подобралось %d", len(lemmas), len(words))
	}

	// Всё показано — но завтра раздел обязан открыться снова.
	if _, err := s.SaveDailySet(ctx, user.ID, time.Now(), "A1", words); err != nil {
		t.Fatal(err)
	}

	again, err := s.PickDailyWords(ctx, user.ID, "A1", []string{theme}, DailyWordCount)
	if err != nil {
		t.Fatalf("второй круг: %v", err)
	}
	if len(again) != len(lemmas) {
		t.Fatalf("на втором круге подобралось %d слов, а тема не опустела", len(again))
	}
}

// Непоказанное идёт вперёд: второй круг — это добор, а не замена.
func TestPickDailyWordsPrefersUnseen(t *testing.T) {
	s := testStore(t)
	ctx := context.Background()
	if _, err := s.Migrate(ctx); err != nil {
		t.Fatal(err)
	}

	user, err := s.CreateUser(ctx, "daily-"+uuid.NewString()+"@example.test", "", "Читатель", true)
	if err != nil {
		t.Fatal(err)
	}
	theme := "тест-" + uuid.NewString()
	t.Cleanup(func() {
		_, _ = s.Pool.Exec(context.Background(), `DELETE FROM roadmap_words WHERE theme=$1`, theme)
		_, _ = s.Pool.Exec(context.Background(), `DELETE FROM users WHERE id=$1`, user.ID)
	})

	seen := "vidjeno-" + uuid.NewString()
	fresh := "novo-" + uuid.NewString()
	for _, lemma := range []string{seen, fresh} {
		if _, err := s.Pool.Exec(ctx, `
            INSERT INTO roadmap_words (level, theme, lemma, translation, status)
                 VALUES ('A1', $1, $2, 'перевод', 'published')`,
			theme, lemma); err != nil {
			t.Fatal(err)
		}
	}
	if _, err := s.SaveDailySet(ctx, user.ID, time.Now(), "A1",
		[]DailyWord{{Lemma: seen, Translation: "перевод"}}); err != nil {
		t.Fatal(err)
	}

	words, err := s.PickDailyWords(ctx, user.ID, "A1", []string{theme}, 1)
	if err != nil {
		t.Fatalf("подбор: %v", err)
	}
	if len(words) != 1 || words[0].Lemma != fresh {
		t.Fatalf("ожидали непоказанное %q, получили %+v", fresh, words)
	}
}
