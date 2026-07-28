package api

import (
	"errors"
	"log/slog"
	"net/http"
	"strings"
	"time"

	"github.com/citavuk/server/internal/auth"
	"github.com/citavuk/server/internal/store"
)

// deviceInfo описывает устройство, с которого выполняется вход. Нужен, чтобы
// пользователь мог понять, какие сессии активны.
type deviceInfo struct {
	ID       string `json:"id"`
	Name     string `json:"name"`
	Platform string `json:"platform"`
}

type registerRequest struct {
	Email       string     `json:"email"`
	Password    string     `json:"password"`
	DisplayName string     `json:"displayName"`
	Device      deviceInfo `json:"device"`
}

type loginRequest struct {
	Email    string     `json:"email"`
	Password string     `json:"password"`
	Device   deviceInfo `json:"device"`
}

type authResponse struct {
	Token     string    `json:"token"`
	ExpiresAt time.Time `json:"expiresAt"`
	User      userView  `json:"user"`
}

type registrationResponse struct {
	VerificationRequired bool   `json:"verificationRequired"`
	Email                string `json:"email"`
}

type userView struct {
	ID            string `json:"id"`
	Email         string `json:"email"`
	DisplayName   string `json:"displayName"`
	SyncRev       int64  `json:"syncRev"`
	HasPassword   bool   `json:"hasPassword"`
	IsAdmin       bool   `json:"isAdmin"`
	EmailVerified bool   `json:"emailVerified"`
}

func viewOf(u *store.User) userView {
	return userView{
		ID:            u.ID.String(),
		Email:         u.Email,
		DisplayName:   u.DisplayName,
		SyncRev:       u.SyncRev,
		HasPassword:   u.PasswordHash != "",
		IsAdmin:       u.IsAdmin,
		EmailVerified: u.EmailVerified,
	}
}

func (s *Server) handleRegister(w http.ResponseWriter, r *http.Request) {
	var req registerRequest
	if err := decodeJSON(w, r, &req, 8<<10); err != nil {
		writeError(w, http.StatusBadRequest, codeBadRequest, "Не удалось прочитать запрос.")
		return
	}

	email := store.NormalizeEmail(req.Email)
	if err := store.ValidateEmail(email); err != nil {
		writeError(w, http.StatusBadRequest, codeBadRequest, err.Error())
		return
	}
	if err := auth.ValidatePassword(req.Password); err != nil {
		writeError(w, http.StatusBadRequest, codeBadRequest, err.Error())
		return
	}

	hash, err := auth.HashPassword(req.Password)
	if err != nil {
		slog.Error("хеширование пароля", "err", err)
		writeError(w, http.StatusInternalServerError, codeInternal, "Не удалось создать аккаунт.")
		return
	}

	name := strings.TrimSpace(req.DisplayName)
	if name == "" {
		// Имя по умолчанию — часть адреса до «@»: показывать пустоту хуже.
		name, _, _ = strings.Cut(email, "@")
	}

	if !s.mailer.Enabled() {
		slog.Error("регистрация невозможна: отправка почты не настроена")
		writeError(w, http.StatusServiceUnavailable, codeInternal,
			"Регистрация временно недоступна: сервер не может отправить письмо.")
		return
	}

	user, err := s.store.CreateUser(r.Context(), email, hash, name, false)
	if errors.Is(err, store.ErrEmailTaken) {
		writeError(w, http.StatusConflict, codeConflict,
			"Аккаунт с такой почтой уже есть. Попробуйте войти.")
		return
	}
	if err != nil {
		slog.Error("создание пользователя", "err", err)
		writeError(w, http.StatusInternalServerError, codeInternal, "Не удалось создать аккаунт.")
		return
	}

	token, tokenHash, err := auth.NewSessionToken()
	if err != nil {
		_ = s.store.DeleteUnverifiedUser(r.Context(), user.ID)
		writeError(w, http.StatusInternalServerError, codeInternal,
			"Не удалось подготовить подтверждение почты.")
		return
	}
	if err := s.store.PutEmailVerificationToken(
		r.Context(),
		user.ID,
		tokenHash,
		s.cfg.EmailVerificationTTL,
	); err != nil {
		_ = s.store.DeleteUnverifiedUser(r.Context(), user.ID)
		slog.Error("сохранение подтверждения почты", "err", err)
		writeError(w, http.StatusInternalServerError, codeInternal,
			"Не удалось подготовить подтверждение почты.")
		return
	}
	if err := s.mailer.SendVerification(
		r.Context(),
		user.Email,
		user.DisplayName,
		token,
	); err != nil {
		_ = s.store.DeleteUnverifiedUser(r.Context(), user.ID)
		slog.Error("отправка подтверждения почты", "err", err)
		writeError(w, http.StatusServiceUnavailable, codeUpstream,
			"Не удалось отправить письмо. Проверьте адрес и попробуйте ещё раз.")
		return
	}

	writeJSON(w, http.StatusAccepted, registrationResponse{
		VerificationRequired: true,
		Email:                user.Email,
	})
}

