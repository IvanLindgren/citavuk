package api

import (
	"context"
	"encoding/json"
	"errors"
	"log/slog"
	"net/http"
	"strings"
	"time"

	"github.com/citavuk/server/internal/auth"
	"github.com/citavuk/server/internal/store"
)

// Sign in with Apple.
//
// На iPhone вход нативный: приложение получает от Apple identity token и
// authorization code и приносит их сюда. С сайта и из настольных программ —
// через браузер: Apple возвращает POST-ом на наш callback, мы выдаём
// одноразовый код и отправляем браузер обратно, как при входе через Яндекс.
//
// Код обменивается на refresh token сразу: без него нельзя отозвать доступ при
// удалении аккаунта, а Apple требует отзыв (App Review 5.1.1(v)).

type appleLoginRequest struct {
	IdentityToken     string `json:"identityToken"`
	AuthorizationCode string `json:"authorizationCode"`
	// Имя Apple сообщает приложению только при самом первом входе и не кладёт
	// в токен, поэтому оно приходит отдельно.
	GivenName  string     `json:"givenName"`
	FamilyName string     `json:"familyName"`
	Device     deviceInfo `json:"device"`
}

func (s *Server) handleAppleLogin(w http.ResponseWriter, r *http.Request) {
	if !s.apple.Enabled() {
		writeError(w, http.StatusNotImplemented, codeBadRequest,
			"Вход через Apple на этом сервере не настроен.")
		return
	}
	var req appleLoginRequest
	if err := decodeJSON(w, r, &req, 32<<10); err != nil {
		writeError(w, http.StatusBadRequest, codeBadRequest, "Не удалось прочитать запрос.")
		return
	}
	claims, err := s.apple.Verify(r.Context(), req.IdentityToken, s.cfg.AppleBundleIDs)
	if err != nil {
		slog.Warn("отклонён токен Apple", "err", err)
		writeError(w, http.StatusUnauthorized, codeUnauthorized,
			"Не удалось подтвердить Apple ID.")
		return
	}
	name := strings.TrimSpace(req.GivenName + " " + req.FamilyName)
	user, err := s.appleUser(r.Context(), claims, name)
	if err != nil {
		s.writeAppleUserError(w, err)
		return
	}
	s.saveAppleGrant(r.Context(), claims, req.AuthorizationCode, claims.Audience, "")
	s.issueSession(w, r, user, req.Device)
}

func (s *Server) handleAppleStart(w http.ResponseWriter, r *http.Request) {
	if !s.apple.WebEnabled() {
		writeError(w, http.StatusNotImplemented, codeBadRequest,
			"Вход через Apple на этом сервере не настроен.")
		return
	}
	var req yandexStartRequest
	if err := decodeJSON(w, r, &req, 8<<10); err != nil {
		writeError(w, http.StatusBadRequest, codeBadRequest, "Не удалось прочитать запрос.")
		return
	}
	// Возврат проверяется так же строго, как у Яндекса: после callback по этому
	// адресу уйдёт одноразовый код входа.
	var returnURL string
	switch req.ReturnTarget {
	case "desktop":
		parsed, err := parseLoopbackURL(req.ReturnURL)
		if err != nil {
			writeError(w, http.StatusBadRequest, codeBadRequest,
				"Адрес возврата должен вести на 127.0.0.1.")
			return
		}
		returnURL = parsed
	case "web":
		if strings.TrimSpace(req.ReturnURL) != "" {
			parsed, err := parseTrustedWebReturn(req.ReturnURL, s.cfg.AllowedOrigins)
			if err != nil {
				writeError(w, http.StatusBadRequest, codeBadRequest,
					"Адрес возврата не принадлежит доверенному сайту.")
				return
			}
			returnURL = parsed
		}
	default:
		writeError(w, http.StatusBadRequest, codeBadRequest,
			"Неизвестное приложение для возврата после входа.")
		return
	}

	state, stateHash, err := auth.NewSessionToken()
	if err == nil {
		err = s.store.PutOAuthState(r.Context(), stateHash, auth.ProviderApple, store.OAuthState{
			ReturnTarget:   req.ReturnTarget,
			ReturnURL:      returnURL,
			DeviceID:       req.Device.ID,
			DeviceName:     req.Device.Name,
			DevicePlatform: req.Device.Platform,
		}, 10*time.Minute)
	}
	if err != nil {
		slog.Error("сохранение Apple OAuth state", "err", err)
		writeError(w, http.StatusInternalServerError, codeInternal,
			"Не удалось начать вход через Apple.")
		return
	}
	writeJSON(w, http.StatusOK, map[string]string{"authorizationUrl": s.apple.AuthorizationURL(state)})
}

