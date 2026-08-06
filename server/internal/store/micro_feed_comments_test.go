package store

import (
	"context"
	"errors"
	"strings"
	"testing"

	"github.com/google/uuid"
)

// normalizeComment существует ради одного: реплика из тридцати переводов
// строки — самый дешёвый способ занять весь экран обсуждения, и запрещать его
// отдельным правилом незачем, достаточно не хранить того, чего не писали.
func TestNormalizeCommentKeepsMeaningfulText(t *testing.T) {
	got := normalizeComment("  Ово је добар текст.  ")
	if got != "Ово је добар текст." {
		t.Fatalf("ожидалась обрезка пробелов, получено %q", got)
	}
}

func TestNormalizeCommentKeepsSingleBlankLine(t *testing.T) {
	// Один пустой абзац — обычное деление мысли, его сохраняем.
	got := normalizeComment("Прво.\n\nДруго.")
	if got != "Прво.\n\nДруго." {
		t.Fatalf("абзац потерян: %q", got)
	}
}

func TestNormalizeCommentCollapsesBlankRuns(t *testing.T) {
	got := normalizeComment("Прво." + strings.Repeat("\n", 30) + "Друго.")
	if got != "Прво.\n\nДруго." {
		t.Fatalf("пустые строки не схлопнулись: %q", got)
	}
	if strings.Count(got, "\n") != 2 {
		t.Fatalf("ожидалось два перевода строки, получено %d", strings.Count(got, "\n"))
	}
}

func TestNormalizeCommentRejectsWhitespaceOnly(t *testing.T) {
	for _, input := range []string{"", "   ", "\n\n\n", " \t \n "} {
		if got := normalizeComment(input); got != "" {
			t.Fatalf("на %q ожидалась пустая строка, получено %q", input, got)
		}
	}
}

// Ключ читателя имеет вид user:<uuid> или guest:<uuid>. Комментарии хранятся по
// учётной записи: гостю писать нельзя, и связать его записи с ключом не через
// что.
func TestActorUserID(t *testing.T) {
	const id = "3f2504e0-4f89-11d3-9a0c-0305e82c3301"
	if got := actorUserID("user:" + id); got == nil {
		t.Fatal("для вошедшего ожидалась учётная запись")
	} else if got.(interface{ String() string }).String() != id {
		t.Fatalf("не тот идентификатор: %v", got)
	}
	for _, key := range []string{"guest:" + id, "user:мусор", "", id} {
		if got := actorUserID(key); got != nil {
			t.Fatalf("для %q ожидался nil, получено %v", key, got)
		}
	}
}

// --- Обсуждение на живой базе ------------------------------------------------
//
// Запись комментария трогает три места сразу: саму таблицу, счётчик на карточке
// и профиль читателя. Согласованность этих трёх проверяется только на настоящей
// базе — в отрыве от неё тут нечего проверять.

func TestCommentUpdatesCountAndProfile(t *testing.T) {
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
	item := items[0]

	// Свой пользователь, а не чужой: комментарий виден всем, и писать от имени
	// настоящего читателя в боевой базе нельзя.
	author := uuid.New()
	if _, err := s.Pool.Exec(ctx, `
		INSERT INTO users (id, email, password_hash, display_name)
		VALUES ($1, $2, 'x', 'Тестовый читатель')`,
		author, "comment-test-"+author.String()+"@example.invalid",
	); err != nil {
		t.Fatalf("не удалось завести тестового читателя: %v", err)
	}
	t.Cleanup(func() {
		clean := context.Background()
		_, _ = s.Pool.Exec(clean, `DELETE FROM micro_feed_comments WHERE user_id=$1`, author)
		_, _ = s.Pool.Exec(clean, `DELETE FROM micro_feed_profiles_embeddings WHERE actor_key=$1`, "user:"+author.String())
		_, _ = s.Pool.Exec(clean, `DELETE FROM users WHERE id=$1`, author)
		_, _ = s.Pool.Exec(clean, `
			UPDATE micro_feed_content_items SET comments_count=$2 WHERE id=$1`,
			item.ID, item.CommentsCount)
	})

	comment, err := s.AddMicroFeedComment(ctx, item.ID, author, "  Ово је добар текст.  ")
	if err != nil {
		t.Fatalf("комментарий не записался: %v", err)
	}
	if comment.Body != "Ово је добар текст." {
		t.Errorf("тело не нормализовано: %q", comment.Body)
	}
	if !comment.Mine || comment.Author != "Тестовый читатель" {
		t.Errorf("автор потерян: mine=%v author=%q", comment.Mine, comment.Author)
	}

	// Счётчик на карточке обязан совпадать с тем, что видно в обсуждении:
	// сортировка «популярного» читает именно его.
	var count int64
	if err := s.Pool.QueryRow(ctx, `
		SELECT comments_count FROM micro_feed_content_items WHERE id=$1`,
		item.ID).Scan(&count); err != nil {
		t.Fatal(err)
	}
	if count != item.CommentsCount+1 {
		t.Errorf("счётчик карточки %d, ожидался %d", count, item.CommentsCount+1)
	}

	list, err := s.ListMicroFeedComments(ctx, item.ID, author, 10)
	if err != nil {
		t.Fatal(err)
	}
	if len(list) == 0 || list[0].ID != comment.ID {
		t.Fatalf("своя реплика не первая в обсуждении: %+v", list)
	}

	// Пауза между репликами: защита от двойного нажатия.
	if _, err := s.AddMicroFeedComment(ctx, item.ID, author, "Друго."); !errors.Is(err, ErrMicroFeedCommentSoon) {
		t.Errorf("вторая реплика подряд прошла: %v", err)
	}

	// Чужую реплику удалить нельзя.
	if err := s.DeleteMicroFeedComment(ctx, comment.ID, uuid.New(), false); !errors.Is(err, ErrMicroFeedCommentDenied) {
		t.Errorf("чужой смог удалить комментарий: %v", err)
	}

	if err := s.DeleteMicroFeedComment(ctx, comment.ID, author, false); err != nil {
		t.Fatalf("своя реплика не удалилась: %v", err)
	}
	if err := s.Pool.QueryRow(ctx, `
		SELECT comments_count FROM micro_feed_content_items WHERE id=$1`,
		item.ID).Scan(&count); err != nil {
		t.Fatal(err)
	}
	if count != item.CommentsCount {
		t.Errorf("после удаления счётчик %d, ожидался %d", count, item.CommentsCount)
	}

	// Повторное удаление — не ошибка: нажатие сработало как задумано.
	if err := s.DeleteMicroFeedComment(ctx, comment.ID, author, false); err != nil {
		t.Errorf("повторное удаление вернуло ошибку: %v", err)
	}
}

func TestCommentRejectsEmptyAndLong(t *testing.T) {
	s := testStore(t)
	ctx := context.Background()
	if _, err := s.AddMicroFeedComment(ctx, uuid.New(), uuid.New(), "   \n\n  "); !errors.Is(err, ErrMicroFeedCommentEmpty) {
		t.Errorf("пустой комментарий принят: %v", err)
	}
	long := strings.Repeat("ш", MicroFeedCommentMaxRunes+1)
	if _, err := s.AddMicroFeedComment(ctx, uuid.New(), uuid.New(), long); !errors.Is(err, ErrMicroFeedCommentLong) {
		t.Errorf("длинный комментарий принят: %v", err)
	}
}