func (s *Server) handleLogin(w http.ResponseWriter, r *http.Request) {
	var req loginRequest
	if err := decodeJSON(w, r, &req, 8<<10); err != nil {
		writeError(w, http.StatusBadRequest, codeBadRequest, "Не удалось прочитать запрос.")
		return
	}

	user, err := s.store.UserByEmail(r.Context(), req.Email)
	if err != nil {
		// Несуществующий аккаунт и неверный пароль отвечают одинаково: разница
		// позволила бы перебором узнать, какие адреса зарегистрированы.
		// Хеш всё равно считается, чтобы ответ не был заметно быстрее.
		_ = auth.VerifyPassword(req.Password, dummyHash)
		writeError(w, http.StatusUnauthorized, codeUnauthorized, "Неверная почта или пароль.")
		return
	}
	if user.PasswordHash == "" {
		_ = auth.VerifyPassword(req.Password, dummyHash)
		writeError(w, http.StatusUnauthorized, codeUnauthorized,
			"У этого аккаунта нет пароля — войдите через Google или Яндекс.")
		return
	}
	if err := auth.VerifyPassword(req.Password, user.PasswordHash); err != nil {
		writeError(w, http.StatusUnauthorized, codeUnauthorized, "Неверная почта или пароль.")
		return
	}
	if !user.EmailVerified {
		writeError(w, http.StatusForbidden, codeEmailUnverified,
			"Подтвердите почту по ссылке из письма.")
		return
	}

	s.issueSession(w, r, user, req.Device)
}

type verifyEmailRequest struct {
	Token string `json:"token"`
}

func (s *Server) handleVerifyEmail(w http.ResponseWriter, r *http.Request) {
	var req verifyEmailRequest
	if err := decodeJSON(w, r, &req, 8<<10); err != nil {
		writeError(w, http.StatusBadRequest, codeBadRequest,
			"Не удалось прочитать запрос.")
		return
	}
	token := strings.TrimSpace(req.Token)
	if token == "" {
		writeError(w, http.StatusBadRequest, codeBadRequest,
			"Ссылка подтверждения неполная.")
		return
	}
	user, err := s.store.VerifyEmailToken(r.Context(), auth.HashToken(token))
	if errors.Is(err, store.ErrAuthTokenInvalid) {
		writeError(w, http.StatusBadRequest, codeTokenInvalid,
			"Ссылка подтверждения недействительна или уже истекла.")
		return
	}
	if err != nil {
		slog.Error("подтверждение почты", "err", err)
		writeError(w, http.StatusInternalServerError, codeInternal,
			"Не удалось подтвердить почту.")
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{
		"verified": true,
		"email":    user.Email,
	})
}

type resendVerificationRequest struct {
	Email string `json:"email"`
}

func (s *Server) handleResendVerification(w http.ResponseWriter, r *http.Request) {
	var req resendVerificationRequest
	if err := decodeJSON(w, r, &req, 8<<10); err != nil {
		writeError(w, http.StatusBadRequest, codeBadRequest,
			"Не удалось прочитать запрос.")
		return
	}
	email := store.NormalizeEmail(req.Email)
	if err := store.ValidateEmail(email); err != nil {
		writeError(w, http.StatusBadRequest, codeBadRequest, err.Error())
		return
	}
	if !s.mailer.Enabled() {
		writeError(w, http.StatusServiceUnavailable, codeInternal,
			"Отправка писем временно недоступна.")
		return
	}

	// Одинаковый ответ для отсутствующего и уже подтверждённого адреса не даёт
	// использовать endpoint как список зарегистрированных пользователей.
	user, err := s.store.UserByEmail(r.Context(), email)
	if errors.Is(err, store.ErrUserNotFound) || (err == nil && user.EmailVerified) {
		writeJSON(w, http.StatusOK, map[string]bool{"sent": true})
		return
	}
	if err != nil {
		slog.Error("поиск аккаунта для повторного письма", "err", err)
		writeError(w, http.StatusInternalServerError, codeInternal,
			"Не удалось отправить письмо.")
		return
	}

	token, tokenHash, err := auth.NewSessionToken()
	if err == nil {
		err = s.store.PutEmailVerificationToken(
			r.Context(),
			user.ID,
			tokenHash,
			s.cfg.EmailVerificationTTL,
		)
	}
	if err == nil {
		err = s.mailer.SendVerification(
			r.Context(),
			user.Email,
			user.DisplayName,
			token,
		)
	}
	if err != nil {
		slog.Error("повторная отправка подтверждения", "err", err)
		writeError(w, http.StatusServiceUnavailable, codeUpstream,
			"Не удалось отправить письмо. Попробуйте позже.")
		return
	}
	writeJSON(w, http.StatusOK, map[string]bool{"sent": true})
}

// dummyHash — заведомо не подходящий ни к одному паролю хеш. Считается на
// несуществующем аккаунте, чтобы время ответа не выдавало, есть ли такой адрес.
// Значение вычисляется один раз при старте, см. init.
var dummyHash string

