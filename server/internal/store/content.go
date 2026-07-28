package store

import (
	"bytes"
	"compress/gzip"
	"context"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"errors"
	"fmt"
	"io"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
)

// ErrContentNotFound возвращается, когда текста книги нет на сервере.
var ErrContentNotFound = errors.New("текст книги не найден")

// ContentSHA считает адрес текста книги и его представление для хранения.
//
// Адресуется содержимое, а не исходный файл: одна и та же книга, импортированная
// из PDF на одном устройстве и из DOCX на другом, даст разные файлы, но
// одинаковый разобранный текст — и не будет храниться дважды.
//
// Хешируется НЕ JSON, а абзацы с префиксом длины: «<байт>\n<абзац>» подряд.
// Причина в том, что адрес считают три реализации на разных языках, а правила
// экранирования у их сериализаторов расходятся. Go всегда экранирует U+2028 и
// U+2029 (ради безопасности встраивания в JavaScript), а JSON.stringify и
// jsonEncode в Dart выводят их как есть. Эти символы встречаются в тексте из
// Word, и книга с ними не выгрузилась бы вовсе: сервер посчитал бы другой адрес
// и отверг запрос. Байтовая склейка от сериализатора не зависит.
//
// Длина обязательна, простого разделителя недостаточно: любой символ-разделитель
// может встретиться внутри абзаца, и тогда два разных набора абзацев дадут один
// адрес, а книги перепутаются между собой. С префиксом длины разбор однозначен
// при любом содержимом.
//
// Совпадение проверяется одинаковыми наборами примеров во всех трёх местах:
// content_test.go, frontend/test/services/sync_content_test.dart и
// web/src/lib/content.test.ts.
func ContentSHA(paragraphs []string) (string, []byte, error) {
	h := sha256.New()
	for _, paragraph := range paragraphs {
		fmt.Fprintf(h, "%d\n%s", len(paragraph), paragraph)
	}
	sum := h.Sum(nil)

	// Хранится по-прежнему JSON: он отдаётся клиенту при скачивании как есть,
	// без разбора и пересборки. На адрес его кодирование больше не влияет.
	var buf bytes.Buffer
	enc := json.NewEncoder(&buf)
	enc.SetEscapeHTML(false)
	if err := enc.Encode(paragraphs); err != nil {
		return "", nil, err
	}
	payload := bytes.TrimRight(buf.Bytes(), "\n")

	return hex.EncodeToString(sum), payload, nil
}

// PutContent сохраняет текст книги в сжатом виде.
//
// Возвращает признак того, что текст уже был на сервере: клиенту это позволяет
// не считать загрузку неудачной и не повторять её.
func (s *Store) PutContent(ctx context.Context, userID uuid.UUID, sha string, paragraphs []string) (existed bool, err error) {
	if sha == "" {
		return false, errors.New("не указан sha256 текста")
	}
	// Адрес считается сервером заново: клиент не должен иметь возможности
	// записать один текст под адресом другого — иначе он подменил бы книгу,
	// которую другое устройство скачает по этому адресу.
	got, payload, err := ContentSHA(paragraphs)
	if err != nil {
		return false, err
	}
	if got != sha {
		return false, fmt.Errorf("sha256 текста не совпадает: заявлен %s, получен %s", sha, got)
	}

	var buf bytes.Buffer
	zw, err := gzip.NewWriterLevel(&buf, gzip.BestSpeed)
	if err != nil {
		return false, err
	}
	if _, err := zw.Write(payload); err != nil {
		return false, err
	}
	if err := zw.Close(); err != nil {
		return false, err
	}

	tag, err := s.Pool.Exec(ctx, `
        INSERT INTO book_contents (user_id, sha256, body, bytes)
        VALUES ($1, $2, $3, $4)
        ON CONFLICT (user_id, sha256) DO NOTHING`,
		userID, sha, buf.Bytes(), len(payload))
	if err != nil {
		return false, fmt.Errorf("сохранение текста: %w", err)
	}
	return tag.RowsAffected() == 0, nil
}

// GetContent возвращает распакованный JSON абзацев.
func (s *Store) GetContent(ctx context.Context, userID uuid.UUID, sha string) ([]byte, error) {
	var body []byte
	err := s.Pool.QueryRow(ctx,
		`SELECT body FROM book_contents WHERE user_id = $1 AND sha256 = $2`, userID, sha).Scan(&body)
	if errors.Is(err, pgx.ErrNoRows) {
		return nil, ErrContentNotFound
	}
	if err != nil {
		return nil, err
	}

	zr, err := gzip.NewReader(bytes.NewReader(body))
	if err != nil {
		return nil, fmt.Errorf("распаковка текста: %w", err)
	}
	defer zr.Close()

	// Ограничение сверху: содержимое пришло из базы, но повреждённый или
	// злонамеренно собранный gzip может распаковываться бесконечно.
	out, err := io.ReadAll(io.LimitReader(zr, 64<<20))
	if err != nil {
		return nil, fmt.Errorf("чтение текста: %w", err)
	}
	return out, nil
}

// HasContent сообщает, какие из перечисленных адресов уже есть на сервере.
//
// Позволяет клиенту выгружать только недостающие книги, а не проверять их по
// одной отдельными запросами.
func (s *Store) HasContent(ctx context.Context, userID uuid.UUID, shas []string) (map[string]bool, error) {
	out := make(map[string]bool, len(shas))
	for _, sha := range shas {
		out[sha] = false
	}
	if len(shas) == 0 {
		return out, nil
	}
	rows, err := s.Pool.Query(ctx,
		`SELECT sha256 FROM book_contents WHERE user_id = $1 AND sha256 = ANY($2)`, userID, shas)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	for rows.Next() {
		var sha string
		if err := rows.Scan(&sha); err != nil {
			return nil, err
		}
		out[sha] = true
	}
	return out, rows.Err()
}

// PurgeOrphanContent удаляет тексты, на которые не ссылается ни одна живая
// книга пользователя. Вызывается после удаления книг, чтобы место не росло
// бесконечно.
func (s *Store) PurgeOrphanContent(ctx context.Context, userID uuid.UUID) (int64, error) {
	tag, err := s.Pool.Exec(ctx, `
        DELETE FROM book_contents c
         WHERE c.user_id = $1
           AND NOT EXISTS (
               SELECT 1 FROM books b
                WHERE b.user_id = c.user_id
                  AND b.content_sha = c.sha256
                  AND NOT b.deleted)`, userID)
	if err != nil {
		return 0, err
	}
	return tag.RowsAffected(), nil
}
