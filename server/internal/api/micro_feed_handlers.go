package api

import (
	"errors"
	"log/slog"
	"net/http"
	"strconv"
	"strings"

	"github.com/citavuk/server/internal/feed"
	"github.com/citavuk/server/internal/store"
	"github.com/google/uuid"
)

func (s *Server) handleMicroFeed(w http.ResponseWriter, r *http.Request) {
	// Гость приходит с подписанным токеном; если его ещё нет или он не прошёл
	// проверку — выдаём новый и возвращаем клиенту вместе с лентой. Отказывать
	// нельзя: первый заход всегда без токена, и лента обязана открыться.
	actorKey, _, issued, ok := s.microFeedActor(
		w, r, r.URL.Query().Get("visitorToken"), true)
	if !ok {
		return
	}
	limit, _ := strconv.Atoi(r.URL.Query().Get("limit"))
	exclude := make([]uuid.UUID, 0, 32)
	for _, raw := range strings.Split(r.URL.Query().Get("exclude"), ",") {
		if id, err := uuid.Parse(strings.TrimSpace(raw)); err == nil {
			exclude = append(exclude, id)
		}
		if len(exclude) == 80 {
			break
		}
	}
	items, strategy, err := s.store.ListMicroFeed(r.Context(), actorKey, exclude, limit)
	if err != nil {
		slog.Error("handleMicroFeed", "err", err)
		writeError(w, http.StatusInternalServerError, codeInternal, "Не удалось собрать микро-ленту.")
		return
	}
	// Адрес картинки подменяется на собственную ручку: прямая ссылка на чужой
	// сайт рассказала бы ему, кто из наших читателей открыл карточку.
	for i := range items {
		if strings.TrimSpace(items[i].ImageURL) != "" {
			items[i].ImageURL = "/v1/micro-feed/" + items[i].ID.String() + "/image"
		}
	}
	// Анкета едет вместе с лентой: клиенту нужно решить, показывать ли опрос,
	// ещё до первой карточки, и отдельный запрос ради этого поставил бы опрос
	// поверх уже открытой ленты — то есть с опозданием.
	prefs, err := s.store.GetMicroFeedPreferences(r.Context(), actorKey)
	if err != nil {
		slog.Warn("handleMicroFeed preferences", "err", err)
	}
	response := map[string]any{"items": items, "strategy": strategy, "preferences": prefs}
	if issued != "" {
		response["visitorToken"] = issued
	}
	writeJSON(w, http.StatusOK, response)
}

type microFeedPreferencesRequest struct {
	VisitorToken string   `json:"visitorToken"`
	Categories   []string `json:"categories"`
	CEFR         string   `json:"cefr"`
}

// handleMicroFeedPreferences сохраняет ответы анкеты.
//
// Токен обязателен и новый не выдаётся: анкету заполняют уже внутри ленты, то
// есть после того, как токен пришёл вместе с первой порцией карточек.
func (s *Server) handleMicroFeedPreferences(w http.ResponseWriter, r *http.Request) {
	var request microFeedPreferencesRequest
	if err := decodeJSON(w, r, &request, 4<<10); err != nil {
		writeError(w, http.StatusBadRequest, codeBadRequest, "Не удалось прочитать ответы.")
		return
	}
	actorKey, userID, _, ok := s.microFeedActor(w, r, request.VisitorToken, false)
	if !ok {
		return
	}
	if len(request.Categories) > len(store.MicroFeedCategories) {
		writeError(w, http.StatusUnprocessableEntity, codeBadRequest, "Слишком много тем.")
		return
	}
	prefs, err := s.store.SaveMicroFeedPreferences(
		r.Context(), actorKey, userID, request.Categories, request.CEFR)
	if err != nil {
		slog.Error("handleMicroFeedPreferences", "err", err)
		writeError(w, http.StatusInternalServerError, codeInternal, "Не удалось сохранить ответы.")
		return
	}
	writeJSON(w, http.StatusOK, prefs)
}

