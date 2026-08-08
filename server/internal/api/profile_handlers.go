package api

import (
	"log/slog"
	"net/http"
)

func (s *Server) handleProfileStats(w http.ResponseWriter, r *http.Request) {
	user := userFrom(r.Context())
	stats, err := s.store.GetProfileStats(r.Context(), user.ID)
	if err != nil {
		slog.Error("handleProfileStats", "err", err, "user", user.ID)
		writeError(w, http.StatusInternalServerError, codeInternal,
			"Не удалось загрузить статистику профиля.")
		return
	}
	writeJSON(w, http.StatusOK, stats)
}
