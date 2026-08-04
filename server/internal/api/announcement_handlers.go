package api

import (
	"errors"
	"net/http"
	"net/url"
	"strconv"
	"strings"
	"time"

	"github.com/citavuk/server/internal/store"
	"github.com/google/uuid"
)

type announcementRequest struct {
	Kind           string    `json:"kind"`
	Title          string    `json:"title"`
	Body           string    `json:"body"`
	BannerText     string    `json:"bannerText"`
	ImageURL       string    `json:"imageUrl"`
	ActionLabel    string    `json:"actionLabel"`
	ActionURL      string    `json:"actionUrl"`
	StartsAt       *jsonTime `json:"startsAt"`
	EndsAt         *jsonTime `json:"endsAt"`
	BannerEnabled  bool      `json:"bannerEnabled"`
	NotifyUsers    bool      `json:"notifyUsers"`
	ShareRequired  bool      `json:"shareRequired"`
	ShareText      string    `json:"shareText"`
	RewardKey      string    `json:"rewardKey"`
	RewardAssetURL string    `json:"rewardAssetUrl"`
}

// jsonTime принимает обычный RFC3339 и позволяет отличить отсутствующее время
// от нулевой даты без строкового разбора в обработчиках.
type jsonTime struct{ time.Time }

func (t *jsonTime) UnmarshalJSON(data []byte) error {
	value := strings.Trim(string(data), `"`)
	if value == "" || value == "null" {
		return nil
	}
	parsed, err := time.Parse(time.RFC3339, value)
	if err != nil {
		return err
	}
	t.Time = parsed
	return nil
}

func (r announcementRequest) input() (store.AnnouncementInput, error) {
	kind := strings.TrimSpace(r.Kind)
	if kind == "" {
		kind = "news"
	}
	if kind != "news" && kind != "campaign" && kind != "maintenance" {
		return store.AnnouncementInput{}, errors.New("неизвестный тип объявления")
	}
	title := trimField(r.Title, 120)
	body := trimField(r.Body, 4000)
	if title == "" || body == "" {
		return store.AnnouncementInput{}, errors.New("нужны заголовок и текст объявления")
	}
	banner := trimField(r.BannerText, 500)
	if r.BannerEnabled && banner == "" {
		return store.AnnouncementInput{}, errors.New("для баннера нужен короткий текст")
	}
	for label, raw := range map[string]string{
		"картинка": r.ImageURL, "ссылка действия": r.ActionURL, "награда": r.RewardAssetURL,
	} {
		if err := validateAnnouncementURL(raw); err != nil {
			return store.AnnouncementInput{}, errors.New(label + ": " + err.Error())
		}
	}
	rewardKey := trimField(r.RewardKey, 80)
	if r.ShareRequired && (rewardKey == "" || strings.TrimSpace(r.RewardAssetURL) == "") {
		return store.AnnouncementInput{}, errors.New("для акции нужны ключ и файл награды")
	}
	var startsAt, endsAt *time.Time
	if r.StartsAt != nil && !r.StartsAt.IsZero() {
		startsAt = &r.StartsAt.Time
	}
	if r.EndsAt != nil && !r.EndsAt.IsZero() {
		endsAt = &r.EndsAt.Time
	}
	if startsAt != nil && endsAt != nil && !endsAt.After(*startsAt) {
		return store.AnnouncementInput{}, errors.New("окончание должно быть позже начала")
	}
	return store.AnnouncementInput{
		Kind: kind, Title: title, Body: body, BannerText: banner,
		ImageURL: strings.TrimSpace(r.ImageURL), ActionLabel: trimField(r.ActionLabel, 80),
		ActionURL: strings.TrimSpace(r.ActionURL), StartsAt: startsAt, EndsAt: endsAt,
		BannerEnabled: r.BannerEnabled, NotifyUsers: r.NotifyUsers,
		ShareRequired: r.ShareRequired, ShareText: trimField(r.ShareText, 1200),
		RewardKey: rewardKey, RewardAssetURL: strings.TrimSpace(r.RewardAssetURL),
	}, nil
}

func validateAnnouncementURL(raw string) error {
	raw = strings.TrimSpace(raw)
	if raw == "" || (strings.HasPrefix(raw, "/") && !strings.HasPrefix(raw, "//")) {
		return nil
	}
	u, err := url.Parse(raw)
	if err != nil || u.Scheme != "https" || u.Hostname() == "" {
		return errors.New("нужна внутренняя ссылка или безопасный HTTPS-адрес")
	}
	return nil
}