// handleMicroFeedLiked отдаёт карточки, отмеченные лайком.
func (s *Server) handleMicroFeedLiked(w http.ResponseWriter, r *http.Request) {
	actorKey, _, _, ok := s.microFeedActor(w, r, r.URL.Query().Get("visitorToken"), false)
	if !ok {
		return
	}
	limit, _ := strconv.Atoi(r.URL.Query().Get("limit"))
	items, err := s.store.ListLikedMicroFeed(r.Context(), actorKey, limit)
	if err != nil {
		slog.Error("handleMicroFeedLiked", "err", err)
		writeError(w, http.StatusInternalServerError, codeInternal, "Не удалось загрузить сохранённое.")
		return
	}
	for i := range items {
		if strings.TrimSpace(items[i].ImageURL) != "" {
			items[i].ImageURL = "/v1/micro-feed/" + items[i].ID.String() + "/image"
		}
	}
	writeJSON(w, http.StatusOK, map[string]any{"items": items})
}

type microFeedInteractionRequest struct {
	VisitorToken string `json:"visitorToken"`
	Event        string `json:"event"`
	DwellMS      int    `json:"dwellMs"`
}

func (s *Server) handleMicroFeedInteraction(w http.ResponseWriter, r *http.Request) {
	id, ok := microFeedID(w, r)
	if !ok {
		return
	}
	var request microFeedInteractionRequest
	if err := decodeJSON(w, r, &request, 4<<10); err != nil {
		writeError(w, http.StatusBadRequest, codeBadRequest, "Не удалось прочитать действие.")
		return
	}
	// Здесь токен обязателен и новый не выдаётся: действие без действующего
	// идентификатора учитывать не за кем. Клиент получает токен вместе с
	// лентой, то есть до любого действия он уже есть.
	actorKey, userID, _, ok := s.microFeedActor(w, r, request.VisitorToken, false)
	if !ok {
		return
	}
	request.Event = strings.TrimSpace(request.Event)
	allowed := map[string]bool{
		"view": true, "like": true, "dislike": true,
		"reaction_cleared": true, "read_more_clicked": true,
		"quick_skip": true, "complete": true, "audio_play": true,
	}
	if !allowed[request.Event] || request.DwellMS < 0 || request.DwellMS > 3600000 {
		writeError(w, http.StatusUnprocessableEntity, codeBadRequest, "Неизвестное действие микро-ленты.")
		return
	}
	if request.Event == "quick_skip" && request.DwellMS >= 2000 {
		writeError(w, http.StatusUnprocessableEntity, codeBadRequest, "Быстрый пропуск должен быть короче двух секунд.")
		return
	}
	if err := s.store.RecordMicroFeedInteraction(
		r.Context(), id, actorKey, userID, request.Event, request.DwellMS,
	); errors.Is(err, store.ErrMicroFeedNotFound) {
		writeError(w, http.StatusNotFound, codeNotFound, "Карточка не найдена.")
		return
	} else if err != nil {
		slog.Error("handleMicroFeedInteraction", "err", err)
		writeError(w, http.StatusInternalServerError, codeInternal, "Не удалось сохранить действие.")
		return
	}
	w.WriteHeader(http.StatusNoContent)
}

// microFeedActor определяет, чьи это действия.
//
// Вошедший читатель узнаётся по сессии, гость — по подписанному серверным HMAC
// токену. Самодельный идентификатор больше не принимается: пока его придумывал
// браузер, лайки накручивались сменой строки в запросе.
//
// Третье возвращаемое значение — выданный токен. Оно не пустое только когда
// сервер завёл новый и клиенту нужно его сохранить.
func (s *Server) microFeedActor(
	w http.ResponseWriter,
	r *http.Request,
	token string,
	issueWhenMissing bool,
) (string, uuid.UUID, string, bool) {
	if user := userFrom(r.Context()); user != nil {
		return "user:" + user.ID.String(), user.ID, "", true
	}
	if id, err := s.parseVisitorToken(token); err == nil {
		return "guest:" + id, uuid.Nil, "", true
	}
	if !issueWhenMissing {
		writeError(w, http.StatusBadRequest, codeBadRequest,
			"Обновите страницу: идентификатор ленты устарел.")
		return "", uuid.Nil, "", false
	}
	issued := s.issueVisitorToken()
	id, err := s.parseVisitorToken(issued)
	if err != nil {
		writeError(w, http.StatusInternalServerError, codeInternal,
			"Не удалось завести идентификатор ленты.")
		return "", uuid.Nil, "", false
	}
	return "guest:" + id, uuid.Nil, issued, true
}

func (s *Server) handleAdminMicroFeedSources(w http.ResponseWriter, r *http.Request) {
	items, err := s.store.ListMicroFeedSources(r.Context())
	if err != nil {
		writeError(w, http.StatusInternalServerError, codeInternal, "Не удалось загрузить источники.")
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{
		"items":             items,
		"generatorEnabled":  s.microFeed.Enabled(),
		"embeddingsEnabled": s.microFeed.EmbeddingsEnabled(),
	})
}

