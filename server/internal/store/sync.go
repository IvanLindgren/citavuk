package store

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"hash/fnv"
	"time"
	"unicode/utf8"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
)

// Максимальные размеры одной посылки. Ограничение нужно, чтобы клиент с
// многолетней историей не пытался отправить всё одним запросом и не упирался в
// таймаут: синхронизация идёт страницами.
const (
	MaxPushRecords = 500
	MaxPullRecords = 500
)

// ErrTooManyRecords возвращается, когда клиент прислал слишком большую посылку.
var ErrTooManyRecords = fmt.Errorf("в одной посылке не больше %d записей", MaxPushRecords)

// Book — синхронизируемые метаданные книги. Текст живёт отдельно.
type Book struct {
	ID         uuid.UUID `json:"id"`
	Title      string    `json:"title"`
	Folder     string    `json:"folder"`
	SourceKey  string    `json:"sourceKey"`
	ParaCount  int       `json:"paraCount"`
	LastPara   int       `json:"lastPara"`
	ContentSHA string    `json:"contentSha"`
	LeadImage  string    `json:"leadImage"`
	Deleted    bool      `json:"deleted"`
	UpdatedAt  time.Time `json:"updatedAt"`
	Rev        int64     `json:"rev"`
}

// VocabEntry — сохранённое слово.
type VocabEntry struct {
	ID          uuid.UUID  `json:"id"`
	BookID      *uuid.UUID `json:"bookId"`
	Word        string     `json:"word"`
	Lemma       string     `json:"lemma"`
	POS         string     `json:"pos"`
	Translation string     `json:"translation"`
	Forms       any        `json:"forms"`
	Deleted     bool       `json:"deleted"`
	UpdatedAt   time.Time  `json:"updatedAt"`
	Rev         int64      `json:"rev"`
}

// Review — состояние интервального повторения. Времена в миллисекундах эпохи,
// как в клиентской базе.
type Review struct {
	VocabID      uuid.UUID `json:"vocabId"`
	Ease         float32   `json:"ease"`
	IntervalDays int       `json:"intervalDays"`
	Reps         int       `json:"reps"`
	DueAt        int64     `json:"dueAt"`
	LastReviewed *int64    `json:"lastReviewed"`
	Deleted      bool      `json:"deleted"`
	UpdatedAt    time.Time `json:"updatedAt"`
	Rev          int64     `json:"rev"`
}

// PalacePin — слово, повешенное на предмет комнаты.
type PalacePin struct {
	Word        string `json:"word"`
	Translation string `json:"translation"`
	// Слово из словаря, если брали оттуда. Пусто — введено руками.
	VocabID string `json:"vocabId"`
	// At — когда слово повесили. По нему строится маршрут обхода: человек
	// расставляет слова в том порядке, в каком собирается их вспоминать, и
	// маршрут обязан совпадать с его замыслом.
	//
	// Поле обязано переживать синхронизацию: без него телефон и браузер
	// обходили бы один и тот же дворец в разном порядке, а весь приём как раз
	// в том, что маршрут всегда один. Ноль означает старую развеску, сделанную
	// до появления поля, — такие слова обходятся в порядке предметов комнаты,
	// как и раньше.
	At int64 `json:"at,omitempty"`
}

// Palace — дворец памяти: комната и развеска слов по её предметам.
type Palace struct {
	ID      uuid.UUID `json:"id"`
	Name    string    `json:"name"`
	SceneID string    `json:"sceneId"`
	// Ключ — идентификатор предмета сцены.
	Pins      map[string]PalacePin `json:"pins"`
	Deleted   bool                 `json:"deleted"`
	UpdatedAt time.Time            `json:"updatedAt"`
	Rev       int64                `json:"rev"`
}

// Changes — порция изменений в обе стороны.
//
// Новые виды записей добавляются полем, а не новым запросом: курсор
// синхронизации общий, и отдельная лента заводила бы второй курсор, который
// пришлось бы согласовывать с первым.
type Changes struct {
	Books      []Book       `json:"books"`
	Vocabulary []VocabEntry `json:"vocabulary"`
	Reviews    []Review     `json:"reviews"`
	Palaces    []Palace     `json:"palaces"`
}

