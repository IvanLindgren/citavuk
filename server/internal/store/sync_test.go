package store

import (
	"context"
	"fmt"
	"strings"
	"testing"
	"time"
	"unicode/utf8"

	"github.com/google/uuid"
)

// newTestUser заводит одноразового пользователя и удаляет его после теста.
// Каскадное удаление уносит все его книги, слова и повторения.
func newTestUser(t *testing.T, s *Store) *User {
	t.Helper()
	ctx := context.Background()
	if _, err := s.Migrate(ctx); err != nil {
		t.Fatal(err)
	}

	email := fmt.Sprintf("test-%s@citavuk.invalid", uuid.NewString())
	u, err := s.CreateUser(ctx, email, "", "Тест", true)
	if err != nil {
		t.Fatalf("CreateUser: %v", err)
	}
	t.Cleanup(func() {
		_, _ = s.Pool.Exec(context.Background(), `DELETE FROM users WHERE id = $1`, u.ID)
	})
	return u
}

func TestPushThenPullReturnsEverything(t *testing.T) {
	s := testStore(t)
	u := newTestUser(t, s)
	ctx := context.Background()

	bookID := uuid.New()
	vocabID := uuid.New()
	now := time.Now().UTC().Truncate(time.Millisecond)

	rev, err := s.Push(ctx, u.ID, &Changes{
		Books: []Book{{
			ID: bookID, Title: "Мали принц", Folder: "Књиге", SourceKey: "mali_princ.pdf",
			ParaCount: 120, LastPara: 7, ContentSHA: "abc", UpdatedAt: now,
		}},
		Vocabulary: []VocabEntry{{
			ID: vocabID, BookID: &bookID, Word: "кућа", Lemma: "кућа", POS: "NOUN",
			Translation: "дом", Forms: map[string]string{"plural": "куће"}, UpdatedAt: now,
		}},
		Reviews: []Review{{
			VocabID: vocabID, Ease: 2.5, IntervalDays: 1, Reps: 1,
			DueAt: now.UnixMilli(), UpdatedAt: now,
		}},
	})
	if err != nil {
		t.Fatalf("Push: %v", err)
	}
	if rev <= 0 {
		t.Fatalf("Push вернул нулевую ревизию: %d", rev)
	}

	got, err := s.Pull(ctx, u.ID, 0, MaxPullRecords)
	if err != nil {
		t.Fatalf("Pull: %v", err)
	}
	if len(got.Books) != 1 || len(got.Vocabulary) != 1 || len(got.Reviews) != 1 {
		t.Fatalf("получено книг=%d слов=%d повторений=%d, ожидалось по одному",
			len(got.Books), len(got.Vocabulary), len(got.Reviews))
	}
	if got.HasMore {
		t.Error("hasMore=true, хотя всё поместилось в одну порцию")
	}
	if got.Rev != rev {
		t.Errorf("курсор %d, ожидался %d", got.Rev, rev)
	}

	// Диакритика сербской кириллицы обязана пережить путь через базу.
	if got.Vocabulary[0].Word != "кућа" {
		t.Errorf("слово исказилось: %q", got.Vocabulary[0].Word)
	}
	if got.Books[0].Title != "Мали принц" {
		t.Errorf("заголовок исказился: %q", got.Books[0].Title)
	}

	// Повторный Pull с полученным курсором обязан быть пустым: иначе клиент
	// будет бесконечно выкачивать одно и то же.
	again, err := s.Pull(ctx, u.ID, got.Rev, MaxPullRecords)
	if err != nil {
		t.Fatal(err)
	}
	if again.Changes.Len() != 0 {
		t.Errorf("повторный Pull вернул %d записей вместо нуля", again.Changes.Len())
	}
}

