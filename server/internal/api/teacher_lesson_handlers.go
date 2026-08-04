package api

import (
	"context"
	"encoding/json"
	"errors"
	"log/slog"
	"net/http"
	"net/url"
	"regexp"
	"strconv"
	"strings"
	"time"
	"unicode/utf8"

	"github.com/citavuk/server/internal/store"
	"github.com/google/uuid"
)

const maxLessonJSONBytes = 512 << 10

var (
	validLevels     = map[string]bool{"A1": true, "A2": true, "B1": true, "B2": true, "C1": true, "C2": true}
	validLessonType = map[string]bool{"lexicon": true, "grammar": true, "speaking": true, "writing": true}
	validScripts    = map[string]bool{"latin": true, "cyrillic": true, "both": true}
	validExercises  = map[string]bool{
		"multiple_choice": true, "ending_picker": true, "sentence_builder": true,
		"letter_unscramble": true, "matching": true, "fill_blank": true,
		"image_description": true, "reading_qa": true, "form_hunt": true,
		"explain_word": true, "teacher_letter": true,
	}
)

type teacherApplicationRequest struct {
	SerbianLevel       string          `json:"serbianLevel"`
	NativeSpeaker      bool            `json:"nativeSpeaker"`
	RussianLevel       string          `json:"russianLevel"`
	Certificates       string          `json:"certificates"`
	TeachingExperience string          `json:"teachingExperience"`
	SocialLinks        json.RawMessage `json:"socialLinks"`
	MonetizationIntent string          `json:"monetizationIntent"`
}

func (s *Server) handleTeacherApplication(w http.ResponseWriter, r *http.Request) {
	a, err := s.store.TeacherApplication(r.Context(), userFrom(r.Context()).ID)
	if errors.Is(err, store.ErrApplicationAbsent) {
		writeJSON(w, http.StatusOK, map[string]any{"status": "none"})
		return
	}
	if err != nil {
		slog.Error("handleTeacherApplication", "err", err)
		writeError(w, http.StatusInternalServerError, codeInternal, "Не удалось прочитать заявку.")
		return
	}
	writeJSON(w, http.StatusOK, a)
}

func (s *Server) handleSubmitTeacherApplication(w http.ResponseWriter, r *http.Request) {
	user := userFrom(r.Context())
	if !user.EmailVerified {
		writeError(w, http.StatusForbidden, codeEmailUnverified, "Сначала подтвердите адрес почты.")
		return
	}
	var req teacherApplicationRequest
	if err := decodeJSON(w, r, &req, 64<<10); err != nil {
		writeError(w, http.StatusBadRequest, codeBadRequest, "Не удалось прочитать заявку.")
		return
	}
	if !validLevels[req.SerbianLevel] {
		writeError(w, http.StatusUnprocessableEntity, codeBadRequest, "Укажите уровень сербского от A1 до C2.")
		return
	}
	if !req.NativeSpeaker && strings.TrimSpace(req.RussianLevel) == "" {
		writeError(w, http.StatusUnprocessableEntity, codeBadRequest, "Укажите уровень русского языка.")
		return
	}
	if strings.TrimSpace(req.TeachingExperience) == "" {
		writeError(w, http.StatusUnprocessableEntity, codeBadRequest, "Расскажите об опыте преподавания.")
		return
	}
	if req.MonetizationIntent == "" {
		req.MonetizationIntent = "free"
	}
	if req.MonetizationIntent != "free" && req.MonetizationIntent != "paid" && req.MonetizationIntent != "both" {
		writeError(w, http.StatusUnprocessableEntity, codeBadRequest, "Неверный вариант публикации.")
		return
	}
	if len(req.SocialLinks) == 0 || !json.Valid(req.SocialLinks) {
		req.SocialLinks = json.RawMessage("[]")
	}
	a, err := s.store.UpsertTeacherApplication(r.Context(), user.ID, store.TeacherApplicationInput{
		SerbianLevel: req.SerbianLevel, NativeSpeaker: req.NativeSpeaker,
		RussianLevel: trimField(req.RussianLevel, 100), Certificates: trimField(req.Certificates, 4000),
		TeachingExperience: trimField(req.TeachingExperience, 4000), SocialLinks: req.SocialLinks,
		MonetizationIntent: req.MonetizationIntent,
	})
	if err != nil {
		slog.Error("handleSubmitTeacherApplication", "err", err)
		writeError(w, http.StatusInternalServerError, codeInternal, "Не удалось отправить заявку.")
		return
	}
	writeJSON(w, http.StatusOK, a)
}

type lessonRequest struct {
	Title            string          `json:"title"`
	Summary          string          `json:"summary"`
	CoverURL         string          `json:"coverUrl"`
	Level            string          `json:"level"`
	LessonType       string          `json:"lessonType"`
	Topic            string          `json:"topic"`
	Tags             []string        `json:"tags"`
	EstimatedMinutes int             `json:"estimatedMinutes"`
	Script           string          `json:"script"`
	Content          json.RawMessage `json:"content"`
}

