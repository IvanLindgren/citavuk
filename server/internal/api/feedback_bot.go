package api

import (
	"bytes"
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"html"
	"log/slog"
	"net/http"
	"strings"
	"time"

	"github.com/citavuk/server/internal/store"
	"github.com/google/uuid"
)

// feedbackBot присылает жалобы на перевод в Telegram и принимает решение по
// кнопкам под сообщением.
//
// Обновления бот забирает long polling, а не webhook: так не нужен публичный
// адрес и правка nginx на общей машине, и наружу не торчит ещё один вход.
// Сервер у нас один, второго читателя обновлений не бывает.
type feedbackBot struct {
	token  string
	chatID int64
	store  *store.Store
	client *http.Client
	api    string
}

func newFeedbackBot(token string, chatID int64, st *store.Store) *feedbackBot {
	if token == "" || chatID == 0 {
		return nil
	}
	return &feedbackBot{
		token:  token,
		chatID: chatID,
		store:  st,
		client: &http.Client{Timeout: 70 * time.Second},
		api:    "https://api.telegram.org",
	}
}

type tgButton struct {
	Text         string `json:"text"`
	CallbackData string `json:"callback_data,omitempty"`
	URL          string `json:"url,omitempty"`
}

type tgMessage struct {
	MessageID int64 `json:"message_id"`
	Chat      struct {
		ID int64 `json:"id"`
	} `json:"chat"`
}

type tgUpdate struct {
	UpdateID      int64 `json:"update_id"`
	CallbackQuery *struct {
		ID      string     `json:"id"`
		Data    string     `json:"data"`
		Message *tgMessage `json:"message"`
	} `json:"callback_query"`
}

func (b *feedbackBot) call(ctx context.Context, method string, payload any, out any) error {
	body, err := json.Marshal(payload)
	if err != nil {
		return err
	}
	req, err := http.NewRequestWithContext(ctx, http.MethodPost, fmt.Sprintf("%s/bot%s/%s", b.api, b.token, method), bytes.NewReader(body))
	if err != nil {
		return err
	}
	req.Header.Set("Content-Type", "application/json")
	resp, err := b.client.Do(req)
	if err != nil {
		// В тексте ошибки net/http — полный адрес, а в нём токен бота.
		return fmt.Errorf("telegram %s: запрос не дошёл", method)
	}
	defer resp.Body.Close()
	var envelope struct {
		OK          bool            `json:"ok"`
		Result      json.RawMessage `json:"result"`
		Description string          `json:"description"`
	}
	if err := json.NewDecoder(resp.Body).Decode(&envelope); err != nil {
		return fmt.Errorf("telegram %s: %w", method, err)
	}
	if !envelope.OK {
		return fmt.Errorf("telegram %s: %s", method, envelope.Description)
	}
	if out != nil {
		return json.Unmarshal(envelope.Result, out)
	}
	return nil
}

// feedbackCard — текст карточки в Telegram.
func feedbackCard(f *store.TranslationFeedback) string {
	scope := "только в этом предложении"
	if f.Scope == store.FeedbackScopeForm {
		scope = "эта форма слова везде"
	}
	var b strings.Builder
	fmt.Fprintf(&b, "<b>%s</b>, перевёл %s\n", html.EscapeString(f.Word), html.EscapeString(providerName(f.Provider)))
	fmt.Fprintf(&b, "<i>%s</i>\n\n", html.EscapeString(markWord(f.Sentence, f.Start, f.End)))
	fmt.Fprintf(&b, "Показали: %s\n", html.EscapeString(f.Shown))
	if f.Suggestion != "" {
		fmt.Fprintf(&b, "Предлагают: <b>%s</b>\n", html.EscapeString(f.Suggestion))
	} else {
		b.WriteString("Верного варианта не предложили\n")
	}
	fmt.Fprintf(&b, "Где: %s\n", scope)
	if f.Comment != "" {
		fmt.Fprintf(&b, "Комментарий: %s\n", html.EscapeString(f.Comment))
	}
	if f.UserEmail != "" {
		fmt.Fprintf(&b, "От: %s\n", html.EscapeString(f.UserEmail))
	}
	switch f.Status {
	case "accepted":
		fmt.Fprintf(&b, "\n✅ Принято: <b>%s</b>", html.EscapeString(f.Final))
	case "rejected":
		b.WriteString("\n✖️ Отклонено")
	}
	return b.String()
}

func providerName(p string) string {
	switch p {
	case "deepl":
		return "DeepL"
	case "google":
		return "Google"
	case "citavuk":
		return "редактор"
	case "":
		return "неизвестно кто"
	}
	return p
}

// markWord выделяет нажатое слово в предложении квадратными скобками.
func markWord(sentence string, start, end int) string {
	if start < 0 || end > len(sentence) || start >= end {
		return sentence
	}
	return sentence[:start] + "[" + sentence[start:end] + "]" + sentence[end:]
}

