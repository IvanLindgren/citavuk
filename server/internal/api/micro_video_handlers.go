package api

import (
	"errors"
	"github.com/citavuk/server/internal/store"
	"github.com/citavuk/server/internal/video"
	"github.com/google/uuid"
	"net/http"
	"strings"
)

func (s *Server) handleVideoDraft(w http.ResponseWriter, r *http.Request) {
	var in struct {
		URL      string   `json:"url"`
		Category string   `json:"category"`
		CEFR     string   `json:"cefr"`
		Tags     []string `json:"tags"`
	}
	if decodeJSON(w, r, &in, 8192) != nil {
		writeError(w, 400, codeBadRequest, "Проверь ссылку и описание ролика.")
		return
	}
	id, err := video.ID(in.URL)
	if err != nil {
		writeError(w, 400, codeBadRequest, err.Error())
		return
	}
	valid := false
	for _, c := range store.MicroFeedCategories {
		if in.Category == c {
			valid = true
		}
	}
	if !valid || in.CEFR == "" || store.ClampToFeedLevel(in.CEFR) != in.CEFR || len(in.Tags) > 12 {
		writeError(w, 400, codeBadRequest, "Проверь тему, уровень и теги.")
		return
	}
	for _, t := range in.Tags {
		if len(t) > 60 || strings.TrimSpace(t) == "" {
			writeError(w, 400, codeBadRequest, "Некорректный тег.")
			return
		}
	}
	if in.Tags == nil {
		in.Tags = []string{}
	}
	meta, err := video.Lookup(r.Context(), id)
	if err != nil {
		writeError(w, 422, codeBadRequest, "YouTube не подтвердил ролик. Проверь ссылку и доступность видео.")
		return
	}
	item, err := s.store.CreateMicroVideo(r.Context(), id, meta.Title, meta.Author, in.Category, in.CEFR, in.Tags)
	if err != nil {
		personalError(w, err)
		return
	}
	writeJSON(w, 201, item)
}
func (s *Server) handleVideoPublish(w http.ResponseWriter, r *http.Request) {
	id, err := uuid.Parse(r.PathValue("id"))
	if err != nil {
		writeError(w, 400, codeBadRequest, "Некорректный ролик.")
		return
	}
	var in struct {
		SerbianSpeech    bool `json:"serbianSpeech"`
		EmbeddingChecked bool `json:"embeddingChecked"`
		Duration         int  `json:"duration"`
	}
	if decodeJSON(w, r, &in, 2048) != nil || !in.SerbianSpeech || !in.EmbeddingChecked || in.Duration < 1 || in.Duration > 180 {
		writeError(w, 400, codeBadRequest, "Подтверди сербскую речь, воспроизведение и длительность до 180 секунд.")
		return
	}
	if err = s.store.PublishMicroVideo(r.Context(), id, in.Duration); err != nil {
		if errors.Is(err, store.ErrMicroFeedNotFound) {
			writeError(w, 404, codeBadRequest, "Ролик не найден.")
			return
		}
		personalError(w, err)
		return
	}
	writeJSON(w, 200, map[string]bool{"published": true})
}
func (s *Server) handleVideoList(w http.ResponseWriter, r *http.Request) {
	items, err := s.store.ListMicroVideos(r.Context())
	if err != nil {
		personalError(w, err)
		return
	}
	writeJSON(w, 200, map[string]any{"items": items})
}