func (s *Server) handleAdminSyncMicroFeedSource(w http.ResponseWriter, r *http.Request) {
	slug := strings.TrimSpace(r.PathValue("slug"))
	source, err := s.store.GetMicroFeedSource(r.Context(), slug)
	if errors.Is(err, store.ErrMicroFeedNotFound) || !source.Enabled {
		writeError(w, http.StatusNotFound, codeNotFound, "Источник не найден или выключен.")
		return
	}
	if err != nil {
		writeError(w, http.StatusInternalServerError, codeInternal, "Не удалось загрузить источник.")
		return
	}
	items, err := s.feedSources.Fetch(r.Context(), source, 24)
	if errors.Is(err, feed.ErrSourceNotSupported) {
		writeError(w, http.StatusUnprocessableEntity, codeBadRequest, "Этот источник добавляется вручную.")
		return
	}
	if err != nil {
		slog.Warn("micro-feed source sync failed", "slug", slug, "err", err)
		writeError(w, http.StatusBadGateway, codeUpstream, "Источник сейчас недоступен.")
		return
	}
	count, err := s.store.SaveMicroFeedImports(r.Context(), source.Slug, items)
	if err != nil {
		writeError(w, http.StatusInternalServerError, codeInternal, "Не удалось сохранить заготовки.")
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{"found": len(items), "saved": count})
}

func (s *Server) handleAdminMicroFeedImports(w http.ResponseWriter, r *http.Request) {
	items, err := s.store.ListMicroFeedImports(r.Context(), strings.TrimSpace(r.URL.Query().Get("status")), 100)
	if err != nil {
		writeError(w, http.StatusInternalServerError, codeInternal, "Не удалось загрузить очередь источников.")
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{"items": items})
}

func (s *Server) handleAdminGenerateMicroFeedItem(w http.ResponseWriter, r *http.Request) {
	id, ok := microFeedID(w, r)
	if !ok {
		return
	}
	input, err := s.store.GetMicroFeedImport(r.Context(), id)
	if errors.Is(err, store.ErrMicroFeedNotFound) || input.Status != "queued" {
		writeError(w, http.StatusConflict, codeConflict, "Заготовка уже обработана или не найдена.")
		return
	}
	if err != nil {
		writeError(w, http.StatusInternalServerError, codeInternal, "Не удалось загрузить заготовку.")
		return
	}
	source, err := s.store.GetMicroFeedSource(r.Context(), input.SourceSlug)
	if err != nil {
		writeError(w, http.StatusInternalServerError, codeInternal, "Не удалось загрузить источник.")
		return
	}
	item, err := s.microFeed.Generate(r.Context(), input, source)
	if errors.Is(err, feed.ErrNotConfigured) {
		writeError(w, http.StatusServiceUnavailable, codeInternal, "Генератор карточек не настроен.")
		return
	}
	if err != nil {
		slog.Warn("micro-feed generation failed", "import", id, "err", err)
		writeError(w, http.StatusBadGateway, codeUpstream, "Модель не смогла подготовить карточку.")
		return
	}
	var embedding []float32
	if s.microFeed.EmbeddingsEnabled() {
		embedding, err = s.microFeed.Embed(r.Context(), item)
		if err != nil {
			slog.Warn("micro-feed draft has no embedding", "import", id, "err", err)
			embedding = nil
		}
	}
	created, err := s.store.CreateMicroFeedItem(
		r.Context(), item, userFrom(r.Context()).ID, embedding,
	)
	if err != nil {
		writeError(w, http.StatusInternalServerError, codeInternal, "Не удалось сохранить черновик карточки.")
		return
	}
	writeJSON(w, http.StatusCreated, created)
}

type microFeedRejectRequest struct {
	Reason string `json:"reason"`
}

func (s *Server) handleAdminRejectMicroFeedImport(w http.ResponseWriter, r *http.Request) {
	id, ok := microFeedID(w, r)
	if !ok {
		return
	}
	var request microFeedRejectRequest
	if err := decodeJSON(w, r, &request, 2<<10); err != nil {
		writeError(w, http.StatusBadRequest, codeBadRequest, "Не удалось прочитать причину.")
		return
	}
	if err := s.store.RejectMicroFeedImport(r.Context(), id, trimField(request.Reason, 500)); err != nil {
		writeError(w, http.StatusNotFound, codeNotFound, "Заготовка не найдена.")
		return
	}
	w.WriteHeader(http.StatusNoContent)
}