func init() {
	h, err := auth.HashPassword("несуществующий-пароль-для-выравнивания-времени")
	if err != nil {
		// Единственная причина отказа — некорректная длина, а она здесь задана
		// константой. Молча оставить пустую строку нельзя: тогда выравнивание
		// времени исчезнет и появится оракул существования аккаунта.
		panic("не удалось подготовить эталонный хеш: " + err.Error())
	}
	dummyHash = h
}

func (s *Server) issueSession(w http.ResponseWriter, r *http.Request, user *store.User, dev deviceInfo) {
	token, hash, err := auth.NewSessionToken()
	if err != nil {
		slog.Error("генерация токена", "err", err)
		writeError(w, http.StatusInternalServerError, codeInternal, "Не удалось войти.")
		return
	}
	expires, err := s.store.CreateSession(r.Context(), user.ID, hash,
		dev.ID, dev.Name, dev.Platform, s.cfg.SessionTTLDays)
	if err != nil {
		slog.Error("создание сессии", "err", err)
		writeError(w, http.StatusInternalServerError, codeInternal, "Не удалось войти.")
		return
	}
	writeJSON(w, http.StatusOK, authResponse{Token: token, ExpiresAt: expires, User: viewOf(user)})
}

func (s *Server) handleLogout(w http.ResponseWriter, r *http.Request) {
	if token := auth.BearerToken(r.Header.Get("Authorization")); token != "" {
		if err := s.store.DeleteSession(r.Context(), auth.HashToken(token)); err != nil {
			slog.Error("удаление сессии", "err", err)
		}
	}
	writeJSON(w, http.StatusOK, map[string]bool{"ok": true})
}

func (s *Server) handleMe(w http.ResponseWriter, r *http.Request) {
	writeJSON(w, http.StatusOK, viewOf(userFrom(r.Context())))
}

type deleteAccountRequest struct {
	// Пароль спрашивается у аккаунтов, где он задан: удаление необратимо, а
	// чужое незаблокированное устройство — обычное дело.
	Password string `json:"password"`
	// Подтверждение осознанности: клиент присылает «УДАЛИТЬ».
	Confirm string `json:"confirm"`
}

func (s *Server) handleDeleteAccount(w http.ResponseWriter, r *http.Request) {
	user := userFrom(r.Context())

	var req deleteAccountRequest
	if err := decodeJSON(w, r, &req, 8<<10); err != nil {
		writeError(w, http.StatusBadRequest, codeBadRequest, "Не удалось прочитать запрос.")
		return
	}
	if strings.ToUpper(strings.TrimSpace(req.Confirm)) != "УДАЛИТЬ" {
		writeError(w, http.StatusBadRequest, codeBadRequest,
			"Удаление не подтверждено.")
		return
	}
	if user.PasswordHash != "" {
		if err := auth.VerifyPassword(req.Password, user.PasswordHash); err != nil {
			writeError(w, http.StatusUnauthorized, codeUnauthorized, "Пароль неверен.")
			return
		}
	}

	if err := s.store.DeleteUser(r.Context(), user.ID); err != nil {
		slog.Error("удаление аккаунта", "err", err)
		writeError(w, http.StatusInternalServerError, codeInternal,
			"Не удалось удалить аккаунт.")
		return
	}
	writeJSON(w, http.StatusOK, map[string]bool{"ok": true})
}

type changePasswordRequest struct {
	CurrentPassword string `json:"currentPassword"`
	NewPassword     string `json:"newPassword"`
}

func (s *Server) handleChangePassword(w http.ResponseWriter, r *http.Request) {
	user := userFrom(r.Context())

	var req changePasswordRequest
	if err := decodeJSON(w, r, &req, 8<<10); err != nil {
		writeError(w, http.StatusBadRequest, codeBadRequest, "Не удалось прочитать запрос.")
		return
	}
	if err := auth.ValidatePassword(req.NewPassword); err != nil {
		writeError(w, http.StatusBadRequest, codeBadRequest, err.Error())
		return
	}
	// Аккаунт без пароля (вход только через Google) задаёт пароль впервые —
	// текущий пароль спрашивать не с чего.
	if user.PasswordHash != "" {
		if err := auth.VerifyPassword(req.CurrentPassword, user.PasswordHash); err != nil {
			writeError(w, http.StatusUnauthorized, codeUnauthorized, "Текущий пароль неверен.")
			return
		}
	}

	hash, err := auth.HashPassword(req.NewPassword)
	if err != nil {
		writeError(w, http.StatusInternalServerError, codeInternal, "Не удалось сменить пароль.")
		return
	}
	if err := s.store.SetPasswordHash(r.Context(), user.ID, hash); err != nil {
		slog.Error("смена пароля", "err", err)
		writeError(w, http.StatusInternalServerError, codeInternal, "Не удалось сменить пароль.")
		return
	}

	// Смена пароля завершает все сессии: сменивший пароль рассчитывает, что
	// чужое устройство потеряет доступ. Текущему устройству выдаётся новая.
	if err := s.store.DeleteUserSessions(r.Context(), user.ID); err != nil {
		slog.Error("сброс сессий после смены пароля", "err", err)
	}
	user.PasswordHash = hash
	s.issueSession(w, r, user, deviceInfo{})
}
