package api

import (
	"errors"
	"io"
	"log/slog"
	"net/http"
	"strings"

	"github.com/citavuk/server/internal/news"
)

// Газета «Вести» и подборка роликов для чек-листа дня.
//
// Все ручки публичные: новости и ролики одинаковы для всех, а заходить ради
// них в аккаунт незачем.

func (s *Server) handleNewsIssue(w http.ResponseWriter, r *http.Request) {
	issue, err := s.news.Issue(r.Context(), r.URL.Query().Get("fresh") == "1")
	if err != nil {
		slog.Warn("газета не вышла", "err", err)
		writeError(w, http.StatusBadGateway, codeUpstream, "Газета сейчас не печатается. Попробуй чуть позже.")
		return
	}
	w.Header().Set("Cache-Control", "no-store")
	writeJSON(w, http.StatusOK, issue)
}

func (s *Server) handleNewsArticle(w http.ResponseWriter, r *http.Request) {
	link := r.URL.Query().Get("url")
	article, err := s.news.Article(r.Context(), link)
	if errors.Is(err, news.ErrForeignArticle) {
		writeError(w, http.StatusBadRequest, codeBadRequest, "Эту заметку газета не открывает.")
		return
	}
	if err != nil {
		slog.Warn("заметка не открылась", "err", err, "url", link)
		writeError(w, http.StatusBadGateway, codeUpstream, "Заметка не открылась. Её можно прочитать на сайте издания.")
		return
	}
	writeJSON(w, http.StatusOK, article)
}

func (s *Server) handleVideoPicks(w http.ResponseWriter, r *http.Request) {
	var codes []string
	for _, code := range strings.Split(r.URL.Query().Get("interests"), ",") {
		if code = strings.TrimSpace(code); code != "" && len(codes) < 20 {
			codes = append(codes, code)
		}
	}
	type interest struct {
		Code     string   `json:"code"`
		Title    string   `json:"title"`
		Channels []string `json:"channels"`
	}
	interests := make([]interest, 0, len(news.Interests))
	for _, item := range news.Interests {
		names := make([]string, 0, len(item.Channels))
		for _, channel := range item.Channels {
			names = append(names, channel.Name)
		}
		interests = append(interests, interest{item.Code, item.Title, names})
	}
	writeJSON(w, http.StatusOK, map[string]any{
		"interests": interests,
		"videos":    s.news.Videos(r.Context(), codes),
	})
}

func (s *Server) handleNewsImage(w http.ResponseWriter, r *http.Request) {
	source, ok := s.news.ImageURL(r.PathValue("id"))
	if !ok {
		http.NotFound(w, r)
		return
	}
	s.proxyNewsImage(w, r, source, "public, max-age=86400")
}

func (s *Server) handleVideoThumb(w http.ResponseWriter, r *http.Request) {
	id := r.PathValue("id")
	if !news.ValidVideoID(id) {
		http.NotFound(w, r)
		return
	}
	s.proxyNewsImage(w, r, "https://i.ytimg.com/vi/"+id+"/hqdefault.jpg", "public, max-age=604800, immutable")
}

// proxyNewsImage отдаёт картинку через наш сервер: читатель не раскрывает
// изданию и YouTube, что открыл газету.
func (s *Server) proxyNewsImage(w http.ResponseWriter, r *http.Request, source, cache string) {
	if !news.AllowedImage(source) {
		http.NotFound(w, r)
		return
	}
	request, err := http.NewRequestWithContext(r.Context(), http.MethodGet, source, nil)
	if err != nil {
		http.NotFound(w, r)
		return
	}
	request.Header.Set("Accept", "image/avif,image/webp,image/jpeg,image/png,*/*;q=0.5")
	request.Header.Set("User-Agent", "CitavukNews/1.0 (+https://citavuk.ru/about)")
	response, err := s.news.Client().Do(request)
	if err != nil {
		http.NotFound(w, r)
		return
	}
	defer response.Body.Close()
	contentType := response.Header.Get("Content-Type")
	if response.StatusCode != http.StatusOK || !strings.HasPrefix(strings.ToLower(contentType), "image/") ||
		strings.Contains(strings.ToLower(contentType), "svg") || !news.AllowedImage(response.Request.URL.String()) {
		http.NotFound(w, r)
		return
	}
	w.Header().Set("Content-Type", contentType)
	w.Header().Set("Cache-Control", cache)
	w.Header().Set("X-Content-Type-Options", "nosniff")
	if _, err := io.Copy(w, io.LimitReader(response.Body, maxFeedImageBytes)); err != nil {
		slog.Debug("картинка газеты: обрыв передачи", "err", err)
	}
}
