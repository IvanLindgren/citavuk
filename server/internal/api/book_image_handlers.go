package api

import (
	"io"
	"log/slog"
	"net/http"
)

// maxBookImage — тот же предел, что у загрузки из браузера (media.imageExtension).
const maxBookImage = 10 << 20

// handleUploadBookImageDirect принимает картинку для книги одним запросом —
// так её вставляет в страницу приложение при правке. Браузер ходит через
// политику загрузки (upload-policy); приложению проще отдать файл серверу,
// а ключ в хранилище тот же — от содержимого.
func (s *Server) handleUploadBookImageDirect(w http.ResponseWriter, r *http.Request) {
	if s.media == nil {
		writeError(w, http.StatusServiceUnavailable, codeUpstream, "Хранилище картинок пока не настроено.")
		return
	}
	r.Body = http.MaxBytesReader(w, r.Body, maxBookImage+1<<20)
	file, _, err := r.FormFile("file")
	if err != nil {
		writeError(w, http.StatusRequestEntityTooLarge, codeBadRequest, "Картинка больше 10 МБ.")
		return
	}
	defer file.Close()
	data, err := io.ReadAll(io.LimitReader(file, maxBookImage+1))
	if err != nil || len(data) == 0 || len(data) > maxBookImage {
		writeError(w, http.StatusRequestEntityTooLarge, codeBadRequest, "Картинка больше 10 МБ.")
		return
	}
	// Тип — по содержимому, а не по тому, что заявил клиент.
	mime := http.DetectContentType(data)
	url, err := s.media.StoreBookImage(r.Context(), userFrom(r.Context()).ID, mime, data)
	if err != nil {
		slog.Warn("картинка книги не сохранилась", "err", err)
		writeValidationError(w, http.StatusUnprocessableEntity, codeBadRequest, err,
			"Подойдёт картинка JPEG, PNG, WebP или GIF до 10 МБ.")
		return
	}
	writeJSON(w, http.StatusOK, map[string]string{"url": url})
}