// Len — общее число записей в порции.
func (c *Changes) Len() int {
	return len(c.Books) + len(c.Vocabulary) + len(c.Reviews) + len(c.Palaces)
}

// PullResult — ответ на запрос изменений.
type PullResult struct {
	Changes
	// Rev — курсор, с которым клиент придёт в следующий раз.
	Rev int64 `json:"rev"`
	// HasMore означает, что порция упёрлась в лимит и нужно запросить ещё.
	HasMore bool `json:"hasMore"`
}

// advisoryKey превращает идентификатор пользователя в ключ advisory-лока.
//
// Коллизия двух пользователей означала бы лишь то, что их синхронизации
// ненадолго выстроятся в очередь, — это безопасно.
func advisoryKey(id uuid.UUID) int64 {
	h := fnv.New64a()
	_, _ = h.Write(id[:])
	return int64(h.Sum64())
}

// nextRev выделяет следующий номер ревизии пользователя.
//
// Вызывается строго под advisory-локом, взятым в той же транзакции. Именно этот
// лок гарантирует главный инвариант синхронизации: порядок выданных rev
// совпадает с порядком фиксации транзакций. Без него транзакция с меньшим rev
// могла бы зафиксироваться позже, чем клиент прочитал больший rev, и запись
// навсегда проскочила бы мимо курсора.
func nextRev(ctx context.Context, tx pgx.Tx, userID uuid.UUID) (int64, error) {
	var rev int64
	err := tx.QueryRow(ctx,
		`UPDATE users SET sync_rev = sync_rev + 1, updated_at = now()
          WHERE id = $1 RETURNING sync_rev`, userID).Scan(&rev)
	if errors.Is(err, pgx.ErrNoRows) {
		return 0, ErrUserNotFound
	}
	return rev, err
}

// Push применяет изменения клиента.
//
// Разрешение конфликтов — «побеждает более позднее изменение» по updatedAt,
// который проставляет клиент. Это осознанный компромисс: полноценное слияние
// потребовало бы истории версий, а расхождение между устройствами здесь
// касается заметок и прогресса чтения, где потеря более старой правки не
// критична.
func (s *Store) Push(ctx context.Context, userID uuid.UUID, in *Changes) (int64, error) {
	if in.Len() > MaxPushRecords {
		return 0, ErrTooManyRecords
	}

	var rev int64
	err := s.InTx(ctx, func(tx pgx.Tx) error {
		// Все записи одной посылки получают один и тот же rev: посылка — это
		// одно атомарное изменение с точки зрения курсора.
		if _, err := tx.Exec(ctx, `SELECT pg_advisory_xact_lock($1)`, advisoryKey(userID)); err != nil {
			return err
		}
		var err error
		if rev, err = nextRev(ctx, tx, userID); err != nil {
			return err
		}

		for i := range in.Books {
			if err := upsertBook(ctx, tx, userID, &in.Books[i], rev); err != nil {
				return fmt.Errorf("книга %s: %w", in.Books[i].ID, err)
			}
		}
		for i := range in.Vocabulary {
			if err := upsertVocab(ctx, tx, userID, &in.Vocabulary[i], rev); err != nil {
				return fmt.Errorf("слово %s: %w", in.Vocabulary[i].ID, err)
			}
		}
		for i := range in.Reviews {
			if err := upsertReview(ctx, tx, userID, &in.Reviews[i], rev); err != nil {
				return fmt.Errorf("повторение %s: %w", in.Reviews[i].VocabID, err)
			}
		}
		for i := range in.Palaces {
			if err := upsertPalace(ctx, tx, userID, &in.Palaces[i], rev); err != nil {
				return fmt.Errorf("дворец %s: %w", in.Palaces[i].ID, err)
			}
		}
		return nil
	})
	return rev, err
}

