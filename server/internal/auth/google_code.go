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

// googleTokenURL — точка обмена authorization code на токены.
const googleTokenURL = "https://oauth2.googleapis.com/token"

var (
	ErrGoogleCodeDisabled = errors.New("вход через Google для настольных приложений не настроен")
	ErrGoogleCode         = errors.New("Google не подтвердил authorization code")
)

// GoogleCodeExchanger выполняет серверную половину authorization-code flow.
//
// Нужен только настольным приложениям. У Android есть нативный SDK, который сам
// приносит готовый ID token, а на Windows и Linux такого SDK нет: приложение
// открывает системный браузер и получает обратно лишь код.
//
// Обмен делает сервер, а не приложение, по двум причинам. Client secret не
// должен лежать в файле, который пользователь распакует за минуту. И ответ
// Google с ID token не проходит через клиента — сервер получает его напрямую по
// TLS от Google, и подменить его на пути некому.
//
// PKCE обязателен. Без него перехваченный код (а он приходит на локальный
// сокет по открытому HTTP) обменивался бы кем угодно: код одноразовый, но
// выигрывает тот, кто успел первым.
type GoogleCodeExchanger struct {
	clientID     string
	clientSecret string
	client       *http.Client
	tokenURL     string
}

func NewGoogleCodeExchanger(clientID, clientSecret string) *GoogleCodeExchanger {
	return &GoogleCodeExchanger{
		clientID:     strings.TrimSpace(clientID),
		clientSecret: strings.TrimSpace(clientSecret),
		client:       &http.Client{Timeout: 12 * time.Second},
		tokenURL:     googleTokenURL,
	}
}

func (c *GoogleCodeExchanger) Enabled() bool {
	return c != nil && c.clientID != "" && c.clientSecret != ""
}

// ClientID — публичная часть, её приложение получает с сервера и подставляет в
// адрес авторизации. Секретом не является.
func (c *GoogleCodeExchanger) ClientID() string {
	if c == nil {
		return ""
	}
	return c.clientID
}

// Exchange возвращает ID token. Проверять его — задача GoogleVerifier: то, что
// токен пришёл прямо от Google, ещё не значит, что он выписан нашему клиенту.
func (c *GoogleCodeExchanger) Exchange(
	ctx context.Context,
	code, codeVerifier, redirectURI string,
) (string, error) {
	if !c.Enabled() {
		return "", ErrGoogleCodeDisabled
	}
	code = strings.TrimSpace(code)
	codeVerifier = strings.TrimSpace(codeVerifier)
	if code == "" || codeVerifier == "" || strings.TrimSpace(redirectURI) == "" {
		return "", fmt.Errorf("%w: неполный запрос", ErrGoogleCode)
	}

	form := url.Values{
		"grant_type":    {"authorization_code"},
		"code":          {code},
		"code_verifier": {codeVerifier},
		"redirect_uri":  {redirectURI},
		"client_id":     {c.clientID},
		"client_secret": {c.clientSecret},
	}
	req, err := http.NewRequestWithContext(
		ctx,
		http.MethodPost,
		c.tokenURL,
		strings.NewReader(form.Encode()),
	)
	if err != nil {
		return "", err
	}
	req.Header.Set("Content-Type", "application/x-www-form-urlencoded")

	resp, err := c.client.Do(req)
	if err != nil {
		return "", fmt.Errorf("%w: обмен кода: %v", ErrGoogleCode, err)
	}
	defer resp.Body.Close()

	body, err := io.ReadAll(io.LimitReader(resp.Body, 128<<10))
	if err != nil {
		return "", fmt.Errorf("%w: чтение ответа", ErrGoogleCode)
	}
	if resp.StatusCode < 200 || resp.StatusCode >= 300 {
		// Google описывает причину отказа в теле; она попадает в журнал, а
		// пользователю уходит общая формулировка.
		var failure struct {
			Error       string `json:"error"`
			Description string `json:"error_description"`
		}
		_ = json.Unmarshal(body, &failure)
		return "", fmt.Errorf("%w: %s (%s %s)",
			ErrGoogleCode, resp.Status, failure.Error, failure.Description)
	}

	var token struct {
		IDToken string `json:"id_token"`
	}
	if err := json.Unmarshal(body, &token); err != nil {
		return "", fmt.Errorf("%w: повреждённый ответ token endpoint", ErrGoogleCode)
	}
	if token.IDToken == "" {
		// Такое бывает, если в запросе авторизации не было scope=openid.
		return "", fmt.Errorf("%w: в ответе нет id_token", ErrGoogleCode)
	}
	return token.IDToken, nil
}
