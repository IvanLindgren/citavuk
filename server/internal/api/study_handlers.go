package api

import (
	"net/http"
	"strings"
	"time"

	"github.com/google/uuid"
)

// Офлайн-упражнения проверяются клиентским движком, как и обычный прогресс
// курса/SRS. Сервер не доверяет заявленной длине серии или учебной дате:
// принимает только факт завершённой попытки, дедуплицирует её и считает день.
// Здесь нет XP/денег/доступа к урокам, поэтому это не API выдачи наград.
func (s *Server) handleStudyAttempt(w http.ResponseWriter, r *http.Request) {
	var in struct {
		EventID    string    `json:"eventId"`
		Source     string    `json:"source"`
		Reference  string    `json:"reference"`
		Answered   int       `json:"answered"`
		OccurredAt time.Time `json:"occurredAt"`
	}
	if decodeJSON(w, r, &in, 4096) != nil {
		writeError(w, 400, codeBadRequest, "Не удалось прочитать результат занятия.")
		return
	}
	id, err := uuid.Parse(in.EventID)
	if err != nil || id == uuid.Nil || in.Answered < 1 || in.Answered > 1000 || len(in.Reference) > 200 || strings.TrimSpace(in.Reference) == "" {
		writeError(w, 400, codeBadRequest, "Некорректный результат занятия.")
		return
	}
	switch in.Source {
	case "exercise", "course", "review", "daily":
	default:
		writeError(w, 400, codeBadRequest, "Неизвестный вид занятия.")
		return
	}
	now := time.Now()
	if in.OccurredAt.IsZero() || in.OccurredAt.After(now.Add(5*time.Minute)) {
		writeError(w, 400, codeBadRequest, "Проверь дату и время устройства.")
		return
	}
	// Старый офлайн-результат сохраняется обычной синхронизацией, но не зажигает
	// огонь много дней спустя. Не задним числом и не произвольной датой клиента.
	eventKey := "attempt:" + id.String()
	if in.OccurredAt.Before(now.Add(-48 * time.Hour)) {
		eventKey = ""
	}
	view, err := s.store.RecordStudy(r.Context(), userFrom(r.Context()).ID, eventKey)
	if err != nil {
		personalError(w, err)
		return
	}
	writeJSON(w, http.StatusOK, view)
}
