// Package mailer отправляет транзакционные письма Citavuk.
package mailer

import (
	"bytes"
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"html"
	"io"
	"net/http"
	"net/url"
	"strings"
	"time"
)

const resendEndpoint = "https://api.resend.com/emails"

// Sender — минимальный контракт, который обработчики используют и подменяют
// тестовой реализацией без сетевых запросов.
type Sender interface {
	Enabled() bool
	SendVerification(ctx context.Context, to, displayName, token string) error
	SendNotification(ctx context.Context, to, displayName, subject, text, actionLabel, actionPath string) error
}

// Resend реализует Sender через Resend HTTP API.
type Resend struct {
	apiKey   string
	from     string
	webURL   string
	endpoint string
	client   *http.Client
}

func NewResend(apiKey, from, webURL string) *Resend {
	return &Resend{
		apiKey:   strings.TrimSpace(apiKey),
		from:     strings.TrimSpace(from),
		webURL:   strings.TrimRight(strings.TrimSpace(webURL), "/"),
		endpoint: resendEndpoint,
		client:   &http.Client{Timeout: 12 * time.Second},
	}
}

func (r *Resend) Enabled() bool {
	return r != nil && r.apiKey != "" && r.from != "" && r.webURL != ""
}

func (r *Resend) SendVerification(
	ctx context.Context,
	to, displayName, token string,
) error {
	if !r.Enabled() {
		return errors.New("отправка почты не настроена")
	}
	link := r.webURL + "/verify-email?token=" + url.QueryEscape(token)
	name := strings.TrimSpace(displayName)
	if name == "" {
		name = "читатель"
	}

	text := fmt.Sprintf(
		"Здравствуйте, %s!\n\nПодтвердите почту для аккаунта Читавук:\n%s\n\n"+
			"Ссылка действует ограниченное время. Если вы не регистрировались, "+
			"просто проигнорируйте письмо.",
		name, link,
	)
	htmlBody := fmt.Sprintf(`<!doctype html>
<html lang="ru">
<body style="margin:0;background:#f3e9d2;color:#2d2118;font-family:Arial,sans-serif">
  <div style="max-width:560px;margin:0 auto;padding:40px 20px">
    <div style="background:#fffaf0;border:1px solid #dfc8a2;border-radius:16px;padding:32px">
      <div style="font-size:24px;font-weight:700;margin-bottom:18px">Читавук</div>
      <p style="font-size:17px;line-height:1.6">Здравствуйте, %s!</p>
      <p style="font-size:17px;line-height:1.6">
        Подтвердите адрес почты, чтобы завершить создание аккаунта и
        синхронизировать книги, словарь и прогресс курса.
      </p>
      <p style="margin:28px 0">
        <a href="%s" style="display:inline-block;background:#a92b27;color:#fffaf0;
          text-decoration:none;font-weight:700;padding:14px 22px;border-radius:10px">
          Подтвердить почту
        </a>
      </p>
      <p style="font-size:13px;line-height:1.5;color:#766657">
        Если вы не регистрировались в Читавуке, просто проигнорируйте это письмо.
      </p>
    </div>
  </div>
</body>
</html>`, html.EscapeString(name), html.EscapeString(link))

	body, err := json.Marshal(map[string]any{
		"from":    r.from,
		"to":      []string{to},
		"subject": "Подтвердите почту в Читавуке",
		"text":    text,
		"html":    htmlBody,
	})
	if err != nil {
		return err
	}

	req, err := http.NewRequestWithContext(
		ctx,
		http.MethodPost,
		r.endpoint,
		bytes.NewReader(body),
	)
	if err != nil {
		return err
	}
	req.Header.Set("Authorization", "Bearer "+r.apiKey)
	req.Header.Set("Content-Type", "application/json")

	resp, err := r.client.Do(req)
	if err != nil {
		return fmt.Errorf("Resend недоступен: %w", err)
	}
	defer resp.Body.Close()
	if resp.StatusCode < 200 || resp.StatusCode >= 300 {
		detail, _ := io.ReadAll(io.LimitReader(resp.Body, 8<<10))
		return fmt.Errorf("Resend вернул %s: %s", resp.Status, strings.TrimSpace(string(detail)))
	}
	return nil
}

// SendNotification sends a short transactional status update. actionPath is a
// local web path, never an arbitrary URL, so a database value cannot turn the
// email into an open redirect.
func (r *Resend) SendNotification(ctx context.Context, to, displayName, subject, text, actionLabel, actionPath string) error {
	if !r.Enabled() {
		return errors.New("отправка почты не настроена")
	}
	name := strings.TrimSpace(displayName)
	if name == "" {
		name = "читатель"
	}
	link := ""
	if strings.HasPrefix(actionPath, "/") {
		link = r.webURL + actionPath
	}
	plain := fmt.Sprintf("Здравствуйте, %s!\n\n%s", name, text)
	htmlAction := ""
	if link != "" && actionLabel != "" {
		plain += "\n\n" + link
		htmlAction = fmt.Sprintf(`<p style="margin:28px 0"><a href="%s" style="display:inline-block;background:#a92b27;color:#fffaf0;text-decoration:none;font-weight:700;padding:14px 22px;border-radius:10px">%s</a></p>`, html.EscapeString(link), html.EscapeString(actionLabel))
	}
	htmlBody := fmt.Sprintf(`<!doctype html><html lang="ru"><body style="margin:0;background:#f3e9d2;color:#2d2118;font-family:Arial,sans-serif"><div style="max-width:560px;margin:0 auto;padding:40px 20px"><div style="background:#fffaf0;border:1px solid #dfc8a2;border-radius:16px;padding:32px"><div style="font-size:24px;font-weight:700;margin-bottom:18px">Читавук</div><p style="font-size:17px;line-height:1.6">Здравствуйте, %s!</p><p style="font-size:17px;line-height:1.6">%s</p>%s</div></div></body></html>`, html.EscapeString(name), html.EscapeString(text), htmlAction)
	body, err := json.Marshal(map[string]any{"from": r.from, "to": []string{to}, "subject": subject, "text": plain, "html": htmlBody})
	if err != nil {
		return err
	}
	req, err := http.NewRequestWithContext(ctx, http.MethodPost, r.endpoint, bytes.NewReader(body))
	if err != nil {
		return err
	}
	req.Header.Set("Authorization", "Bearer "+r.apiKey)
	req.Header.Set("Content-Type", "application/json")
	resp, err := r.client.Do(req)
	if err != nil {
		return fmt.Errorf("Resend недоступен: %w", err)
	}
	defer resp.Body.Close()
	if resp.StatusCode < 200 || resp.StatusCode >= 300 {
		detail, _ := io.ReadAll(io.LimitReader(resp.Body, 8<<10))
		return fmt.Errorf("Resend вернул %s: %s", resp.Status, strings.TrimSpace(string(detail)))
	}
	return nil
}