func validateLessonRequest(req *lessonRequest) error {
	req.Title = strings.TrimSpace(req.Title)
	req.Summary = strings.TrimSpace(req.Summary)
	req.CoverURL = strings.TrimSpace(req.CoverURL)
	req.Topic = strings.TrimSpace(req.Topic)
	if req.Title == "" || utf8.RuneCountInString(req.Title) > 160 {
		return errors.New("название должно содержать от 1 до 160 символов")
	}
	if utf8.RuneCountInString(req.Summary) > 500 || req.Topic == "" || utf8.RuneCountInString(req.Topic) > 80 {
		return errors.New("проверьте краткое описание и тему")
	}
	if err := checkImageURL(req.CoverURL); err != nil {
		return errors.New("обложка урока должна иметь безопасную HTTPS-ссылку")
	}
	if !validLevels[req.Level] || !validLessonType[req.LessonType] || !validScripts[req.Script] {
		return errors.New("неверно указан уровень, тип урока или письменность")
	}
	if req.EstimatedMinutes < 1 || req.EstimatedMinutes > 240 {
		return errors.New("длительность должна быть от 1 до 240 минут")
	}
	if len(req.Tags) > 12 {
		return errors.New("можно указать не более 12 тегов")
	}
	for i := range req.Tags {
		req.Tags[i] = strings.TrimSpace(req.Tags[i])
		if req.Tags[i] == "" || utf8.RuneCountInString(req.Tags[i]) > 40 {
			return errors.New("проверьте теги урока")
		}
	}
	normalized, err := normalizeLessonContent(req.Content)
	if err != nil {
		return err
	}
	req.Content = normalized
	return nil
}

func normalizeLessonContent(raw json.RawMessage) (json.RawMessage, error) {
	if len(raw) == 0 || len(raw) > maxLessonJSONBytes || !json.Valid(raw) {
		return nil, errors.New("содержимое урока пустое, слишком большое или повреждено")
	}
	var root map[string]any
	if err := json.Unmarshal(raw, &root); err != nil {
		return nil, errors.New("содержимое урока должно быть объектом")
	}
	theory, ok := root["theory"].([]any)
	if !ok {
		return nil, errors.New("добавьте раздел теории")
	}
	chars := 0
	if err := normalizeBlocks(theory, &chars); err != nil {
		return nil, err
	}
	if chars > 6000 {
		return nil, errors.New("теория длиннее 6000 знаков; разделите материал на несколько уроков")
	}
	if exercises, ok := root["exercises"].([]any); ok {
		for _, item := range exercises {
			exercise, ok := item.(map[string]any)
			if !ok || !validExercises[stringValue(exercise["type"])] {
				return nil, errors.New("в уроке есть неизвестный тип упражнения")
			}
			// Картинка упражнения показывается ученику как <img src>. Теория
			// такую ссылку проверяет, а упражнения раньше нет — и адрес по
			// http сажал смешанное содержимое на страницу, а чужой хост
			// получал IP каждого, кто открыл урок.
			if err := checkImageURL(exercise["imageUrl"]); err != nil {
				return nil, err
			}
		}
	}
	if dialogue, ok := root["dialogue"].(map[string]any); ok {
		if err := normalizeDialogue(dialogue); err != nil {
			return nil, err
		}
	}
	out, err := json.Marshal(root)
	if err != nil {
		return nil, err
	}
	return out, nil
}

func normalizeBlocks(blocks []any, chars *int) error {
	allowed := map[string]bool{"paragraph": true, "heading": true, "quote": true, "list": true, "image": true, "video": true, "table": true}
	for _, item := range blocks {
		block, ok := item.(map[string]any)
		if !ok || !allowed[stringValue(block["type"])] {
			return errors.New("в теории есть неизвестный тип блока")
		}
		walkStrings(block, chars)
		if stringValue(block["type"]) == "video" {
			provider, embed, err := normalizeVideoURL(stringValue(block["url"]))
			if err != nil {
				return err
			}
			block["provider"] = provider
			block["embedUrl"] = embed
		}
		if stringValue(block["type"]) == "image" {
			u, err := url.Parse(stringValue(block["url"]))
			if err != nil || u.Scheme != "https" || u.Host == "" {
				return errors.New("изображение должно иметь безопасную HTTPS-ссылку")
			}
		}
	}
	return nil
}

// checkImageURL требует от картинки безопасной HTTPS-ссылки. Пустое значение
// допустимо: картинка у упражнения необязательна.
func checkImageURL(raw any) error {
	value := stringValue(raw)
	if value == "" {
		return nil
	}
	u, err := url.Parse(value)
	if err != nil || u.Scheme != "https" || u.Host == "" {
		return errors.New("картинка задания должна иметь безопасную HTTPS-ссылку")
	}
	return nil
}