// handleAppleCallback принимает form_post от Apple.
func (s *Server) handleAppleCallback(w http.ResponseWriter, r *http.Request) {
	r.Body = http.MaxBytesReader(w, r.Body, 64<<10)
	if err := r.ParseForm(); err != nil {
		writeError(w, http.StatusBadRequest, codeBadRequest, "Apple прислал непонятный ответ.")
		return
	}
	stateToken := strings.TrimSpace(r.PostForm.Get("state"))
	if stateToken == "" {
		writeError(w, http.StatusBadRequest, codeBadRequest, "Apple не вернул состояние авторизации.")
		return
	}
	state, err := s.store.ConsumeOAuthState(r.Context(), auth.HashToken(stateToken), auth.ProviderApple)
	if errors.Is(err, store.ErrAuthTokenInvalid) {
		writeError(w, http.StatusBadRequest, codeTokenInvalid, "Попытка входа истекла. Начните заново.")
		return
	}
	if err != nil {
		slog.Error("чтение Apple OAuth state", "err", err)
		writeError(w, http.StatusInternalServerError, codeInternal, "Не удалось завершить вход через Apple.")
		return
	}
	if r.PostForm.Get("error") != "" {
		s.redirectOAuthResult(w, r, auth.ProviderApple, state, "", "Вход через Apple отменён.")
		return
	}

	tokens, err := s.apple.Exchange(r.Context(), r.PostForm.Get("code"), s.apple.ServicesID(), s.cfg.AppleRedirectURI)
	var claims *auth.AppleClaims
	if err == nil {
		claims, err = s.apple.Verify(r.Context(), tokens.IDToken, []string{s.apple.ServicesID()})
	}
	if err != nil {
		slog.Warn("Apple отклонил вход через браузер", "err", err)
		s.redirectOAuthResult(w, r, auth.ProviderApple, state, "", "Не удалось подтвердить Apple ID.")
		return
	}
	user, err := s.appleUser(r.Context(), claims, appleFormName(r.PostForm.Get("user")))
	if err != nil {
		slog.Warn("вход через Apple (браузер)", "err", err)
		s.redirectOAuthResult(w, r, auth.ProviderApple, state, "", appleUserMessage(err))
		return
	}
	if tokens.RefreshToken != "" {
		if err := s.store.SaveIdentityGrant(r.Context(), auth.ProviderApple, claims.Subject,
			s.apple.ServicesID(), tokens.RefreshToken); err != nil {
			slog.Warn("сохранение доступа Apple", "err", err)
		}
	}

	completion, completionHash, err := auth.NewSessionToken()
	if err == nil {
		err = s.store.PutOAuthCompletion(r.Context(), completionHash, user.ID, state, 5*time.Minute)
	}
	if err != nil {
		slog.Error("создание кода завершения Apple OAuth", "err", err)
		s.redirectOAuthResult(w, r, auth.ProviderApple, state, "", "Не удалось завершить вход через Apple.")
		return
	}
	s.redirectOAuthResult(w, r, auth.ProviderApple, state, completion, "")
}

func (s *Server) handleAppleComplete(w http.ResponseWriter, r *http.Request) {
	s.completeOAuth(w, r, "Apple")
}

