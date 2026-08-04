package store

import (
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