func (s *Server) handleAdminMicroFeedItems(w http.ResponseWriter, r *http.Request) {
	items, err := s.store.ListAdminMicroFeedItems(r.Context(), strings.TrimSpace(r.URL.Query().Get("status")), 120)
	if err != nil {
		writeError(w, http.StatusInternalServerError, codeInternal, "Не удалось загрузить карточки.")
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{"items": items})
}

type microFeedItemRequest struct {
	Kind              string                `json:"kind"`
	Category          string                `json:"category"`
	TitleCyrillic     string                `json:"titleCyrillic"`
	TitleLatin        string                `json:"titleLatin"`
	TextCyrillic      string                `json:"textCyrillic"`
	TextLatin         string                `json:"textLatin"`
	OriginalLanguage  string                `json:"originalLanguage"`
	OriginalScript    string                `json:"originalScript"`
	CEFR              string                `json:"cefr"`
	Tags              []string              `json:"tags"`
	DifficultWords    []store.DifficultWord `json:"difficultWords"`
	ImageURL          string                `json:"imageUrl"`
	AudioURL          string                `json:"audioUrl"`
	SourceSlug        string                `json:"sourceSlug"`
	SourceTitle       string                `json:"sourceTitle"`
	SourceURL         string                `json:"sourceUrl"`
	LicenseCode       string                `json:"licenseCode"`
	AttributionText   string                `json:"attributionText"`
	BookID            string                `json:"bookId"`
	ChapterID         string                `json:"chapterId"`
	StartPositionChar int                   `json:"startPositionChar"`
	BookTargetURL     string                `json:"bookTargetUrl"`
}

func (request microFeedItemRequest) item(id uuid.UUID) (*store.MicroFeedItem, error) {
	item := &store.MicroFeedItem{
		ID: id, Kind: strings.TrimSpace(request.Kind), Category: strings.TrimSpace(request.Category),
		TitleCyrillic:    trimField(request.TitleCyrillic, 140),
		TitleLatin:       trimField(request.TitleLatin, 140),
		TextCyrillic:     trimField(request.TextCyrillic, 10000),
		TextLatin:        trimField(request.TextLatin, 10000),
		OriginalLanguage: trimField(request.OriginalLanguage, 12),
		OriginalScript:   strings.TrimSpace(request.OriginalScript), CEFR: strings.TrimSpace(request.CEFR),
		Tags: cleanFeedTags(request.Tags), DifficultWords: request.DifficultWords,
		ImageURL: strings.TrimSpace(request.ImageURL), AudioURL: strings.TrimSpace(request.AudioURL),
		SourceSlug: strings.TrimSpace(request.SourceSlug), SourceTitle: trimField(request.SourceTitle, 240),
		SourceURL: strings.TrimSpace(request.SourceURL), LicenseCode: trimField(request.LicenseCode, 80),
		AttributionText: trimField(request.AttributionText, 240), SourceBookID: trimField(request.BookID, 120),
		ChapterID: trimField(request.ChapterID, 120), StartPositionChar: request.StartPositionChar,
		BookTargetURL: strings.TrimSpace(request.BookTargetURL),
	}
	if item.OriginalLanguage == "" {
		item.OriginalLanguage = "sr"
	}
	for label, raw := range map[string]string{
		"изображение": item.ImageURL, "аудио": item.AudioURL,
		"источник": item.SourceURL, "книга": item.BookTargetURL,
	} {
		if err := validateAnnouncementURL(raw); err != nil {
			return nil, errors.New(label + ": " + err.Error())
		}
	}
	if item.SourceURL != "" && item.AttributionText == "" {
		return nil, errors.New("для внешнего источника нужна атрибуция")
	}
	if err := feed.ValidateItem(item); err != nil {
		return nil, err
	}
	return item, nil
}

func cleanFeedTags(values []string) []string {
	result := make([]string, 0, 5)
	seen := map[string]bool{}
	for _, value := range values {
		value = strings.ToLower(trimField(value, 32))
		if value != "" && !seen[value] {
			seen[value] = true
			result = append(result, value)
		}
		if len(result) == 5 {
			break
		}
	}
	return result
}