var (
	errAppleNoEmail       = errors.New("Apple не передал почту")
	errAppleEmailUnproven = errors.New("почта Apple ID не подтверждена")
)

// appleUser находит или заводит аккаунт. Почта у Apple бывает подменной
// (privaterelay.appleid.com) — это обычный рабочий адрес, письма на него
// пересылаются на настоящий.
func (s *Server) appleUser(ctx context.Context, claims *auth.AppleClaims, name string) (*store.User, error) {
	if claims.Email == "" {
		// Apple кладёт почту в каждый токен, если её разрешили при первом входе.
		// Без неё можно только узнать того, кто уже входил.
		user, err := s.store.UserByIdentity(ctx, auth.ProviderApple, claims.Subject)
		if errors.Is(err, store.ErrUserNotFound) {
			return nil, errAppleNoEmail
		}
		return user, err
	}
	// Неподтверждённая почта позволила бы войти в чужой аккаунт с тем же адресом.
	if !claims.EmailVerified {
		return nil, errAppleEmailUnproven
	}
	return s.linkOrCreateExternalUser(ctx, auth.ProviderApple, claims.Subject, claims.Email, name)
}

func appleUserMessage(err error) string {
	switch {
	case errors.Is(err, errAppleNoEmail):
		return "Apple не передал почту. Разреши доступ к почте при входе."
	case errors.Is(err, errAppleEmailUnproven):
		return "Почта Apple ID не подтверждена."
	}
	return "Не удалось войти через Apple."
}

func (s *Server) writeAppleUserError(w http.ResponseWriter, err error) {
	if errors.Is(err, errAppleNoEmail) || errors.Is(err, errAppleEmailUnproven) {
		writeError(w, http.StatusForbidden, codeForbidden, appleUserMessage(err))
		return
	}
	slog.Error("вход через Apple", "err", err)
	writeError(w, http.StatusInternalServerError, codeInternal, "Не удалось войти через Apple.")
}

// saveAppleGrant обменивает код из приложения на refresh token. Неудача не
// мешает входу: личность уже подтверждена токеном, а без refresh token мы
// лишь не сможем отозвать доступ — это пишется в журнал.
func (s *Server) saveAppleGrant(ctx context.Context, claims *auth.AppleClaims, code, clientID, redirectURI string) {
	if strings.TrimSpace(code) == "" {
		return
	}
	tokens, err := s.apple.Exchange(ctx, code, clientID, redirectURI)
	if err == nil && tokens.RefreshToken != "" {
		err = s.store.SaveIdentityGrant(ctx, auth.ProviderApple, claims.Subject, clientID, tokens.RefreshToken)
	}
	if err != nil {
		slog.Warn("доступ Apple не сохранён", "err", err)
	}
}

// revokeAppleGrants отзывает доступ приложения к Apple ID перед удалением аккаунта.
func (s *Server) revokeAppleGrants(ctx context.Context, user *store.User) {
	grants, err := s.store.IdentityGrants(ctx, user.ID, auth.ProviderApple)
	if err != nil {
		slog.Warn("доступы Apple при удалении аккаунта", "err", err)
		return
	}
	for _, grant := range grants {
		if err := s.apple.Revoke(ctx, grant.ClientID, grant.RefreshToken); err != nil {
			slog.Warn("отзыв доступа Apple", "err", err)
		}
	}
}

// appleFormName достаёт имя из поля user, которое Apple присылает в callback
// только при первом входе: {"name":{"firstName":"…","lastName":"…"}}.
func appleFormName(raw string) string {
	var payload struct {
		Name struct {
			FirstName string `json:"firstName"`
			LastName  string `json:"lastName"`
		} `json:"name"`
	}
	if raw == "" || json.Unmarshal([]byte(raw), &payload) != nil {
		return ""
	}
	return strings.TrimSpace(payload.Name.FirstName + " " + payload.Name.LastName)
}
