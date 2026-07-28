package auth

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"net/http"
	"net/url"
	"strings"
	"time"
)

const (
	ProviderYandex     = "yandex"
	yandexAuthorizeURL = "https://oauth.yandex.ru/authorize"
	yandexTokenURL     = "https://oauth.yandex.ru/token"
	yandexInfoURL      = "https://login.yandex.ru/info"
)

var (
	ErrYandexDisabled = errors.New("вход через Яндекс не настроен")
	ErrYandexToken    = errors.New("Яндекс не подтвердил авторизацию")
	ErrYandexEmail    = errors.New("Яндекс не вернул адрес почты")
)

type YandexClaims struct {
	Subject string
	Email   string
	Name    string
}

// YandexClient выполняет только серверную часть authorization-code flow.
// Client secret никогда не передаётся в браузер или мобильное приложение.
type YandexClient struct {
	clientID     string
	clientSecret string
	redirectURI  string
	client       *http.Client
	tokenURL     string
	infoURL      string
}

func NewYandexClient(clientID, clientSecret, redirectURI string) *YandexClient {
	return &YandexClient{
		clientID:     strings.TrimSpace(clientID),
		clientSecret: strings.TrimSpace(clientSecret),
		redirectURI:  strings.TrimSpace(redirectURI),
		client:       &http.Client{Timeout: 12 * time.Second},
		tokenURL:     yandexTokenURL,
		infoURL:      yandexInfoURL,
	}
}

func (c *YandexClient) Enabled() bool {
	return c != nil && c.clientID != "" && c.clientSecret != "" && c.redirectURI != ""
}

func (c *YandexClient) AuthorizationURL(state string) (string, error) {
	if !c.Enabled() {
		return "", ErrYandexDisabled
	}
	values := url.Values{
		"response_type": {"code"},
		"client_id":     {c.clientID},
		"redirect_uri":  {c.redirectURI},
		"state":         {state},
		"scope":         {"login:info login:email"},
	}
	return yandexAuthorizeURL + "?" + values.Encode(), nil
}

func (c *YandexClient) Exchange(ctx context.Context, code string) (*YandexClaims, error) {
	if !c.Enabled() {
		return nil, ErrYandexDisabled
	}
	if strings.TrimSpace(code) == "" {
		return nil, ErrYandexToken
	}

	form := url.Values{
		"grant_type":   {"authorization_code"},
		"code":         {code},
		"redirect_uri": {c.redirectURI},
	}
	req, err := http.NewRequestWithContext(
		ctx,
		http.MethodPost,
		c.tokenURL,
		strings.NewReader(form.Encode()),
	)
	if err != nil {
		return nil, err
	}
	req.SetBasicAuth(c.clientID, c.clientSecret)
	req.Header.Set("Content-Type", "application/x-www-form-urlencoded")

	resp, err := c.client.Do(req)
	if err != nil {
		return nil, fmt.Errorf("%w: обмен кода: %v", ErrYandexToken, err)
	}
	defer resp.Body.Close()
	body, err := io.ReadAll(io.LimitReader(resp.Body, 64<<10))
	if err != nil {
		return nil, fmt.Errorf("%w: чтение токена", ErrYandexToken)
	}
	if resp.StatusCode < 200 || resp.StatusCode >= 300 {
		return nil, fmt.Errorf("%w: token endpoint вернул %s", ErrYandexToken, resp.Status)
	}
	var token struct {
		AccessToken string `json:"access_token"`
		TokenType   string `json:"token_type"`
	}
	if err := json.Unmarshal(body, &token); err != nil || token.AccessToken == "" {
		return nil, fmt.Errorf("%w: повреждённый ответ token endpoint", ErrYandexToken)
	}

	infoURL, err := url.Parse(c.infoURL)
	if err != nil {
		return nil, err
	}
	query := infoURL.Query()
	query.Set("format", "json")
	infoURL.RawQuery = query.Encode()
	infoReq, err := http.NewRequestWithContext(ctx, http.MethodGet, infoURL.String(), nil)
	if err != nil {
		return nil, err
	}
	infoReq.Header.Set("Authorization", "OAuth "+token.AccessToken)

	infoResp, err := c.client.Do(infoReq)
	if err != nil {
		return nil, fmt.Errorf("%w: профиль недоступен: %v", ErrYandexToken, err)
	}
	defer infoResp.Body.Close()
	infoBody, err := io.ReadAll(io.LimitReader(infoResp.Body, 128<<10))
	if err != nil {
		return nil, fmt.Errorf("%w: чтение профиля", ErrYandexToken)
	}
	if infoResp.StatusCode < 200 || infoResp.StatusCode >= 300 {
		return nil, fmt.Errorf("%w: профиль вернул %s", ErrYandexToken, infoResp.Status)
	}

	var profile struct {
		ID           string   `json:"id"`
		DefaultEmail string   `json:"default_email"`
		Emails       []string `json:"emails"`
		DisplayName  string   `json:"display_name"`
		RealName     string   `json:"real_name"`
		FirstName    string   `json:"first_name"`
		LastName     string   `json:"last_name"`
	}
	if err := json.Unmarshal(infoBody, &profile); err != nil {
		return nil, fmt.Errorf("%w: повреждённый профиль", ErrYandexToken)
	}
	if profile.ID == "" {
		return nil, fmt.Errorf("%w: в профиле нет id", ErrYandexToken)
	}
	email := strings.TrimSpace(profile.DefaultEmail)
	if email == "" && len(profile.Emails) > 0 {
		email = strings.TrimSpace(profile.Emails[0])
	}
	if email == "" {
		return nil, ErrYandexEmail
	}
	name := strings.TrimSpace(profile.RealName)
	if name == "" {
		name = strings.TrimSpace(profile.DisplayName)
	}
	if name == "" {
		name = strings.TrimSpace(profile.FirstName + " " + profile.LastName)
	}
	return &YandexClaims{Subject: profile.ID, Email: email, Name: name}, nil
}
