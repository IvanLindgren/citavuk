// Package yookassa — минимальный клиент API ЮKassa: создать платёж и узнать его
// статус. Уведомлениям не доверяем: подписи у них нет, поэтому статус всегда
// перезапрашивается у API своим ключом.
package yookassa

import (
	"bytes"
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"net/http"
	"net/url"
	"strconv"
	"strings"
	"time"
)

const defaultBaseURL = "https://api.yookassa.ru/v3"

var ErrDisabled = errors.New("ЮKassa не настроена")

type Client struct {
	shopID  string
	secret  string
	baseURL string
	http    *http.Client
}

func New(shopID, secret string) *Client {
	return &Client{
		shopID:  shopID,
		secret:  secret,
		baseURL: defaultBaseURL,
		http:    &http.Client{Timeout: 35 * time.Second},
	}
}

// WithBaseURL нужен тестам.
func (c *Client) WithBaseURL(base string) *Client {
	c.baseURL = base
	return c
}

func (c *Client) Enabled() bool { return c != nil && c.shopID != "" && c.secret != "" }

// TestMode — ключ тестового магазина: платежи проходят только тестовыми
// картами, и настоящих денег за ними нет.
func (c *Client) TestMode() bool { return c.Enabled() && strings.HasPrefix(c.secret, "test_") }

type Amount struct {
	Value    string `json:"value"`
	Currency string `json:"currency"`
}

// Kopecks переводит строку вида "200.00" в копейки без float.
func (a Amount) Kopecks() (int64, error) {
	whole, frac, _ := cutDot(a.Value)
	rub, err := strconv.ParseInt(whole, 10, 64)
	if err != nil {
		return 0, fmt.Errorf("сумма %q: %w", a.Value, err)
	}
	for len(frac) < 2 {
		frac += "0"
	}
	kop, err := strconv.ParseInt(frac[:2], 10, 64)
	if err != nil {
		return 0, fmt.Errorf("сумма %q: %w", a.Value, err)
	}
	return rub*100 + kop, nil
}

func cutDot(s string) (string, string, bool) {
	for i := 0; i < len(s); i++ {
		if s[i] == '.' {
			return s[:i], s[i+1:], true
		}
	}
	return s, "", false
}

func RUB(kopecks int64) Amount {
	return Amount{Value: fmt.Sprintf("%d.%02d", kopecks/100, kopecks%100), Currency: "RUB"}
}

type Payment struct {
	ID           string            `json:"id"`
	Status       string            `json:"status"`
	Paid         bool              `json:"paid"`
	Test         bool              `json:"test"`
	Amount       Amount            `json:"amount"`
	CapturedAt   *time.Time        `json:"captured_at,omitempty"`
	CreatedAt    time.Time         `json:"created_at"`
	Metadata     map[string]string `json:"metadata,omitempty"`
	Confirmation *struct {
		Type            string `json:"type"`
		ConfirmationURL string `json:"confirmation_url"`
	} `json:"confirmation,omitempty"`
	RefundedAmount *Amount `json:"refunded_amount,omitempty"`
	PaymentMethod  *struct {
		ID    string `json:"id"`
		Saved bool   `json:"saved"`
		Type  string `json:"type"`
	} `json:"payment_method,omitempty"`
}

type CreatePayment struct {
	Amount            Amount            `json:"amount"`
	Capture           bool              `json:"capture"`
	Confirmation      confirmation      `json:"confirmation"`
	Description       string            `json:"description"`
	Metadata          map[string]string `json:"metadata,omitempty"`
	SavePaymentMethod bool              `json:"save_payment_method,omitempty"`
}

type confirmation struct {
	Type      string `json:"type"`
	ReturnURL string `json:"return_url"`
}

