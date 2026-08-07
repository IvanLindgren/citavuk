package store

import (
	"context"
	"errors"
	"fmt"
	"regexp"
	"strconv"
	"testing"

	"github.com/google/uuid"
)

// Публикация версии урока собирается из двух разных условий — авторского и
// модераторского. Тест проверяет не текст запроса, а его согласованность с
// параметрами: PostgreSQL в расширенном протоколе обязан вывести тип каждого
// параметра, и параметр, которого нет в тексте, роняет запрос целиком
// («could not determine data type of parameter $N»). Модераторская публикация
// именно так и падала с 500 — база не могла вывести тип неиспользуемого
// author_id. Такую ошибку не видно ни при чтении, ни при компиляции.
func TestPublishRevisionQueryUsesEveryParameter(t *testing.T) {
	placeholder := regexp.MustCompile(`\$(\d+)`)

	for _, admin := range []bool{true, false} {
		t.Run(fmt.Sprintf("admin=%v", admin), func(t *testing.T) {
			query, args := publishRevisionQuery(
				uuid.New(), uuid.New(), uuid.New(), admin, uuid.New(), "комментарий")

			used := map[int]bool{}
			highest := 0
			for _, match := range placeholder.FindAllStringSubmatch(query, -1) {
				n, err := strconv.Atoi(match[1])
				if err != nil {
					t.Fatalf("нечитаемый плейсхолдер %q", match[0])
				}
				used[n] = true
				if n > highest {
					highest = n
				}
			}

			if highest != len(args) {
				t.Fatalf("наибольший плейсхолдер $%d, а параметров передано %d",
					highest, len(args))
			}
			for n := 1; n <= len(args); n++ {
				if !used[n] {
					t.Errorf("параметр $%d передан, но в запросе не используется — "+
						"база не сможет вывести его тип", n)
				}
			}
		})
	}
}

// Условия у автора и у модератора не должны меняться местами: автор публикует
// только свой урок, модератор — только отправленный на проверку.
func TestPublishRevisionQueryScopes(t *testing.T) {
	adminQuery, _ := publishRevisionQuery(
		uuid.New(), uuid.New(), uuid.New(), true, uuid.New(), "")
	if !contains(adminQuery, "r.status='pending'") {
		t.Error("модератор обязан публиковать только отправленное на проверку")
	}
	if contains(adminQuery, "l.author_id") {
		t.Error("модератор не ограничен своим авторством")
	}

	authorQuery, _ := publishRevisionQuery(
		uuid.New(), uuid.New(), uuid.New(), false, uuid.Nil, "")
	if !contains(authorQuery, "l.author_id") {
		t.Error("автор обязан публиковать только свой урок")
	}
	if contains(authorQuery, "r.status='pending'") {
		t.Error("автор публикует из черновика, а не из проверки")
	}
}

func contains(haystack, needle string) bool {
	return len(haystack) >= len(needle) &&
		regexp.MustCompile(regexp.QuoteMeta(needle)).MatchString(haystack)
}

// Модератор не один, и решают они не по очереди. Между чтением «ревизия на
// проверке» и записью решения ту же ревизию успевает рассудить второй, поэтому
// условие обязано стоять в самом UPDATE. Одобрение его несло, отказ — нет:
// пара «одобрил, следом отклонил» переводила ревизию в rejected, а
// teacher_lessons.published_revision_id продолжал на неё ссылаться. Урок
// оставался опубликованным ревизией, помеченной отклонённой.
func TestReviewLessonRevisionRejectsOnlyPending(t *testing.T) {
	s := testStore(t)
	ctx := context.Background()
	if _, err := s.Migrate(ctx); err != nil {
		t.Fatal(err)
	}

	author, err := s.CreateUser(ctx,
		"review-race-"+uuid.NewString()+"@example.test", "", "Автор", true)
	if err != nil {
		t.Fatal(err)
	}
	admin, err := s.CreateUser(ctx,
		"review-admin-"+uuid.NewString()+"@example.test", "", "Модератор", true)
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() {
		_, _ = s.Pool.Exec(context.Background(),
			`DELETE FROM users WHERE id = ANY($1)`, []uuid.UUID{author.ID, admin.ID})
	})

	lesson, err := s.CreateLesson(ctx, author.ID, "race-"+uuid.NewString(), LessonInput{
		Title: "Проверка гонки", Summary: "", Level: "A1", LessonType: "grammar",
		Topic: "тест", Tags: []string{}, EstimatedMinutes: 5, Script: "latin",
		Content: []byte(`{"theory":[],"exercises":[]}`),
	})
	if err != nil {
		t.Fatalf("CreateLesson: %v", err)
	}

	var revisionID uuid.UUID
	if err := s.Pool.QueryRow(ctx,
		`SELECT id FROM lesson_revisions WHERE lesson_id=$1`, lesson.ID).Scan(&revisionID); err != nil {
		t.Fatal(err)
	}
	if err := s.SubmitPublicLesson(ctx, author.ID, lesson.ID, revisionID); err != nil {
		t.Fatalf("SubmitPublicLesson: %v", err)
	}

	// Первый модератор одобряет.
	if err := s.ReviewLessonRevision(ctx, revisionID, admin.ID, true, "хорошо"); err != nil {
		t.Fatalf("одобрение: %v", err)
	}

	// Второй отклоняет ту же ревизию. Вызывается rejectRevision напрямую, а не
	// ReviewLessonRevision: там впереди стоит чтение с тем же условием, и при
	// последовательном вызове до записи дело не доходит. Но чтение и запись —
	// два разных запроса, и в настоящей гонке оба модератора проходят чтение,
	// пока ревизия ещё на проверке. Воспроизвести это расписанием нельзя, а
	// проверить условие в самой записи — можно, и именно оно тут и защищает.
	if err := s.rejectRevision(ctx, revisionID, admin.ID, "нет"); !errors.Is(err, ErrRevisionNotFound) {
		t.Fatalf("отказ прошёл по уже опубликованной ревизии: err = %v", err)
	}

	var status string
	var published *uuid.UUID
	if err := s.Pool.QueryRow(ctx, `
        SELECT r.status, l.published_revision_id
          FROM lesson_revisions r JOIN teacher_lessons l ON l.id=r.lesson_id
         WHERE r.id=$1`, revisionID).Scan(&status, &published); err != nil {
		t.Fatal(err)
	}
	if status != "published" {
		t.Errorf("ревизия в состоянии %q — опубликованный урок ссылается на отклонённую версию", status)
	}
	if published == nil || *published != revisionID {
		t.Errorf("published_revision_id = %v", published)
	}
}
