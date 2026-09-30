// libraryimport добавляет проверенный пакет в закрытую библиотеку.
// По умолчанию только проверяет файл, -apply явно разрешает запись в БД.
package main

import (
	"context"
	"encoding/json"
	"errors"
	"flag"
	"fmt"
	"io"
	"net/url"
	"os"
	"strings"
	"time"

	"github.com/citavuk/server/internal/config"
	"github.com/citavuk/server/internal/serbian"
	"github.com/citavuk/server/internal/store"
	"github.com/google/uuid"
)

type entry struct {
	store.LibraryItemInput
	SourceURL       string   `json:"sourceUrl"`
	License         string   `json:"license"`
	SourceRevisions []string `json:"sourceRevisions"`
	AuthorDeath     int      `json:"authorDeath"`
	Translator      string   `json:"translator"`
	TranslatorDeath int      `json:"translatorDeath"`
	Chapters        int      `json:"chapters"`
}

func validate(entries []entry, year int) error {
	if len(entries) == 0 || len(entries) > 100 {
		return errors.New("пакет должен содержать от 1 до 100 книг")
	}
	seen := map[string]bool{}
	for i := range entries {
		e := &entries[i]
		if err := e.Normalize(); err != nil {
			return fmt.Errorf("книга %d: %w", i+1, err)
		}
		u, err := url.Parse(e.SourceURL)
		if err != nil || u.Scheme != "https" || u.Host != "sr.wikisource.org" || !strings.HasPrefix(u.Path, "/wiki/") || u.User != nil {
			return fmt.Errorf("книга %d: неверный первоисточник", i+1)
		}
		if seen[e.SourceURL] {
			return errors.New("повторяющийся первоисточник в пакете")
		}
		seen[e.SourceURL] = true
		if e.Kind != "book" || !e.Published || len([]rune(e.Body)) < 3000 || e.Chapters < 1 || len(e.SourceRevisions) != e.Chapters {
			return fmt.Errorf("книга %d: нет полного проверенного текста", i+1)
		}
		if e.License != "public-domain" || e.AuthorDeath <= 0 || e.AuthorDeath+70 >= year || (e.Translator != "" && (e.TranslatorDeath <= 0 || e.TranslatorDeath+70 >= year)) {
			return fmt.Errorf("книга %d: не подтверждены права автора/переводчика", i+1)
		}
		if !strings.Contains(e.Body, e.SourceURL) || !strings.Contains(e.Body, "https://creativecommons.org/licenses/by-sa/4.0/") {
			return fmt.Errorf("книга %d: нет ссылки на источник и атрибуции оцифровки", i+1)
		}
		if !serbian.CheckDocument(strings.Split(e.Body, "\n")).Serbian {
			return fmt.Errorf("книга %d: не подтверждён сербский язык", i+1)
		}
	}
	return nil
}

func run(file, env string, apply bool) error {
	f, err := os.Open(file)
	if err != nil {
		return errors.New("не удалось открыть пакет книг")
	}
	defer f.Close()
	var bundle struct {
		Items []entry `json:"items"`
	}
	decoder := json.NewDecoder(io.LimitReader(f, 160<<20))
	decoder.DisallowUnknownFields()
	if err := decoder.Decode(&bundle); err != nil {
		return errors.New("неверный JSON пакета книг")
	}
	if err := decoder.Decode(new(any)); err != io.EOF {
		return errors.New("лишние данные после пакета книг")
	}
	if err := validate(bundle.Items, time.Now().Year()); err != nil {
		return err
	}
	if !apply {
		fmt.Printf("Проверено %d книг; БД не изменена. Для публикации: -apply\n", len(bundle.Items))
		return nil
	}
	cfg, err := config.Load(env)
	if err != nil {
		return errors.New("не удалось прочитать конфигурацию сервера")
	}
	ctx, cancel := context.WithTimeout(context.Background(), 2*time.Minute)
	defer cancel()
	st, err := store.Open(ctx, cfg.DatabaseURL)
	if err != nil {
		return errors.New("не удалось подключиться к БД")
	}
	defer st.Close()
	tx, err := st.Pool.Begin(ctx)
	if err != nil {
		return err
	}
	defer tx.Rollback(context.Background())
	// Одновременные запуски не должны создавать копии одного и того же пакета.
	if _, err := tx.Exec(ctx, "SELECT pg_advisory_xact_lock(hashtext('citavuk:libraryimport'))"); err != nil {
		return err
	}
	count := int64(0)
	for _, e := range bundle.Items {
		id := uuid.NewSHA1(uuid.NameSpaceURL, []byte("citavuk:supporter-library:"+e.SourceURL))
		tag, err := tx.Exec(ctx, `INSERT INTO supporter_library_items
		    (id, kind, title, author, description, level, cover_url, body, published)
		    SELECT $1, 'book', $2, $3, $4, $5, $6, $7, true
		    WHERE NOT EXISTS (SELECT 1 FROM supporter_library_items WHERE kind = 'book' AND title = $2 AND author = $3)
		    ON CONFLICT (id) DO NOTHING`, id, e.Title, e.Author, e.Description, e.Level, e.CoverURL, e.Body)
		if err != nil {
			return errors.New("не удалось добавить книгу; транзакция отменена")
		}
		count += tag.RowsAffected()
	}
	if err := tx.Commit(ctx); err != nil {
		return err
	}
	for _, e := range bundle.Items {
		var ready bool
		if err := st.Pool.QueryRow(ctx, `SELECT EXISTS (
		    SELECT 1 FROM supporter_library_items WHERE kind = 'book' AND title = $1 AND author = $2
		    AND published AND char_length(body) >= 3000)`, e.Title, e.Author).Scan(&ready); err != nil || !ready {
			return errors.New("после импорта не подтверждена доступность одной из книг")
		}
	}
	fmt.Printf("Добавлено %d книг, уже существовало %d. Прежние записи не изменены.\n", count, int64(len(bundle.Items))-count)
	fmt.Printf("Проверено в БД: %d опубликованных книг с полными текстами.\n", len(bundle.Items))
	return nil
}

func main() {
	file := flag.String("file", "", "пакет с проверенными текстами книг")
	env := flag.String("env", "/opt/citavuk/.env", "конфигурация сервера")
	apply := flag.Bool("apply", false, "добавить книги в закрытую библиотеку")
	flag.Parse()
	if err := run(*file, *env, *apply); err != nil {
		fmt.Fprintln(os.Stderr, err)
		os.Exit(1)
	}
}
