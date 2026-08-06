// Package api реализует HTTP-интерфейс сервера Citavuk.
package api

import (
	"encoding/json"
	"errors"
	"io"
	"log/slog"
	"net/http"
	"strings"
)

// errorBody — единый формат ошибки. Клиент разбирает поле code программно, а
// message показывает пользователю, поэтому message всегда на русском.
type errorBody struct {
	Code    string `json:"code"`
	Message string `json:"message"`
}

// Коды ошибок, на которые клиент реагирует по-разному.
const (
	codeBadRequest      = "bad_request"
	codeUnauthorized    = "unauthorized"
	codeForbidden       = "forbidden"
	codeNotFound        = "not_found"
	codeConflict        = "conflict"
	codeTooLarge        = "too_large"
	codeRateLimited     = "rate_limited"
	codeUpstream        = "upstream_error"
	codeInternal        = "internal"
	codeEmailUnverified = "email_unverified"
	codeTokenInvalid    = "token_invalid"
)

func writeJSON(w http.ResponseWriter, status int, payload any) {
	w.Header().Set("Content-Type", "application/json; charset=utf-8")
	w.WriteHeader(status)
	if payload == nil {
		return
	}
	enc := json.NewEncoder(w)
	// Сербские и русские буквы должны оставаться собой, а не \uXXXX: так ответы
	// читаемы в логах и при отладке, а размер тела меньше.
	enc.SetEscapeHTML(false)
	if err := enc.Encode(payload); err != nil {
		slog.Error("не удалось записать ответ", "err", err)
	}
}

func writeError(w http.ResponseWriter, status int, code, message string) {
	writeJSON(w, status, errorBody{Code: code, Message: message})
}

// decodeJSON читает тело запроса с ограничением размера.
//
// Ограничение обязательно: без него клиент, отправивший бесконечный поток,
// исчерпает память процесса. DisallowUnknownFields не включается намеренно —
// иначе новый клиент, добавивший поле, перестал бы работать со старым сервером.
func decodeJSON(w http.ResponseWriter, r *http.Request, dst any, maxBytes int64) error {
	r.Body = http.MaxBytesReader(w, r.Body, maxBytes)
	dec := json.NewDecoder(r.Body)
	if err := dec.Decode(dst); err != nil {
		var maxErr *http.MaxBytesError
		if errors.As(err, &maxErr) {
			return errTooLarge
		}
		if errors.Is(err, io.EOF) {
			return errors.New("пустое тело запроса")
		}
		return err
	}
	return nil
}

var errTooLarge = errors.New("тело запроса слишком велико")

// clientIP определяет адрес клиента.
//
// X-Forwarded-For читается только при trustProxy: без обратного прокси клиент
// сам проставит любой заголовок и обойдёт ограничение частоты запросов.
//
// Даже за прокси доверять можно НЕ ВСЕЙ цепочке, а только тому, что дописал
// наш nginx. Он ставит `X-Forwarded-For $proxy_add_x_forwarded_for`, то есть
// «то, что прислал клиент» + «настоящий адрес соединения», — и настоящий
// адрес оказывается ПОСЛЕДНИМ. Пока брался первый, любой запрос с
// «X-Forwarded-For: 1.2.3.4» получал новое ведро токенов: ограничение частоты
// для гостей, перебор паролей и общий лимит API обходились одним заголовком.
//
// X-Real-IP спрашивается первым: proxy_set_header ЗАМЕНЯЕТ заголовок целиком,
// поэтому клиентское значение до нас не доходит вовсе.
func clientIP(r *http.Request, trustProxy bool) string {
	if trustProxy {
		if real := strings.TrimSpace(r.Header.Get("X-Real-IP")); real != "" {
			return real
		}
		if xff := strings.TrimSpace(r.Header.Get("X-Forwarded-For")); xff != "" {
			if i := strings.LastIndex(xff, ","); i >= 0 {
				return strings.TrimSpace(xff[i+1:])
			}
			return xff
		}
	}
	host := r.RemoteAddr
	if i := strings.LastIndex(host, ":"); i > 0 {
		host = host[:i]
	}
	return strings.Trim(host, "[]")
}
