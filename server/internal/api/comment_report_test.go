package api

import (
	"context"
	"net/http"
	"testing"

	"github.com/citavuk/server/internal/store"
	"github.com/google/uuid"
)

func TestRoadmapCommentModeration(t *testing.T) {
	ts, st := testServer(t)
	author, _ := register(t, ts, st)
	reader, _ := register(t, ts, st)

	// Грубость не записывается.
	status, raw := author.do(http.MethodPost, "/v1/roadmap/A1/comments", map[string]any{"body": "ну ты и мудак"})
	if status != http.StatusUnprocessableEntity {
		t.Fatalf("грубый комментарий принят: %d %s", status, raw)
	}

	status, raw = author.do(http.MethodPost, "/v1/roadmap/A1/comments", map[string]any{"body": "Хороший уровень, спасибо"})
	var comment store.RoadmapComment
	author.mustJSON(status, raw, &comment)

	// Жалоба принимается и от другого читателя, и от гостя.
	status, raw = reader.do(http.MethodPost, "/v1/comments/reports", map[string]any{
		"kind": "roadmap", "id": comment.ID.String(), "reason": "оскорбление",
	})
	if status != http.StatusAccepted {
		t.Fatalf("жалоба не принята: %d %s", status, raw)
	}
	guest := &client{t: t, base: ts.URL}
	if status, raw = guest.do(http.MethodPost, "/v1/comments/reports", map[string]any{
		"kind": "roadmap", "id": comment.ID.String(),
	}); status != http.StatusAccepted {
		t.Fatalf("жалоба гостя не принята: %d %s", status, raw)
	}

	// Неизвестный вид и чужой номер — отказ.
	if status, _ = reader.do(http.MethodPost, "/v1/comments/reports", map[string]any{
		"kind": "chat", "id": comment.ID.String(),
	}); status != http.StatusBadRequest {
		t.Fatalf("неизвестный вид: %d", status)
	}
	if status, _ = reader.do(http.MethodPost, "/v1/comments/reports", map[string]any{
		"kind": "roadmap", "id": uuid.NewString(),
	}); status != http.StatusNotFound {
		t.Fatalf("несуществующий комментарий: %d", status)
	}

	// Решение модератора снимает комментарий, повтор не ошибка.
	ctx := context.Background()
	found, err := st.CommentForReport(ctx, store.CommentKindRoadmap, comment.ID)
	if err != nil || found.Body != "Хороший уровень, спасибо" {
		t.Fatalf("комментарий для карточки: %+v %v", found, err)
	}
	for range 2 {
		if err := st.RemoveReportedComment(ctx, store.CommentKindRoadmap, comment.ID); err != nil {
			t.Fatal(err)
		}
	}
	if _, err := st.CommentForReport(ctx, store.CommentKindRoadmap, comment.ID); err != store.ErrCommentNotFound {
		t.Fatalf("комментарий не снят: %v", err)
	}
}
