package api

import (
	"errors"
	"log/slog"
	"net/http"

	"github.com/citavuk/server/internal/auth"
)

type googleLoginRequest struct {
	IDToken string     `json:"idToken"`
	Device  deviceInfo `json:"device"`
}

// handleGoogleLogin принимает ID token, полученный приложением от Google.
//
// Сервер никогда не видит пароль пользователя от Google и не участвует в обмене
// кода на токен: приложение делает это само, а сюда приносит уже подписанный
// ID token, который остаётся только проверить.
func (s *Server) handleGoogleLogin(w http.ResponseWriter, r *http.Request) {
	if !s.google.Enabled() {
		writeError(w, http.StatusNotImplemented, codeBadRequest,
			"Вход через Google на этом сервере не настроен.")
		return
	}

	var req googleLoginRequest
	if err := decodeJSON(w, r, &req, 16<<10); err != nil {
		writeError(w, http.StatusBadRequest, codeBadRequest, "Не удалось прочитать запрос.")
		return
	}

	claims, err := s.google.Verify(r.Context(), req.IDToken)
	if err != nil {
		switch {
		case errors.Is(err, auth.ErrEmailNotVerified):
			writeError(w, http.StatusForbidden, codeForbidden,
				"Почта в аккаунте Google не подтверждена.")
		case errors.Is(err, auth.ErrGoogleAudience):
			writeError(w, http.StatusUnauthorized, codeUnauthorized,
				"Токен выдан другому приложению.")
		default:
			// Подробности проверки в ответ не уходят: они помогли бы подбирать
			// подделку. В журнал — уходят.
			slog.Warn("отклонён токен Google", "err", err)
			writeError(w, http.StatusUnauthorized, codeUnauthorized,
				"Не удалось подтвердить аккаунт Google.")
		}
		return
	}

	user, err := s.linkOrCreateExternalUser(
		r.Context(),
		auth.ProviderGoogle,
		claims.Subject,
		claims.Email,
		claims.Name,
	)
	if err != nil {
		slog.Error("вход через Google", "err", err)
		writeError(w, http.StatusInternalServerError, codeInternal, "Не удалось войти.")
		return
	}
	s.issueSession(w, r, user, req.Device)
}

type googleDesktopRequest struct {
	Code         string     `json:"code"`
	CodeVerifier string     `json:"codeVerifier"`
	RedirectURI  string     `json:"redirectUri"`
	Device       deviceInfo `json:"device"`
}

// handleGoogleDesktopLogin завершает вход из настольного приложения.
//
// На Windows и Linux нативного SDK Google нет: приложение открывает системный
// браузер, принимает ответ на 127.0.0.1 и приносит сюда authorization code.
// Обмен кода на токен делает сервер — client secret не должен лежать в файле
// программы, а ID token приходит к нам напрямую от Google, минуя клиента.
func (s *Server) handleGoogleDesktopLogin(w http.ResponseWriter, r *http.Request) {
	if !s.googleCode.Enabled() || !s.google.Enabled() {
		writeError(w, http.StatusNotImplemented, codeBadRequest,
			"Вход через Google для настольных приложений на этом сервере не настроен.")
		return
	}

	var req googleDesktopRequest
	if err := decodeJSON(w, r, &req, 16<<10); err != nil {
		writeError(w, http.StatusBadRequest, codeBadRequest, "Не удалось прочитать запрос.")
		return
	}

	// Адрес возврата уходит в token endpoint и должен совпасть с тем, который
	// приложение указало при авторизации. Заодно это проверка, что эндпойнт
	// используется по назначению: он только для локального сокета.
	redirectURI, err := parseLoopbackURL(req.RedirectURI)
	if err != nil {
		writeError(w, http.StatusBadRequest, codeBadRequest,
			"Адрес возврата должен вести на 127.0.0.1.")
		return
	}

	idToken, err := s.googleCode.Exchange(
		r.Context(),
		req.Code,
		req.CodeVerifier,
		redirectURI,
	)
	if err != nil {
		// Подробности отказа Google остаются в журнале: по ним удобно подбирать
		// корректный запрос, а пользователю они ничего не объясняют.
		slog.Warn("обмен кода Google не удался", "err", err)
		writeError(w, http.StatusUnauthorized, codeUnauthorized,
			"Google не подтвердил вход. Попробуйте ещё раз.")
		return
	}

	claims, err := s.google.Verify(r.Context(), idToken)
	if err != nil {
		switch {
		case errors.Is(err, auth.ErrEmailNotVerified):
			writeError(w, http.StatusForbidden, codeForbidden,
				"Почта в аккаунте Google не подтверждена.")
		default:
			slog.Warn("отклонён токен Google (десктоп)", "err", err)
			writeError(w, http.StatusUnauthorized, codeUnauthorized,
				"Не удалось подтвердить аккаунт Google.")
		}
		return
	}

	user, err := s.linkOrCreateExternalUser(
		r.Context(),
		auth.ProviderGoogle,
		claims.Subject,
		claims.Email,
		claims.Name,
	)
	if err != nil {
		slog.Error("вход через Google (десктоп)", "err", err)
		writeError(w, http.StatusInternalServerError, codeInternal, "Не удалось войти.")
		return
	}
	s.issueSession(w, r, user, req.Device)
}