// Клиент со старой версией записи не должен затирать более свежую серверную.
func TestPushKeepsNewerServerRecord(t *testing.T) {
	s := testStore(t)
	u := newTestUser(t, s)
	ctx := context.Background()

	id := uuid.New()
	newer := time.Now().UTC()
	older := newer.Add(-time.Hour)

	if _, err := s.Push(ctx, u.ID, &Changes{Books: []Book{
		{ID: id, Title: "Свежая правка", LastPara: 300, UpdatedAt: newer},
	}}); err != nil {
		t.Fatal(err)
	}
	if _, err := s.Push(ctx, u.ID, &Changes{Books: []Book{
		{ID: id, Title: "Устаревшая правка", LastPara: 5, UpdatedAt: older},
	}}); err != nil {
		t.Fatal(err)
	}

	got, err := s.Pull(ctx, u.ID, 0, MaxPullRecords)
	if err != nil {
		t.Fatal(err)
	}
	if len(got.Books) != 1 {
		t.Fatalf("ожидалась одна книга, получено %d", len(got.Books))
	}
	if got.Books[0].Title != "Свежая правка" {
		t.Errorf("устаревшая правка перезаписала свежую: %q", got.Books[0].Title)
	}
	if got.Books[0].LastPara != 300 {
		t.Errorf("прогресс откатился к %d", got.Books[0].LastPara)
	}
}

// Более позднее изменение обязано побеждать — в том числе откат прогресса
// назад, когда пользователь сознательно перечитывает книгу.
func TestPushAppliesNewerRecordIncludingProgressGoingBack(t *testing.T) {
	s := testStore(t)
	u := newTestUser(t, s)
	ctx := context.Background()

	id := uuid.New()
	first := time.Now().UTC().Add(-time.Hour)

	if _, err := s.Push(ctx, u.ID, &Changes{Books: []Book{
		{ID: id, Title: "Книга", LastPara: 300, UpdatedAt: first},
	}}); err != nil {
		t.Fatal(err)
	}
	if _, err := s.Push(ctx, u.ID, &Changes{Books: []Book{
		{ID: id, Title: "Книга", LastPara: 0, UpdatedAt: time.Now().UTC()},
	}}); err != nil {
		t.Fatal(err)
	}

	got, err := s.Pull(ctx, u.ID, 0, MaxPullRecords)
	if err != nil {
		t.Fatal(err)
	}
	if got.Books[0].LastPara != 0 {
		t.Errorf("перечитывание с начала не сохранилось: last_para = %d", got.Books[0].LastPara)
	}
}

// Пустой content_sha не должен стирать уже загруженную на сервер ссылку на
// текст: устройство, которое ещё не выкачало книгу, не знает её адреса.
func TestPushDoesNotClearContentSHA(t *testing.T) {
	s := testStore(t)
	u := newTestUser(t, s)
	ctx := context.Background()

	id := uuid.New()
	if _, err := s.Push(ctx, u.ID, &Changes{Books: []Book{
		{ID: id, Title: "Книга", ContentSHA: "deadbeef", UpdatedAt: time.Now().UTC().Add(-time.Minute)},
	}}); err != nil {
		t.Fatal(err)
	}
	if _, err := s.Push(ctx, u.ID, &Changes{Books: []Book{
		{ID: id, Title: "Книга, переименована", ContentSHA: "", UpdatedAt: time.Now().UTC()},
	}}); err != nil {
		t.Fatal(err)
	}

	got, err := s.Pull(ctx, u.ID, 0, MaxPullRecords)
	if err != nil {
		t.Fatal(err)
	}
	if got.Books[0].ContentSHA != "deadbeef" {
		t.Errorf("ссылка на текст потеряна: %q", got.Books[0].ContentSHA)
	}
	if got.Books[0].Title != "Книга, переименована" {
		t.Errorf("переименование не применилось: %q", got.Books[0].Title)
	}
}

