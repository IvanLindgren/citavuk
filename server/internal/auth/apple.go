package auth

import (
	"context"
	"crypto/ecdsa"
	"crypto/rsa"
	"crypto/x509"
	"encoding/json"
	"encoding/pem"
	"errors"
	"fmt"
	"io"
	"net/http"
	"net/url"
	"slices"
	"strings"
	"sync"
	"time"

	"github.com/golang-jwt/jwt/v5"
)

// Провайдер входа через Apple.
const ProviderApple = "apple"

const (
	appleIssuer    = "https://appleid.apple.com"
	appleKeysURL   = "https://appleid.apple.com/auth/keys"
	appleTokenURL  = "https://appleid.apple.com/auth/token"
	appleRevokeURL = "https://appleid.apple.com/auth/revoke"
	appleAuthorize = "https://appleid.apple.com/auth/authorize"
)

// Ошибки входа через Apple.
var (
	ErrAppleDisabled = errors.New("вход через Apple не настроен")
	ErrAppleToken    = errors.New("токен Apple не прошёл проверку")
	ErrAppleAudience = errors.New("токен Apple выдан другому приложению")
)

// AppleConfig — настройки из кабинета разработчика Apple.
type AppleConfig struct {
	TeamID string
	// KeyID и PrivateKey — ключ «Sign in with Apple» (.p8). Им подписывается
	// client_secret: без него нельзя обменять код и отозвать доступ при
	// удалении аккаунта, а без отзыва Apple не пропускает приложение.
	KeyID      string
	PrivateKey []byte
	// BundleIDs — приложения, которые входят нативно (iPhone).
	BundleIDs []string
	// ServicesID и RedirectURI — вход с сайта и настольных программ через браузер.
	ServicesID  string
	RedirectURI string
}

// AppleClaims — то, что нужно из identity token.
type AppleClaims struct {
	Subject       string
	Email         string
	EmailVerified bool
	// Audience — приложение, которому выдан токен: им же обменивается код.
	Audience string
}

// AppleTokens — ответ Apple на обмен кода.
type AppleTokens struct {
	IDToken      string
	RefreshToken string
}

// Apple проверяет identity token и разговаривает с Apple от имени сервера.
type Apple struct {
	cfg    AppleConfig
	key    *ecdsa.PrivateKey
	client *http.Client

	keysURL   string
	tokenURL  string
	revokeURL string

	mu        sync.RWMutex
	keys      map[string]*rsa.PublicKey
	expiresAt time.Time
}

// NewApple разбирает ключ. Неполная настройка — не ошибка: вход просто
// выключен, и кнопка Apple нигде не показывается.
func NewApple(cfg AppleConfig) (*Apple, error) {
	a := &Apple{
		cfg:       cfg,
		client:    &http.Client{Timeout: 15 * time.Second},
		keysURL:   appleKeysURL,
		tokenURL:  appleTokenURL,
		revokeURL: appleRevokeURL,
		keys:      map[string]*rsa.PublicKey{},
	}
	if cfg.TeamID == "" || cfg.KeyID == "" || len(cfg.PrivateKey) == 0 {
		return a, nil
	}
	key, err := parseAppleKey(cfg.PrivateKey)
	if err != nil {
		return a, fmt.Errorf("ключ Sign in with Apple: %w", err)
	}
	a.key = key
	return a, nil
}

func parseAppleKey(raw []byte) (*ecdsa.PrivateKey, error) {
	block, _ := pem.Decode(raw)
	if block == nil {
		return nil, errors.New("ожидался PEM (.p8)")
	}
	parsed, err := x509.ParsePKCS8PrivateKey(block.Bytes)
	if err != nil {
		return nil, err
	}
	key, ok := parsed.(*ecdsa.PrivateKey)
	if !ok {
		return nil, errors.New("ключ не ECDSA")
	}
	return key, nil
}

// Enabled — нативный вход в приложении возможен.
func (a *Apple) Enabled() bool { return a != nil && a.key != nil && len(a.cfg.BundleIDs) > 0 }

