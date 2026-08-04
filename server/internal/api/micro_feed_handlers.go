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
	actorKey, _, ok := microFeedActor(w, r, r.URL.Query().Get("visitorId"))
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
	writeJSON(w, http.StatusOK, map[string]any{
		"items": items, "strategy": strategy,
	})
}

type microFeedInteractionRequest struct {
	VisitorID string `json:"visitorId"`
	Event     string `json:"event"`
	DwellMS   int    `json:"dwellMs"`
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
	actorKey, userID, ok := microFeedActor(w, r, request.VisitorID)
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

func microFeedActor(w http.ResponseWriter, r *http.Request, visitor string) (string, uuid.UUID, bool) {
	if user := userFrom(r.Context()); user != nil {
		return "user:" + user.ID.String(), user.ID, true
	}
	id, err := uuid.Parse(strings.TrimSpace(visitor))
	if err != nil || id == uuid.Nil {
		writeError(w, http.StatusBadRequest, codeBadRequest, "Браузеру нужен анонимный идентификатор ленты.")
		return "", uuid.Nil, false
	}
	return "guest:" + id.String(), uuid.Nil, true
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
