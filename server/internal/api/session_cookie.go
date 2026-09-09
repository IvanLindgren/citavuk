package api

import (
	"net/http"
	"time"

	"github.com/citavuk/server/internal/auth"
)

const sessionCookie = "__Host-citavuk_session"

func requestToken(r *http.Request) string {
	if token := auth.BearerToken(r.Header.Get("Authorization")); token != "" {
		return token
	}
	if cookie, err := r.Cookie(sessionCookie); err == nil {
		return cookie.Value
	}
	return ""
}

func (s *Server) browserSession(r *http.Request) bool {
	return r.Header.Get("X-Citavuk-Client") == "web" && s.originAllowed(r.Header.Get("Origin"))
}

func setSessionCookie(w http.ResponseWriter, token string, expires time.Time) {
	maxAge := int(time.Until(expires).Seconds())
	if token == "" {
		maxAge = -1
	}
	http.SetCookie(w, &http.Cookie{Name: sessionCookie, Value: token, Path: "/", HttpOnly: true,
		Secure: true, SameSite: http.SameSiteStrictMode, Expires: expires, MaxAge: maxAge})
}
