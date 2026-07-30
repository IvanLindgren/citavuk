package api

import (
	"errors"
	"log/slog"
	"net/http"
	"strings"

	"github.com/citavuk/server/internal/podcast"
)

// handleAudioLessons отдаёт список эпизодов подкастов.
//
// Раньше этот путь уходил на прежний Python-бэкенд. Он живёт на бесплатном
// Space, который засыпает, и раздел «Слушание» отвечал 502; а главное — реплики
// там собирались из описания эпизода с таймингами, растянутыми пропорционально
// длине строк. Совпасть с речью такой текст не мог ни в одном эпизоде.
func (s *Server) handleAudioLessons(w http.ResponseWriter, r *http.Request) {
	lessons, err := s.podcasts.Lessons(r.Context())
	if err != nil {
		if isClientGone(r, err) {
			writeError(w, statusClientClosed, codeUpstream, "Запрос отменён.")
			return
		}
		slog.Warn("ленты подкастов недоступны", "err", err)
		writeError(w, http.StatusFailedDependency, codeUpstream,
			"Не удалось получить список эпизодов. Попробуйте позже.")
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{"items": lessons})
}

// handleAudioTranscript отдаёт расшифровку эпизода.
//
// Только свою, сделанную Whisper. Прежде сюда же приходили ссылки на страницу
// автора: текст оттуда выскребался и разбивался по времени на глазок. Теперь
// на посторонний адрес возвращается пустой список — эпизод покажет, что
// расшифровка ещё готовится, и это честнее выдуманных подписей.
func (s *Server) handleAudioTranscript(w http.ResponseWriter, r *http.Request) {
	url := strings.TrimSpace(r.URL.Query().Get("url"))
	if url == "" {
		writeError(w, http.StatusBadRequest, codeBadRequest, "Не указан адрес расшифровки.")
		return
	}

	transcript, err := s.podcasts.Transcript(r.Context(), url)
	if errors.Is(err, podcast.ErrForeignTranscript) {
		writeJSON(w, http.StatusOK, map[string]any{"cues": []podcast.Cue{}})
		return
	}
	if err != nil {
		if isClientGone(r, err) {
			writeError(w, statusClientClosed, codeUpstream, "Запрос отменён.")
			return
		}
		slog.Warn("расшифровка недоступна", "url", url, "err", err)
		writeJSON(w, http.StatusOK, map[string]any{"cues": []podcast.Cue{}})
		return
	}

	cues := transcript.Cues
	if cues == nil {
		cues = []podcast.Cue{}
	}
	writeJSON(w, http.StatusOK, map[string]any{
		"cues":     cues,
		"duration": transcript.Duration,
	})
}