// upsertBook записывает книгу, если клиентская версия новее серверной.
//
// content_sha сохраняется только непустым: устройство, которое ещё не выкачало
// текст книги, не должно стирать ссылку на уже загруженный на сервер текст.
//
// Прогресс чтения намеренно подчиняется общему правилу, а не берётся как
// максимум: «двигать только вперёд» выглядит защитой от отката, но тогда
// пользователь не может перечитать книгу с начала — прогресс тут же
// возвращался бы к прежней странице. От устаревшего прогресса защищает условие
// по updated_at ниже.
func upsertBook(ctx context.Context, tx pgx.Tx, userID uuid.UUID, b *Book, rev int64) error {
	if b.ID == uuid.Nil {
		return errors.New("пустой идентификатор")
	}
	if b.UpdatedAt.IsZero() {
		b.UpdatedAt = time.Now().UTC()
	}
	_, err := tx.Exec(ctx, `
        INSERT INTO books (id, user_id, title, folder, source_key, para_count, last_para,
                           content_sha, lead_image, deleted, updated_at, rev)
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
        ON CONFLICT (id) DO UPDATE SET
            title       = EXCLUDED.title,
            folder      = EXCLUDED.folder,
            source_key  = EXCLUDED.source_key,
            para_count  = EXCLUDED.para_count,
            last_para   = EXCLUDED.last_para,
            content_sha = CASE WHEN EXCLUDED.content_sha <> '' THEN EXCLUDED.content_sha
                               ELSE books.content_sha END,
            lead_image  = EXCLUDED.lead_image,
            deleted     = EXCLUDED.deleted,
            updated_at  = EXCLUDED.updated_at,
            rev         = EXCLUDED.rev
        WHERE books.user_id = EXCLUDED.user_id
          AND books.updated_at <= EXCLUDED.updated_at`,
		b.ID, userID, b.Title, b.Folder, b.SourceKey, b.ParaCount, b.LastPara,
		b.ContentSHA, b.LeadImage, b.Deleted, b.UpdatedAt, rev)
	return err
}

func upsertVocab(ctx context.Context, tx pgx.Tx, userID uuid.UUID, v *VocabEntry, rev int64) error {
	if v.ID == uuid.Nil {
		return errors.New("пустой идентификатор")
	}
	if v.UpdatedAt.IsZero() {
		v.UpdatedAt = time.Now().UTC()
	}
	forms, err := json.Marshal(v.Forms)
	if err != nil || v.Forms == nil {
		forms = []byte(`{}`)
	}
	_, err = tx.Exec(ctx, `
        INSERT INTO vocabulary (id, user_id, book_id, word, lemma, pos, translation,
                                forms, deleted, updated_at, rev)
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
        ON CONFLICT (id) DO UPDATE SET
            book_id     = EXCLUDED.book_id,
            word        = EXCLUDED.word,
            lemma       = EXCLUDED.lemma,
            pos         = EXCLUDED.pos,
            translation = EXCLUDED.translation,
            forms       = EXCLUDED.forms,
            deleted     = EXCLUDED.deleted,
            updated_at  = EXCLUDED.updated_at,
            rev         = EXCLUDED.rev
        WHERE vocabulary.user_id = EXCLUDED.user_id
          AND vocabulary.updated_at <= EXCLUDED.updated_at`,
		v.ID, userID, v.BookID, v.Word, v.Lemma, v.POS, v.Translation,
		forms, v.Deleted, v.UpdatedAt, rev)
	return err
}

