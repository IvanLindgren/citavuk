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

// Подписанный идентификатор участника матча.
//
// Гость играет по ссылке без регистрации, но чем-то он в комнате быть обязан:
// его переводы, его голоса и его очки должны принадлежать ему одному. Браузеру
// доверить это нельзя — подставив чужой идентификатор, гость увидел бы чужие
// ответы до конца раунда и проголосовал бы за себя чужим голосом. Поэтому
// идентификатор выдаёт сервер и подписывает своим секретом.
//
// У вошедшего участник выводится из аккаунта: токен ему не нужен, а место в
// комнате переживает перезагрузку страницы и смену устройства.

const duelTokenVersion = "d1"

var errDuelToken = errors.New("недействительный участник матча")

// duelSecret выводится из того же секрета сервера, что и остальные подписи.
// Домен разделения не даёт использовать ключ где-то ещё.
func (s *Server) duelSecret() []byte {
	sum := sha256.Sum256([]byte("citavuk/duel-player\x00" + s.cfg.DatabaseURL))
	return sum[:]
}

func (s *Server) signDuelToken(id string) string {
	mac := hmac.New(sha256.New, s.duelSecret())
	mac.Write([]byte(duelTokenVersion + "\x00" + id))
	return duelTokenVersion + "." + id + "." + base64.RawURLEncoding.EncodeToString(mac.Sum(nil))
}

func (s *Server) issueDuelToken() string {
	return s.signDuelToken(uuid.NewString())
}

func (s *Server) parseDuelToken(token string) (string, error) {
	parts := strings.Split(strings.TrimSpace(token), ".")
	if len(parts) != 3 || parts[0] != duelTokenVersion {
		return "", errDuelToken
	}
	id, err := uuid.Parse(parts[1])
	if err != nil || id == uuid.Nil {
		return "", errDuelToken
	}
	want := s.signDuelToken(parts[1])
	if subtle.ConstantTimeCompare([]byte(token), []byte(want)) != 1 {
		return "", errDuelToken
	}
	return id.String(), nil
}