func (s *Server) handleAdminAnnouncements(w http.ResponseWriter, r *http.Request) {
	items, err := s.store.ListAdminAnnouncements(r.Context())
	if err != nil {
		writeError(w, http.StatusInternalServerError, codeInternal, "Не удалось загрузить объявления.")
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{"items": items})
}

func (s *Server) handleCreateAnnouncement(w http.ResponseWriter, r *http.Request) {
	var req announcementRequest
	if err := decodeJSON(w, r, &req, 16<<10); err != nil {
		writeError(w, http.StatusBadRequest, codeBadRequest, "Не удалось прочитать объявление.")
		return
	}
	input, err := req.input()
	if err != nil {
		writeError(w, http.StatusUnprocessableEntity, codeBadRequest, err.Error())
		return
	}
	item, err := s.store.CreateAnnouncement(r.Context(), userFrom(r.Context()).ID, input)
	if err != nil {
		writeError(w, http.StatusInternalServerError, codeInternal, "Не удалось создать объявление.")
		return
	}
	writeJSON(w, http.StatusCreated, item)
}

func (s *Server) handleUpdateAnnouncement(w http.ResponseWriter, r *http.Request) {
	id, ok := announcementID(w, r)
	if !ok {
		return
	}
	var req announcementRequest
	if err := decodeJSON(w, r, &req, 16<<10); err != nil {
		writeError(w, http.StatusBadRequest, codeBadRequest, "Не удалось прочитать объявление.")
		return
	}
	input, err := req.input()
	if err != nil {
		writeError(w, http.StatusUnprocessableEntity, codeBadRequest, err.Error())
		return
	}
	item, err := s.store.UpdateAnnouncement(r.Context(), id, input)
	if errors.Is(err, store.ErrAnnouncementNotFound) {
		writeError(w, http.StatusConflict, codeConflict, "Можно менять только черновик объявления.")
		return
	}
	if err != nil {
		writeError(w, http.StatusInternalServerError, codeInternal, "Не удалось сохранить объявление.")
		return
	}
	writeJSON(w, http.StatusOK, item)
}

func (s *Server) handlePublishAnnouncement(w http.ResponseWriter, r *http.Request) {
	id, ok := announcementID(w, r)
	if !ok {
		return
	}
	item, err := s.store.PublishAnnouncement(r.Context(), id)
	if errors.Is(err, store.ErrAnnouncementNotFound) {
		writeError(w, http.StatusConflict, codeConflict, "Объявление уже опубликовано или не найдено.")
		return
	}
	if err != nil {
		writeError(w, http.StatusInternalServerError, codeInternal, "Не удалось разослать объявление.")
		return
	}
	writeJSON(w, http.StatusOK, item)
}

func (s *Server) handleArchiveAnnouncement(w http.ResponseWriter, r *http.Request) {
	id, ok := announcementID(w, r)
	if !ok {
		return
	}
	if err := s.store.ArchiveAnnouncement(r.Context(), id); err != nil {
		writeError(w, http.StatusNotFound, codeNotFound, "Объявление не найдено.")
		return
	}
	w.WriteHeader(http.StatusNoContent)
}

func announcementID(w http.ResponseWriter, r *http.Request) (uuid.UUID, bool) {
	id, err := uuid.Parse(r.PathValue("id"))
	if err != nil {
		writeError(w, http.StatusBadRequest, codeBadRequest, "Неверный идентификатор объявления.")
		return uuid.Nil, false
	}
	return id, true
}

func (s *Server) handleAnnouncements(w http.ResponseWriter, r *http.Request) {
	userID := uuid.Nil
	if user := userFrom(r.Context()); user != nil {
		userID = user.ID
	}
	items, err := s.store.ListActiveAnnouncements(r.Context(), userID)
	if err != nil {
		writeError(w, http.StatusInternalServerError, codeInternal, "Не удалось загрузить объявления.")
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{"items": items})
}

func (s *Server) handleReadAnnouncement(w http.ResponseWriter, r *http.Request) {
	s.handleAnnouncementState(w, r, false)
}

func (s *Server) handleDismissAnnouncement(w http.ResponseWriter, r *http.Request) {
	s.handleAnnouncementState(w, r, true)
}

