package auth

import (
	"context"
	"crypto/rsa"
	"encoding/base64"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"math/big"
	"net/http"
	"slices"
	"strings"
	"sync"
	"time"

	"github.com/golang-jwt/jwt/v5"
)

// Провайдер входа через Google.
const ProviderGoogle = "google"

// googleCertsURL — набор публичных ключей, которыми Google подписывает ID token.
const googleCertsURL = "https://www.googleapis.com/oauth2/v3/certs"

// Допустимые значения iss. Google исторически выдаёт оба варианта.
var googleIssuers = []string{"accounts.google.com", "https://accounts.google.com"}

// Ошибки проверки токена Google.
var (
	ErrGoogleDisabled   = errors.New("вход через Google не настроен")
	ErrGoogleToken      = errors.New("токен Google не прошёл проверку")
	ErrGoogleAudience   = errors.New("токен Google выдан другому приложению")
	ErrGoogleIssuer     = errors.New("токен выдан не Google")
	ErrEmailNotVerified = errors.New("почта в аккаунте Google не подтверждена")
)

// GoogleClaims — то, что нам нужно из ID token.
type GoogleClaims struct {
	Subject       string // стабильный идентификатор пользователя у Google
	Email         string
	EmailVerified bool
	Name          string
	Picture       string
}

// GoogleVerifier проверяет ID token, выданный Google.
//
// Проверка выполняется локально по публичным ключам Google, без обращения к
// Google на каждый вход. Проверяются подпись, алгоритм, издатель, получатель,
// срок действия и подтверждённость почты — пропуск любой из этих проверок
// означает возможность войти в чужой аккаунт.
type GoogleVerifier struct {
	audiences []string
	client    *http.Client
	certsURL  string

	mu        sync.RWMutex
	keys      map[string]*rsa.PublicKey
	expiresAt time.Time
}

// NewGoogleVerifier создаёт проверяющего для перечисленных client_id.
// Пустой список означает, что вход через Google выключен.
func NewGoogleVerifier(audiences []string) *GoogleVerifier {
	return &GoogleVerifier{
		audiences: slices.Clone(audiences),
		client:    &http.Client{Timeout: 10 * time.Second},
		certsURL:  googleCertsURL,
		keys:      map[string]*rsa.PublicKey{},
	}
}

// Enabled сообщает, настроен ли вход через Google.
func (v *GoogleVerifier) Enabled() bool { return v != nil && len(v.audiences) > 0 }

// Verify проверяет токен и возвращает сведения о пользователе.
func (v *GoogleVerifier) Verify(ctx context.Context, idToken string) (*GoogleClaims, error) {
	if !v.Enabled() {
		return nil, ErrGoogleDisabled
	}
	if strings.TrimSpace(idToken) == "" {
		return nil, ErrGoogleToken
	}

	var claims jwt.MapClaims
	_, err := jwt.ParseWithClaims(idToken, &claims,
		func(t *jwt.Token) (any, error) { return v.keyFor(ctx, t) },
		// Список допустимых алгоритмов задаётся явно. Без него токен с
		// alg=none или alg=HS256, подписанный публичным ключом как секретом,
		// прошёл бы проверку — классический способ подделать чужой JWT.
		jwt.WithValidMethods([]string{"RS256"}),
		jwt.WithIssuedAt(),
		// Небольшой допуск на расхождение часов клиента и сервера.
		jwt.WithLeeway(30*time.Second),
	)
	if err != nil {
		return nil, fmt.Errorf("%w: %v", ErrGoogleToken, err)
	}

	iss, _ := claims["iss"].(string)
	if !slices.Contains(googleIssuers, iss) {
		return nil, ErrGoogleIssuer
	}
	if !v.audienceAllowed(claims["aud"]) {
		return nil, ErrGoogleAudience
	}

	sub, _ := claims["sub"].(string)
	if sub == "" {
		return nil, fmt.Errorf("%w: нет идентификатора пользователя", ErrGoogleToken)
	}

	out := &GoogleClaims{Subject: sub}
	out.Email, _ = claims["email"].(string)
	out.Name, _ = claims["name"].(string)
	out.Picture, _ = claims["picture"].(string)
	out.EmailVerified = truthy(claims["email_verified"])

	if out.Email == "" {
		return nil, fmt.Errorf("%w: в токене нет почты", ErrGoogleToken)
	}
	// Неподтверждённая почта опасна: иначе можно завести аккаунт Google на
	// чужой адрес и через него войти в уже существующий аккаунт Citavuk.
	if !out.EmailVerified {
		return nil, ErrEmailNotVerified
	}
	return out, nil
}

// audienceAllowed сверяет aud со списком известных client_id.
//
// aud приходит либо строкой, либо массивом строк — спецификация JWT допускает
// оба варианта, и обрабатывать нужно оба.
func (v *GoogleVerifier) audienceAllowed(aud any) bool {
	switch value := aud.(type) {
	case string:
		return slices.Contains(v.audiences, value)
	case []any:
		for _, item := range value {
			if s, ok := item.(string); ok && slices.Contains(v.audiences, s) {
				return true
			}
		}
	case []string:
		for _, s := range value {
			if slices.Contains(v.audiences, s) {
				return true
			}
		}
	}
	return false
}

