package store

import (
	"context"
	"errors"
	"testing"

	"github.com/google/uuid"
)

// newLevelUser заводит временный аккаунт и убирает его за собой.
func newLevelUser(t *testing.T, s *Store) *User {
	t.Helper()
	ctx := context.Background()
	if _, err := s.Migrate(ctx); err != nil {
		t.Fatal(err)
	}
	user, err := s.CreateUser(
		ctx, "level-store-test-"+uuid.NewString()+"@example.test", "", "Level Test", true)
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() {
		_, _ = s.Pool.Exec(context.Background(), `DELETE FROM users WHERE id = $1`, user.ID)
	})
	return user
}

// Новый аккаунт уровня не имеет, и это не то же самое, что A1: слив их, мы
// потеряли бы право спросить у новичка.
func TestSerbianLevelStartsUnknown(t *testing.T) {
	s := testStore(t)
	user := newLevelUser(t, s)

	level, err := s.GetSerbianLevel(context.Background(), user.ID)
	if err != nil {
		t.Fatalf("GetSerbianLevel: %v", err)
	}
	if level.Known() {
		t.Errorf("у нового аккаунта уровень %q", level.Level)
	}
}

func TestSetSerbianLevelRoundTrip(t *testing.T) {
	s := testStore(t)
	user := newLevelUser(t, s)
	ctx := context.Background()

	saved, err := s.SetSerbianLevel(ctx, user.ID, "b2", LevelSourceTest)
	if err != nil {
		t.Fatalf("SetSerbianLevel: %v", err)
	}
	if saved.Level != "B2" || saved.Source != LevelSourceTest {
		t.Errorf("сохранено %q/%q", saved.Level, saved.Source)
	}
	if saved.SetAt == nil {
		t.Error("время ответа не записано")
	}

	read, err := s.GetSerbianLevel(ctx, user.ID)
	if err != nil {
		t.Fatalf("GetSerbianLevel: %v", err)
	}
	if read.Level != "B2" || !read.Known() {
		t.Errorf("прочитано %q", read.Level)
	}

	// Человек растёт, и «я теперь C1» — обычное обновление.
	if _, err := s.SetSerbianLevel(ctx, user.ID, "C1", LevelSourceDeclared); err != nil {
		t.Fatalf("повторная запись: %v", err)
	}
	read, _ = s.GetSerbianLevel(ctx, user.ID)
	if read.Level != "C1" || read.Source != LevelSourceDeclared {
		t.Errorf("после обновления %q/%q", read.Level, read.Source)
	}
}

// Мусор вместо уровня не должен превращаться в B1: тогда «не спрашивали» стало
// бы ответом, которого никто не давал.
func TestSetSerbianLevelRejectsGarbage(t *testing.T) {
	s := testStore(t)
	user := newLevelUser(t, s)

	for _, bad := range []string{"", "  ", "D9", "средний"} {
		_, err := s.SetSerbianLevel(context.Background(), user.ID, bad, "")
		if !errors.Is(err, ErrUnknownSerbianLevel) {
			t.Errorf("уровень %q принят: err = %v", bad, err)
		}
	}
}

// Уровень аккаунта заменяет уровень из анкеты ленты: он задан один раз для
// всего приложения, и лента не вправе подбирать по своему.
func TestMicroFeedPreferencesTakeLevelFromAccount(t *testing.T) {
	s := testStore(t)
	user := newLevelUser(t, s)
	ctx := context.Background()
	actorKey := "user:" + user.ID.String()

	if _, err := s.SetSerbianLevel(ctx, user.ID, "A2", LevelSourceDeclared); err != nil {
		t.Fatal(err)
	}
	if _, err := s.SaveMicroFeedPreferences(
		ctx, actorKey, user.ID, []string{"history"}, "C1",
	); err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() {
		_, _ = s.Pool.Exec(context.Background(),
			`DELETE FROM micro_feed_profiles_embeddings WHERE actor_key = $1`, actorKey)
	})

	prefs, err := s.GetMicroFeedPreferences(ctx, actorKey, user.ID)
	if err != nil {
		t.Fatalf("GetMicroFeedPreferences: %v", err)
	}
	if prefs.CEFR != "A2" || !prefs.LevelFromAccount {
		t.Errorf("уровень ленты %q, fromAccount=%v — ожидался уровень аккаунта A2",
			prefs.CEFR, prefs.LevelFromAccount)
	}
	if !prefs.Onboarded {
		t.Error("анкета не отмечена пройденной")
	}
}

// Уровень, названный в анкете ленты, ложится на аккаунт — если там его ещё нет.
// Спросили один раз, знают везде.
func TestMicroFeedPreferencesSeedAccountLevel(t *testing.T) {
	s := testStore(t)
	user := newLevelUser(t, s)
	ctx := context.Background()
	actorKey := "user:" + user.ID.String()

	if _, err := s.SaveMicroFeedPreferences(
		ctx, actorKey, user.ID, []string{"music"}, "B2",
	); err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() {
		_, _ = s.Pool.Exec(context.Background(),
			`DELETE FROM micro_feed_profiles_embeddings WHERE actor_key = $1`, actorKey)
	})

	account, err := s.GetSerbianLevel(ctx, user.ID)
	if err != nil {
		t.Fatalf("GetSerbianLevel: %v", err)
	}
	if account.Level != "B2" || account.Source != LevelSourceDeclared {
		t.Errorf("на аккаунте %q/%q, ожидался B2/declared", account.Level, account.Source)
	}
}