// WebEnabled — вход через браузер возможен.
func (a *Apple) WebEnabled() bool {
	return a != nil && a.key != nil && a.cfg.ServicesID != "" && a.cfg.RedirectURI != ""
}

// BundleID сообщает, принадлежит ли идентификатор нашему приложению.
func (a *Apple) BundleID(id string) bool { return a != nil && slices.Contains(a.cfg.BundleIDs, id) }

// ServicesID — client_id входа через браузер.
func (a *Apple) ServicesID() string { return a.cfg.ServicesID }

// AuthorizationURL — страница Apple для входа через браузер. Имя и почту Apple
// отдаёт только с response_mode=form_post, поэтому ответ приходит POST-ом.
func (a *Apple) AuthorizationURL(state string) string {
	values := url.Values{
		"response_type": {"code"},
		"response_mode": {"form_post"},
		"client_id":     {a.cfg.ServicesID},
		"redirect_uri":  {a.cfg.RedirectURI},
		"scope":         {"name email"},
		"state":         {state},
	}
	return appleAuthorize + "?" + values.Encode()
}

// Verify проверяет identity token: подпись, издателя, получателя и срок.
// audiences — допустимые client_id: bundle id приложения или Services ID.
func (a *Apple) Verify(ctx context.Context, idToken string, audiences []string) (*AppleClaims, error) {
	if a == nil || a.key == nil {
		return nil, ErrAppleDisabled
	}
	if strings.TrimSpace(idToken) == "" {
		return nil, ErrAppleToken
	}
	var claims jwt.MapClaims
	_, err := jwt.ParseWithClaims(idToken, &claims,
		func(t *jwt.Token) (any, error) { return a.keyFor(ctx, t) },
		// Алгоритм задан явно — иначе прошёл бы токен с alg=none.
		jwt.WithValidMethods([]string{"RS256"}),
		jwt.WithIssuer(appleIssuer),
		jwt.WithLeeway(30*time.Second),
	)
	if err != nil {
		return nil, fmt.Errorf("%w: %v", ErrAppleToken, err)
	}
	aud, _ := claims["aud"].(string)
	if !slices.Contains(audiences, aud) {
		return nil, ErrAppleAudience
	}
	out := &AppleClaims{Audience: aud}
	out.Subject, _ = claims["sub"].(string)
	out.Email, _ = claims["email"].(string)
	out.EmailVerified = truthy(claims["email_verified"])
	if out.Subject == "" {
		return nil, fmt.Errorf("%w: нет идентификатора пользователя", ErrAppleToken)
	}
	return out, nil
}

// clientSecret — короткоживущий JWT, которым сервер представляется Apple.
func (a *Apple) clientSecret(clientID string) (string, error) {
	now := time.Now()
	token := jwt.NewWithClaims(jwt.SigningMethodES256, jwt.MapClaims{
		"iss": a.cfg.TeamID,
		"iat": now.Unix(),
		"exp": now.Add(10 * time.Minute).Unix(),
		"aud": appleIssuer,
		"sub": clientID,
	})
	token.Header["kid"] = a.cfg.KeyID
	return token.SignedString(a.key)
}

// Exchange меняет authorization code на токены. redirectURI пуст для кода из
// нативного приложения и обязателен для кода из браузера.
func (a *Apple) Exchange(ctx context.Context, code, clientID, redirectURI string) (*AppleTokens, error) {
	if a == nil || a.key == nil {
		return nil, ErrAppleDisabled
	}
	secret, err := a.clientSecret(clientID)
	if err != nil {
		return nil, err
	}
	form := url.Values{
		"client_id":     {clientID},
		"client_secret": {secret},
		"code":          {code},
		"grant_type":    {"authorization_code"},
	}
	if redirectURI != "" {
		form.Set("redirect_uri", redirectURI)
	}
	var out struct {
		IDToken      string `json:"id_token"`
		RefreshToken string `json:"refresh_token"`
		Error        string `json:"error"`
	}
	if err := a.post(ctx, a.tokenURL, form, &out); err != nil {
		return nil, err
	}
	if out.Error != "" || out.IDToken == "" {
		return nil, fmt.Errorf("Apple отклонил код: %s", out.Error)
	}
	return &AppleTokens{IDToken: out.IDToken, RefreshToken: out.RefreshToken}, nil
}

