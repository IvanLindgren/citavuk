package api

import (
	"context"
	"errors"
	"log/slog"
	"net/http"
	"net/url"
	"strings"
	"time"

	"github.com/citavuk/server/internal/auth"
	"github.com/citavuk/server/internal/store"
)

type yandexStartRequest struct {
	ReturnTarget string `json:"returnTarget"`

	// Desktop передаёт loopback; доверенное соседнее web-приложение — HTTPS
	// /auth/return на origin из CITAVUK_ALLOWED_ORIGINS. Оба адреса проверяются
	// до сохранения OAuth state.
	ReturnURL string     `json:"returnUrl"`
	Device    deviceInfo `json:"device"`
}

type yandexCompleteRequest struct {
	Code string `json:"code"`
}

func (s *Server) handleYandexStart(w http.ResponseWriter, r *http.Request) {
	if !s.yandex.Enabled() {
		writeError(w, http.StatusNotImplemented, codeBadRequest,
			"Вход через Яндекс на этом сервере не настроен.")
		return
	}
	var req yandexStartRequest
	if err := decodeJSON(w, r, &req, 8<<10); err != nil {
		writeError(w, http.StatusBadRequest, codeBadRequest,
			"Не удалось прочитать запрос.")
		return
	}
	switch req.ReturnTarget {
	case "web", "mobile", "desktop":
	default:
		writeError(w, http.StatusBadRequest, codeBadRequest,
			"Неизвестное приложение для возврата после входа.")
		return
	}

	// Адрес проверяется до сохранения: после callback он получит одноразовый
	// completion code, поэтому непроверенное значение стало бы открытым редиректом.
	var returnURL string
	switch {
	case req.ReturnTarget == "desktop":
		parsed, err := parseLoopbackURL(req.ReturnURL)
		if err != nil {
			writeError(w, http.StatusBadRequest, codeBadRequest,
				"Адрес возврата должен вести на 127.0.0.1.")
			return
		}
		returnURL = parsed
	case req.ReturnTarget == "web" && strings.TrimSpace(req.ReturnURL) != "":
		parsed, err := parseTrustedWebReturn(req.ReturnURL, s.cfg.AllowedOrigins)
		if err != nil {
			writeError(w, http.StatusBadRequest, codeBadRequest,
				"Адрес возврата не принадлежит доверенному сайту.")
			return
		}
		returnURL = parsed
	}

	state, stateHash, err := auth.NewSessionToken()
	if err != nil {
		writeError(w, http.StatusInternalServerError, codeInternal,
			"Не удалось начать вход через Яндекс.")
		return
	}
	if err := s.store.PutOAuthState(
		r.Context(),
		stateHash,
		auth.ProviderYandex,
		store.OAuthState{
			ReturnTarget:   req.ReturnTarget,
			ReturnURL:      returnURL,
			DeviceID:       req.Device.ID,
			DeviceName:     req.Device.Name,
			DevicePlatform: req.Device.Platform,
		},
		10*time.Minute,
	); err != nil {
		slog.Error("сохранение Yandex OAuth state", "err", err)
		writeError(w, http.StatusInternalServerError, codeInternal,
			"Не удалось начать вход через Яндекс.")
		return
	}
	authorizationURL, err := s.yandex.AuthorizationURL(state)
	if err != nil {
		writeError(w, http.StatusInternalServerError, codeInternal,
			"Не удалось подготовить вход через Яндекс.")
		return
	}
	writeJSON(w, http.StatusOK, map[string]string{"authorizationUrl": authorizationURL})
}

func (s *Server) handleYandexCallback(w http.ResponseWriter, r *http.Request) {
	stateToken := strings.TrimSpace(r.URL.Query().Get("state"))
	if stateToken == "" {
		writeError(w, http.StatusBadRequest, codeBadRequest,
			"Яндекс не вернул состояние авторизации.")
		return
	}
	state, err := s.store.ConsumeOAuthState(
		r.Context(),
		auth.HashToken(stateToken),
		auth.ProviderYandex,
	)
	if errors.Is(err, store.ErrAuthTokenInvalid) {
		writeError(w, http.StatusBadRequest, codeTokenInvalid,
			"Попытка входа истекла. Начните заново.")
		return
	}
	if err != nil {
		slog.Error("чтение Yandex OAuth state", "err", err)
		writeError(w, http.StatusInternalServerError, codeInternal,
			"Не удалось завершить вход через Яндекс.")
		return
	}

	if providerError := strings.TrimSpace(r.URL.Query().Get("error")); providerError != "" {
		s.redirectOAuthResult(w, r, state, "", "Вход через Яндекс отменён.")
		return
	}
	claims, err := s.yandex.Exchange(r.Context(), r.URL.Query().Get("code"))
	if err != nil {
		slog.Warn("Яндекс отклонил OAuth callback", "err", err)
		s.redirectOAuthResult(w, r, state, "",
			"Не удалось подтвердить аккаунт Яндекса.")
		return
	}
	user, err := s.linkOrCreateExternalUser(
		r.Context(),
		auth.ProviderYandex,
		claims.Subject,
		claims.Email,
		claims.Name,
	)
	if err != nil {
		slog.Error("вход через Яндекс", "err", err)
		s.redirectOAuthResult(w, r, state, "",
			"Не удалось войти через Яндекс.")
		return
	}

	completion, completionHash, err := auth.NewSessionToken()
	if err == nil {
		err = s.store.PutOAuthCompletion(
			r.Context(),
			completionHash,
			user.ID,
			state,
			5*time.Minute,
		)
	}
	if err != nil {
		slog.Error("создание кода завершения Yandex OAuth", "err", err)
		s.redirectOAuthResult(w, r, state, "",
			"Не удалось завершить вход через Яндекс.")
		return
	}
	s.redirectOAuthResult(w, r, state, completion, "")
}