// Главный инвариант синхронизации: последовательные Pull по курсору обязаны
// отдать каждую запись ровно один раз, ничего не потеряв и не задвоив.
func TestPullPagesCoverEveryRecordExactlyOnce(t *testing.T) {
	s := testStore(t)
	u := newTestUser(t, s)
	ctx := context.Background()

	const batches, perBatch = 7, 9
	want := map[uuid.UUID]bool{}
	for b := range batches {
		books := make([]Book, perBatch)
		for i := range books {
			id := uuid.New()
			want[id] = false
			books[i] = Book{
				ID:        id,
				Title:     fmt.Sprintf("Книга %d-%d", b, i),
				UpdatedAt: time.Now().UTC(),
			}
		}
		if _, err := s.Push(ctx, u.ID, &Changes{Books: books}); err != nil {
			t.Fatalf("Push %d: %v", b, err)
		}
	}

	// Лимит намеренно меньше размера посылки: каждая ревизия крупнее страницы,
	// и выборка обязана отдавать ревизию целиком, а не рвать её пополам.
	var cursor int64
	seen := map[uuid.UUID]int{}
	for page := 0; ; page++ {
		if page > batches*4 {
			t.Fatal("Pull не сходится: слишком много страниц")
		}
		got, err := s.Pull(ctx, u.ID, cursor, 4)
		if err != nil {
			t.Fatalf("Pull: %v", err)
		}
		for _, b := range got.Books {
			seen[b.ID]++
		}
		if got.Rev <= cursor && got.Changes.Len() > 0 {
			t.Fatalf("курсор не сдвинулся (%d), но пришли записи — клиент зациклится", got.Rev)
		}
		cursor = got.Rev
		if !got.HasMore {
			break
		}
	}

	if len(seen) != len(want) {
		t.Errorf("получено %d уникальных книг, отправлено %d", len(seen), len(want))
	}
	for id := range want {
		switch seen[id] {
		case 1:
		case 0:
			t.Errorf("книга %s потеряна при постраничной выдаче", id)
		default:
			t.Errorf("книга %s пришла %d раз", id, seen[id])
		}
	}
}

// Чужие записи не должны быть видны и не должны перезаписываться.
func TestPushCannotTouchAnotherUsersRecord(t *testing.T) {
	s := testStore(t)
	victim := newTestUser(t, s)
	attacker := newTestUser(t, s)
	ctx := context.Background()

	id := uuid.New()
	if _, err := s.Push(ctx, victim.ID, &Changes{Books: []Book{
		{ID: id, Title: "Личная книга", UpdatedAt: time.Now().UTC().Add(-time.Hour)},
	}}); err != nil {
		t.Fatal(err)
	}

	// Тот же id книги, но от чужого пользователя и с более свежим временем.
	if _, err := s.Push(ctx, attacker.ID, &Changes{Books: []Book{
		{ID: id, Title: "Подмена", UpdatedAt: time.Now().UTC()},
	}}); err != nil {
		t.Fatalf("Push чужой записи вернул ошибку вместо тихого игнорирования: %v", err)
	}

	got, err := s.Pull(ctx, victim.ID, 0, MaxPullRecords)
	if err != nil {
		t.Fatal(err)
	}
	if len(got.Books) != 1 || got.Books[0].Title != "Личная книга" {
		t.Errorf("чужой Push изменил книгу: %+v", got.Books)
	}

	other, err := s.Pull(ctx, attacker.ID, 0, MaxPullRecords)
	if err != nil {
		t.Fatal(err)
	}
	if len(other.Books) != 0 {
		t.Errorf("чужая книга видна атакующему: %+v", other.Books)
	}
}

func TestPushRejectsOversizedBatch(t *testing.T) {
	s := testStore(t)
	u := newTestUser(t, s)

	books := make([]Book, MaxPushRecords+1)
	for i := range books {
		books[i] = Book{ID: uuid.New(), UpdatedAt: time.Now().UTC()}
	}
	if _, err := s.Push(context.Background(), u.ID, &Changes{Books: books}); err == nil {
		t.Fatal("слишком большая посылка принята")
	}
}