func (b *feedbackBot) buttons(f *store.TranslationFeedback) [][]tgButton {
	if f.Status != "pending" {
		return [][]tgButton{}
	}
	row := []tgButton{}
	// Принять можно только с готовым вариантом: «здесь неверно» без верного
	// перевода решается в админке, где его можно вписать.
	if f.Suggestion != "" {
		row = append(row, tgButton{Text: "Принять", CallbackData: "fb:a:" + f.ID.String()})
	}
	row = append(row, tgButton{Text: "Отклонить", CallbackData: "fb:r:" + f.ID.String()})
	return [][]tgButton{row, {{Text: "Открыть в админке", URL: "https://citavuk.ru/admin?tab=translations"}}}
}

// Announce отправляет новую жалобу. Ошибки только в журнал: жалоба уже
// сохранена и видна в админке, а бот — удобство, а не обязательный путь.
func (b *feedbackBot) Announce(f *store.TranslationFeedback) {
	if b == nil {
		return
	}
	go func() {
		ctx, cancel := context.WithTimeout(context.Background(), 15*time.Second)
		defer cancel()
		var msg tgMessage
		err := b.call(ctx, "sendMessage", map[string]any{
			"chat_id":                  b.chatID,
			"text":                     feedbackCard(f),
			"parse_mode":               "HTML",
			"disable_web_page_preview": true,
			"reply_markup":             map[string]any{"inline_keyboard": b.buttons(f)},
		}, &msg)
		if err != nil {
			slog.Warn("жалоба на перевод в Telegram", "err", err)
			return
		}
		if err := b.store.SetFeedbackTelegramMessage(ctx, f.ID, msg.MessageID); err != nil {
			slog.Warn("номер сообщения жалобы", "err", err)
		}
	}()
}

// Refresh перерисовывает карточку после решения, принятого в админке.
func (b *feedbackBot) Refresh(f *store.TranslationFeedback) {
	if b == nil || f.TelegramMessageID == 0 {
		return
	}
	go func() {
		ctx, cancel := context.WithTimeout(context.Background(), 15*time.Second)
		defer cancel()
		b.edit(ctx, f)
	}()
}

func (b *feedbackBot) edit(ctx context.Context, f *store.TranslationFeedback) {
	err := b.call(ctx, "editMessageText", map[string]any{
		"chat_id":                  b.chatID,
		"message_id":               f.TelegramMessageID,
		"text":                     feedbackCard(f),
		"parse_mode":               "HTML",
		"disable_web_page_preview": true,
		"reply_markup":             map[string]any{"inline_keyboard": b.buttons(f)},
	}, nil)
	if err != nil {
		slog.Warn("обновление карточки жалобы", "err", err)
	}
}

// Run слушает нажатия кнопок, пока жив ctx.
func (b *feedbackBot) Run(ctx context.Context) {
	if b == nil {
		return
	}
	var offset int64
	for ctx.Err() == nil {
		var updates []tgUpdate
		err := b.call(ctx, "getUpdates", map[string]any{
			"offset":          offset,
			"timeout":         50,
			"allowed_updates": []string{"callback_query"},
		}, &updates)
		if err != nil {
			if ctx.Err() != nil {
				return
			}
			slog.Warn("бот жалоб: getUpdates", "err", err)
			select {
			case <-ctx.Done():
				return
			case <-time.After(15 * time.Second):
			}
			continue
		}
		for _, u := range updates {
			offset = u.UpdateID + 1
			if u.CallbackQuery != nil {
				b.handleCallback(ctx, u.CallbackQuery.ID, u.CallbackQuery.Data, u.CallbackQuery.Message)
			}
		}
	}
}

func (b *feedbackBot) handleCallback(ctx context.Context, callbackID, data string, msg *tgMessage) {
	answer := func(text string) {
		_ = b.call(ctx, "answerCallbackQuery", map[string]any{"callback_query_id": callbackID, "text": text}, nil)
	}
	// Решать можно только из того чата, куда бот пишет: кнопка, пересланная
	// в чужой чат, не должна ничего менять.
	if msg == nil || msg.Chat.ID != b.chatID {
		answer("Не из этого чата.")
		return
	}
	parts := strings.SplitN(data, ":", 3)
	if len(parts) != 3 || parts[0] != "fb" {
		answer("")
		return
	}
	id, err := uuid.Parse(parts[2])
	if err != nil {
		answer("")
		return
	}
	f, err := b.store.DecideTranslationFeedback(ctx, id, uuid.Nil, parts[1] == "a", "")
	switch {
	case errors.Is(err, store.ErrFeedbackDecided):
		answer("Уже решено.")
		if f, err := b.store.TranslationFeedbackByID(ctx, id); err == nil {
			b.edit(ctx, f)
		}
		return
	case err != nil:
		slog.Warn("решение по жалобе из Telegram", "err", err)
		answer("Не получилось, загляни в админку.")
		return
	}
	if f.Status == "accepted" {
		answer("Принято")
	} else {
		answer("Отклонено")
	}
	b.edit(ctx, f)
}