// normalizeDialogue проверяет связность ветвящегося диалога.
//
// Раньше проверялось только то, что `nodes` вообще массив, и урок с висячим
// `startId` спокойно уходил на модерацию: плееру было неоткуда начать, и
// ученик видел пустой экран вместо диалога. Заодно обрубаем переходы на
// несуществующие реплики — они появляются, когда автор удаляет реплику,
// на которую кто-то ссылался.
func normalizeDialogue(dialogue map[string]any) error {
	nodes, ok := dialogue["nodes"].([]any)
	if !ok || len(nodes) == 0 {
		return errors.New("у диалога нет реплик")
	}

	ids := make(map[string]bool, len(nodes))
	for _, item := range nodes {
		node, ok := item.(map[string]any)
		if !ok {
			return errors.New("в диалоге есть повреждённая реплика")
		}
		id := stringValue(node["id"])
		if id == "" {
			return errors.New("у каждой реплики диалога должен быть идентификатор")
		}
		if ids[id] {
			return errors.New("идентификаторы реплик диалога повторяются")
		}
		ids[id] = true
	}

	start := stringValue(dialogue["startId"])
	if start == "" || !ids[start] {
		return errors.New("начальная реплика диалога не найдена")
	}

	for _, item := range nodes {
		node, _ := item.(map[string]any)
		choices, ok := node["choices"].([]any)
		if !ok {
			continue
		}
		for _, raw := range choices {
			choice, ok := raw.(map[string]any)
			if !ok {
				return errors.New("в диалоге есть повреждённый вариант ответа")
			}
			// Переход в никуда — это законный конец ветки, а вот ссылка на
			// удалённую реплику завела бы ученика в тупик. Такую обнуляем.
			if next := stringValue(choice["nextId"]); next != "" && !ids[next] {
				choice["nextId"] = ""
			}
		}
	}
	return nil
}

func walkStrings(v any, chars *int) {
	switch value := v.(type) {
	case string:
		*chars += utf8.RuneCountInString(value)
	case []any:
		for _, child := range value {
			walkStrings(child, chars)
		}
	case map[string]any:
		for key, child := range value {
			if key != "url" && key != "embedUrl" {
				walkStrings(child, chars)
			}
		}
	}
}

func stringValue(v any) string {
	s, _ := v.(string)
	return strings.TrimSpace(s)
}

var (
	videoID = regexp.MustCompile(`^[A-Za-z0-9_-]{6,}$`)
	vkVideo = regexp.MustCompile(`^video(-?\d+)_(\d+)`)
)

func normalizeVideoURL(raw string) (string, string, error) {
	u, err := url.Parse(strings.TrimSpace(raw))
	if err != nil || u.Scheme != "https" {
		return "", "", errors.New("видео должно иметь HTTPS-ссылку")
	}
	host := strings.ToLower(strings.TrimPrefix(u.Hostname(), "www."))
	parts := strings.Split(strings.Trim(u.Path, "/"), "/")
	switch host {
	case "youtu.be":
		if len(parts) > 0 && videoID.MatchString(parts[0]) {
			return "youtube", "https://www.youtube-nocookie.com/embed/" + parts[0], nil
		}
	case "youtube.com", "m.youtube.com":
		id := u.Query().Get("v")
		if len(parts) >= 2 && (parts[0] == "shorts" || parts[0] == "embed") {
			id = parts[1]
		}
		if videoID.MatchString(id) {
			return "youtube", "https://www.youtube-nocookie.com/embed/" + id, nil
		}
	case "vimeo.com", "player.vimeo.com":
		id := parts[len(parts)-1]
		if _, err := strconv.ParseUint(id, 10, 64); err == nil {
			return "vimeo", "https://player.vimeo.com/video/" + id, nil
		}
	case "rutube.ru":
		for i, part := range parts {
			if part == "video" && i+1 < len(parts) && videoID.MatchString(parts[i+1]) {
				return "rutube", "https://rutube.ru/play/embed/" + parts[i+1], nil
			}
		}
	case "vk.com", "vkvideo.ru", "m.vk.com":
		candidate := ""
		if len(parts) > 0 {
			candidate = parts[len(parts)-1]
		}
		match := vkVideo.FindStringSubmatch(candidate)
		if len(match) == 3 {
			return "vk", "https://vk.com/video_ext.php?oid=" + url.QueryEscape(match[1]) + "&id=" + url.QueryEscape(match[2]) + "&hd=2", nil
		}
	}
	return "", "", errors.New("поддерживаются ссылки YouTube, VK Video, Rutube и Vimeo")
}

func lessonInput(req lessonRequest) store.LessonInput {
	return store.LessonInput{Title: req.Title, Summary: req.Summary, CoverURL: req.CoverURL, Level: req.Level,
		LessonType: req.LessonType, Topic: req.Topic, Tags: req.Tags,
		EstimatedMinutes: req.EstimatedMinutes, Script: req.Script, Content: req.Content}
}