// Курсор из будущего (например, после восстановления базы) обязан приводить к
// полной перевыкачке, а не к молчаливой пустоте навсегда.
func TestPullResetsCursorFromFuture(t *testing.T) {
	s := testStore(t)
	u := newTestUser(t, s)
	ctx := context.Background()

	if _, err := s.Push(ctx, u.ID, &Changes{Books: []Book{
		{ID: uuid.New(), Title: "Книга", UpdatedAt: time.Now().UTC()},
	}}); err != nil {
		t.Fatal(err)
	}

	got, err := s.Pull(ctx, u.ID, 999999, MaxPullRecords)
	if err != nil {
		t.Fatal(err)
	}
	if len(got.Books) != 1 {
		t.Errorf("после сброса курсора книга не пришла: %d записей", len(got.Books))
	}
}

func TestPalaceRoundTrip(t *testing.T) {
	s := testStore(t)
	u := newTestUser(t, s)
	ctx := context.Background()

	id := uuid.New()
	now := time.Now().UTC().Truncate(time.Millisecond)

	if _, err := s.Push(ctx, u.ID, &Changes{
		Palaces: []Palace{{
			ID: id, Name: "Кухня бабушки", SceneID: "kuhinja",
			Pins: map[string]PalacePin{
				"prozor": {Word: "прозор", Translation: "окно", VocabID: ""},
				"sto":    {Word: "сто", Translation: "стол", VocabID: "abc"},
			},
			UpdatedAt: now,
		}},
	}); err != nil {
		t.Fatalf("Push: %v", err)
	}

	res, err := s.Pull(ctx, u.ID, 0, 100)
	if err != nil {
		t.Fatalf("Pull: %v", err)
	}
	if len(res.Palaces) != 1 {
		t.Fatalf("ожидался один дворец, пришло %d", len(res.Palaces))
	}
	got := res.Palaces[0]
	if got.Name != "Кухня бабушки" || got.SceneID != "kuhinja" {
		t.Fatalf("дворец вернулся изменённым: %+v", got)
	}
	if len(got.Pins) != 2 || got.Pins["sto"].Word != "сто" ||
		got.Pins["prozor"].Translation != "окно" {
		t.Fatalf("развеска не сохранилась: %+v", got.Pins)
	}
}

func TestPalaceKeepsNewerServerRecord(t *testing.T) {
	s := testStore(t)
	u := newTestUser(t, s)
	ctx := context.Background()

	id := uuid.New()
	newer := time.Now().UTC().Truncate(time.Millisecond)
	older := newer.Add(-time.Hour)

	if _, err := s.Push(ctx, u.ID, &Changes{Palaces: []Palace{{
		ID: id, Name: "Свежее", SceneID: "ulica",
		Pins: map[string]PalacePin{"drvo": {Word: "дрво"}}, UpdatedAt: newer,
	}}}); err != nil {
		t.Fatalf("Push: %v", err)
	}
	if _, err := s.Push(ctx, u.ID, &Changes{Palaces: []Palace{{
		ID: id, Name: "Устаревшее", SceneID: "kuhinja", UpdatedAt: older,
	}}}); err != nil {
		t.Fatalf("Push устаревшего: %v", err)
	}

	res, err := s.Pull(ctx, u.ID, 0, 100)
	if err != nil {
		t.Fatalf("Pull: %v", err)
	}
	if len(res.Palaces) != 1 || res.Palaces[0].Name != "Свежее" {
		t.Fatalf("устаревшая правка затёрла свежую: %+v", res.Palaces)
	}
}

