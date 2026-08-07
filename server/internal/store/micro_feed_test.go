package store

import (
	"context"
	"testing"

	"github.com/google/uuid"
)

// Порция ленты собирается из нескольких выборок, и каждая отсортирована
// по-своему: пять новостей подряд — обычный исход. Листать такую ленту скучно
// ровно так же, как смотреть пять роликов одного автора подряд.

func categories(items []MicroFeedItem) string {
	out := ""
	for _, item := range items {
		out += item.Category[:1]
	}
	return out
}

func feed(pattern string) []MicroFeedItem {
	names := map[byte]string{
		'n': "news", 'h': "history", 'c': "culture",
		's': "science", 'f': "fiction", 'o': "society",
	}
	items := make([]MicroFeedItem, 0, len(pattern))
	for i := 0; i < len(pattern); i++ {
		items = append(items, MicroFeedItem{Category: names[pattern[i]]})
	}
	return items
}

// / Соседей одной темы быть не должно, пока есть чем их разделить.
func adjacentRepeats(items []MicroFeedItem) int {
	repeats := 0
	for i := 1; i < len(items); i++ {
		if items[i].Category == items[i-1].Category {
			repeats++
		}
	}
	return repeats
}

func TestSpreadCategoriesBreaksRuns(t *testing.T) {
	got := spreadCategories(feed("nnnnhhcc"))
	if adjacentRepeats(got) != 0 {
		t.Errorf("темы идут подряд: %s", categories(got))
	}
	if len(got) != 8 {
		t.Errorf("карточек стало %d вместо 8", len(got))
	}
}

// Перестановка решает, КОГДА показать карточку, а не какую. Спорить с подбором
// внутри одной темы она не должна.
func TestSpreadCategoriesKeepsOrderWithinCategory(t *testing.T) {
	items := []MicroFeedItem{
		{Category: "news", TitleLatin: "n1"},
		{Category: "news", TitleLatin: "n2"},
		{Category: "news", TitleLatin: "n3"},
		{Category: "history", TitleLatin: "h1"},
		{Category: "history", TitleLatin: "h2"},
	}
	got := spreadCategories(items)

	seen := map[string][]string{}
	for _, item := range got {
		seen[item.Category] = append(seen[item.Category], item.TitleLatin)
	}
	if want := []string{"n1", "n2", "n3"}; !equal(seen["news"], want) {
		t.Errorf("порядок новостей = %v", seen["news"])
	}
	if want := []string{"h1", "h2"}; !equal(seen["history"], want) {
		t.Errorf("порядок истории = %v", seen["history"])
	}
}

// Когда разделять нечем, карточки обязаны остаться на месте, а не пропасть.
func TestSpreadCategoriesKeepsEverything(t *testing.T) {
	for _, pattern := range []string{"", "n", "nn", "nnnnn", "nh", "nnnh"} {
		got := spreadCategories(feed(pattern))
		if len(got) != len(pattern) {
			t.Errorf("%q: карточек стало %d", pattern, len(got))
		}
	}
}

// Когда одной темы больше, чем всех остальных вместе, стыки неизбежны: пять
// новостей на два разделителя нельзя разложить без соседей. Проверяем, что их
// ровно столько, сколько неизбежно, — то есть что длинная очередь не осталась
// напоследок и не вылилась целиком в хвост.
func TestSpreadCategoriesLeavesOnlyUnavoidableRuns(t *testing.T) {
	for _, pattern := range []string{"hnnnnnc", "nnnnnnh", "nnnhhc", "nnnnhhcc"} {
		got := spreadCategories(feed(pattern))

		longest := 0
		counts := map[string]int{}
		for _, item := range got {
			counts[item.Category]++
			if counts[item.Category] > longest {
				longest = counts[item.Category]
			}
		}
		// Разделителей на один меньше, чем промежутков между карточками
		// самой частой темы.
		unavoidable := max(0, longest-(len(got)-longest)-1)

		if repeats := adjacentRepeats(got); repeats != unavoidable {
			t.Errorf("%q: подряд идущих пар %d, неизбежно %d — %s",
				pattern, repeats, unavoidable, categories(got))
		}
	}
}

func equal(left, right []string) bool {
	if len(left) != len(right) {
		return false
	}
	for i := range left {
		if left[i] != right[i] {
			return false
		}
	}
	return true
}

func TestFeedLevelCapAllowsOnlyOneStepUp(t *testing.T) {
	for _, item := range []struct {
		level string
		want  int
	}{
		{"A1", 2},
		{"A2", 3},
		{"B1", 4},
		{"B2", 5},
		{"C1", 5},
	} {
		if got := maxFeedLevelIndex(item.level); got != item.want {
			t.Errorf("%s: потолок %d, ожидался %d", item.level, got, item.want)
		}
	}
}