func (s *Server) handleTeacherLessons(w http.ResponseWriter, r *http.Request) {
	items, err := s.store.ListOwnLessons(r.Context(), userFrom(r.Context()).ID)
	if err != nil {
		slog.Error("handleTeacherLessons", "err", err)
		writeError(w, 500, codeInternal, "Не удалось загрузить уроки.")
		return
	}
	writeJSON(w, 200, map[string]any{"items": items})
}

func (s *Server) handleTeacherProfile(w http.ResponseWriter, r *http.Request) {
	p, err := s.store.TeacherProfile(r.Context(), userFrom(r.Context()).ID)
	if errors.Is(err, store.ErrTeacherRequired) {
		writeJSON(w, 200, map[string]any{})
		return
	}
	if err != nil {
		slog.Error("handleTeacherProfile", "err", err)
		writeError(w, 500, codeInternal, "Не удалось загрузить профиль.")
		return
	}
	writeJSON(w, 200, p)
}

func (s *Server) handlePublicTeacherProfile(w http.ResponseWriter, r *http.Request) {
	id, err := uuid.Parse(r.PathValue("id"))
	if err != nil {
		writeError(w, 400, codeBadRequest, "Неверный адрес преподавателя.")
		return
	}
	approved, err := s.store.IsApprovedTeacher(r.Context(), id)
	if err != nil {
		slog.Error("handlePublicTeacherProfile", "err", err)
		writeError(w, 500, codeInternal, "Не удалось загрузить профиль.")
		return
	}
	if !approved {
		writeError(w, 404, codeNotFound, "Профиль не найден.")
		return
	}
	p, err := s.store.TeacherProfile(r.Context(), id)
	if errors.Is(err, store.ErrTeacherRequired) {
		writeError(w, 404, codeNotFound, "Профиль не найден.")
		return
	}
	if err != nil {
		slog.Error("handlePublicTeacherProfile", "err", err)
		writeError(w, 500, codeInternal, "Не удалось загрузить профиль.")
		return
	}
	writeJSON(w, 200, p)
}

func (s *Server) handleUpdateTeacherProfile(w http.ResponseWriter, r *http.Request) {
	var p store.TeacherProfile
	if decodeJSON(w, r, &p, 64<<10) != nil {
		writeError(w, 400, codeBadRequest, "Не удалось прочитать профиль.")
		return
	}
	p.UserID = userFrom(r.Context()).ID
	p.PublicName = trimField(p.PublicName, 120)
	p.Bio = trimField(p.Bio, 3000)
	p.Organization = trimField(p.Organization, 200)
	p.Website = strings.TrimSpace(p.Website)
	p.AvatarURL = strings.TrimSpace(p.AvatarURL)
	if p.PublicName == "" {
		writeError(w, 422, codeBadRequest, "Укажите публичное имя.")
		return
	}
	for _, raw := range []string{p.Website, p.AvatarURL} {
		if raw == "" {
			continue
		}
		u, err := url.Parse(raw)
		if err != nil || u.Scheme != "https" || u.Host == "" {
			writeError(w, 422, codeBadRequest, "Ссылки профиля должны использовать HTTPS.")
			return
		}
	}
	if len(p.Languages) > 12 || len(p.Formats) > 12 {
		writeError(w, 422, codeBadRequest, "Слишком много языков или форматов.")
		return
	}
	if err := s.store.UpsertTeacherProfile(r.Context(), p); err != nil {
		slog.Error("handleUpdateTeacherProfile", "err", err)
		writeError(w, 500, codeInternal, "Не удалось сохранить профиль.")
		return
	}
	writeJSON(w, 200, p)
}

type mediaPolicyRequest struct {
	SHA256   string `json:"sha256"`
	MimeType string `json:"mimeType"`
	Size     int64  `json:"size"`
}

func (s *Server) handleTeacherMediaPolicy(w http.ResponseWriter, r *http.Request) {
	if s.media == nil {
		writeError(w, http.StatusServiceUnavailable, codeUpstream, "Загрузка изображений пока не настроена.")
		return
	}
	var req mediaPolicyRequest
	if err := decodeJSON(w, r, &req, 4<<10); err != nil {
		writeError(w, http.StatusBadRequest, codeBadRequest, "Не удалось прочитать параметры файла.")
		return
	}
	policy, err := s.media.CreateUploadPolicy(
		r.Context(), userFrom(r.Context()).ID,
		strings.ToLower(strings.TrimSpace(req.SHA256)), req.MimeType, req.Size)
	if err != nil {
		writeError(w, http.StatusUnprocessableEntity, codeBadRequest, err.Error())
		return
	}
	writeJSON(w, http.StatusOK, policy)
}