// upsertReview сливает состояние повторения.
//
// Здесь «побеждает более позднее» особенно уместно: карточку повторили либо на
// одном устройстве, либо на другом, и актуально то повторение, которое было
// позже. Складывать reps с двух устройств нельзя — это исказило бы интервал.
func upsertReview(ctx context.Context, tx pgx.Tx, userID uuid.UUID, r *Review, rev int64) error {
	if r.VocabID == uuid.Nil {
		return errors.New("пустой идентификатор")
	}
	if r.UpdatedAt.IsZero() {
		r.UpdatedAt = time.Now().UTC()
	}
	_, err := tx.Exec(ctx, `
        INSERT INTO reviews (vocab_id, user_id, ease, interval_days, reps, due_at,
                             last_reviewed, deleted, updated_at, rev)
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
        ON CONFLICT (vocab_id) DO UPDATE SET
            ease          = EXCLUDED.ease,
            interval_days = EXCLUDED.interval_days,
            reps          = EXCLUDED.reps,
            due_at        = EXCLUDED.due_at,
            last_reviewed = EXCLUDED.last_reviewed,
            deleted       = EXCLUDED.deleted,
            updated_at    = EXCLUDED.updated_at,
            rev           = EXCLUDED.rev
        WHERE reviews.user_id = EXCLUDED.user_id
          AND reviews.updated_at <= EXCLUDED.updated_at`,
		r.VocabID, userID, r.Ease, r.IntervalDays, r.Reps, r.DueAt,
		r.LastReviewed, r.Deleted, r.UpdatedAt, rev)
	return err
}

// Пределы одного дворца.
//
// Комнаты рисует клиент, и предметов в них десяток. Запас взят с большим
// избытком, чтобы будущая сцена не упёрлась в ограничение, но чтобы одна запись
// не могла разрастись до мегабайтов: дворец читается целиком при каждой
// выкачке, и раздутый выгружался бы на все устройства снова и снова.
const (
	MaxPalacePins    = 64
	maxPalaceName    = 120
	maxPalaceSceneID = 60
	maxPalaceObject  = 60
	maxPinWord       = 200
	maxPinTranslate  = 500
)

// clip укорачивает строку до предела, не разрывая символ.
//
// Значения именно укорачиваются, а не отвергаются. Отказ выглядел бы честнее,
// но ошибка в upsert прерывает всю посылку: одно слишком длинное поле навсегда
// сломало бы синхронизацию устройства, и починить это пользователь бы не смог.
func clip(s string, limit int) string {
	if len(s) <= limit {
		return s
	}
	// Отступаем до начала символа: срез ровно по байту разрубил бы кириллицу
	// пополам, и в базу уехала бы строка, которая уже не UTF-8.
	for i := limit; i > 0; i-- {
		if utf8.RuneStart(s[i]) {
			return s[:i]
		}
	}
	return ""
}

// upsertPalace записывает дворец, если клиентская версия новее серверной.
//
// Развеска заменяется целиком, а не сливается по предметам: см. комментарий к
// таблице в 0006_palaces.sql.
func upsertPalace(ctx context.Context, tx pgx.Tx, userID uuid.UUID, p *Palace, rev int64) error {
	if p.ID == uuid.Nil {
		return errors.New("пустой идентификатор")
	}
	if p.UpdatedAt.IsZero() {
		p.UpdatedAt = time.Now().UTC()
	}

	pins := make(map[string]PalacePin, len(p.Pins))
	for object, pin := range p.Pins {
		if len(pins) >= MaxPalacePins {
			break
		}
		object = clip(object, maxPalaceObject)
		if object == "" || pin.Word == "" {
			// Предмет без слова хранить нечего: пустая развеска — это её
			// отсутствие.
			continue
		}
		pins[object] = PalacePin{
			Word:        clip(pin.Word, maxPinWord),
			Translation: clip(pin.Translation, maxPinTranslate),
			VocabID:     clip(pin.VocabID, 36),
		}
	}
	encoded, err := json.Marshal(pins)
	if err != nil {
		return err
	}

	_, err = tx.Exec(ctx, `
        INSERT INTO palaces (id, user_id, name, scene_id, pins, deleted, updated_at, rev)
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
        ON CONFLICT (id) DO UPDATE SET
            name       = EXCLUDED.name,
            scene_id   = EXCLUDED.scene_id,
            pins       = EXCLUDED.pins,
            deleted    = EXCLUDED.deleted,
            updated_at = EXCLUDED.updated_at,
            rev        = EXCLUDED.rev
        WHERE palaces.user_id = EXCLUDED.user_id
          AND palaces.updated_at <= EXCLUDED.updated_at`,
		p.ID, userID, clip(p.Name, maxPalaceName), clip(p.SceneID, maxPalaceSceneID),
		encoded, p.Deleted, p.UpdatedAt, rev)
	return err
}

