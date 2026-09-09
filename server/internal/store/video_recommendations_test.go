package store

import (
	"context"
	"testing"

	"github.com/google/uuid"
)

func TestVideoRecommendationsUseImmediateFeedback(t *testing.T) {
	s := testStore(t)
	ctx := context.Background()
	if _, err := s.Migrate(ctx); err != nil {
		t.Fatal(err)
	}
	actor := "guest:" + uuid.NewString()
	defer s.Pool.Exec(ctx, `DELETE FROM micro_feed_profiles_embeddings WHERE actor_key=$1`, actor)
	makeVideo := func(author, category, level string) MicroFeedItem {
		t.Helper()
		item, err := s.CreateMicroVideo(ctx, uuid.NewString()[:8]+"_yt", "Kratka priča", author, category, level, []string{category})
		if err != nil {
			t.Fatal(err)
		}
		t.Cleanup(func() { s.Pool.Exec(context.Background(), `DELETE FROM micro_feed_content_items WHERE id=$1`, item.ID) })
		if err = s.PublishMicroVideo(ctx, item.ID, 30); err != nil {
			t.Fatal(err)
		}
		return *item
	}
	author := "Тест " + uuid.NewString()
	seed := makeVideo(author, "food", "A2")
	similar := makeVideo(author, "food", "A2")
	other := makeVideo("Другой", "science", "A2")
	hard := makeVideo(author, "food", "C1")
	if _, err := s.SaveMicroFeedPreferences(ctx, actor, uuid.Nil, nil, "A2"); err != nil {
		t.Fatal(err)
	}
	for _, event := range []string{"like", "reaction_cleared", "complete"} {
		if err := s.RecordMicroFeedInteraction(ctx, seed.ID, actor, uuid.Nil, event, 25000); err != nil {
			t.Fatal(err)
		}
		if event == "reaction_cleared" {
			continue
		}
		items, strategy, err := s.ListMicroFeed(ctx, actor, []uuid.UUID{seed.ID}, 1, "video")
		if err != nil || len(items) != 1 || items[0].ID != similar.ID || strategy != "personalized" {
			t.Fatalf("%s не повлиял на подбор: %+v %s %v", event, items, strategy, err)
		}
	}
	// Досмотр считается один раз даже после повторного просмотра.
	if err := s.RecordMicroFeedInteraction(ctx, seed.ID, actor, uuid.Nil, "complete", 25000); err != nil {
		t.Fatal(err)
	}
	if err := s.RecordMicroFeedInteraction(ctx, similar.ID, actor, uuid.Nil, "dislike", 0); err != nil {
		t.Fatal(err)
	}
	items, _, err := s.ListMicroFeed(ctx, actor, nil, 20, "video")
	if err != nil {
		t.Fatal(err)
	}
	found := false
	for _, item := range items {
		if item.ID == seed.ID || item.ID == similar.ID || item.ID == hard.ID {
			t.Fatalf("показан досмотренный, отклонённый или слишком сложный ролик: %s", item.ID)
		}
		if item.ID == other.ID {
			found = true
		}
	}
	if !found {
		t.Fatal("другая тема пропала")
	}
	// Чужие действия не делают нового гостя персонализированным.
	_, strategy, err := s.ListMicroFeed(ctx, "guest:"+uuid.NewString(), nil, 1, "video")
	if err != nil || strategy == "personalized" {
		t.Fatalf("утечка интересов: %s %v", strategy, err)
	}
}

func TestVideoDiversityKeepsBestFirst(t *testing.T) {
	items := []MicroFeedItem{{SourceTitle: "A", TitleLatin: "1"}, {SourceTitle: "A", TitleLatin: "2"}, {SourceTitle: "B", TitleLatin: "3"}, {SourceTitle: "A", TitleLatin: "4"}, {SourceTitle: "C", TitleLatin: "5"}}
	got := diversifyVideos(items, 4)
	if len(got) != 4 || got[0].TitleLatin != "1" {
		t.Fatal(got)
	}
	for n := 1; n < len(got); n++ {
		if got[n].SourceTitle == got[n-1].SourceTitle {
			t.Fatal("повтор автора", got)
		}
	}
	if items[1].TitleLatin != "2" {
		t.Fatal("изменён входной массив")
	}
}
