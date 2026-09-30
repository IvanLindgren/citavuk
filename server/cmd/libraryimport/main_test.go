package main

import (
	"context"
	"encoding/json"
	"os"
	"path/filepath"
	"strings"
	"testing"

	"github.com/citavuk/server/internal/store"
	"github.com/google/uuid"
)

func validEntry() entry {
	return entry{LibraryItemInput: store.LibraryItemInput{Kind: "book", Title: "Книга", Author: "Автор", Published: true,
		Body: strings.Repeat("Ово је лепа прича о људима. ", 300) + "https://sr.wikisource.org/wiki/Test https://creativecommons.org/licenses/by-sa/4.0/"},
		SourceURL: "https://sr.wikisource.org/wiki/Test", License: "public-domain", AuthorDeath: 1904,
		Chapters: 1, SourceRevisions: []string{"https://sr.wikisource.org/w/index.php?oldid=1"}}
}

func TestImportIsIdempotentAndPreservesEdits(t *testing.T) {
	databaseURL := os.Getenv("CITAVUK_TEST_DATABASE_URL")
	if databaseURL == "" {
		t.Skip("нужна отдельная тестовая БД")
	}
	t.Setenv("DATABASE_URL", databaseURL)
	ctx := context.Background()
	st, err := store.Open(ctx, databaseURL)
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(st.Close)
	if _, err = st.Migrate(ctx); err != nil {
		t.Fatal(err)
	}
	e := validEntry()
	e.Title = "Тест импорта " + uuid.NewString()
	oldSource := e.SourceURL
	e.SourceURL = "https://sr.wikisource.org/wiki/Citavuk_test_" + uuid.NewString()
	e.Body = strings.ReplaceAll(e.Body, oldSource, e.SourceURL)
	id := uuid.NewSHA1(uuid.NameSpaceURL, []byte("citavuk:supporter-library:"+e.SourceURL))
	t.Cleanup(func() { _, _ = st.Pool.Exec(ctx, "DELETE FROM supporter_library_items WHERE id = $1", id) })
	file := filepath.Join(t.TempDir(), "bundle.json")
	data, _ := json.Marshal(map[string]any{"items": []entry{e}})
	if err = os.WriteFile(file, data, 0600); err != nil {
		t.Fatal(err)
	}
	if err = run(file, "", true); err != nil {
		t.Fatal(err)
	}
	if _, err = st.Pool.Exec(ctx, "UPDATE supporter_library_items SET description = 'Редактура администратора' WHERE id = $1", id); err != nil {
		t.Fatal(err)
	}
	if err = run(file, "", true); err != nil {
		t.Fatal(err)
	}
	var count int
	var description string
	if err = st.Pool.QueryRow(ctx, "SELECT count(*), min(description) FROM supporter_library_items WHERE title = $1", e.Title).Scan(&count, &description); err != nil {
		t.Fatal(err)
	}
	if count != 1 || description != "Редактура администратора" {
		t.Fatal("повтор создал копию или затёр редактуру")
	}
}

func TestValidate(t *testing.T) {
	if err := validate([]entry{validEntry()}, 2026); err != nil {
		t.Fatal(err)
	}
	for name, change := range map[string]func(*entry){
		"защищённый перевод":   func(e *entry) { e.Translator = "Переводчик"; e.TranslatorDeath = 1990 },
		"нет года переводчика": func(e *entry) { e.Translator = "Переводчик" },
		"истекает в этом году": func(e *entry) { e.AuthorDeath = 1956 },
		"пустой текст":         func(e *entry) { e.Body = "Оглавление" },
		"нет лицензии":         func(e *entry) { e.License = "" },
		"не все главы":         func(e *entry) { e.Chapters = 2 },
		"нет атрибуции":        func(e *entry) { e.Body = strings.Repeat("Текст. ", 600) },
		"чужой источник":       func(e *entry) { e.SourceURL = "https://example.com/wiki/Test" },
		"не сербский": func(e *entry) {
			e.Body = strings.Repeat("This story was written in English and is not Serbian. ", 300) + "https://sr.wikisource.org/wiki/Test https://creativecommons.org/licenses/by-sa/4.0/"
		},
	} {
		t.Run(name, func(t *testing.T) {
			e := validEntry()
			change(&e)
			if validate([]entry{e}, 2026) == nil {
				t.Fatal("небезопасный пакет принят")
			}
		})
	}
	if validate([]entry{validEntry(), validEntry()}, 2026) == nil {
		t.Fatal("повтор книги принят")
	}
}