// Create создаёт платёж с немедленным списанием и переходом на страницу
// оплаты. idempotenceKey защищает от двойного платежа при повторе запроса.
func (c *Client) Create(
	ctx context.Context, idempotenceKey string, amount Amount,
	description, returnURL string, metadata map[string]string,
) (*Payment, error) {
	return c.CreateWithSaving(ctx, idempotenceKey, amount, description, returnURL, metadata, false)
}

func (c *Client) CreateWithSaving(ctx context.Context, idempotenceKey string, amount Amount,
	description, returnURL string, metadata map[string]string, save bool) (*Payment, error) {
	body := CreatePayment{
		Amount:            amount,
		Capture:           true,
		Confirmation:      confirmation{Type: "redirect", ReturnURL: returnURL},
		Description:       truncRunes(description, 128),
		Metadata:          metadata,
		SavePaymentMethod: save,
	}
	var p Payment
	if err := c.do(ctx, http.MethodPost, "/payments", idempotenceKey, body, &p); err != nil {
		return nil, err
	}
	return &p, nil
}

// Charge использует только способ оплаты, сохранённый с явным согласием.
func (c *Client) Charge(ctx context.Context, key string, amount Amount, methodID string, metadata map[string]string) (*Payment, error) {
	var p Payment
	body := struct {
		Amount          Amount            `json:"amount"`
		Capture         bool              `json:"capture"`
		PaymentMethodID string            `json:"payment_method_id"`
		Description     string            `json:"description"`
		Metadata        map[string]string `json:"metadata"`
	}{amount, true, methodID, "Ежемесячная поддержка Читавука", metadata}
	if err := c.do(ctx, http.MethodPost, "/payments", key, body, &p); err != nil {
		return nil, err
	}
	return &p, nil
}

func (c *Client) Payment(ctx context.Context, id string) (*Payment, error) {
	var p Payment
	if err := c.do(ctx, http.MethodGet, "/payments/"+url.PathEscape(id), "", nil, &p); err != nil {
		return nil, err
	}
	return &p, nil
}

type Refund struct {
	ID        string `json:"id"`
	PaymentID string `json:"payment_id"`
	Status    string `json:"status"`
}

func (c *Client) Refund(ctx context.Context, id string) (*Refund, error) {
	var r Refund
	if err := c.do(ctx, http.MethodGet, "/refunds/"+url.PathEscape(id), "", nil, &r); err != nil {
		return nil, err
	}
	return &r, nil
}

type apiError struct {
	Status      int
	Code        string `json:"code"`
	Description string `json:"description"`
}

func (e *apiError) Error() string {
	return fmt.Sprintf("ЮKassa %d %s: %s", e.Status, e.Code, e.Description)
}

func (c *Client) do(ctx context.Context, method, path, idem string, in, out any) error {
	if !c.Enabled() {
		return ErrDisabled
	}
	var body io.Reader
	if in != nil {
		raw, err := json.Marshal(in)
		if err != nil {
			return err
		}
		body = bytes.NewReader(raw)
	}
	req, err := http.NewRequestWithContext(ctx, method, c.baseURL+path, body)
	if err != nil {
		return err
	}
	req.SetBasicAuth(c.shopID, c.secret)
	req.Header.Set("Accept", "application/json")
	if in != nil {
		req.Header.Set("Content-Type", "application/json")
	}
	if idem != "" {
		req.Header.Set("Idempotence-Key", idem)
	}
	resp, err := c.http.Do(req)
	if err != nil {
		return fmt.Errorf("ЮKassa: %w", err)
	}
	defer resp.Body.Close()
	raw, err := io.ReadAll(io.LimitReader(resp.Body, 1<<20))
	if err != nil {
		return err
	}
	if resp.StatusCode >= 300 {
		e := &apiError{Status: resp.StatusCode}
		_ = json.Unmarshal(raw, e)
		return e
	}
	return json.Unmarshal(raw, out)
}

func truncRunes(s string, n int) string {
	r := []rune(s)
	if len(r) <= n {
		return s
	}
	return string(r[:n])
}
