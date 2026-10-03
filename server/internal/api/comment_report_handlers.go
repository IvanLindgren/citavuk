package api

import (
	"context"
	"errors"
	"fmt"
	"html"
	"log/slog"
	"net/http"
	"strings"
	"time"
	"unicode/utf8"

	"github.com/citavuk/server/internal/store"
	"github.com/google/uuid"
)

// Жалобы на комментарии. Apple требует, чтобы на чужую запись можно было
// пожаловаться и чтобы жалобу разбирали быстро (App Review 1.2). Жалоба
// приходит модератору в Telegram с кнопками «Удалить» и «Оставить»; в базе
// она не хранится — решение исполняется сразу.

const maxReportReasonRunes = 500

type commentReportRequest struct {
	Kind   string `json:"kind"`
	ID     string `json:"id"`
	Reason string `json:"reason"`
}

func (s *Server) handleReportComment(w http.ResponseWriter, r *http.Request) {
	var req commentReportRequest
	if err := decodeJSON(w, r, &req, 8<<10); err != nil {
		writeError(w, http.StatusBadRequest, codeBadRequest, "Не удалось прочитать жалобу.")
		return
	}
	if !store.ValidCommentKind(req.Kind) {
		writeError(w, http.StatusBadRequest, codeBadRequest, "Неизвестный вид комментария.")
		return
	}
	id, err := uuid.Parse(strings.TrimSpace(req.ID))
	if err != nil {
		writeError(w, http.StatusBadRequest, codeBadRequest, "Неверный идентификатор комментария.")
		return
	}
	reason := strings.TrimSpace(req.Reason)
	if utf8.RuneCountInString(reason) > maxReportReasonRunes {
		reason = string([]rune(reason)[:maxReportReasonRunes])
	}

	comment, err := s.store.CommentForReport(r.Context(), req.Kind, id)
	if errors.Is(err, store.ErrCommentNotFound) {
		writeError(w, http.StatusNotFound, codeNotFound, "Этого комментария уже нет.")
		return
	}
	if err != nil {
		slog.Error("жалоба на комментарий", "err", err)
		writeError(w, http.StatusInternalServerError, codeInternal, "Не удалось отправить жалобу.")
		return
	}

	reporter := "гость"
	if user := userFrom(r.Context()); user != nil {
		reporter = user.Email
	}
	if s.feedbackBot == nil {
		// Без бота жалоба остаётся только в журнале — пусть хотя бы там её
		// будет видно сразу.
		slog.Error("жалоба на комментарий без бота модерации",
			"kind", comment.Kind, "id", comment.ID, "reason", reason, "from", reporter)
	}
	s.feedbackBot.ReportComment(comment, reason, reporter)
	writeJSON(w, http.StatusAccepted, map[string]bool{"ok": true})
}

func commentKindName(kind string) string {
	switch kind {
	case store.CommentKindFeed:
		return "Вукоток"
	case store.CommentKindRoadmap:
		return "Карта пути"
	case store.CommentKindBook:
		return "Общая книга"
	}
	return kind
}

func commentReportCard(c *store.ReportedComment, reason, reporter, verdict string) string {
	var b strings.Builder
	fmt.Fprintf(&b, "🚩 <b>Жалоба на комментарий</b> — %s\n", html.EscapeString(commentKindName(c.Kind)))
	fmt.Fprintf(&b, "%s\n\n", html.EscapeString(c.Where))
	fmt.Fprintf(&b, "<b>%s</b>:\n<i>%s</i>\n\n", html.EscapeString(c.Author), html.EscapeString(c.Body))
	if reason != "" {
		fmt.Fprintf(&b, "Причина: %s\n", html.EscapeString(reason))
	}
	fmt.Fprintf(&b, "От: %s", html.EscapeString(reporter))
	if verdict != "" {
		fmt.Fprintf(&b, "\n\n%s", verdict)
	}
	return b.String()
}

// ReportComment присылает модератору жалобу с кнопками решения.
func (b *feedbackBot) ReportComment(c *store.ReportedComment, reason, reporter string) {
	if b == nil {
		return
	}
	go func() {
		ctx, cancel := context.WithTimeout(context.Background(), 15*time.Second)
		defer cancel()
		suffix := c.Kind + ":" + c.ID.String()
		err := b.call(ctx, "sendMessage", map[string]any{
			"chat_id":                  b.chatID,
			"text":                     commentReportCard(c, reason, reporter, ""),
			"parse_mode":               "HTML",
			"disable_web_page_preview": true,
			"reply_markup": map[string]any{"inline_keyboard": [][]tgButton{{
				{Text: "Удалить", CallbackData: "cr:d:" + suffix},
				{Text: "Оставить", CallbackData: "cr:k:" + suffix},
			}}},
		}, nil)
		if err != nil {
			slog.Warn("жалоба на комментарий в Telegram", "err", err)
		}
	}()
}

// handleCommentReportCallback исполняет решение по жалобе на комментарий:
// data вида cr:d:feed:<uuid> (удалить) или cr:k:feed:<uuid> (оставить).
func (b *feedbackBot) handleCommentReportCallback(ctx context.Context, data string, msg *tgMessage, answer func(string)) {
	parts := strings.SplitN(data, ":", 4)
	if len(parts) != 4 || !store.ValidCommentKind(parts[2]) {
		answer("")
		return
	}
	id, err := uuid.Parse(parts[3])
	if err != nil {
		answer("")
		return
	}
	verdict := "✅ Оставлено"
	if parts[1] == "d" {
		if err := b.store.RemoveReportedComment(ctx, parts[2], id); err != nil {
			slog.Warn("удаление комментария по жалобе", "err", err)
			answer("Не получилось удалить.")
			return
		}
		verdict = "🗑 Удалено"
	}
	answer(strings.TrimLeft(verdict, "✅🗑 "))
	// Карточка остаётся в чате без кнопок, с пометкой о решении.
	_ = b.call(ctx, "editMessageReplyMarkup", map[string]any{
		"chat_id":      b.chatID,
		"message_id":   msg.MessageID,
		"reply_markup": map[string]any{"inline_keyboard": [][]tgButton{}},
	}, nil)
	_ = b.call(ctx, "sendMessage", map[string]any{
		"chat_id":             b.chatID,
		"text":                verdict,
		"reply_to_message_id": msg.MessageID,
	}, nil)
}