// У A2 есть сотня собственных карточек, однако раньше 70% холодной выдачи
// обходили фильтр сложности и в ленту попадал B2. Проверяем весь настоящий SQL,
// включая популярное, темы и exploration, а не только функцию шкалы выше.
func TestBeginnerFeedPrefersOwnLevelAndNeverJumpsTwo(t *testing.T) {
	s := testStore(t)
	ctx := context.Background()
	if _, err := s.Migrate(ctx); err != nil {
		t.Fatal(err)
	}

	var a2Count int
	if err := s.Pool.QueryRow(ctx, `
		SELECT count(*) FROM micro_feed_content_items
		WHERE status='published' AND cefr='A2'`).Scan(&a2Count); err != nil {
		t.Fatal(err)
	}
	if a2Count == 0 {
		t.Skip("в базе нет опубликованных A2-карточек")
	}

	actor := "test-feed-a2-" + uuid.NewString()
	t.Cleanup(func() {
		_, _ = s.Pool.Exec(context.Background(),
			`DELETE FROM micro_feed_profiles_embeddings WHERE actor_key=$1`, actor)
	})
	if _, err := s.SaveMicroFeedPreferences(
		ctx, actor, uuid.Nil, []string{"culture", "history"}, "A2",
	); err != nil {
		t.Fatal(err)
	}

	items, _, err := s.ListMicroFeed(ctx, actor, nil, 20)
	if err != nil {
		t.Fatal(err)
	}
	if len(items) == 0 {
		t.Fatal("A2 получил пустую ленту при наличии A2-карточек")
	}
	for _, item := range items {
		if feedLevelIndex(item.CEFR) > feedLevelIndex("B1") {
			t.Errorf("читателю A2 выдана карточка %s: %s", item.ID, item.CEFR)
		}
	}
	if items[0].CEFR != "A2" {
		t.Errorf("первая карточка уровня %s, хотя A2-карточки есть", items[0].CEFR)
	}
}

// --- Профиль по поведению ---------------------------------------------------
//
// Профиль собирался из одних лайков, а лайк ставит меньшинство: большинство
// листает, дочитывает то, что зацепило, и не нажимает ничего. Такой читатель
// оставался «холодным» навсегда, и подбор для него не включался никогда.
//
// Запрос перестройки сложный (веса повторами строк, отталкивающие темы,
// pgvector-усреднение), и проверить его можно только на живой базе.

func TestProfileWarmsUpFromReading(t *testing.T) {
	s := testStore(t)
	ctx := context.Background()
	if _, err := s.Migrate(ctx); err != nil {
		t.Fatal(err)
	}

	items, err := s.ListAdminMicroFeedItems(ctx, "published", 4)
	if err != nil {
		t.Fatal(err)
	}
	if len(items) < 3 {
		t.Skip("в базе меньше трёх опубликованных карточек")
	}

	actor := "test-actor-" + uuid.NewString()
	t.Cleanup(func() {
		clean := context.Background()
		_, _ = s.Pool.Exec(clean, `DELETE FROM micro_feed_interactions WHERE actor_key=$1`, actor)
		_, _ = s.Pool.Exec(clean, `DELETE FROM micro_feed_profiles_embeddings WHERE actor_key=$1`, actor)
	})

	// «complete» и «quick_skip» намеренно: они не трогают счётчики карточек,
	// поэтому тест не искажает боевую статистику.
	if got := s.microFeedProfile(ctx, actor); got.Warm {
		t.Fatal("незнакомый читатель сразу оказался тёплым")
	}

	for i := 0; i < 3; i++ {
		if err := s.RecordMicroFeedInteraction(
			ctx, items[i].ID, actor, uuid.Nil, "complete", 30_000,
		); err != nil {
			t.Fatalf("дочитывание %d: %v", i, err)
		}
	}

	profile := s.microFeedProfile(ctx, actor)
	if !profile.Warm {
		t.Error("три дочитывания не сделали профиль тёплым — подбор не включится")
	}
	// Профиль должен появиться сам, без единого лайка.
	var exists bool
	if err := s.Pool.QueryRow(ctx, `
		SELECT true FROM micro_feed_profiles_embeddings WHERE actor_key=$1`,
		actor).Scan(&exists); err != nil {
		t.Fatalf("профиль не создан: %v", err)
	}
}

// Быстрое пролистывание — сигнал отталкивания, и он тоже обязан доходить до
// профиля, а не только записываться в историю.
func TestQuickSkipRebuildsProfile(t *testing.T) {
	s := testStore(t)
	ctx := context.Background()
	if _, err := s.Migrate(ctx); err != nil {
		t.Fatal(err)
	}

	items, err := s.ListAdminMicroFeedItems(ctx, "published", 1)
	if err != nil {
		t.Fatal(err)
	}
	if len(items) == 0 {
		t.Skip("в базе нет опубликованных карточек")
	}

	actor := "test-actor-" + uuid.NewString()
	t.Cleanup(func() {
		clean := context.Background()
		_, _ = s.Pool.Exec(clean, `DELETE FROM micro_feed_interactions WHERE actor_key=$1`, actor)
		_, _ = s.Pool.Exec(clean, `DELETE FROM micro_feed_profiles_embeddings WHERE actor_key=$1`, actor)
	})

	if err := s.RecordMicroFeedInteraction(
		ctx, items[0].ID, actor, uuid.Nil, "quick_skip", 900,
	); err != nil {
		t.Fatalf("пролистывание: %v", err)
	}

	var exists bool
	if err := s.Pool.QueryRow(ctx, `
		SELECT true FROM micro_feed_profiles_embeddings WHERE actor_key=$1`,
		actor).Scan(&exists); err != nil {
		t.Fatalf("профиль не создан пролистыванием: %v", err)
	}
	// Одного раза мало, чтобы записать тему в отталкивающие: пролистать можно
	// и по случайности.
	if got := s.microFeedProfile(ctx, actor); len(got.Avoided) != 0 {
		t.Errorf("одно пролистывание записало темы в отталкивающие: %v", got.Avoided)
	}
}
