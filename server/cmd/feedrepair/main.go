// feedrepair публикует только проверенную редактуру существующих карточек.
// По умолчанию dry-run. ID, ссылки, реакции, комментарии и права не меняются.
package main

import (
	"bufio"
	"context"
	"encoding/json"
	"errors"
	"flag"
	"fmt"
	"io"
	"os"
	"strings"
	"time"

	"github.com/citavuk/server/internal/config"
	"github.com/citavuk/server/internal/feed"
	"github.com/citavuk/server/internal/store"
	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
)

type snapshot struct {
	ID            uuid.UUID             `json:"id"`
	Kind          string                `json:"kind"`
	Category      string                `json:"category"`
	CEFR          string                `json:"cefr"`
	Tags          []string              `json:"tags"`
	TitleLatin    string                `json:"title_latin"`
	TitleCyrillic string                `json:"title_cyrillic"`
	TextLatin     string                `json:"text_latin"`
	TextCyrillic  string                `json:"text_cyrillic"`
	Words         []store.DifficultWord `json:"difficult_words"`
	UpdatedAt     time.Time             `json:"updated_at"`
}
type editorial struct {
	ID            uuid.UUID             `json:"id"`
	TitleCyrillic string                `json:"title_cyrillic"`
	TitleLatin    string                `json:"title_latin"`
	TextCyrillic  string                `json:"text_cyrillic"`
	TextLatin     string                `json:"text_latin"`
	Words         []store.DifficultWord `json:"difficult_words"`
}
type record struct {
	ID        uuid.UUID `json:"id"`
	OK        bool      `json:"ok"`
	Editorial editorial `json:"editorial"`
}

func loadPacket(snapshotPath, reviewedPath string, partial bool) ([]snapshot, map[uuid.UUID]editorial, error) {
	sf, err := os.Open(snapshotPath)
	if err != nil {
		return nil, nil, err
	}
	defer sf.Close()
	var originals []snapshot
	if err := json.NewDecoder(io.LimitReader(sf, 64<<20)).Decode(&originals); err != nil {
		return nil, nil, err
	}
	if len(originals) == 0 || len(originals) > 10000 {
		return nil, nil, errors.New("недопустимый снимок")
	}
	known := map[uuid.UUID]snapshot{}
	for _, s := range originals {
		if s.ID == uuid.Nil || s.UpdatedAt.IsZero() {
			return nil, nil, errors.New("нет ID/времени снимка")
		}
		if _, ok := known[s.ID]; ok {
			return nil, nil, errors.New("повтор ID в снимке")
		}
		known[s.ID] = s
	}
	input, err := os.Open(reviewedPath)
	if err != nil {
		return nil, nil, err
	}
	defer input.Close()
	scanner := bufio.NewScanner(input)
	scanner.Buffer(make([]byte, 4096), 1<<20)
	patches := map[uuid.UUID]editorial{}
	for scanner.Scan() {
		var r record
		if err := json.Unmarshal(scanner.Bytes(), &r); err != nil {
			return nil, nil, err
		}
		if !r.OK {
			continue
		}
		s, ok := known[r.ID]
		if !ok || r.Editorial.ID != r.ID {
			return nil, nil, errors.New("посторонний ID редакторского ответа")
		}
		p := r.Editorial
		latinTitle, latinText, err := feed.CanonicalEditorial(p.TitleCyrillic, p.TextCyrillic, p.Words)
		if err != nil {
			return nil, nil, fmt.Errorf("%s: %w", r.ID, err)
		}
		if latinTitle != p.TitleLatin || latinText != p.TextLatin {
			return nil, nil, errors.New("пакет содержит несогласованные алфавиты")
		}
		item := store.MicroFeedItem{Kind: s.Kind, Category: s.Category, CEFR: s.CEFR, Tags: s.Tags, OriginalScript: "translated",
			TitleLatin: p.TitleLatin, TitleCyrillic: p.TitleCyrillic, TextLatin: p.TextLatin, TextCyrillic: p.TextCyrillic, DifficultWords: p.Words}
		if err := feed.ValidateItem(&item); err != nil {
			return nil, nil, fmt.Errorf("%s: %w", r.ID, err)
		}
		patches[r.ID] = p
	}
	if err := scanner.Err(); err != nil {
		return nil, nil, err
	}
	if len(patches) == 0 || (!partial && len(patches) != len(originals)) {
		return nil, nil, fmt.Errorf("неполный пакет: %d из %d", len(patches), len(originals))
	}
	return originals, patches, nil
}

