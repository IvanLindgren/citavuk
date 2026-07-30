package store

import (
	"context"
	"encoding/json"
	"testing"
	"time"

	"github.com/google/uuid"
)

func shareTestUser(t *testing.T, s *Store) uuid.UUID {
	t.Helper()
	ctx := context.Background()
	user, err := s.CreateUser(
		ctx, "share-test-"+uuid.NewString()+"@example.test", "", "Тестовый", true)
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() {
		_, _ = s.Pool.Exec(context.Background(), `DELETE FROM users WHERE id = $1`, user.ID)
	})
	return user.ID
}

func TestShareRoundTrip(t *testing.T) {
	s := testStore(t)
	ctx := context.Background()
	if _, err := s.Migrate(ctx); err != nil {
		t.Fatal(err)
	}
	owner := shareTestUser(t, s)

	paragraphs := []string{
		"Neko mora da je oklevetao Jozefa K.",
		"Kuvarica gospođe Grubah donosila mu je doručak.",
	}
	sha, _, err := ContentSHA(paragraphs)
	if err != nil {
		t.Fatal(err)
	}
	if _, err := s.PutContent(ctx, owner, sha, paragraphs); err != nil {
		t.Fatal(err)
	}

	share, err := s.CreateShare(ctx, owner, sha, "Процес", len(paragraphs))
	if err != nil {
		t.Fatal(err)
	}
	if len(share.Token) < 12 {
		t.Fatalf("токен слишком короткий: %q", share.Token)
	}

	// Повторное «поделиться» той же книгой не должно плодить ссылки: иначе
	// обсуждение расползётся по копиям одной книги.
	again, err := s.CreateShare(ctx, owner, sha, "Процес", len(paragraphs))
	if err != nil {
		t.Fatal(err)
	}
	if again.Token != share.Token {
		t.Fatalf("на одну книгу выдано две ссылки: %s и %s", share.Token, again.Token)
	}

	// Получатель читает книгу, не будучи её владельцем.
	body, err := s.ShareContent(ctx, share.Token)
	if err != nil {
		t.Fatal(err)
	}
	var got []string
	if err := json.Unmarshal(body, &got); err != nil {
		t.Fatalf("текст по ссылке не разобрался: %v", err)
	}
	if len(got) != len(paragraphs) || got[0] != paragraphs[0] {
		t.Fatalf("текст по ссылке не совпал: %+v", got)
	}

	// Открытия считаются — владельцу видно, живёт ли ссылка.
	opened, err := s.Share(ctx, share.Token)
	if err != nil {
		t.Fatal(err)
	}
	if opened.Title != "Процес" {
		t.Fatalf("название потерялось: %q", opened.Title)
	}

	if err := s.DeleteShare(ctx, owner, share.Token); err != nil {
		t.Fatal(err)
	}
	if _, err := s.Share(ctx, share.Token); err == nil {
		t.Fatal("отозванная ссылка всё ещё открывается")
	}
}

func TestShareRequiresUploadedText(t *testing.T) {
	s := testStore(t)
	ctx := context.Background()
	if _, err := s.Migrate(ctx); err != nil {
		t.Fatal(err)
	}
	owner := shareTestUser(t, s)

	// Текста на сервере нет — ссылка вела бы в пустоту.
	_, err := s.CreateShare(ctx, owner, "0000000000000000", "Пустая", 0)
	if err == nil {
		t.Fatal("ссылка выдана на невыгруженный текст")
	}
}

func TestCommentsAreScopedToPage(t *testing.T) {
	s := testStore(t)
	ctx := context.Background()
	if _, err := s.Migrate(ctx); err != nil {
		t.Fatal(err)
	}
	owner := shareTestUser(t, s)
	reader := shareTestUser(t, s)

	paragraphs := []string{"Prva strana.", "Druga strana."}
	sha, _, _ := ContentSHA(paragraphs)
	if _, err := s.PutContent(ctx, owner, sha, paragraphs); err != nil {
		t.Fatal(err)
	}
	share, err := s.CreateShare(ctx, owner, sha, "Knjiga", len(paragraphs))
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() {
		_, _ = s.Pool.Exec(context.Background(),
			`DELETE FROM shared_books WHERE token = $1`, share.Token)
	})

	if _, err := s.AddComment(ctx, share.Token, 0, reader, "Читатель", "Lepa priča!"); err != nil {
		t.Fatal(err)
	}
	if _, err := s.AddComment(ctx, share.Token, 5, owner, "Хозяин", "Druga strana."); err != nil {
		t.Fatal(err)
	}

	first, err := s.Comments(ctx, share.Token, 0, reader)
	if err != nil {
		t.Fatal(err)
	}
	if len(first) != 1 || first[0].Body != "Lepa priča!" {
		t.Fatalf("обсуждение первой страницы неверно: %+v", first)
	}
	if !first[0].Mine {
		t.Fatal("своё сообщение должно быть помечено как своё")
	}

	// Чужому читателю то же сообщение своим не считается.
	asOwner, err := s.Comments(ctx, share.Token, 0, owner)
	if err != nil {
		t.Fatal(err)
	}
	if len(asOwner) != 1 || asOwner[0].Mine {
		t.Fatalf("чужое сообщение помечено своим: %+v", asOwner)
	}

	counts, err := s.CommentCounts(ctx, share.Token)
	if err != nil {
		t.Fatal(err)
	}
	if counts[0] != 1 || counts[5] != 1 {
		t.Fatalf("карта страниц с обсуждением неверна: %+v", counts)
	}

	// Своё сообщение можно убрать, чужое — нет.
	if err := s.HideOwnComment(ctx, first[0].ID, owner); err == nil {
		t.Fatal("чужое сообщение удалось скрыть")
	}
	if err := s.HideOwnComment(ctx, first[0].ID, reader); err != nil {
		t.Fatal(err)
	}
	after, err := s.Comments(ctx, share.Token, 0, reader)
	if err != nil {
		t.Fatal(err)
	}
	if len(after) != 0 {
		t.Fatalf("скрытое сообщение всё ещё показывается: %+v", after)
	}

	recent, err := s.RecentCommentsByUser(ctx, owner, time.Hour)
	if err != nil {
		t.Fatal(err)
	}
	if recent < 1 {
		t.Fatalf("свежие сообщения не считаются: %d", recent)
	}
}

func TestSharedBooksGoAwayWithOwner(t *testing.T) {
	s := testStore(t)
	ctx := context.Background()
	if _, err := s.Migrate(ctx); err != nil {
		t.Fatal(err)
	}

	user, err := s.CreateUser(
		ctx, "share-gone-"+uuid.NewString()+"@example.test", "", "Уходящий", true)
	if err != nil {
		t.Fatal(err)
	}
	paragraphs := []string{"Tekst koji odlazi."}
	sha, _, _ := ContentSHA(paragraphs)
	if _, err := s.PutContent(ctx, user.ID, sha, paragraphs); err != nil {
		t.Fatal(err)
	}
	share, err := s.CreateShare(ctx, user.ID, sha, "Уходит", 1)
	if err != nil {
		t.Fatal(err)
	}

	// Удаление аккаунта должно уносить и ссылку: иначе она осталась бы вести на
	// текст, которого больше нет.
	if err := s.DeleteUser(ctx, user.ID); err != nil {
		t.Fatal(err)
	}
	if _, err := s.Share(ctx, share.Token); err == nil {
		t.Fatal("ссылка пережила удаление аккаунта")
	}
}
