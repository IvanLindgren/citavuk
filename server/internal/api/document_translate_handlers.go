package api

import (
	"context"
	"errors"
	"log/slog"
	"net/http"
	"strconv"
	"strings"
	"time"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"

	"github.com/citavuk/server/internal/media"
	"github.com/citavuk/server/internal/serbian"
	"github.com/citavuk/server/internal/store"
	"github.com/citavuk/server/internal/translate"
)

// Перевод загруженного документа на сербский.
//
// Перевод идёт не одним запросом, а заявкой и кусками. Причина простая: книга
// переводится минуты, а не секунды. Единственный запрос на весь текст упёрся бы
// в таймаут прокси, не показал бы никакого хода работ и при обрыве связи
// потерял бы уже сделанное — вместе с суточным пределом. Заявка же расходует
// предел один раз, а куски идут своим темпом и переживают повтор.
//
// Предел тратит переведённый текст, а не заведённая заявка: пока по заявке не
// переведено ни знака, она против предела не считается (см. store.
// countedAgainstLimit). Поэтому отказ переводчика на первом же куске возвращает
// человеку день, а не съедает его молча.
//
// Что переводить, решает клиент: только он знает, где в книге текст, а где
// картинка или ячейка таблицы. Сервер переводит присланный список строк один в
// один и ничего не додумывает.

const (
	// maxLanguageSampleBytes — сколько текста нужно, чтобы определить язык.
	// Выборку делает клиент, целая книга здесь ни к чему.
	maxLanguageSampleBytes = 128 << 10
	// maxChunkBytes — предел одного куска перевода.
	maxChunkBytes = 512 << 10
	// maxChunkParagraphs защищает от списка из десятков тысяч пустых строк.
	maxChunkParagraphs = 500
	// chunkSlackRunes — насколько кусками разрешено превысить заявленный объём.
	// Небольшой запас нужен потому, что клиент считает знаки до разбора на
	// блоки, а шлёт после; строгое равенство ломало бы перевод на ровном месте.
	chunkSlackRunes = 4000
)

type languageRequest struct {
	Paragraphs []string `json:"paragraphs"`
}

type languageResponse struct {
	// Serbian означает, что документ можно читать как есть.
	Serbian bool `json:"serbian"`
	// Language — предполагаемый язык оригинала: "sr", "ru", "en" либо пусто.
	Language string `json:"language"`
	// Share — доля слов, знакомых сербскому словарю. Показывается только в
	// отладке, но возвращается всегда: без неё нельзя объяснить решение.
	Share float64 `json:"share"`
	Words int     `json:"words"`
	// Translatable сообщает, есть ли чем переводить прямо сейчас.
	Translatable bool `json:"translatable"`
}

// handleDocumentLanguage решает, на сербском ли документ.
//
// Аккаунт не нужен: это обращение к встроенному словарю, а не к переводчику.
// Спрашивать про вход раньше, чем стало ясно, что перевод вообще понадобится, —
// значит спрашивать зря у всех, кто добавляет обычную сербскую книгу.
func (s *Server) handleDocumentLanguage(w http.ResponseWriter, r *http.Request) {
	var req languageRequest
	if err := decodeJSON(w, r, &req, maxLanguageSampleBytes); err != nil {
		writeError(w, http.StatusBadRequest, codeBadRequest, "Не удалось прочитать запрос.")
		return
	}

	verdict := serbian.CheckDocument(req.Paragraphs)
	writeJSON(w, http.StatusOK, languageResponse{
		Serbian:      verdict.Serbian,
		Language:     verdict.Language,
		Share:        verdict.Share,
		Words:        verdict.Words,
		Translatable: s.translator.PickProvider(1) != "",
	})
}

type startTranslationRequest struct {
	Title string `json:"title"`
	// Chars — объём документа в знаках. По нему выбирается провайдер, и им же
	// ограничивается, сколько всего разрешено перевести по этой заявке.
	Chars      int    `json:"chars"`
	SourceLang string `json:"sourceLang"`
}