// Revoke отзывает доступ приложения к Apple ID — обязательная часть удаления
// аккаунта (App Review 5.1.1(v)).
func (a *Apple) Revoke(ctx context.Context, clientID, refreshToken string) error {
	if a == nil || a.key == nil {
		return ErrAppleDisabled
	}
	secret, err := a.clientSecret(clientID)
	if err != nil {
		return err
	}
	return a.post(ctx, a.revokeURL, url.Values{
		"client_id":       {clientID},
		"client_secret":   {secret},
		"token":           {refreshToken},
		"token_type_hint": {"refresh_token"},
	}, nil)
}

func (a *Apple) post(ctx context.Context, endpoint string, form url.Values, out any) error {
	req, err := http.NewRequestWithContext(ctx, http.MethodPost, endpoint, strings.NewReader(form.Encode()))
	if err != nil {
		return err
	}
	req.Header.Set("Content-Type", "application/x-www-form-urlencoded")
	resp, err := a.client.Do(req)
	if err != nil {
		return fmt.Errorf("Apple недоступен: %w", err)
	}
	defer resp.Body.Close()
	body, err := io.ReadAll(io.LimitReader(resp.Body, 1<<20))
	if err != nil {
		return err
	}
	if resp.StatusCode != http.StatusOK {
		return fmt.Errorf("Apple ответил %s: %s", resp.Status, strings.TrimSpace(string(body)))
	}
	if out != nil && len(body) > 0 {
		return json.Unmarshal(body, out)
	}
	return nil
}

func (a *Apple) keyFor(ctx context.Context, token *jwt.Token) (*rsa.PublicKey, error) {
	kid, _ := token.Header["kid"].(string)
	if kid == "" {
		return nil, errors.New("в заголовке токена нет kid")
	}
	if key := a.cachedKey(kid); key != nil {
		return key, nil
	}
	if err := a.refresh(ctx); err != nil {
		return nil, err
	}
	if key := a.cachedKey(kid); key != nil {
		return key, nil
	}
	return nil, fmt.Errorf("Apple не публикует ключ %s", kid)
}

func (a *Apple) cachedKey(kid string) *rsa.PublicKey {
	a.mu.RLock()
	defer a.mu.RUnlock()
	if time.Now().After(a.expiresAt) {
		return nil
	}
	return a.keys[kid]
}

func (a *Apple) refresh(ctx context.Context) error {
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, a.keysURL, nil)
	if err != nil {
		return err
	}
	resp, err := a.client.Do(req)
	if err != nil {
		return fmt.Errorf("ключи Apple недоступны: %w", err)
	}
	defer resp.Body.Close()
	if resp.StatusCode != http.StatusOK {
		return fmt.Errorf("ключи Apple: %s", resp.Status)
	}
	var parsed jwksResponse
	if err := json.NewDecoder(io.LimitReader(resp.Body, 1<<20)).Decode(&parsed); err != nil {
		return fmt.Errorf("ключи Apple: неразбираемый ответ: %w", err)
	}
	keys := make(map[string]*rsa.PublicKey, len(parsed.Keys))
	for _, k := range parsed.Keys {
		if k.Kty != "RSA" || (k.Alg != "" && k.Alg != "RS256") {
			continue
		}
		if key, err := rsaKeyFromJWK(k.N, k.E); err == nil {
			keys[k.Kid] = key
		}
	}
	if len(keys) == 0 {
		return errors.New("Apple не вернул ни одного пригодного ключа")
	}
	a.mu.Lock()
	a.keys = keys
	a.expiresAt = time.Now().Add(cacheLifetime(resp.Header.Get("Cache-Control")))
	a.mu.Unlock()
	return nil
}

// WithEndpoints направляет запросы к Apple на другие адреса — для тестов,
// которые поднимают поддельный Apple.
func (a *Apple) WithEndpoints(keysURL, tokenURL, revokeURL string) *Apple {
	a.keysURL, a.tokenURL, a.revokeURL = keysURL, tokenURL, revokeURL
	return a
}
