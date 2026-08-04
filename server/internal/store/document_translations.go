package store

import (
	"context"
	"errors"
	"time"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
)

// ErrTranslationLimit возвращается, когда суточный предел уже израсходован.
var ErrTranslationLimit = errors.New("суточный предел переводов исчерпан")

// TranslationWindow — за какой срок считается предел.
//
// Скользящие сутки, а не календарный день. Календарный день выгоднее тому, кто
// знает про полночь: две книги подряд в 23:59 и 00:01 формально не нарушают
// «одну в день», но нагрузку дают двойную. Скользящее окно ещё и позволяет
// назвать точное время, когда станет можно снова.
const TranslationWindow = 24 * time.Hour

// DocumentTranslation — заявка на перевод документа.
type DocumentTranslation struct {
	ID              uuid.UUID `json:"id"`
	Title           string    `json:"title"`
	SourceLang      string    `json:"sourceLang"`
	Provider        string    `json:"provider"`
	Chars           int       `json:"chars"`
	TranslatedChars int       `json:"translatedChars"`
	CreatedAt       time.Time `json:"createdAt"`
}

// countedAgainstLimit — условие «эта заявка тратит суточный предел».
//
// Предел тратит переведённый текст, а не намерение его перевести. Заявка, по
// которой не переведено ни знака, не считается: так ведёт себя отказ провайдера
// (например, исчерпанная месячная квота DeepL) и просто закрытое окно. Иначе
// получалось бы худшее из возможных: перевода нет, а день потрачен, и человек
// узнаёт об этом, только когда пробует ещё раз.
//
// Обратная сторона правила: заявка, оборвавшаяся на середине, предел всё-таки
// тратит. Так и должно быть — квота внешнего переводчика на переведённые куски
// уже израсходована, и разрешать бесконечные повторы значило бы отдать её
// одному человеку целиком.
const countedAgainstLimit = `translated_chars > 0`

// StartDocumentTranslation заводит заявку, если предел позволяет.
//
// Проверка и запись выполняются ОДНИМ оператором. Раздельные «посчитать» и
// «вставить» дали бы гонку: два запроса с двух устройств прошли бы проверку
// одновременно и оба получили бы разрешение. Здесь же вставка просто не найдёт
// строк для источника, если предел уже выбран.
func (s *Store) StartDocumentTranslation(
	ctx context.Context,
	userID uuid.UUID,
	title, sourceLang, provider string,
	chars, dailyLimit int,
) (*DocumentTranslation, error) {
	job := DocumentTranslation{
		ID:         uuid.New(),
		Title:      title,
		SourceLang: sourceLang,
		Provider:   provider,
		Chars:      chars,
	}

	err := s.Pool.QueryRow(ctx, `
        INSERT INTO document_translations (id, user_id, title, source_lang, provider, chars)
        SELECT $1, $2, $3, $4, $5, $6
         WHERE (
                 SELECT count(*) FROM document_translations
                  WHERE user_id = $2
                    AND created_at > now() - make_interval(secs => $7)
                    AND `+countedAgainstLimit+`
               ) < $8
        RETURNING created_at`,
		job.ID, userID, title, sourceLang, provider, chars,
		TranslationWindow.Seconds(), dailyLimit,
	).Scan(&job.CreatedAt)
	if errors.Is(err, pgx.ErrNoRows) {
		return nil, ErrTranslationLimit
	}
	if err != nil {
		return nil, err
	}
	return &job, nil
}

// NextDocumentTranslationAt сообщает, когда предел освободится.
//
// Нулевое время означает, что перевод доступен прямо сейчас.
func (s *Store) NextDocumentTranslationAt(
	ctx context.Context,
	userID uuid.UUID,
	dailyLimit int,
) (time.Time, error) {
	var next *time.Time
	err := s.Pool.QueryRow(ctx, `
        SELECT min(created_at) + make_interval(secs => $3)
          FROM (
                SELECT created_at FROM document_translations
                 WHERE user_id = $1
                   AND created_at > now() - make_interval(secs => $3)
                   AND `+countedAgainstLimit+`
                 ORDER BY created_at DESC
                 LIMIT $2
               ) recent
         HAVING count(*) >= $2`,
		userID, dailyLimit, TranslationWindow.Seconds(),
	).Scan(&next)
	if errors.Is(err, pgx.ErrNoRows) || next == nil {
		return time.Time{}, nil
	}
	if err != nil {
		return time.Time{}, err
	}
	return *next, nil
}

// DocumentTranslationForUpdate возвращает заявку владельца.
//
// Владелец проверяется в самом запросе, а не после выборки: заявка по чужому
// идентификатору обязана выглядеть как несуществующая.
func (s *Store) DocumentTranslationForUpdate(
	ctx context.Context,
	userID, jobID uuid.UUID,
) (*DocumentTranslation, error) {
	var job DocumentTranslation
	err := s.Pool.QueryRow(ctx, `
        SELECT id, title, source_lang, provider, chars, translated_chars, created_at
          FROM document_translations
         WHERE id = $1 AND user_id = $2`,
		jobID, userID,
	).Scan(&job.ID, &job.Title, &job.SourceLang, &job.Provider,
		&job.Chars, &job.TranslatedChars, &job.CreatedAt)
	if errors.Is(err, pgx.ErrNoRows) {
		return nil, pgx.ErrNoRows
	}
	if err != nil {
		return nil, err
	}
	return &job, nil
}

// AddTranslatedChars засчитывает переведённый кусок и возвращает новый итог.
//
// Итог возвращается из того же запроса, что и увеличивает счётчик: прочитать
// его отдельно значило бы разрешить двум параллельным кускам увидеть одно и то
// же значение и вместе выйти за заявленный объём.
func (s *Store) AddTranslatedChars(
	ctx context.Context,
	jobID uuid.UUID,
	chars int,
) (int, error) {
	var total int
	err := s.Pool.QueryRow(ctx, `
        UPDATE document_translations
           SET translated_chars = translated_chars + $2
         WHERE id = $1
        RETURNING translated_chars`,
		jobID, chars,
	).Scan(&total)
	return total, err
}

// ReleaseTranslatedChars возвращает объём, засчитанный куску, который перевести
// не удалось.
//
// Объём засчитывается авансом, до обращения к переводчику (см.
// AddTranslatedChars), поэтому отказ обязан его вернуть. Иначе заявка выглядит
// как «что-то переведено», хотя не переведено ничего, и по правилу
// countedAgainstLimit съедает суточный предел ни за что.
//
// greatest(..., 0) страхует от отрицательного итога: повторный возврат одного и
// того же куска не должен уводить счётчик ниже нуля и открывать бесконечные
// переводы.
func (s *Store) ReleaseTranslatedChars(ctx context.Context, jobID uuid.UUID, chars int) error {
	if chars <= 0 {
		return nil
	}
	_, err := s.Pool.Exec(ctx, `
        UPDATE document_translations
           SET translated_chars = greatest(translated_chars - $2, 0)
         WHERE id = $1`, jobID, chars)
	return err
}

// FinishDocumentTranslation отмечает заявку завершённой.
func (s *Store) FinishDocumentTranslation(ctx context.Context, jobID uuid.UUID) error {
	_, err := s.Pool.Exec(ctx, `
        UPDATE document_translations SET finished_at = now()
         WHERE id = $1 AND finished_at IS NULL`, jobID)
	return err
}
