package api

import (
	"crypto/hmac"
	"crypto/sha256"
	"crypto/subtle"
	"encoding/base64"
	"errors"
	"strings"

	"github.com/google/uuid"
)

// Подписанный идентификатор гостя для ленты.
//
// Раньше `visitorId` придумывал сам браузер: любой UUID принимался как новый
// читатель. Значит, лайки накручивались сменой строки в запросе, а профиль
// подбора можно было засорить чужими действиями. Теперь идентификатор выдаёт
// сервер вместе с самой лентой и подписывает HMAC своим секретом — чужой
// подставить нельзя, потому что секрет наружу не выходит.
//
// Подпись не превращает гостя в аккаунт: набрать пачку токенов по-прежнему
// можно, их выдача ограничена только частотой запросов по IP. Поэтому она
// работает В ПАРЕ с правилом «публичные счётчики растут только от вошедших»
// (см. store.updateMicroFeedReaction): подпись защищает подбор ленты, а вход —
// её рейтинг.

// visitorTokenVersion позволяет сменить формат, не ломая уже выданные токены:
// старая версия просто перестанет проходить проверку, и клиент попросит новый.
const visitorTokenVersion = "v1"

var errVisitorToken = errors.New("недействительный идентификатор читателя")

// visitorSecret выводит ключ подписи из уже существующего секрета сервера.
//
// Отдельной переменной окружения намеренно нет: ещё один обязательный секрет —
// это ещё один способ развернуть сервер неправильно. Ключ выводится из
// DatabaseURL, который на сервере есть всегда и наружу не попадает никогда.
// Домен разделения ("citavuk/micro-feed-visitor") не даёт использовать этот же
// ключ где-то ещё.
func (s *Server) visitorSecret() []byte {
	sum := sha256.Sum256([]byte("citavuk/micro-feed-visitor\x00" + s.cfg.DatabaseURL))
	return sum[:]
}

// issueVisitorToken выдаёт новый подписанный идентификатор.
func (s *Server) issueVisitorToken() string {
	return s.signVisitorToken(uuid.NewString())
}

func (s *Server) signVisitorToken(id string) string {
	mac := hmac.New(sha256.New, s.visitorSecret())
	mac.Write([]byte(visitorTokenVersion + "\x00" + id))
	signature := base64.RawURLEncoding.EncodeToString(mac.Sum(nil))
	return visitorTokenVersion + "." + id + "." + signature
}

// parseVisitorToken проверяет подпись и возвращает идентификатор гостя.
func (s *Server) parseVisitorToken(token string) (string, error) {
	parts := strings.Split(strings.TrimSpace(token), ".")
	if len(parts) != 3 || parts[0] != visitorTokenVersion {
		return "", errVisitorToken
	}
	id, err := uuid.Parse(parts[1])
	if err != nil || id == uuid.Nil {
		return "", errVisitorToken
	}
	// Сравнение за постоянное время: подпись сверяется на каждый показ
	// карточки, и утечка времени здесь так же нежелательна, как в проверке
	// пароля.
	want := s.signVisitorToken(parts[1])
	if subtle.ConstantTimeCompare([]byte(token), []byte(want)) != 1 {
		return "", errVisitorToken
	}
	return id.String(), nil
}