func (s *Server) handleCreateTeacherLesson(w http.ResponseWriter, r *http.Request) {
	var req lessonRequest
	if err := decodeJSON(w, r, &req, maxLessonJSONBytes+64<<10); err != nil {
		writeError(w, 400, codeBadRequest, "Не удалось прочитать урок.")
		return
	}
	if err := validateLessonRequest(&req); err != nil {
		writeError(w, 422, codeBadRequest, err.Error())
		return
	}
	l, err := s.store.CreateLesson(r.Context(), userFrom(r.Context()).ID, store.SlugifyLessonTitle(req.Title), lessonInput(req))
	if err != nil {
		slog.Warn("создание урока", "err", err)
		slog.Error("handleCreateTeacherLesson", "err", err)
		writeError(w, 500, codeInternal, "Не удалось создать урок.")
		return
	}
	writeJSON(w, 201, l)
}

func (s *Server) handleUpdateTeacherLesson(w http.ResponseWriter, r *http.Request) {
	id, err := uuid.Parse(r.PathValue("id"))
	if err != nil {
		writeError(w, 400, codeBadRequest, "Неверный адрес урока.")
		return
	}
	var req lessonRequest
	if err := decodeJSON(w, r, &req, maxLessonJSONBytes+64<<10); err != nil {
		writeError(w, 400, codeBadRequest, "Не удалось прочитать урок.")
		return
	}
	if err := validateLessonRequest(&req); err != nil {
		writeError(w, 422, codeBadRequest, err.Error())
		return
	}
	l, err := s.store.SaveLesson(r.Context(), userFrom(r.Context()).ID, id, lessonInput(req))
	if errors.Is(err, store.ErrLessonNotFound) {
		writeError(w, 404, codeNotFound, "Урок не найден.")
		return
	}
	if err != nil {
		slog.Error("handleUpdateTeacherLesson", "err", err)
		writeError(w, 500, codeInternal, "Не удалось сохранить урок.")
		return
	}
	writeJSON(w, 200, l)
}

func (s *Server) handleDeleteTeacherLesson(w http.ResponseWriter, r *http.Request) {
	id, err := uuid.Parse(r.PathValue("id"))
	if err != nil {
		writeError(w, http.StatusBadRequest, codeBadRequest, "Неверный адрес урока.")
		return
	}
	err = s.store.ArchiveLesson(r.Context(), userFrom(r.Context()).ID, id)
	if errors.Is(err, store.ErrLessonNotFound) {
		writeError(w, http.StatusNotFound, codeNotFound, "Урок не найден.")
		return
	}
	if err != nil {
		slog.Error("handleDeleteTeacherLesson", "err", err)
		writeError(w, http.StatusInternalServerError, codeInternal, "Не удалось удалить урок.")
		return
	}
	w.WriteHeader(http.StatusNoContent)
}

type revisionRequest struct {
	RevisionID uuid.UUID `json:"revisionId"`
}

func (s *Server) handlePublishUnlistedLesson(w http.ResponseWriter, r *http.Request) {
	s.handleLessonPublication(w, r, false)
}
func (s *Server) handleSubmitPublicLesson(w http.ResponseWriter, r *http.Request) {
	s.handleLessonPublication(w, r, true)
}
func (s *Server) handleLessonPublication(w http.ResponseWriter, r *http.Request, public bool) {
	lessonID, err := uuid.Parse(r.PathValue("id"))
	if err != nil {
		writeError(w, 400, codeBadRequest, "Неверный адрес урока.")
		return
	}
	var req revisionRequest
	if decodeJSON(w, r, &req, 8<<10) != nil || req.RevisionID == uuid.Nil {
		writeError(w, 400, codeBadRequest, "Не указана версия урока.")
		return
	}
	if public {
		err = s.store.SubmitPublicLesson(r.Context(), userFrom(r.Context()).ID, lessonID, req.RevisionID)
	} else {
		err = s.store.PublishUnlisted(r.Context(), userFrom(r.Context()).ID, lessonID, req.RevisionID)
	}
	if errors.Is(err, store.ErrRevisionNotFound) {
		writeError(w, 404, codeNotFound, "Версия урока не найдена.")
		return
	}
	if err != nil {
		slog.Error("handleLessonPublication", "err", err)
		writeError(w, 500, codeInternal, "Не удалось опубликовать урок.")
		return
	}
	writeJSON(w, 200, map[string]any{"status": map[bool]string{true: "pending", false: "published"}[public]})
}

