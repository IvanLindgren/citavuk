package api

import (
	"bytes"
	"context"
	"encoding/json"
	"errors"
	"io"
	"log/slog"
	"mime/multipart"
	"net/http"
	"strings"
	"time"

	"github.com/citavuk/server/internal/pdfimages"
)

// maxPDFImageSource — тот же предел, что у импорта на сайте.
const maxPDFImageSource = 32 << 20

type pdfImageResponse struct {
	Page       int     `json:"page"`
	CenterY    float64 `json:"centerY"`
	PageHeight float64 `json:"pageHeight"`
	URL        string  `json:"url"`
}

// handlePDFImages достаёт картинки из PDF для приложения: у того нет
// отрисовщика PDF, а текст оно извлекает само. Ответ — адреса уже сохранённых
// картинок и место каждой (страница и высота от верха), по которому
// приложение вставит их между своими строками.
func (s *Server) handlePDFImages(w http.ResponseWriter, r *http.Request) {
	if s.media == nil {
		writeError(w, http.StatusServiceUnavailable, codeUpstream, "Хранилище картинок пока не настроено.")
		return
	}
	body, err := pdfBody(w, r)
	if err != nil {
		writeError(w, http.StatusRequestEntityTooLarge, codeBadRequest, "PDF больше 32 МБ.")
		return
	}
	if !bytes.HasPrefix(body, []byte("%PDF-")) {
		writeError(w, http.StatusBadRequest, codeBadRequest, "Это не PDF.")
		return
	}

	ctx, cancel := context.WithTimeout(r.Context(), 90*time.Second)
	defer cancel()
	images, pages, err := pdfimages.Extract(ctx, bytes.NewReader(body), pdfimages.DefaultLimits)
	if err != nil {
		if errors.Is(err, context.DeadlineExceeded) {
			writeError(w, http.StatusGatewayTimeout, codeUpstream, "PDF слишком сложный, картинки не успели достаться.")
			return
		}
		// Картинки — добавка к тексту: приложение откроет книгу и без них.
		slog.Info("картинки из PDF не достались", "err", err)
		writeJSON(w, http.StatusOK, map[string]any{"images": []pdfImageResponse{}, "pages": 0})
		return
	}

	owner := userFrom(r.Context()).ID
	out := make([]pdfImageResponse, 0, len(images))
	for _, img := range images {
		url, err := s.media.StoreBookImage(ctx, owner, img.MimeType, img.Data)
		if err != nil {
			slog.Warn("картинка из PDF не сохранилась", "err", err)
			continue
		}
		out = append(out, pdfImageResponse{Page: img.Page, CenterY: img.CenterY, PageHeight: img.PageHeight, URL: url})
	}
	// Число страниц нужно приложению, когда текст разобран сервером и высот
	// строк у него нет: тогда картинка встаёт по доле книги.
	writeJSON(w, http.StatusOK, map[string]any{"images": out, "pages": pages})
}

// pdfBody принимает файл и полем формы (так шлёт приложение), и голым телом.
func pdfBody(w http.ResponseWriter, r *http.Request) ([]byte, error) {
	r.Body = http.MaxBytesReader(w, r.Body, maxPDFImageSource+1<<20)
	if strings.HasPrefix(r.Header.Get("Content-Type"), "multipart/form-data") {
		file, _, err := r.FormFile("file")
		if err != nil {
			return nil, err
		}
		defer file.Close()
		return io.ReadAll(io.LimitReader(file, maxPDFImageSource+1))
	}
	return io.ReadAll(r.Body)
}

