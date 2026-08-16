package store

import (
	"context"
	"errors"
	"strings"

	"github.com/jackc/pgx/v5"
)

// Кеш толкований, сочинённых нейросетью.
//
// Хранится и отказ («такого слова нет»), и само толкование: платим за слово
// один раз за всё время. Словарные статьи сюда не попадают — они и так живут
// в памяти процесса и достаются бесплатно.

// CachedDefinition возвращает сохранённое толкование. Второе значение —
// отвечала ли модель об этом слове вообще: nil при known == true означает
// «модель сказала, что слова нет», и второй раз спрашивать незачем.
func (s *Store) CachedDefinition(ctx context.Context, word string) ([]byte, bool, error) {
	var entry []byte
	err := s.Pool.QueryRow(ctx,
		`SELECT entry FROM word_definitions WHERE word = $1`,
		normalizeWord(word),
	).Scan(&entry)
	if errors.Is(err, pgx.ErrNoRows) {
		return nil, false, nil
	}
	if err != nil {
		return nil, false, err
	}
	return entry, true, nil
}

// SaveDefinition запоминает ответ модели. entry == nil — слова нет.
func (s *Store) SaveDefinition(ctx context.Context, word string, entry []byte, model string) error {
	_, err := s.Pool.Exec(ctx,
		`INSERT INTO word_definitions (word, entry, model)
		 VALUES ($1, $2, $3)
		 ON CONFLICT (word) DO UPDATE SET entry = EXCLUDED.entry,
		                                  model = EXCLUDED.model,
		                                  created_at = now()`,
		normalizeWord(word), entry, model)
	return err
}

func normalizeWord(word string) string {
	return strings.ToLower(strings.TrimSpace(word))
}

// CachedFormHint возвращает сохранённый разбор словоформы. Второе значение —
// спрашивали ли про эту форму вообще: nil при known == true означает, что
// разобрать её не вышло, и второй раз тратиться на это незачем.
func (s *Store) CachedFormHint(ctx context.Context, form string) ([]byte, bool, error) {
	var reading []byte
	err := s.Pool.QueryRow(ctx,
		`SELECT reading FROM word_form_hints WHERE form = $1`,
		normalizeWord(form),
	).Scan(&reading)
	if errors.Is(err, pgx.ErrNoRows) {
		return nil, false, nil
	}
	if err != nil {
		return nil, false, err
	}
	return reading, true, nil
}

// SaveFormHint запоминает проверенный разбор. reading == nil — разбора нет.
func (s *Store) SaveFormHint(ctx context.Context, form string, reading []byte, model string) error {
	_, err := s.Pool.Exec(ctx,
		`INSERT INTO word_form_hints (form, reading, model)
		 VALUES ($1, $2, $3)
		 ON CONFLICT (form) DO UPDATE SET reading = EXCLUDED.reading,
		                                  model = EXCLUDED.model,
		                                  created_at = now()`,
		normalizeWord(form), reading, model)
	return err
}