func publish(ctx context.Context, st *store.Store, originals []snapshot, patches map[uuid.UUID]editorial, backupPath string) (int, error) {
	// O_EXCL исключает потерю предыдущего снимка. Файл приватный, вне webroot.
	backup, err := os.OpenFile(backupPath, os.O_CREATE|os.O_EXCL|os.O_WRONLY, 0600)
	if err != nil {
		return 0, err
	}
	defer backup.Close()
	tx, err := st.Pool.Begin(ctx)
	if err != nil {
		return 0, err
	}
	defer tx.Rollback(context.Background())
	if _, err := tx.Exec(ctx, "SELECT pg_advisory_xact_lock(hashtext('citavuk:feedrepair'))"); err != nil {
		return 0, err
	}
	byID := map[uuid.UUID]snapshot{}
	ids := make([]uuid.UUID, 0, len(patches))
	for _, s := range originals {
		byID[s.ID] = s
		if _, ok := patches[s.ID]; ok {
			ids = append(ids, s.ID)
		}
	}
	rows, err := tx.Query(ctx, `SELECT id,title_latin,title_cyrillic,text_latin,text_cyrillic,difficult_words,updated_at,embedding::text
	 FROM micro_feed_content_items WHERE id=ANY($1) AND status='published' AND kind<>'video' ORDER BY id FOR UPDATE`, ids)
	if err != nil {
		return 0, err
	}
	defer rows.Close()
	count := 0
	for rows.Next() {
		var current snapshot
		var words []byte
		var embedding *string
		err := rows.Scan(&current.ID, &current.TitleLatin, &current.TitleCyrillic, &current.TextLatin, &current.TextCyrillic, &words, &current.UpdatedAt, &embedding)
		if err != nil {
			return 0, errors.New("карточка исчезла; пакет отменён")
		}
		s := byID[current.ID]
		if !current.UpdatedAt.Equal(s.UpdatedAt) || current.TitleLatin != s.TitleLatin || current.TitleCyrillic != s.TitleCyrillic || current.TextLatin != s.TextLatin || current.TextCyrillic != s.TextCyrillic {
			return 0, fmt.Errorf("%s изменена после снимка; чужая правка сохранена, пакет отменён", s.ID)
		}
		if err := json.Unmarshal(words, &current.Words); err != nil {
			return 0, err
		}
		preimage := struct {
			Snapshot  snapshot `json:"snapshot"`
			Embedding *string  `json:"embedding"`
		}{current, embedding}
		if err := json.NewEncoder(backup).Encode(preimage); err != nil {
			return 0, err
		}
		count++
	}
	if err := rows.Err(); err != nil {
		return 0, err
	}
	rows.Close()
	if count != len(patches) {
		return 0, errors.New("карточка исчезла; пакет отменён")
	}
	if _, err := tx.Exec(ctx, `CREATE TEMP TABLE citavuk_feedrepair_patch (id uuid PRIMARY KEY,expected_at timestamptz,title_latin text,title_cyrillic text,text_latin text,text_cyrillic text,words jsonb) ON COMMIT DROP`); err != nil {
		return 0, err
	}
	copyRows := make([][]any, 0, len(patches))
	for _, s := range originals {
		p, ok := patches[s.ID]
		if !ok {
			continue
		}
		words, err := json.Marshal(p.Words)
		if err != nil {
			return 0, err
		}
		copyRows = append(copyRows, []any{s.ID, s.UpdatedAt, p.TitleLatin, p.TitleCyrillic, p.TextLatin, p.TextCyrillic, words})
	}
	if _, err := tx.CopyFrom(ctx, pgx.Identifier{"citavuk_feedrepair_patch"}, []string{"id", "expected_at", "title_latin", "title_cyrillic", "text_latin", "text_cyrillic", "words"}, pgx.CopyFromRows(copyRows)); err != nil {
		return 0, err
	}
	// Один UPDATE не держит первые карточки заблокированными на время тысяч
	// сетевых round-trip. Счётчики/комментарии и приближённые embeddings прежние.
	tag, err := tx.Exec(ctx, `UPDATE micro_feed_content_items c SET title_latin=p.title_latin,title_cyrillic=p.title_cyrillic,text_latin=p.text_latin,text_cyrillic=p.text_cyrillic,difficult_words=p.words,updated_at=now()
	 FROM citavuk_feedrepair_patch p WHERE c.id=p.id AND c.status='published' AND c.updated_at=p.expected_at`)
	if err != nil || tag.RowsAffected() != int64(count) {
		return 0, errors.New("обновление не подтверждено; пакет отменён")
	}
	if err := backup.Sync(); err != nil {
		return 0, err
	}
	if err := tx.Commit(ctx); err != nil {
		return 0, err
	}
	return count, nil
}

func main() {
	snapshotFile := flag.String("snapshot", "", "исходный снимок без пользовательских данных")
	packet := flag.String("file", "", "редакторский журнал JSONL")
	env := flag.String("env", "/opt/citavuk/.env", "приватная конфигурация")
	backup := flag.String("backup", "", "новый приватный файл резервной копии")
	apply := flag.Bool("apply", false, "опубликовать проверенный пакет")
	partial := flag.Bool("allow-partial", false, "явно разрешить неполный пакет")
	flag.Parse()
	originals, patches, err := loadPacket(*snapshotFile, *packet, *partial)
	if err != nil {
		fmt.Fprintln(os.Stderr, err)
		os.Exit(1)
	}
	fmt.Printf("Проверено %d исправленных карточек из %d.\n", len(patches), len(originals))
	if !*apply {
		fmt.Println("БД не изменена. Для публикации нужны -apply и -backup.")
		return
	}
	if strings.TrimSpace(*backup) == "" {
		fmt.Fprintln(os.Stderr, "нужен новый приватный -backup")
		os.Exit(1)
	}
	cfg, err := config.Load(*env)
	if err != nil {
		fmt.Fprintln(os.Stderr, "не удалось прочитать конфигурацию")
		os.Exit(1)
	}
	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Minute)
	defer cancel()
	st, err := store.Open(ctx, cfg.DatabaseURL)
	if err != nil {
		fmt.Fprintln(os.Stderr, "не удалось открыть БД")
		os.Exit(1)
	}
	defer st.Close()
	count, err := publish(ctx, st, originals, patches, *backup)
	if err != nil {
		fmt.Fprintln(os.Stderr, err)
		os.Exit(1)
	}
	fmt.Printf("Опубликовано %d исправленных карточек; ID, источники, реакции и комментарии сохранены.\n", count)
}