// handlePDFImport — разбор PDF для телефона одним запросом: текст делает
// Python-бэкенд, как и раньше через /documents/extract, а картинки — Go.
//
// Отдельно от /documents/extract потому, что иначе телефон заливал бы один и
// тот же файл дважды, а это до 32 МБ по мобильной сети. Здесь файл приходит
// один раз, а до бэкенда сервер доносит его сам.
func (s *Server) handlePDFImport(w http.ResponseWriter, r *http.Request) {
	if s.cfg.UpstreamURL == "" {
		writeError(w, http.StatusServiceUnavailable, codeUpstream, "Разбор документов пока не настроен.")
		return
	}
	body, err := pdfBody(w, r)
	if err != nil {
		writeError(w, http.StatusRequestEntityTooLarge, codeBadRequest, "PDF больше 32 МБ.")
		return
	}
	if !bytes.HasPrefix(body, []byte("%PDF-")) {
		writeError(w, http.StatusBadRequest, codeBadRequest, "Это не PDF.")
		return
	}

	ctx, cancel := context.WithTimeout(r.Context(), 6*time.Minute)
	defer cancel()

	type pictures struct {
		list  []pdfImageResponse
		pages int
	}
	found := make(chan pictures, 1)
	go func() {
		if s.media == nil {
			found <- pictures{}
			return
		}
		imgCtx, stop := context.WithTimeout(ctx, 90*time.Second)
		defer stop()
		images, pages, err := pdfimages.Extract(imgCtx, bytes.NewReader(body), pdfimages.DefaultLimits)
		if err != nil {
			slog.Info("картинки из PDF не достались", "err", err)
			found <- pictures{}
			return
		}
		owner := userFrom(r.Context()).ID
		out := make([]pdfImageResponse, 0, len(images))
		for _, img := range images {
			url, err := s.media.StoreBookImage(imgCtx, owner, img.MimeType, img.Data)
			if err != nil {
				slog.Warn("картинка из PDF не сохранилась", "err", err)
				continue
			}
			out = append(out, pdfImageResponse{Page: img.Page, CenterY: img.CenterY, PageHeight: img.PageHeight, URL: url})
		}
		found <- pictures{out, pages}
	}()

	status, payload, err := s.extractTextUpstream(ctx, r, body)
	if err != nil {
		slog.Warn("разбор PDF на бэкенде", "err", err)
		writeError(w, http.StatusBadGateway, codeUpstream, "Не удалось разобрать PDF. Попробуй ещё раз.")
		return
	}
	if status < 200 || status > 299 {
		// Ответ бэкенда как есть: по его коду приложение решает, повторять
		// ли разбор у себя (400/413/422 — нет, остальное — да).
		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(status)
		_, _ = w.Write(payload)
		return
	}
	var text map[string]any
	if err := json.Unmarshal(payload, &text); err != nil {
		writeError(w, http.StatusBadGateway, codeUpstream, "Не удалось разобрать PDF. Попробуй ещё раз.")
		return
	}
	pics := <-found
	text["images"] = pics.list
	text["imagePages"] = pics.pages
	writeJSON(w, http.StatusOK, text)
}

// extractTextUpstream отправляет PDF на /documents/extract бэкенда тем же
// путём, что и обратный прокси: с секретом и адресом клиента — по нему
// бэкенд держит свои пределы.
func (s *Server) extractTextUpstream(ctx context.Context, r *http.Request, data []byte) (int, []byte, error) {
	var form bytes.Buffer
	mw := multipart.NewWriter(&form)
	part, err := mw.CreateFormFile("file", "book.pdf")
	if err != nil {
		return 0, nil, err
	}
	if _, err := part.Write(data); err != nil {
		return 0, nil, err
	}
	if err := mw.Close(); err != nil {
		return 0, nil, err
	}
	req, err := http.NewRequestWithContext(ctx, http.MethodPost,
		strings.TrimRight(s.cfg.UpstreamURL, "/")+"/documents/extract", &form)
	if err != nil {
		return 0, nil, err
	}
	req.Header.Set("Content-Type", mw.FormDataContentType())
	if s.cfg.UpstreamSecret != "" {
		req.Header.Set("X-Citavuk-Proxy-Secret", s.cfg.UpstreamSecret)
	}
	req.Header.Set("X-Citavuk-Client-IP", clientIP(r, s.cfg.TrustProxy))
	resp, err := (&http.Client{Timeout: 6 * time.Minute}).Do(req)
	if err != nil {
		return 0, nil, err
	}
	defer resp.Body.Close()
	payload, err := io.ReadAll(io.LimitReader(resp.Body, 64<<20))
	return resp.StatusCode, payload, err
}