// redirectOAuthResult отправляет браузер обратно в то приложение, которое
// начинало вход: по deep link на Android, на локальный сокет у настольных
// программ, на страницу сайта в остальных случаях.
func (s *Server) redirectOAuthResult(
	w http.ResponseWriter,
	r *http.Request,
	state *store.OAuthState,
	code, message string,
) {
	var destination string
	switch {
	case state.ReturnTarget == "mobile":
		destination = "citavuk://auth/yandex"
	case state.ReturnTarget == "web" && state.ReturnURL != "":
		// HTTPS origin и точный путь проверены в handleYandexStart.
		destination = state.ReturnURL
	case state.ReturnTarget == "desktop" && state.ReturnURL != "":
		// Адрес уже проверен при начале входа, см. handleYandexStart.
		destination = state.ReturnURL
	default:
		destination = strings.TrimRight(s.cfg.WebURL, "/") + "/auth/yandex"
	}
	target, err := url.Parse(destination)
	if err != nil {
		writeError(w, http.StatusBadRequest, codeBadRequest,
			"Не удалось подготовить возврат после входа.")
		return
	}
	values := target.Query()
	if code != "" {
		values.Set("code", code)
	}
	if message != "" {
		values.Set("error", message)
	}
	target.RawQuery = values.Encode()
	http.Redirect(w, r, target.String(), http.StatusSeeOther)
}

func (s *Server) handleYandexComplete(w http.ResponseWriter, r *http.Request) {
	var req yandexCompleteRequest
	if err := decodeJSON(w, r, &req, 8<<10); err != nil {
		writeError(w, http.StatusBadRequest, codeBadRequest,
			"Не удалось прочитать запрос.")
		return
	}
	completion, err := s.store.ConsumeOAuthCompletion(
		r.Context(),
		auth.HashToken(strings.TrimSpace(req.Code)),
	)
	if errors.Is(err, store.ErrAuthTokenInvalid) {
		writeError(w, http.StatusBadRequest, codeTokenInvalid,
			"Код входа недействителен или уже использован.")
		return
	}
	if err != nil {
		slog.Error("завершение Yandex OAuth", "err", err)
		writeError(w, http.StatusInternalServerError, codeInternal,
			"Не удалось завершить вход через Яндекс.")
		return
	}
	s.issueSession(w, r, completion.User, deviceInfo{
		ID:       completion.DeviceID,
		Name:     completion.DeviceName,
		Platform: completion.DevicePlatform,
	})
}

// linkOrCreateExternalUser связывает подтверждённую провайдером почту с
// существующим аккаунтом либо создаёт новый аккаунт без пароля.
func (s *Server) linkOrCreateExternalUser(
	ctx context.Context,
	provider, subject, email, name string,
) (*store.User, error) {
	user, err := s.store.UserByIdentity(ctx, provider, subject)
	if err == nil {
		if !user.EmailVerified {
			if err := s.store.MarkEmailVerified(ctx, user.ID); err != nil {
				return nil, err
			}
			user.EmailVerified = true
		}
		return user, nil
	}
	if !errors.Is(err, store.ErrUserNotFound) {
		return nil, err
	}

	user, err = s.store.UserByEmail(ctx, email)
	switch {
	case err == nil:
		if err := s.store.LinkIdentity(ctx, user.ID, provider, subject, email); err != nil {
			return nil, err
		}
		if !user.EmailVerified {
			if err := s.store.MarkEmailVerified(ctx, user.ID); err != nil {
				return nil, err
			}
			user.EmailVerified = true
		}
		return user, nil
	case errors.Is(err, store.ErrUserNotFound):
	default:
		return nil, err
	}

	name = strings.TrimSpace(name)
	if name == "" {
		name, _, _ = strings.Cut(email, "@")
	}
	user, err = s.store.CreateUser(ctx, email, "", name, true)
	if err != nil {
		return nil, err
	}
	if err := s.store.LinkIdentity(ctx, user.ID, provider, subject, email); err != nil {
		return nil, err
	}
	return user, nil
}