func (s *Server) handlePublicLessons(w http.ResponseWriter, r *http.Request) {
	limit, _ := strconv.Atoi(r.URL.Query().Get("limit"))
	if limit < 1 || limit > 100 {
		limit = 30
	}
	offset, _ := strconv.Atoi(r.URL.Query().Get("offset"))
	if offset < 0 {
		offset = 0
	}
	q := r.URL.Query()
	items, err := s.store.ListPublicLessons(r.Context(), store.LessonFilter{Level: q.Get("level"), LessonType: q.Get("type"), Topic: q.Get("topic"), Author: q.Get("author"), Script: q.Get("script"), Limit: limit, Offset: offset})
	if err != nil {
		slog.Error("handlePublicLessons", "err", err)
		writeError(w, 500, codeInternal, "Не удалось загрузить каталог.")
		return
	}
	writeJSON(w, 200, map[string]any{"items": items})
}

func (s *Server) handlePublicLesson(w http.ResponseWriter, r *http.Request) {
	l, err := s.store.PublicLesson(r.Context(), r.PathValue("slug"))
	if errors.Is(err, store.ErrLessonNotFound) {
		writeError(w, 404, codeNotFound, "Урок не найден.")
		return
	}
	if err != nil {
		slog.Error("handlePublicLesson", "err", err)
		writeError(w, 500, codeInternal, "Не удалось загрузить урок.")
		return
	}
	writeJSON(w, 200, l)
}
func (s *Server) handleUnlistedLesson(w http.ResponseWriter, r *http.Request) {
	l, err := s.store.UnlistedLesson(r.Context(), r.PathValue("token"))
	if errors.Is(err, store.ErrLessonNotFound) {
		writeError(w, 404, codeNotFound, "Урок не найден.")
		return
	}
	if err != nil {
		slog.Error("handleUnlistedLesson", "err", err)
		writeError(w, 500, codeInternal, "Не удалось загрузить урок.")
		return
	}
	writeJSON(w, 200, l)
}

type reviewRequest struct {
	Status  string `json:"status"`
	Comment string `json:"comment"`
}

func (s *Server) handleAdminTeacherApplications(w http.ResponseWriter, r *http.Request) {
	items, err := s.store.ListTeacherApplications(r.Context(), r.URL.Query().Get("status"))
	if err != nil {
		slog.Error("handleAdminTeacherApplications", "err", err)
		writeError(w, 500, codeInternal, "Не удалось загрузить заявки.")
		return
	}
	writeJSON(w, 200, map[string]any{"items": items})
}
func (s *Server) handleAdminReviewTeacherApplication(w http.ResponseWriter, r *http.Request) {
	id, err := uuid.Parse(r.PathValue("userId"))
	if err != nil {
		writeError(w, 400, codeBadRequest, "Неверный адрес пользователя.")
		return
	}
	var req reviewRequest
	if decodeJSON(w, r, &req, 16<<10) != nil {
		writeError(w, 400, codeBadRequest, "Не удалось прочитать решение.")
		return
	}
	if req.Status != "approved" && req.Status != "rejected" && req.Status != "suspended" {
		writeError(w, 422, codeBadRequest, "Неверный статус.")
		return
	}
	err = s.store.ReviewTeacherApplication(r.Context(), id, userFrom(r.Context()).ID, req.Status, trimField(req.Comment, 2000))
	if errors.Is(err, store.ErrApplicationAbsent) {
		writeError(w, 404, codeNotFound, "Заявка не найдена.")
		return
	}
	if err != nil {
		slog.Error("handleAdminReviewTeacherApplication", "err", err)
		writeError(w, 500, codeInternal, "Не удалось сохранить решение.")
		return
	}
	writeJSON(w, 200, map[string]any{"status": req.Status})
	s.sendUserNotification(id, "Решение по заявке преподавателя",
		"Статус заявки: "+req.Status+". "+strings.TrimSpace(req.Comment),
		"Открыть кабинет", "/teachers")
}
func (s *Server) handleAdminLessonQueue(w http.ResponseWriter, r *http.Request) {
	items, err := s.store.PendingLessonRevisions(r.Context())
	if err != nil {
		slog.Error("handleAdminLessonQueue", "err", err)
		writeError(w, 500, codeInternal, "Не удалось загрузить очередь.")
		return
	}
	writeJSON(w, 200, map[string]any{"items": items})
}
func (s *Server) handleAdminReviewLesson(w http.ResponseWriter, r *http.Request) {
	id, err := uuid.Parse(r.PathValue("revisionId"))
	if err != nil {
		writeError(w, 400, codeBadRequest, "Неверный адрес версии.")
		return
	}
	var req reviewRequest
	if decodeJSON(w, r, &req, 16<<10) != nil {
		writeError(w, 400, codeBadRequest, "Не удалось прочитать решение.")
		return
	}
	approve := req.Status == "approved"
	if !approve && req.Status != "rejected" {
		writeError(w, 422, codeBadRequest, "Неверный статус.")
		return
	}
	ownerID, _ := s.store.LessonRevisionOwner(r.Context(), id)
	err = s.store.ReviewLessonRevision(r.Context(), id, userFrom(r.Context()).ID, approve, trimField(req.Comment, 2000))
	if errors.Is(err, store.ErrRevisionNotFound) {
		writeError(w, 404, codeNotFound, "Версия не найдена.")
		return
	}
	if err != nil {
		// Без причины в журнале такой 500 неотличим от любого другого, и
		// разбираться приходится вслепую — так и вышло с этой публикацией.
		slog.Error("модерация урока", "revision", id, "status", req.Status, "err", err)
		writeError(w, 500, codeInternal, "Не удалось сохранить решение.")
		return
	}
	writeJSON(w, 200, map[string]any{"status": req.Status})
	if ownerID != uuid.Nil {
		s.sendUserNotification(ownerID, "Модерация урока завершена",
			"Статус версии: "+req.Status+". "+strings.TrimSpace(req.Comment),
			"Открыть уроки", "/teachers")
	}
}

