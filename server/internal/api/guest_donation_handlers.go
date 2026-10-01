package api

import (
	"context"
	"encoding/base64"
	"errors"
	"log/slog"
	"net/http"
	"strings"
	"time"

	"github.com/citavuk/server/internal/auth"
	"github.com/citavuk/server/internal/store"
	"github.com/google/uuid"
)

const guestDonationCookie = "__Host-citavuk_donation_claim"

func guestDonationToken(r *http.Request) string {
	c, err := r.Cookie(guestDonationCookie)
	if err != nil || !validDonationProof(c.Value) {
		return ""
	}
	return c.Value
}
func validDonationProof(token string) bool {
	if len(token) != 47 || !strings.HasPrefix(token, auth.TokenPrefix) {
		return false
	}
	decoded, err := base64.RawURLEncoding.DecodeString(strings.TrimPrefix(token, auth.TokenPrefix))
	return err == nil && len(decoded) == 32
}

func (s *Server) prepareGuestDonation(w http.ResponseWriter, r *http.Request, id uuid.UUID, email string) error {
	token := guestDonationToken(r)
	if token == "" {
		var err error
		token, _, err = auth.NewSessionToken()
		if err != nil {
			return err
		}
	}
	if err := s.store.RegisterGuestDonation(r.Context(), id, auth.HashToken(token), email); err != nil {
		return err
	}
	http.SetCookie(w, &http.Cookie{Name: guestDonationCookie, Value: token, Path: "/", HttpOnly: true, Secure: true, SameSite: http.SameSiteStrictMode, MaxAge: 90 * 24 * 60 * 60, Expires: time.Now().Add(90 * 24 * time.Hour)})
	return nil
}

func (s *Server) handleOwnedGuestDonations(w http.ResponseWriter, r *http.Request) {
	w.Header().Set("Cache-Control", "no-store")
	token := guestDonationToken(r)
	if token == "" {
		writeJSON(w, 200, map[string]any{"items": []store.GuestDonation{}})
		return
	}
	items, err := s.store.OwnedGuestDonations(r.Context(), auth.HashToken(token))
	if err != nil {
		writeError(w, 500, codeInternal, "Не удалось проверить гостевую поддержку.")
		return
	}
	writeJSON(w, 200, map[string]any{"items": items})
}

func (s *Server) handleClaimGuestDonation(w http.ResponseWriter, r *http.Request) {
	w.Header().Set("Cache-Control", "no-store")
	if !s.browserSession(r) {
		writeError(w, 403, codeForbidden, "Открой привязку на сайте Читавука.")
		return
	}
	var in struct {
		ID    string `json:"id"`
		Token string `json:"token"`
	}
	if decodeJSON(w, r, &in, 1024) != nil {
		writeError(w, 400, codeBadRequest, "Не удалось прочитать подтверждение.")
		return
	}
	var browserHash, linkHash []byte
	id, _ := uuid.Parse(in.ID)
	if in.Token != "" {
		if !validDonationProof(in.Token) {
			writeError(w, 404, codeNotFound, "Ссылка недействительна или уже использована.")
			return
		}
		linkHash = auth.HashToken(in.Token)
	} else if token := guestDonationToken(r); token != "" {
		browserHash = auth.HashToken(token)
	}
	claimed, err := s.store.ClaimGuestDonation(r.Context(), userFrom(r.Context()).ID, id, browserHash, linkHash)
	if errors.Is(err, store.ErrGuestDonationEmail) {
		writeError(w, 403, "claim_email_mismatch", "Войди в аккаунт с подтверждённой почтой, на которую пришла ссылка.")
		return
	}
	if errors.Is(err, store.ErrGuestDonationProof) {
		writeError(w, 404, codeNotFound, "Ссылка недействительна, оплата ещё не подтверждена или поддержка уже привязана.")
		return
	}
	if err != nil {
		slog.Error("привязка гостевой поддержки", "err", err)
		writeError(w, 500, codeInternal, "Не удалось привязать поддержку. Попробуй ещё раз.")
		return
	}
	writeJSON(w, 200, map[string]any{"id": claimed})
}

func (s *Server) handleGuestDonationEmail(w http.ResponseWriter, r *http.Request) {
	if !s.browserSession(r) {
		writeError(w, 403, codeForbidden, "Открой поддержку на сайте Читавука.")
		return
	}
	if !s.mailer.Enabled() {
		writeError(w, 503, codeUpstream, "Отправка письма временно недоступна.")
		return
	}
	var in struct {
		ID    string `json:"id"`
		Email string `json:"email"`
	}
	if decodeJSON(w, r, &in, 1024) != nil {
		writeError(w, 400, codeBadRequest, "Не удалось прочитать запрос.")
		return
	}
	id, err := uuid.Parse(in.ID)
	token := guestDonationToken(r)
	email := store.NormalizeEmail(in.Email)
	if err != nil || token == "" {
		writeError(w, 404, codeNotFound, "Открой страницу в браузере, в котором была оплата.")
		return
	}
	if email != "" && store.ValidateEmail(email) != nil {
		writeError(w, 400, codeBadRequest, "Проверь адрес почты.")
		return
	}
	if err = s.store.RequestGuestDonationEmail(r.Context(), id, auth.HashToken(token), email); err != nil {
		writeError(w, 409, codeConflict, "Не удалось отправить письмо. Подожди пару минут и попробуй снова.")
		return
	}
	writeJSON(w, 202, map[string]bool{"queued": true})
}

func (s *Server) sendGuestDonationLinks(parent context.Context) {
	ctx, cancel := context.WithTimeout(parent, 45*time.Second)
	defer cancel()
	if err := s.store.PurgeGuestDonationLinks(ctx); err != nil && ctx.Err() == nil {
		slog.Warn("очистка подтверждений гостевой поддержки", "err", err)
	}
	if !s.mailer.Enabled() {
		return
	}
	items, err := s.store.ClaimGuestDonationEmails(ctx)
	if err != nil {
		if ctx.Err() == nil {
			slog.Warn("письма о гостевой поддержке", "err", err)
		}
		return
	}
	for _, item := range items {
		if ctx.Err() != nil {
			return
		}
		token, hash, err := auth.NewSessionToken()
		if err == nil {
			err = s.store.AddGuestDonationLink(ctx, item.DonationID, hash, item.Email)
		}
		if err == nil {
			mailCtx, done := context.WithTimeout(ctx, 10*time.Second)
			err = s.mailer.SendNotification(mailCtx, item.Email, "", "Привяжи поддержку Читавука к аккаунту", "Спасибо за поддержку Читавука! Открой ссылку на любом устройстве и войди или создай аккаунт с этой почтой. Платёж будет учтён в профиле, а при общей поддержке от 200 ₽ откроется статус друга. Ссылка действует 3 дня и используется один раз.", "Привязать поддержку", "/support/claim#token="+token)
			done()
		}
		if err == nil {
			err = s.store.MarkGuestDonationEmailSent(ctx, item.DonationID, item.Email)
		}
		if err != nil && ctx.Err() == nil {
			slog.Warn("письмо о привязке поддержки", "donation", item.DonationID, "err", err)
		}
	}
}