// Pull возвращает изменения новее курсора since.
//
// Записи всех трёх видов отдаются с одним общим лимитом, поэтому клиент,
// получивший hasMore, обязан повторить запрос с новым курсором до тех пор, пока
// hasMore не станет false.
func (s *Store) Pull(ctx context.Context, userID uuid.UUID, since int64, limit int) (*PullResult, error) {
	if limit <= 0 || limit > MaxPullRecords {
		limit = MaxPullRecords
	}
	if since < 0 {
		since = 0
	}
	res := &PullResult{Rev: since}

	// Верхняя граница фиксируется до чтения: если во время выборки придёт новая
	// запись, она попадёт в следующую порцию, а не сдвинет курсор мимо себя.
	var head int64
	if err := s.Pool.QueryRow(ctx, `SELECT sync_rev FROM users WHERE id = $1`, userID).Scan(&head); err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return nil, ErrUserNotFound
		}
		return nil, err
	}
	if head < since {
		// Курсор клиента опережает сервер. Так бывает после восстановления базы
		// из резервной копии. Считаем курсор недействительным и выкачиваем всё
		// заново: клиент сольёт полученное со своими записями по updatedAt.
		since = 0
		res.Rev = 0
	}
	if head == since {
		res.Rev = head
		return res, nil
	}

	// Порция берётся по одной ревизии целиком: rev, начатый в этой порции, не
	// может оказаться разорванным между двумя ответами, иначе клиент сдвинул бы
	// курсор за него и потерял хвост.
	var upto int64
	err := s.Pool.QueryRow(ctx, `
        SELECT COALESCE(max(rev), $2) FROM (
            SELECT rev, sum(n) OVER (ORDER BY rev) AS running
              FROM (
                SELECT rev, count(*) AS n FROM books
                 WHERE user_id = $1 AND rev > $2 GROUP BY rev
                UNION ALL
                SELECT rev, count(*) FROM vocabulary
                 WHERE user_id = $1 AND rev > $2 GROUP BY rev
                UNION ALL
                SELECT rev, count(*) FROM reviews
                 WHERE user_id = $1 AND rev > $2 GROUP BY rev
                UNION ALL
                SELECT rev, count(*) FROM palaces
                 WHERE user_id = $1 AND rev > $2 GROUP BY rev
              ) per_rev
        ) cumulative
        WHERE running <= $3`, userID, since, limit).Scan(&upto)
	if err != nil {
		return nil, fmt.Errorf("определение границы порции: %w", err)
	}
	// Одна ревизия крупнее лимита: отдаём её целиком, иначе клиент застрянет.
	if upto <= since {
		if err := s.Pool.QueryRow(ctx, `
            SELECT COALESCE(min(rev), $2) FROM (
                SELECT rev FROM books      WHERE user_id = $1 AND rev > $2
                UNION SELECT rev FROM vocabulary WHERE user_id = $1 AND rev > $2
                UNION SELECT rev FROM reviews    WHERE user_id = $1 AND rev > $2
                UNION SELECT rev FROM palaces    WHERE user_id = $1 AND rev > $2
            ) r`, userID, since).Scan(&upto); err != nil {
			return nil, err
		}
	}

	if res.Books, err = selectBooks(ctx, s, userID, since, upto); err != nil {
		return nil, err
	}
	if res.Vocabulary, err = selectVocab(ctx, s, userID, since, upto); err != nil {
		return nil, err
	}
	if res.Reviews, err = selectReviews(ctx, s, userID, since, upto); err != nil {
		return nil, err
	}
	if res.Palaces, err = selectPalaces(ctx, s, userID, since, upto); err != nil {
		return nil, err
	}

	res.Rev = upto
	res.HasMore = upto < head
	return res, nil
}