func (s *Server) handleAnnouncementState(w http.ResponseWriter, r *http.Request, dismiss bool) {
	id, ok := announcementID(w, r)
	if !ok {
		return
	}
	if err := s.store.SetAnnouncementState(r.Context(), id, userFrom(r.Context()).ID, dismiss); err != nil {
		writeError(w, http.StatusInternalServerError, codeInternal, "Не удалось сохранить состояние объявления.")
		return
	}
	w.WriteHeader(http.StatusNoContent)
}

type claimAnnouncementRequest struct {
	SocialNetwork string `json:"socialNetwork"`
	ProofURL      string `json:"proofUrl"`
}

func (s *Server) handleClaimAnnouncement(w http.ResponseWriter, r *http.Request) {
	id, ok := announcementID(w, r)
	if !ok {
		return
	}
	var req claimAnnouncementRequest
	if err := decodeJSON(w, r, &req, 4<<10); err != nil {
		writeError(w, http.StatusBadRequest, codeBadRequest, "Не удалось прочитать ссылку на публикацию.")
		return
	}
	network, proofURL, err := validateShareProof(req.SocialNetwork, req.ProofURL)
	if err != nil {
		writeError(w, http.StatusUnprocessableEntity, codeBadRequest, err.Error())
		return
	}
	rewardKey, rewardAssetURL, err := s.store.ClaimAnnouncement(
		r.Context(), id, userFrom(r.Context()).ID, network, proofURL)
	if errors.Is(err, store.ErrAnnouncementNotFound) {
		writeError(w, http.StatusNotFound, codeNotFound, "Акция не найдена или уже завершена.")
		return
	}
	if err != nil {
		writeError(w, http.StatusInternalServerError, codeInternal, "Не удалось выдать награду.")
		return
	}
	writeJSON(w, http.StatusOK, map[string]string{"rewardKey": rewardKey, "rewardAssetUrl": rewardAssetURL})
}

var shareHosts = map[string][]string{
	"instagram": {"instagram.com"},
	"threads":   {"threads.net"},
	"facebook":  {"facebook.com", "fb.com"},
	"twitter":   {"x.com", "twitter.com"},
	"vk":        {"vk.com"},
	"telegram":  {"t.me", "telegram.me"},
}

func validateShareProof(network, raw string) (string, string, error) {
	network = strings.ToLower(strings.TrimSpace(network))
	hosts, ok := shareHosts[network]
	if !ok {
		return "", "", errors.New("выберите поддерживаемую социальную сеть")
	}
	u, err := url.Parse(strings.TrimSpace(raw))
	if err != nil || u.Scheme != "https" || u.Hostname() == "" {
		return "", "", errors.New("добавьте HTTPS-ссылку на опубликованный пост")
	}
	host := strings.ToLower(u.Hostname())
	allowed := false
	for _, candidate := range hosts {
		if host == candidate || strings.HasSuffix(host, "."+candidate) {
			allowed = true
			break
		}
	}
	if !allowed {
		return "", "", errors.New("ссылка не относится к выбранной социальной сети")
	}
	u.Fragment = ""
	return network, u.String(), nil
}

func (s *Server) handleNotifications(w http.ResponseWriter, r *http.Request) {
	limit, _ := strconv.Atoi(r.URL.Query().Get("limit"))
	items, unread, err := s.store.ListUserNotifications(r.Context(), userFrom(r.Context()).ID, limit)
	if err != nil {
		writeError(w, http.StatusInternalServerError, codeInternal, "Не удалось загрузить уведомления.")
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{"items": items, "unread": unread})
}

func (s *Server) handleReadNotification(w http.ResponseWriter, r *http.Request) {
	id, ok := announcementID(w, r)
	if !ok {
		return
	}
	if err := s.store.ReadNotification(r.Context(), id, userFrom(r.Context()).ID); err != nil {
		writeError(w, http.StatusInternalServerError, codeInternal, "Не удалось отметить уведомление.")
		return
	}
	w.WriteHeader(http.StatusNoContent)
}

func (s *Server) handleReadAllNotifications(w http.ResponseWriter, r *http.Request) {
	if err := s.store.ReadAllNotifications(r.Context(), userFrom(r.Context()).ID); err != nil {
		writeError(w, http.StatusInternalServerError, codeInternal, "Не удалось отметить уведомления.")
		return
	}
	w.WriteHeader(http.StatusNoContent)
}
