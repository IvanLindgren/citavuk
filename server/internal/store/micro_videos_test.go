package store

import (
	"context"
	"github.com/google/uuid"
	"testing"
)

func TestVideoModerationAndFeedIsolation(t *testing.T) {
	s := testStore(t)
	ctx := context.Background()
	if _, err := s.Migrate(ctx); err != nil {
		t.Fatal(err)
	}
	id := uuid.NewString()[:8] + "_yt"
	item, err := s.CreateMicroVideo(ctx, id, "Кратка прича", "Тест", "culture", "B1", []string{"priča"})
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() {
		_, _ = s.Pool.Exec(context.Background(), `DELETE FROM micro_feed_content_items WHERE id=$1`, item.ID)
	})
	actor := "guest:" + uuid.NewString()
	has := func(items []MicroFeedItem) bool {
		for _, i := range items {
			if i.ID == item.ID {
				return true
			}
		}
		return false
	}
	items, _, err := s.ListMicroFeed(ctx, actor, nil, 20, "video")
	if err != nil || has(items) {
		t.Fatal("черновик виден", err)
	}
	if _, err = s.Pool.Exec(ctx, `UPDATE micro_feed_content_items SET status='published' WHERE id=$1`, item.ID); err == nil {
		t.Fatal("публикация без проверки речи принята")
	}
	if err = s.PublishMicroVideo(ctx, item.ID, 181); err == nil {
		t.Fatal("слишком длинный ролик принят")
	}
	if err = s.PublishMicroVideo(ctx, item.ID, 45); err != nil {
		t.Fatal(err)
	}
	items, _, err = s.ListMicroFeed(ctx, actor, nil, 20, "video")
	if err != nil || !has(items) {
		t.Fatal("проверенный ролик не виден", err)
	}
	items, _, err = s.ListMicroFeed(ctx, actor, nil, 20)
	if err != nil || has(items) {
		t.Fatal("видео попало в текстовую ленту", err)
	}
	items, err = s.ListAdminMicroFeedItems(ctx, "published", 200)
	if err != nil || has(items) {
		t.Fatal("видео попало в редактор текста", err)
	}
	if err = s.RecordMicroFeedInteraction(ctx, item.ID, actor, uuid.Nil, "like", 0); err != nil {
		t.Fatal(err)
	}
	likes, err := s.ListLikedMicroFeed(ctx, actor, 20, "video")
	if err != nil || !has(likes) {
		t.Fatal("реакция потеряна", err)
	}
	other, err := s.ListLikedMicroFeed(ctx, "guest:"+uuid.NewString(), 20, "video")
	if err != nil || has(other) {
		t.Fatal("чужая реакция", err)
	}
}