func TestPalaceDropsEmptyPinsAndClipsLongValues(t *testing.T) {
	s := testStore(t)
	u := newTestUser(t, s)
	ctx := context.Background()

	id := uuid.New()
	long := strings.Repeat("ш", 400)

	if _, err := s.Push(ctx, u.ID, &Changes{Palaces: []Palace{{
		ID: id, Name: strings.Repeat("Д", 400), SceneID: "kuhinja",
		Pins: map[string]PalacePin{
			// Предмет без слова хранить нечего.
			"prozor": {Word: "", Translation: "окно"},
			"sto":    {Word: long, Translation: long},
		},
		UpdatedAt: time.Now().UTC(),
	}}}); err != nil {
		t.Fatalf("Push: %v", err)
	}

	res, err := s.Pull(ctx, u.ID, 0, 100)
	if err != nil {
		t.Fatalf("Pull: %v", err)
	}
	got := res.Palaces[0]
	if _, ok := got.Pins["prozor"]; ok {
		t.Fatal("предмет без слова попал в базу")
	}
	if len(got.Pins) != 1 {
		t.Fatalf("ожидалась одна развеска, пришло %d", len(got.Pins))
	}
	if n := len(got.Pins["sto"].Word); n > maxPinWord {
		t.Fatalf("слово не укорочено: %d байт", n)
	}
	// Обрезка обязана оставить строку читаемой, а не оборвать символ на середине.
	if !utf8.ValidString(got.Pins["sto"].Word) || !utf8.ValidString(got.Name) {
		t.Fatal("обрезка разрубила символ")
	}
	if len(got.Name) > maxPalaceName {
		t.Fatalf("название не укорочено: %d байт", len(got.Name))
	}
}

func TestPalaceTombstoneSurvives(t *testing.T) {
	s := testStore(t)
	u := newTestUser(t, s)
	ctx := context.Background()

	id := uuid.New()
	now := time.Now().UTC().Truncate(time.Millisecond)

	if _, err := s.Push(ctx, u.ID, &Changes{Palaces: []Palace{
		{ID: id, Name: "Комната", SceneID: "dnevna", UpdatedAt: now},
	}}); err != nil {
		t.Fatalf("Push: %v", err)
	}
	if _, err := s.Push(ctx, u.ID, &Changes{Palaces: []Palace{
		{ID: id, Name: "Комната", SceneID: "dnevna", Deleted: true,
			UpdatedAt: now.Add(time.Minute)},
	}}); err != nil {
		t.Fatalf("Push надгробия: %v", err)
	}

	res, err := s.Pull(ctx, u.ID, 0, 100)
	if err != nil {
		t.Fatalf("Pull: %v", err)
	}
	if len(res.Palaces) != 1 || !res.Palaces[0].Deleted {
		t.Fatalf("надгробие не дошло: %+v", res.Palaces)
	}
}

func TestPalaceCannotTouchAnotherUsersRecord(t *testing.T) {
	s := testStore(t)
	owner := newTestUser(t, s)
	stranger := newTestUser(t, s)
	ctx := context.Background()

	id := uuid.New()
	now := time.Now().UTC().Truncate(time.Millisecond)

	if _, err := s.Push(ctx, owner.ID, &Changes{Palaces: []Palace{{
		ID: id, Name: "Моё", SceneID: "kuhinja", UpdatedAt: now,
	}}}); err != nil {
		t.Fatalf("Push владельца: %v", err)
	}
	// Тот же идентификатор от чужого пользователя не должен ни перезаписать
	// запись, ни создать вторую с тем же ключом.
	if _, err := s.Push(ctx, stranger.ID, &Changes{Palaces: []Palace{{
		ID: id, Name: "Чужое", SceneID: "ulica", UpdatedAt: now.Add(time.Hour),
	}}}); err != nil {
		t.Fatalf("Push чужака: %v", err)
	}

	res, err := s.Pull(ctx, owner.ID, 0, 100)
	if err != nil {
		t.Fatalf("Pull: %v", err)
	}
	if len(res.Palaces) != 1 || res.Palaces[0].Name != "Моё" {
		t.Fatalf("чужак изменил дворец: %+v", res.Palaces)
	}
	other, err := s.Pull(ctx, stranger.ID, 0, 100)
	if err != nil {
		t.Fatalf("Pull чужака: %v", err)
	}
	if len(other.Palaces) != 0 {
		t.Fatalf("чужаку достался чужой дворец: %+v", other.Palaces)
	}
}