type translationJobResponse struct {
	JobID    string `json:"jobId"`
	Provider string `json:"provider"`
	Chars    int    `json:"chars"`
	// ProviderNote объясняет человеку выбор переводчика: он влияет на качество,
	// и молчать об этом нечестно.
	ProviderNote string `json:"providerNote"`
}

type quotaResponse struct {
	Available bool `json:"available"`
	// NextAt — когда предел освободится. Пусто, если перевод доступен сейчас.
	NextAt   string `json:"nextAt,omitempty"`
	PerDay   int    `json:"perDay"`
	MaxChars int    `json:"maxChars"`
}

// handleTranslationQuota сообщает, можно ли переводить документ сейчас.
func (s *Server) handleTranslationQuota(w http.ResponseWriter, r *http.Request) {
	user := userFrom(r.Context())
	next, err := s.store.NextDocumentTranslationAt(
		r.Context(), user.ID, s.cfg.DocumentTranslationsPerDay)
	if err != nil {
		slog.Error("handleTranslationQuota", "err", err)
		writeError(w, http.StatusInternalServerError, codeInternal,
			"Не удалось проверить суточный предел.")
		return
	}

	resp := quotaResponse{
		Available: next.IsZero(),
		PerDay:    s.cfg.DocumentTranslationsPerDay,
		MaxChars:  translate.MaxDocumentRunes,
	}
	if !next.IsZero() {
		resp.NextAt = next.UTC().Format(time.RFC3339)
	}
	writeJSON(w, http.StatusOK, resp)
}

// handleStartTranslation заводит заявку на перевод документа.
func (s *Server) handleStartTranslation(w http.ResponseWriter, r *http.Request) {
	if !s.translator.Available() {
		writeError(w, http.StatusServiceUnavailable, codeUpstream, "Переводчик не настроен.")
		return
	}

	var req startTranslationRequest
	if err := decodeJSON(w, r, &req, 8<<10); err != nil {
		writeError(w, http.StatusBadRequest, codeBadRequest, "Не удалось прочитать запрос.")
		return
	}
	if req.Chars <= 0 {
		writeError(w, http.StatusBadRequest, codeBadRequest, "Не указан объём документа.")
		return
	}
	if req.Chars > translate.MaxDocumentRunes {
		writeError(w, http.StatusRequestEntityTooLarge, codeTooLarge,
			"Документ слишком большой для перевода. Разделите его на части.")
		return
	}

	provider := s.translator.PickProvider(req.Chars)
	if provider == "" {
		writeError(w, http.StatusServiceUnavailable, codeUpstream, "Переводчик недоступен.")
		return
	}

	user := userFrom(r.Context())
	job, err := s.store.StartDocumentTranslation(
		r.Context(), user.ID,
		trimRunes(strings.TrimSpace(req.Title), 200),
		trimRunes(strings.TrimSpace(req.SourceLang), 16),
		provider, req.Chars,
		s.cfg.DocumentTranslationsPerDay,
	)
	if errors.Is(err, store.ErrTranslationLimit) {
		s.writeTranslationLimit(w, r, user.ID)
		return
	}
	if err != nil {
		slog.Error("handleStartTranslation", "err", err)
		writeError(w, http.StatusInternalServerError, codeInternal,
			"Не удалось начать перевод.")
		return
	}

	writeJSON(w, http.StatusOK, translationJobResponse{
		JobID:        job.ID.String(),
		Provider:     provider,
		Chars:        req.Chars,
		ProviderNote: providerNote(provider),
	})
}

// writeTranslationLimit объясняет отказ и называет время, когда станет можно.
//
// «Предел исчерпан» без срока — бесполезный ответ: человек не знает, зайти
// через час или завтра, и просто пробует снова.
func (s *Server) writeTranslationLimit(w http.ResponseWriter, r *http.Request, userID uuid.UUID) {
	message := "Один документ в сутки уже переведён."
	if next, err := s.store.NextDocumentTranslationAt(
		r.Context(), userID, s.cfg.DocumentTranslationsPerDay,
	); err == nil && !next.IsZero() {
		message += " Следующий — " + humanWait(time.Until(next)) + "."
	}
	w.Header().Set("Retry-After", "3600")
	writeError(w, http.StatusTooManyRequests, codeRateLimited, message)
}