func (s *Server) handleLessonProgress(w http.ResponseWriter, r *http.Request) {
	id, err := uuid.Parse(r.PathValue("id"))
	if err != nil {
		writeError(w, 400, codeBadRequest, "Неверный адрес урока.")
		return
	}
	payload, err := s.store.LessonProgress(r.Context(), userFrom(r.Context()).ID, id)
	if err != nil {
		slog.Error("handleLessonProgress", "err", err)
		writeError(w, 500, codeInternal, "Не удалось загрузить прогресс.")
		return
	}
	w.Header().Set("Content-Type", "application/json; charset=utf-8")
	w.WriteHeader(200)
	_, _ = w.Write(payload)
}
func (s *Server) handlePutLessonProgress(w http.ResponseWriter, r *http.Request) {
	id, err := uuid.Parse(r.PathValue("id"))
	if err != nil {
		writeError(w, 400, codeBadRequest, "Неверный адрес урока.")
		return
	}
	var payload json.RawMessage
	if decodeJSON(w, r, &payload, 64<<10) != nil {
		writeError(w, 400, codeBadRequest, "Не удалось прочитать прогресс.")
		return
	}
	if err = s.store.PutLessonProgress(r.Context(), userFrom(r.Context()).ID, id, payload); err != nil {
		slog.Error("handlePutLessonProgress", "err", err)
		writeError(w, 500, codeInternal, "Не удалось сохранить прогресс.")
		return
	}
	writeJSON(w, 200, map[string]any{"saved": true})
}

type submissionRequest struct {
	RevisionID uuid.UUID `json:"revisionId"`
	ExerciseID string    `json:"exerciseId"`
	Answer     string    `json:"answer"`
}

func (s *Server) handleCreateLessonSubmission(w http.ResponseWriter, r *http.Request) {
	lessonID, err := uuid.Parse(r.PathValue("id"))
	if err != nil {
		writeError(w, 400, codeBadRequest, "Неверный адрес урока.")
		return
	}
	var req submissionRequest
	if decodeJSON(w, r, &req, 64<<10) != nil {
		writeError(w, 400, codeBadRequest, "Не удалось прочитать работу.")
		return
	}
	req.ExerciseID = strings.TrimSpace(req.ExerciseID)
	req.Answer = strings.TrimSpace(req.Answer)
	if req.RevisionID == uuid.Nil || req.ExerciseID == "" || req.Answer == "" || utf8.RuneCountInString(req.Answer) > 12000 {
		writeError(w, 422, codeBadRequest, "Проверьте письменную работу.")
		return
	}
	item, err := s.store.CreateLessonSubmission(r.Context(), userFrom(r.Context()).ID, lessonID, req.RevisionID, req.ExerciseID, req.Answer)
	if errors.Is(err, store.ErrLessonNotFound) {
		writeError(w, 404, codeNotFound, "Опубликованная версия урока не найдена.")
		return
	}
	if err != nil {
		slog.Error("handleCreateLessonSubmission", "err", err)
		writeError(w, 500, codeInternal, "Не удалось отправить работу.")
		return
	}
	writeJSON(w, 201, item)
}

func (s *Server) handleTeacherSubmissions(w http.ResponseWriter, r *http.Request) {
	items, err := s.store.ListTeacherSubmissions(r.Context(), userFrom(r.Context()).ID, r.URL.Query().Get("status"))
	if err != nil {
		slog.Error("handleTeacherSubmissions", "err", err)
		writeError(w, 500, codeInternal, "Не удалось загрузить работы.")
		return
	}
	writeJSON(w, 200, map[string]any{"items": items})
}

type submissionReviewRequest struct {
	Status   string `json:"status"`
	Feedback string `json:"feedback"`
	Score    *int   `json:"score"`
}

