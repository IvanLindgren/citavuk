package store

import (
	"context"
	"errors"
	"strings"
	"time"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
)

var ErrLibraryItemNotFound = errors.New("library item not found")

// LibraryItem — книга или подкаст закрытой библиотеки для друзей Читавука.
type LibraryItem struct {
	ID          uuid.UUID `json:"id"`
	Kind        string    `json:"kind"`
	Title       string    `json:"title"`
	Author      string    `json:"author"`
	Description string    `json:"description"`
	Level       string    `json:"level"`
	CoverURL    string    `json:"coverUrl"`
	// Body — текст книги или расшифровка подкаста. В списке не отдаётся.
	Body      string    `json:"body,omitempty"`
	BodyChars int       `json:"bodyChars"`
	AudioFile string    `json:"-"`
	AudioMime string    `json:"audioMime"`
	AudioSize int64     `json:"audioSize"`
	Published bool      `json:"published"`
	CreatedAt time.Time `json:"createdAt"`
	UpdatedAt time.Time `json:"updatedAt"`
}

// LibraryItemInput — поля, которые задаёт администратор.
type LibraryItemInput struct {
	Kind        string `json:"kind"`
	Title       string `json:"title"`
	Author      string `json:"author"`
	Description string `json:"description"`
	Level       string `json:"level"`
	CoverURL    string `json:"coverUrl"`
	Body        string `json:"body"`
	Published   bool   `json:"published"`
}

var libraryLevels = map[string]bool{"": true, "A1": true, "A2": true, "B1": true, "B2": true, "C1": true, "C2": true}

// Normalize проверяет и подчищает ввод.
func (in *LibraryItemInput) Normalize() error {
	in.Kind = strings.TrimSpace(in.Kind)
	in.Title = strings.TrimSpace(in.Title)
	in.Author = strings.TrimSpace(in.Author)
	in.Description = strings.TrimSpace(in.Description)
	in.Level = strings.ToUpper(strings.TrimSpace(in.Level))
	in.CoverURL = strings.TrimSpace(in.CoverURL)
	if in.Kind != "book" && in.Kind != "podcast" {
		return errors.New("вид — книга или подкаст")
	}
	if in.Title == "" || len([]rune(in.Title)) > 200 {
		return errors.New("название — от 1 до 200 знаков")
	}
	if len([]rune(in.Author)) > 200 || len([]rune(in.Description)) > 2000 {
		return errors.New("автор до 200 знаков, описание до 2000")
	}
	if !libraryLevels[in.Level] {
		return errors.New("уровень — A1…C2 или пусто")
	}
	if in.CoverURL != "" && !strings.HasPrefix(in.CoverURL, "https://") {
		return errors.New("обложка — ссылка https://")
	}
	if len(in.Body) > 8<<20 {
		return errors.New("текст длиннее 8 МБ")
	}
	return nil
}

const libraryListColumns = `id, kind, title, author, description, level, cover_url,
    char_length(body), audio_file, audio_mime, audio_size, published, created_at, updated_at`

func scanLibraryItem(row pgx.Row, withBody bool) (*LibraryItem, error) {
	var it LibraryItem
	dest := []any{&it.ID, &it.Kind, &it.Title, &it.Author, &it.Description, &it.Level, &it.CoverURL,
		&it.BodyChars, &it.AudioFile, &it.AudioMime, &it.AudioSize, &it.Published, &it.CreatedAt, &it.UpdatedAt}
	if withBody {
		dest = append(dest, &it.Body)
	}
	if err := row.Scan(dest...); err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return nil, ErrLibraryItemNotFound
		}
		return nil, err
	}
	return &it, nil
}

// LibraryItems — список без текстов. Неопубликованные видит только админка.
func (s *Store) LibraryItems(ctx context.Context, includeDrafts bool) ([]LibraryItem, error) {
	rows, err := s.Pool.Query(ctx, `SELECT `+libraryListColumns+`
          FROM supporter_library_items
         WHERE published OR $1
         ORDER BY created_at DESC`, includeDrafts)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	out := []LibraryItem{}
	for rows.Next() {
		it, err := scanLibraryItem(rows, false)
		if err != nil {
			return nil, err
		}
		out = append(out, *it)
	}
	return out, rows.Err()
}

func (s *Store) LibraryItem(ctx context.Context, id uuid.UUID) (*LibraryItem, error) {
	return scanLibraryItem(s.Pool.QueryRow(ctx, `SELECT `+libraryListColumns+`, body
          FROM supporter_library_items WHERE id = $1`, id), true)
}

func (s *Store) CreateLibraryItem(ctx context.Context, in LibraryItemInput) (*LibraryItem, error) {
	return scanLibraryItem(s.Pool.QueryRow(ctx, `
        INSERT INTO supporter_library_items (kind, title, author, description, level, cover_url, body, published)
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
        RETURNING `+libraryListColumns+`, body`,
		in.Kind, in.Title, in.Author, in.Description, in.Level, in.CoverURL, in.Body, in.Published), true)
}

func (s *Store) UpdateLibraryItem(ctx context.Context, id uuid.UUID, in LibraryItemInput) (*LibraryItem, error) {
	return scanLibraryItem(s.Pool.QueryRow(ctx, `
        UPDATE supporter_library_items
           SET kind = $2, title = $3, author = $4, description = $5, level = $6,
               cover_url = $7, body = $8, published = $9, updated_at = now()
         WHERE id = $1
        RETURNING `+libraryListColumns+`, body`,
		id, in.Kind, in.Title, in.Author, in.Description, in.Level, in.CoverURL, in.Body, in.Published), true)
}

// SetLibraryAudio записывает готовый аудиофайл; прежний файл удаляет вызывающий.
func (s *Store) SetLibraryAudio(ctx context.Context, id uuid.UUID, file, mime string, size int64) error {
	tag, err := s.Pool.Exec(ctx, `
        UPDATE supporter_library_items
           SET audio_file = $2, audio_mime = $3, audio_size = $4, updated_at = now()
         WHERE id = $1`, id, file, mime, size)
	if err == nil && tag.RowsAffected() == 0 {
		return ErrLibraryItemNotFound
	}
	return err
}

// DeleteLibraryItem удаляет запись и возвращает имя аудиофайла для уборки.
func (s *Store) DeleteLibraryItem(ctx context.Context, id uuid.UUID) (string, error) {
	var file string
	err := s.Pool.QueryRow(ctx,
		`DELETE FROM supporter_library_items WHERE id = $1 RETURNING audio_file`, id).Scan(&file)
	if errors.Is(err, pgx.ErrNoRows) {
		return "", ErrLibraryItemNotFound
	}
	return file, err
}