func humanWait(d time.Duration) string {
	if d < time.Hour {
		minutes := int(d.Minutes()) + 1
		if minutes < 2 {
			return "через минуту"
		}
		return "через " + plural(minutes, "минуту", "минуты", "минут")
	}
	hours := int(d.Hours()) + 1
	return "через " + plural(hours, "час", "часа", "часов")
}

// plural согласует числительное с существительным: «1 час», «2 часа», «5 часов».
// Русский требует три формы, и «через 2 часов» читается как небрежность.
func plural(n int, one, few, many string) string {
	word := many
	if mod100 := n % 100; mod100 < 11 || mod100 > 14 {
		switch n % 10 {
		case 1:
			word = one
		case 2, 3, 4:
			word = few
		}
	}
	return strconv.Itoa(n) + " " + word
}

func providerNote(provider string) string {
	switch provider {
	case translate.ProviderDeepL:
		return "Документ короткий, поэтому переводит DeepL — качество выше."
	case translate.ProviderGoogle:
		return "Документ большой, поэтому переводит запасной переводчик: " +
			"месячной квоты DeepL на книгу не хватит, а она нужна разбору слов в читалке."
	default:
		return ""
	}
}

type chunkRequest struct {
	Paragraphs []string `json:"paragraphs"`
}

type chunkResponse struct {
	Paragraphs []string `json:"paragraphs"`
	// Done сообщает, сколько знаков переведено по этой заявке всего.
	Done int `json:"done"`
}

// handleTranslateChunk переводит очередной кусок документа.
func (s *Server) handleTranslateChunk(w http.ResponseWriter, r *http.Request) {
	user := userFrom(r.Context())
	jobID, err := uuid.Parse(r.PathValue("id"))
	if err != nil {
		writeError(w, http.StatusNotFound, codeNotFound, "Перевод не найден.")
		return
	}

	job, err := s.store.DocumentTranslationForUpdate(r.Context(), user.ID, jobID)
	if errors.Is(err, pgx.ErrNoRows) {
		writeError(w, http.StatusNotFound, codeNotFound, "Перевод не найден.")
		return
	}
	if err != nil {
		slog.Error("handleTranslateChunk: чтение заявки", "err", err)
		writeError(w, http.StatusInternalServerError, codeInternal, "Не удалось продолжить перевод.")
		return
	}

	var req chunkRequest
	if err := decodeJSON(w, r, &req, maxChunkBytes); err != nil {
		writeError(w, http.StatusBadRequest, codeBadRequest, "Не удалось прочитать запрос.")
		return
	}
	if len(req.Paragraphs) == 0 {
		writeJSON(w, http.StatusOK, chunkResponse{Paragraphs: []string{}, Done: job.TranslatedChars})
		return
	}
	if len(req.Paragraphs) > maxChunkParagraphs {
		writeError(w, http.StatusRequestEntityTooLarge, codeTooLarge,
			"Слишком много абзацев в одном куске.")
		return
	}

	// Счётчик увеличивается ДО перевода. Иначе два параллельных куска увидели
	// бы одно и то же значение и вместе вышли бы за заявленный объём — а
	// провайдер к тому времени уже отработал бы оба.
	size := translate.CountRunes(req.Paragraphs)
	total, err := s.store.AddTranslatedChars(r.Context(), jobID, size)
	if err != nil {
		slog.Error("handleTranslateChunk: учёт объёма", "err", err)
		writeError(w, http.StatusInternalServerError, codeInternal, "Не удалось продолжить перевод.")
		return
	}
	if total > job.Chars+chunkSlackRunes {
		s.releaseChunk(r, jobID, size)
		writeError(w, http.StatusRequestEntityTooLarge, codeTooLarge,
			"Прислано больше текста, чем было заявлено при начале перевода.")
		return
	}

	out, err := s.translator.Paragraphs(
		r.Context(), req.Paragraphs, "", "sr", job.Provider)
	if err != nil {
		// Кусок не переведён — значит и объём за ним не числится. Если по заявке
		// не переведено вообще ничего, она перестаёт считаться против суточного
		// предела, и человек может попробовать снова. Отказ переводчика не его
		// вина, и стоить ему дня он не должен.
		s.releaseChunk(r, jobID, size)
		writeTranslateError(w, err)
		return
	}
	writeJSON(w, http.StatusOK, chunkResponse{Paragraphs: out, Done: total})
}