// truthy приводит email_verified к bool: Google присылает его то булевым, то
// строкой "true".
func truthy(v any) bool {
	switch value := v.(type) {
	case bool:
		return value
	case string:
		return value == "true"
	}
	return false
}

// keyFor возвращает публичный ключ по kid из заголовка токена.
func (v *GoogleVerifier) keyFor(ctx context.Context, token *jwt.Token) (*rsa.PublicKey, error) {
	kid, _ := token.Header["kid"].(string)
	if kid == "" {
		return nil, errors.New("в заголовке токена нет kid")
	}

	if key := v.cachedKey(kid); key != nil {
		return key, nil
	}
	// Ключа нет либо кеш устарел. Google периодически меняет ключи, поэтому
	// промах — обычная ситуация, а не ошибка.
	if err := v.refresh(ctx); err != nil {
		return nil, err
	}
	if key := v.cachedKey(kid); key != nil {
		return key, nil
	}
	return nil, fmt.Errorf("Google не публикует ключ %s", kid)
}

func (v *GoogleVerifier) cachedKey(kid string) *rsa.PublicKey {
	v.mu.RLock()
	defer v.mu.RUnlock()
	if time.Now().After(v.expiresAt) {
		return nil
	}
	return v.keys[kid]
}

type jwksResponse struct {
	Keys []struct {
		Kid string `json:"kid"`
		Kty string `json:"kty"`
		Alg string `json:"alg"`
		Use string `json:"use"`
		N   string `json:"n"`
		E   string `json:"e"`
	} `json:"keys"`
}

// refresh перечитывает набор ключей Google.
func (v *GoogleVerifier) refresh(ctx context.Context) error {
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, v.certsURL, nil)
	if err != nil {
		return err
	}
	resp, err := v.client.Do(req)
	if err != nil {
		return fmt.Errorf("ключи Google недоступны: %w", err)
	}
	defer resp.Body.Close()
	if resp.StatusCode != http.StatusOK {
		return fmt.Errorf("ключи Google: %s", resp.Status)
	}
	body, err := io.ReadAll(io.LimitReader(resp.Body, 1<<20))
	if err != nil {
		return err
	}

	var parsed jwksResponse
	if err := json.Unmarshal(body, &parsed); err != nil {
		return fmt.Errorf("ключи Google: неразбираемый ответ: %w", err)
	}

	keys := make(map[string]*rsa.PublicKey, len(parsed.Keys))
	for _, k := range parsed.Keys {
		if k.Kty != "RSA" || (k.Alg != "" && k.Alg != "RS256") {
			continue
		}
		key, err := rsaKeyFromJWK(k.N, k.E)
		if err != nil {
			continue
		}
		keys[k.Kid] = key
	}
	if len(keys) == 0 {
		return errors.New("Google не вернул ни одного пригодного ключа")
	}

	v.mu.Lock()
	v.keys = keys
	v.expiresAt = time.Now().Add(cacheLifetime(resp.Header.Get("Cache-Control")))
	v.mu.Unlock()
	return nil
}

// rsaKeyFromJWK собирает публичный ключ из base64url-компонентов JWK.
func rsaKeyFromJWK(nB64, eB64 string) (*rsa.PublicKey, error) {
	n, err := base64.RawURLEncoding.DecodeString(strings.TrimRight(nB64, "="))
	if err != nil {
		return nil, err
	}
	e, err := base64.RawURLEncoding.DecodeString(strings.TrimRight(eB64, "="))
	if err != nil {
		return nil, err
	}
	if len(n) == 0 || len(e) == 0 || len(e) > 8 {
		return nil, errors.New("некорректные параметры ключа")
	}
	exponent := 0
	for _, b := range e {
		exponent = exponent<<8 | int(b)
	}
	if exponent < 3 {
		return nil, errors.New("недопустимая экспонента ключа")
	}
	return &rsa.PublicKey{N: new(big.Int).SetBytes(n), E: exponent}, nil
}

// cacheLifetime достаёт max-age из Cache-Control.
//
// Google указывает срок жизни ключей сам; при отсутствии заголовка берётся
// умеренный час — достаточно короткий, чтобы ротация ключей подхватилась.
func cacheLifetime(header string) time.Duration {
	const fallback = time.Hour
	for _, part := range strings.Split(header, ",") {
		part = strings.TrimSpace(part)
		value, ok := strings.CutPrefix(part, "max-age=")
		if !ok {
			continue
		}
		var seconds int
		if _, err := fmt.Sscanf(value, "%d", &seconds); err != nil || seconds <= 0 {
			continue
		}
		d := time.Duration(seconds) * time.Second
		if d > 24*time.Hour {
			d = 24 * time.Hour
		}
		return d
	}
	return fallback
}