// Вошедший приносит с собой профиль, накопленный до входа. Без переноса вход
// означал бы чистый лист: анкета, заполненная пять минут назад, спрашивалась
// заново — ровно на этом читатели и спотыкались.
func TestAdoptMicroFeedGuestProfile(t *testing.T) {
	s := testStore(t)
	user := newLevelUser(t, s)
	ctx := context.Background()

	guestKey := "guest:" + uuid.NewString()
	userKey := "user:" + user.ID.String()
	t.Cleanup(func() {
		_, _ = s.Pool.Exec(context.Background(),
			`DELETE FROM micro_feed_profiles_embeddings WHERE actor_key = ANY($1)`,
			[]string{guestKey, userKey})
	})

	if _, err := s.SaveMicroFeedPreferences(
		ctx, guestKey, uuid.Nil, []string{"food", "sport"}, "A2",
	); err != nil {
		t.Fatal(err)
	}
	if err := s.AdoptMicroFeedGuestProfile(ctx, userKey, guestKey, user.ID); err != nil {
		t.Fatalf("AdoptMicroFeedGuestProfile: %v", err)
	}

	prefs, err := s.GetMicroFeedPreferences(ctx, userKey, user.ID)
	if err != nil {
		t.Fatalf("GetMicroFeedPreferences: %v", err)
	}
	if !prefs.Onboarded {
		t.Fatal("после входа анкета снова спрашивается")
	}
	if len(prefs.Categories) != 2 {
		t.Errorf("темы не перенеслись: %v", prefs.Categories)
	}

	// Повтор ничего не портит: вход случается на каждом запросе ленты, и
	// затирать накопленное аккаунтом каждый раз было бы прямым вредом.
	if _, err := s.SaveMicroFeedPreferences(
		ctx, userKey, user.ID, []string{"music"}, "B1",
	); err != nil {
		t.Fatal(err)
	}
	if err := s.AdoptMicroFeedGuestProfile(ctx, userKey, guestKey, user.ID); err != nil {
		t.Fatal(err)
	}
	prefs, _ = s.GetMicroFeedPreferences(ctx, userKey, user.ID)
	if len(prefs.Categories) != 1 || prefs.Categories[0] != "music" {
		t.Errorf("повторный перенос затёр выбор аккаунта: %v", prefs.Categories)
	}
}

// Шкала аккаунта доходит до C2, как и заявка преподавателя: колонки называются
// одинаково и означают одно и то же, а разошедшиеся домены — ловушка. Первая же
// попытка перенести уровень из заявки в аккаунт упёрлась бы в CHECK.
func TestSerbianLevelAcceptsC2(t *testing.T) {
	s := testStore(t)
	user := newLevelUser(t, s)

	saved, err := s.SetSerbianLevel(context.Background(), user.ID, "C2", LevelSourceDeclared)
	if err != nil {
		t.Fatalf("C2 не принят: %v", err)
	}
	if saved.Level != "C2" {
		t.Errorf("сохранено %q", saved.Level)
	}
}

// У ленты своя, более короткая шкала: там уровень стоит на карточке, а не на
// человеке. C2 обязан опуститься до её потолка, а не стать серединой.
func TestFeedLevelClampedFromAccount(t *testing.T) {
	s := testStore(t)
	user := newLevelUser(t, s)
	ctx := context.Background()
	actorKey := "user:" + user.ID.String()
	t.Cleanup(func() {
		_, _ = s.Pool.Exec(context.Background(),
			`DELETE FROM micro_feed_profiles_embeddings WHERE actor_key = $1`, actorKey)
	})

	if _, err := s.SetSerbianLevel(ctx, user.ID, "C2", LevelSourceDeclared); err != nil {
		t.Fatal(err)
	}
	if _, err := s.SaveMicroFeedPreferences(
		ctx, actorKey, user.ID, []string{"news"}, "C2",
	); err != nil {
		t.Fatalf("SaveMicroFeedPreferences: %v", err)
	}

	var stored string
	if err := s.Pool.QueryRow(ctx,
		`SELECT cefr FROM micro_feed_profiles_embeddings WHERE actor_key=$1`,
		actorKey).Scan(&stored); err != nil {
		t.Fatal(err)
	}
	if stored != "C1" {
		t.Errorf("в ленте записан уровень %q, ожидался C1", stored)
	}
}

func TestClampToFeedLevel(t *testing.T) {
	for _, item := range []struct{ in, want string }{
		{"C2", "C1"},
		{"C1", "C1"},
		{"A1", "A1"},
		{"", ""},
		{"чепуха", ""},
	} {
		if got := ClampToFeedLevel(item.in); got != item.want {
			t.Errorf("ClampToFeedLevel(%q) = %q, ожидалось %q", item.in, got, item.want)
		}
	}
}
