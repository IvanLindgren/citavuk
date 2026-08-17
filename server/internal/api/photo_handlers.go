package api

import (
	"context"
	"errors"
	"io"
	"log/slog"
	"net/http"
	"strings"

	"github.com/citavuk/server/internal/photoscan"
)

// photoScanner — распознавание текста со снимка. Интерфейс, а не тип: тесты
// ручки не должны ходить к модели.
type photoScanner interface {
	Enabled() bool
	Recognize(ctx context.Context, image []byte, mime string) ([]string, error)
}

type photoScanResponse struct {
	// Paragraphs — текст снимка. Клиент показывает его человеку и даёт
	// поправить: распознанное с ошибкой уйдёт в разбор слов и в словарь.
	Paragraphs []string `json:"paragraphs"`
}

// handlePhotoScan вытаскивает сербский текст со снимка.
//
// Кадр приходит как multipart — так его отдаёт камера телефона, и мегабайты
// не приходится перегонять в base64 дважды. На сервере снимок НЕ сохраняется:
// на чужом объявлении бывают лица и телефоны, а нужен из него только текст.
func (s *Server) handlePhotoScan(w http.ResponseWriter, r *http.Request) {
	if s.photoScan == nil || !s.photoScan.Enabled() {
		writeError(w, http.StatusServiceUnavailable, codeUpstream,
			"Распознавание снимков не настроено.")
		return
	}

	// Предел на теле запроса, а не только на прочитанном куске: без него
	// клиент занимает память сервера на весь свой аплоад.
	r.Body = http.MaxBytesReader(w, r.Body, photoscan.MaxImageBytes+(1<<16))
	if err := r.ParseMultipartForm(1 << 20); err != nil {
		writeError(w, http.StatusRequestEntityTooLarge, codeTooLarge,
			"Снимок слишком большой. Снимите кадр поменьше.")
		return
	}

	file, header, err := r.FormFile("photo")
	if err != nil {
		writeError(w, http.StatusBadRequest, codeBadRequest, "Снимок не приложен.")
		return
	}
	defer file.Close()

	image, err := io.ReadAll(io.LimitReader(file, photoscan.MaxImageBytes+1))
	if err != nil {
		writeError(w, http.StatusBadRequest, codeBadRequest,
			"Не удалось прочитать снимок.")
		return
	}
	if len(image) == 0 {
		writeError(w, http.StatusBadRequest, codeBadRequest, "Снимок пустой.")
		return
	}
	if len(image) > photoscan.MaxImageBytes {
		writeError(w, http.StatusRequestEntityTooLarge, codeTooLarge,
			"Снимок слишком большой. Снимите кадр поменьше.")
		return
	}

	mime := ""
	if header != nil {
		mime = header.Header.Get("Content-Type")
	}

	paragraphs, err := s.photoScan.Recognize(r.Context(), image, mime)
	// Снимок стены без текста — обычное дело, а не поломка, и отвечать на него
	// «внутренняя ошибка» значит врать человеку.
	if errors.Is(err, photoscan.ErrNoText) {
		writeError(w, http.StatusUnprocessableEntity, codeBadRequest,
			"На снимке не видно текста. Попробуйте снять ближе и ровнее.")
		return
	}
	if err != nil {
		slog.Error("handlePhotoScan", "err", err)
		writeError(w, http.StatusBadGateway, codeUpstream,
			"Не удалось разобрать снимок. Попробуйте ещё раз.")
		return
	}

	writeJSON(w, http.StatusOK, photoScanResponse{Paragraphs: paragraphs})
}

// handlePhotoScanAvailable сообщает, включена ли съёмка.
//
// Кнопку «снять текст» приложение показывает только когда сервер умеет её
// обслужить: кнопка, которая всегда отвечает отказом, хуже отсутствующей.
func (s *Server) handlePhotoScanAvailable(w http.ResponseWriter, r *http.Request) {
	writeJSON(w, http.StatusOK, map[string]any{
		"available": s.photoScan != nil && s.photoScan.Enabled(),
		"maxBytes":  photoscan.MaxImageBytes,
	})
}

// photoTitle — название книги из первого абзаца снимка.
//
// Спрашивать название после каждого кадра утомительно, а «Снимок 17» в
// библиотеке ничего не говорит. Первая строка объявления или вывески почти
// всегда и есть его заголовок.
func photoTitle(paragraphs []string, fallback string) string {
	for _, paragraph := range paragraphs {
		line := strings.TrimSpace(strings.SplitN(paragraph, "\n", 2)[0])
		if line == "" {
			continue
		}
		return trimRunes(line, 60)
	}
	return fallback
}
