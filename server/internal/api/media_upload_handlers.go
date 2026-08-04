package api

import (
	"io"
	"net/http"
	"strconv"
	"strings"
)

func (s *Server) handleMediaUpload(w http.ResponseWriter, r *http.Request) {
	if s.media == nil {
		writeError(w, http.StatusServiceUnavailable, codeInternal, "Хранилище изображений не настроено.")
		return
	}
	query := r.URL.Query()
	expires, err := strconv.ParseInt(query.Get("expires"), 10, 64)
	if err != nil {
		writeError(w, http.StatusBadRequest, codeBadRequest, "Неверная ссылка загрузки.")
		return
	}
	mimeType := strings.TrimSpace(query.Get("mime"))
	requestType := strings.TrimSpace(strings.Split(r.Header.Get("Content-Type"), ";")[0])
	if requestType != mimeType {
		writeError(w, http.StatusUnsupportedMediaType, codeBadRequest, "Тип файла не совпадает с политикой загрузки.")
		return
	}
	r.Body = http.MaxBytesReader(w, r.Body, 10<<20)
	data, err := io.ReadAll(r.Body)
	if err != nil {
		writeError(w, http.StatusRequestEntityTooLarge, codeBadRequest, "Изображение должно быть не больше 10 МБ.")
		return
	}
	err = s.media.Upload(
		r.Context(), userFrom(r.Context()).ID,
		query.Get("key"), query.Get("sha256"), mimeType, expires,
		query.Get("signature"), data,
	)
	if err != nil {
		writeError(w, http.StatusUnprocessableEntity, codeBadRequest, err.Error())
		return
	}
	w.WriteHeader(http.StatusNoContent)
}