func (s *Server) handleReviewSubmission(w http.ResponseWriter, r *http.Request) {
	id, err := uuid.Parse(r.PathValue("id"))
	if err != nil {
		writeError(w, 400, codeBadRequest, "Неверный адрес работы.")
		return
	}
	var req submissionReviewRequest
	if decodeJSON(w, r, &req, 32<<10) != nil {
		writeError(w, 400, codeBadRequest, "Не удалось прочитать отзыв.")
		return
	}
	if req.Status != "reviewing" && req.Status != "reviewed" {
		writeError(w, 422, codeBadRequest, "Неверный статус работы.")
		return
	}
	if req.Score != nil && (*req.Score < 0 || *req.Score > 100) {
		writeError(w, 422, codeBadRequest, "Оценка должна быть от 0 до 100.")
		return
	}
	studentID, _ := s.store.SubmissionStudent(r.Context(), id)
	err = s.store.ReviewLessonSubmission(r.Context(), userFrom(r.Context()).ID, id, req.Status, trimField(req.Feedback, 6000), req.Score)
	if errors.Is(err, store.ErrLessonNotFound) {
		writeError(w, 404, codeNotFound, "Работа не найдена.")
		return
	}
	if err != nil {
		slog.Error("handleReviewSubmission", "err", err)
		writeError(w, 500, codeInternal, "Не удалось сохранить отзыв.")
		return
	}
	writeJSON(w, 200, map[string]any{"status": req.Status})
	if req.Status == "reviewed" && studentID != uuid.Nil {
		s.sendUserNotification(studentID, "Письменная работа проверена",
			strings.TrimSpace(req.Feedback), "Открыть Читавук", "/account")
	}
}

func (s *Server) sendUserNotification(userID uuid.UUID, subject, body, actionLabel, actionPath string) {
	if !s.mailer.Enabled() {
		return
	}
	go func() {
		ctx, cancel := context.WithTimeout(context.Background(), 12*time.Second)
		defer cancel()
		user, err := s.store.UserByID(ctx, userID)
		if err != nil {
			return
		}
		if err := s.mailer.SendNotification(ctx, user.Email, user.DisplayName, subject, body, actionLabel, actionPath); err != nil {
			slog.Warn("не удалось отправить уведомление", "err", err)
		}
	}()
}

type reportRequest struct {
	Reason  string `json:"reason"`
	Details string `json:"details"`
}

func (s *Server) handleReportLesson(w http.ResponseWriter, r *http.Request) {
	id, err := uuid.Parse(r.PathValue("id"))
	if err != nil {
		writeError(w, 400, codeBadRequest, "Неверный адрес урока.")
		return
	}
	var req reportRequest
	if decodeJSON(w, r, &req, 16<<10) != nil {
		writeError(w, 400, codeBadRequest, "Не удалось прочитать жалобу.")
		return
	}
	req.Reason = trimField(req.Reason, 100)
	req.Details = trimField(req.Details, 2000)
	if req.Reason == "" {
		writeError(w, 422, codeBadRequest, "Укажите причину жалобы.")
		return
	}
	err = s.store.CreateLessonReport(r.Context(), userFrom(r.Context()).ID, id, req.Reason, req.Details)
	if errors.Is(err, store.ErrLessonNotFound) {
		writeError(w, 404, codeNotFound, "Урок не найден.")
		return
	}
	if err != nil {
		slog.Error("handleReportLesson", "err", err)
		writeError(w, 500, codeInternal, "Не удалось отправить жалобу.")
		return
	}
	writeJSON(w, 201, map[string]any{"sent": true})
}

func (s *Server) handleAdminLessonReports(w http.ResponseWriter, r *http.Request) {
	items, err := s.store.ListLessonReports(r.Context(), r.URL.Query().Get("status"))
	if err != nil {
		slog.Error("handleAdminLessonReports", "err", err)
		writeError(w, 500, codeInternal, "Не удалось загрузить жалобы.")
		return
	}
	writeJSON(w, 200, map[string]any{"items": items})
}
func (s *Server) handleAdminReviewLessonReport(w http.ResponseWriter, r *http.Request) {
	id, err := uuid.Parse(r.PathValue("id"))
	if err != nil {
		writeError(w, 400, codeBadRequest, "Неверный адрес жалобы.")
		return
	}
	var req reviewRequest
	if decodeJSON(w, r, &req, 8<<10) != nil {
		writeError(w, 400, codeBadRequest, "Не удалось прочитать решение.")
		return
	}
	if req.Status != "resolved" && req.Status != "dismissed" {
		writeError(w, 422, codeBadRequest, "Неверный статус.")
		return
	}
	err = s.store.ReviewLessonReport(r.Context(), userFrom(r.Context()).ID, id, req.Status)
	if errors.Is(err, store.ErrLessonNotFound) {
		writeError(w, 404, codeNotFound, "Жалоба не найдена.")
		return
	}
	if err != nil {
		slog.Error("handleAdminReviewLessonReport", "err", err)
		writeError(w, 500, codeInternal, "Не удалось сохранить решение.")
		return
	}
	writeJSON(w, 200, map[string]any{"status": req.Status})
}
