package store

import (
	"strings"
	"testing"
)

// Миграции попадают в бинарник через go:embed, и каталог у них ровно один —
// `internal/store/migrations`. Файл, положенный мимо него, компилируется,
// проходит все тесты и молча не доезжает до базы: выкатка сообщает «миграции
// применены», применив ноль, а сервер отвечает 500 на первом же запросе к
// несуществующей таблице. Именно так и случилось с document_translations.
//
// Поэтому здесь проверяется не форма файлов, а факт: таблица, от которой
// зависит код пакета, обязана создаваться какой-нибудь встроенной миграцией.

// requiredTables — таблицы, без которых соответствующая возможность мертва.
// Список пополняется вместе с новой миграцией: это дешевле, чем разбирать
// SQL из кода, и надёжнее, чем надеяться на внимательность.
var requiredTables = []string{
	"users",
	"sessions",
	"books",
	"vocabulary",
	"reviews",
	"course_progress",
	"palaces",
	"quizzes",
	"shared_books",
	"teacher_lessons",
	"lesson_revisions",
	"document_translations",
	"micro_feed_sources",
	"micro_feed_imports",
	"micro_feed_content_items",
	"micro_feed_interactions",
	"micro_feed_reactions",
	"micro_feed_profiles_embeddings",
}

func TestEmbeddedMigrationsCreateRequiredTables(t *testing.T) {
	names := KnownMigrations()
	if len(names) == 0 {
		t.Fatal("во встроенной файловой системе нет ни одной миграции")
	}

	var all strings.Builder
	for _, name := range names {
		body, err := migrationsFS.ReadFile("migrations/" + name)
		if err != nil {
			t.Fatalf("%s не читается: %v", name, err)
		}
		all.Write(body)
		all.WriteByte('\n')
	}
	sql := strings.ToLower(all.String())

	for _, table := range requiredTables {
		if !strings.Contains(sql, "create table if not exists "+table) &&
			!strings.Contains(sql, "create table "+table) {
			t.Errorf("таблицу %q не создаёт ни одна встроенная миграция — "+
				"файл лежит не в internal/store/migrations и в сборку не попал",
				table)
		}
	}
}

// Имена задают порядок применения, поэтому они должны быть уникальны и
// упорядочены по номеру. Дубль номера означает, что две миграции применятся в
// произвольном порядке — на разных серверах по-разному.
func TestMigrationNamesAreUniqueAndOrdered(t *testing.T) {
	names := KnownMigrations()
	seen := map[string]bool{}

	for i, name := range names {
		prefix, _, ok := strings.Cut(name, "_")
		if !ok || len(prefix) != 4 {
			t.Errorf("%s: имя должно начинаться с четырёхзначного номера", name)
			continue
		}
		if seen[prefix] {
			t.Errorf("номер %s встречается дважды", prefix)
		}
		seen[prefix] = true
		if i > 0 && names[i-1] >= name {
			t.Errorf("%s стоит после %s — порядок применения нарушен", name, names[i-1])
		}
	}
}