// releaseChunk снимает объём, засчитанный авансом неудавшемуся куску.
//
// Контекст берётся без отмены: перевод куска идёт секунды, и к моменту отказа
// человек вполне мог закрыть вкладку. Контекст запроса тогда уже отменён, и
// возврат по нему не выполнился бы — то есть предел терялся бы ровно в том
// случае, ради которого всё это и написано.
func (s *Server) releaseChunk(r *http.Request, jobID uuid.UUID, chars int) {
	ctx, cancel := context.WithTimeout(context.WithoutCancel(r.Context()), 5*time.Second)
	defer cancel()
	if err := s.store.ReleaseTranslatedChars(ctx, jobID, chars); err != nil {
		slog.Error("handleTranslateChunk: возврат объёма", "err", err, "job", jobID)
	}
}

type bookImagePolicyRequest struct {
	// SHA256 — хеш содержимого картинки. Из него получается имя файла, поэтому
	// одна и та же книга, добавленная на разных устройствах, даёт одни и те же
	// адреса картинок и остаётся одной книгой.
	SHA256   string `json:"sha256"`
	MimeType string `json:"mimeType"`
	Size     int64  `json:"size"`
}

type bookImagePolicyResponse struct {
	*media.UploadPolicy
	// Uploaded означает, что такая картинка уже лежит в хранилище и заливать её
	// повторно не нужно.
	Uploaded bool `json:"uploaded"`
}

// handleBookImagePolicy выдаёт политику загрузки картинки из книги.
func (s *Server) handleBookImagePolicy(w http.ResponseWriter, r *http.Request) {
	if s.media == nil {
		writeError(w, http.StatusServiceUnavailable, codeUpstream,
			"Хранилище картинок пока не настроено.")
		return
	}
	var req bookImagePolicyRequest
	if err := decodeJSON(w, r, &req, 4<<10); err != nil {
		writeError(w, http.StatusBadRequest, codeBadRequest, "Не удалось прочитать параметры файла.")
		return
	}
	policy, uploaded, err := s.media.BookImagePolicy(
		r.Context(), userFrom(r.Context()).ID,
		strings.ToLower(strings.TrimSpace(req.SHA256)), req.MimeType, req.Size)
	if err != nil {
		writeError(w, http.StatusUnprocessableEntity, codeBadRequest, err.Error())
		return
	}
	writeJSON(w, http.StatusOK, bookImagePolicyResponse{UploadPolicy: policy, Uploaded: uploaded})
}

// handleFinishTranslation закрывает заявку.
//
// На предел это не влияет: его считает переведённый объём, а он набран кусками
// раньше. Отметка нужна для отчёта — по ней видно, сколько переводов доводят до
// конца.
func (s *Server) handleFinishTranslation(w http.ResponseWriter, r *http.Request) {
	user := userFrom(r.Context())
	jobID, err := uuid.Parse(r.PathValue("id"))
	if err != nil {
		writeError(w, http.StatusNotFound, codeNotFound, "Перевод не найден.")
		return
	}
	if _, err := s.store.DocumentTranslationForUpdate(r.Context(), user.ID, jobID); err != nil {
		writeError(w, http.StatusNotFound, codeNotFound, "Перевод не найден.")
		return
	}
	if err := s.store.FinishDocumentTranslation(r.Context(), jobID); err != nil {
		slog.Error("handleFinishTranslation", "err", err)
	}
	w.WriteHeader(http.StatusNoContent)
}
