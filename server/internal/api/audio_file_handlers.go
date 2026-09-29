package api

import (
	"mime"
	"net/http"
	"strings"
	"time"
)

const maxAudioTranscriptionBody = 50 << 20

// handleAudioFileTranscribe — авторизованный вход в расшифровку.
// Само распознавание и проверку языка выполняет Python (Groq Fast с fallback
// Aiesa/Polza); Go не сохраняет файл и только ограничивает размер, частоту и
// доступ.
func (s *Server) handleAudioFileTranscribe(w http.ResponseWriter, r *http.Request) {
	if s.proxy == nil {
		writeError(w, http.StatusServiceUnavailable, codeUpstream,
			"Расшифровка аудио пока не настроена.")
		return
	}
	mediaType, _, err := mime.ParseMediaType(r.Header.Get("Content-Type"))
	if err != nil || !strings.EqualFold(mediaType, "multipart/form-data") {
		writeError(w, http.StatusUnsupportedMediaType, codeBadRequest,
			"Нужно отправить аудиофайл.")
		return
	}
	if r.ContentLength > maxAudioTranscriptionBody {
		writeError(w, http.StatusRequestEntityTooLarge, codeBadRequest,
			"Аудиофайл должен быть не больше 48 МБ.")
		return
	}
	// Общие таймауты сервера рассчитаны на JSON. Здесь пользователь может
	// загружать 48 МБ по мобильной сети, после чего Groq/Aiesa ещё обрабатывают
	// запись. Расширяем дедлайны только этой авторизованной и отдельно
	// ограниченной ручке, не ослабляя остальные запросы.
	controller := http.NewResponseController(w)
	_ = controller.SetReadDeadline(time.Now().Add(10 * time.Minute))
	_ = controller.SetWriteDeadline(time.Now().Add(25 * time.Minute))

	r.Body = http.MaxBytesReader(w, r.Body, maxAudioTranscriptionBody)
	r.URL.Path = "/audio/transcribe-file"
	r.URL.RawPath = ""
	s.proxy.ServeHTTP(w, r)
}