func (s *Server) handleAdminCreateMicroFeedItem(w http.ResponseWriter, r *http.Request) {
	var request microFeedItemRequest
	if err := decodeJSON(w, r, &request, 32<<10); err != nil {
		writeError(w, http.StatusBadRequest, codeBadRequest, "Не удалось прочитать карточку.")
		return
	}
	item, err := request.item(uuid.New())
	if err != nil {
		writeError(w, http.StatusUnprocessableEntity, codeBadRequest, err.Error())
		return
	}
	created, err := s.store.CreateMicroFeedItem(r.Context(), item, userFrom(r.Context()).ID, nil)
	if err != nil {
		writeError(w, http.StatusInternalServerError, codeInternal, "Не удалось создать карточку.")
		return
	}
	writeJSON(w, http.StatusCreated, created)
}

func (s *Server) handleAdminUpdateMicroFeedItem(w http.ResponseWriter, r *http.Request) {
	id, ok := microFeedID(w, r)
	if !ok {
		return
	}
	var request microFeedItemRequest
	if err := decodeJSON(w, r, &request, 32<<10); err != nil {
		writeError(w, http.StatusBadRequest, codeBadRequest, "Не удалось прочитать карточку.")
		return
	}
	item, err := request.item(id)
	if err != nil {
		writeError(w, http.StatusUnprocessableEntity, codeBadRequest, err.Error())
		return
	}
	updated, err := s.store.UpdateMicroFeedItem(r.Context(), item)
	if errors.Is(err, store.ErrMicroFeedNotFound) {
		writeError(w, http.StatusConflict, codeConflict, "Можно менять только черновик карточки.")
		return
	}
	if err != nil {
		writeError(w, http.StatusInternalServerError, codeInternal, "Не удалось сохранить карточку.")
		return
	}
	writeJSON(w, http.StatusOK, updated)
}

func (s *Server) handleAdminPublishMicroFeedItem(w http.ResponseWriter, r *http.Request) {
	id, ok := microFeedID(w, r)
	if !ok {
		return
	}
	item, err := s.store.GetMicroFeedItem(r.Context(), id, "")
	if errors.Is(err, store.ErrMicroFeedNotFound) || item.Status != "draft" {
		writeError(w, http.StatusConflict, codeConflict, "Карточка уже опубликована или не найдена.")
		return
	}
	if err != nil {
		writeError(w, http.StatusInternalServerError, codeInternal, "Не удалось загрузить карточку.")
		return
	}
	if err := feed.ValidateItem(item); err != nil {
		writeError(w, http.StatusUnprocessableEntity, codeBadRequest, err.Error())
		return
	}
	if !item.HasEmbedding && s.microFeed.EmbeddingsEnabled() {
		embedding, embedErr := s.microFeed.Embed(r.Context(), item)
		if embedErr != nil {
			slog.Warn("micro-feed publish embedding failed", "item", id, "err", embedErr)
		} else if err := s.store.SetMicroFeedEmbedding(r.Context(), id, embedding); err != nil {
			writeError(w, http.StatusInternalServerError, codeInternal, "Не удалось сохранить профиль карточки.")
			return
		}
	}
	published, err := s.store.PublishMicroFeedItem(r.Context(), id)
	if err != nil {
		writeError(w, http.StatusConflict, codeConflict, "Не удалось опубликовать карточку.")
		return
	}
	writeJSON(w, http.StatusOK, published)
}

func (s *Server) handleAdminArchiveMicroFeedItem(w http.ResponseWriter, r *http.Request) {
	id, ok := microFeedID(w, r)
	if !ok {
		return
	}
	if err := s.store.ArchiveMicroFeedItem(r.Context(), id); err != nil {
		writeError(w, http.StatusNotFound, codeNotFound, "Карточка не найдена.")
		return
	}
	w.WriteHeader(http.StatusNoContent)
}

func (s *Server) handleAdminDeleteMicroFeedItem(w http.ResponseWriter, r *http.Request) {
	id, ok := microFeedID(w, r)
	if !ok {
		return
	}
	if err := s.store.DeleteMicroFeedItem(r.Context(), id); err != nil {
		writeError(w, http.StatusNotFound, codeNotFound, "Карточка не найдена.")
		return
	}
	w.WriteHeader(http.StatusNoContent)
}

func microFeedID(w http.ResponseWriter, r *http.Request) (uuid.UUID, bool) {
	id, err := uuid.Parse(r.PathValue("id"))
	if err != nil {
		writeError(w, http.StatusBadRequest, codeBadRequest, "Неверный идентификатор микро-ленты.")
		return uuid.Nil, false
	}
	return id, true
}