func selectBooks(ctx context.Context, s *Store, userID uuid.UUID, since, upto int64) ([]Book, error) {
	rows, err := s.Pool.Query(ctx, `
        SELECT id, title, folder, source_key, para_count, last_para, content_sha,
               lead_image, deleted, updated_at, rev
          FROM books
         WHERE user_id = $1 AND rev > $2 AND rev <= $3
         ORDER BY rev, id`, userID, since, upto)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	out := []Book{}
	for rows.Next() {
		var b Book
		if err := rows.Scan(&b.ID, &b.Title, &b.Folder, &b.SourceKey, &b.ParaCount,
			&b.LastPara, &b.ContentSHA, &b.LeadImage, &b.Deleted, &b.UpdatedAt, &b.Rev); err != nil {
			return nil, err
		}
		out = append(out, b)
	}
	return out, rows.Err()
}

func selectVocab(ctx context.Context, s *Store, userID uuid.UUID, since, upto int64) ([]VocabEntry, error) {
	rows, err := s.Pool.Query(ctx, `
        SELECT id, book_id, word, lemma, pos, translation, forms, deleted, updated_at, rev
          FROM vocabulary
         WHERE user_id = $1 AND rev > $2 AND rev <= $3
         ORDER BY rev, id`, userID, since, upto)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	out := []VocabEntry{}
	for rows.Next() {
		var v VocabEntry
		var forms []byte
		if err := rows.Scan(&v.ID, &v.BookID, &v.Word, &v.Lemma, &v.POS, &v.Translation,
			&forms, &v.Deleted, &v.UpdatedAt, &v.Rev); err != nil {
			return nil, err
		}
		if len(forms) > 0 {
			_ = json.Unmarshal(forms, &v.Forms)
		}
		out = append(out, v)
	}
	return out, rows.Err()
}

func selectReviews(ctx context.Context, s *Store, userID uuid.UUID, since, upto int64) ([]Review, error) {
	rows, err := s.Pool.Query(ctx, `
        SELECT vocab_id, ease, interval_days, reps, due_at, last_reviewed,
               deleted, updated_at, rev
          FROM reviews
         WHERE user_id = $1 AND rev > $2 AND rev <= $3
         ORDER BY rev, vocab_id`, userID, since, upto)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	out := []Review{}
	for rows.Next() {
		var r Review
		if err := rows.Scan(&r.VocabID, &r.Ease, &r.IntervalDays, &r.Reps, &r.DueAt,
			&r.LastReviewed, &r.Deleted, &r.UpdatedAt, &r.Rev); err != nil {
			return nil, err
		}
		out = append(out, r)
	}
	return out, rows.Err()
}

func selectPalaces(ctx context.Context, s *Store, userID uuid.UUID, since, upto int64) ([]Palace, error) {
	rows, err := s.Pool.Query(ctx, `
        SELECT id, name, scene_id, pins, deleted, updated_at, rev
          FROM palaces
         WHERE user_id = $1 AND rev > $2 AND rev <= $3
         ORDER BY rev, id`, userID, since, upto)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	out := []Palace{}
	for rows.Next() {
		var p Palace
		var pins []byte
		if err := rows.Scan(&p.ID, &p.Name, &p.SceneID, &pins, &p.Deleted,
			&p.UpdatedAt, &p.Rev); err != nil {
			return nil, err
		}
		if len(pins) > 0 {
			_ = json.Unmarshal(pins, &p.Pins)
		}
		if p.Pins == nil {
			// Клиенту удобнее пустой объект, чем null: развеска всегда
			// перебирается, а проверка на null жила бы в каждом месте перебора.
			p.Pins = map[string]PalacePin{}
		}
		out = append(out, p)
	}
	return out, rows.Err()
}
