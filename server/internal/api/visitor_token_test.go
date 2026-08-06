package api

import (
	"strings"
	"testing"

	"github.com/citavuk/server/internal/config"
	"github.com/google/uuid"
)

func testVisitorServer() *Server {
	return &Server{cfg: &config.Config{DatabaseURL: "postgres://test/секрет"}}
}

func TestVisitorTokenRoundTrip(t *testing.T) {
	s := testVisitorServer()

	token := s.issueVisitorToken()
	id, err := s.parseVisitorToken(token)
	if err != nil {
		t.Fatalf("свой же токен не прошёл проверку: %v", err)
	}
	if _, err := uuid.Parse(id); err != nil {
		t.Fatalf("идентификатор %q не UUID", id)
	}
	if s.issueVisitorToken() == token {
		t.Fatal("два вызова выдали один и тот же токен")
	}
}

// Главное свойство: самодельный идентификатор не принимается. Пока его
// придумывал браузер, лайки накручивались сменой строки в запросе.
func TestVisitorTokenRejectsForgeries(t *testing.T) {
	s := testVisitorServer()
	valid := s.issueVisitorToken()
	parts := strings.Split(valid, ".")

	cases := map[string]string{
		"пусто":                    "",
		"голый UUID":               uuid.NewString(),
		"без подписи":              parts[0] + "." + parts[1],
		"чужая подпись":            parts[0] + "." + uuid.NewString() + "." + parts[2],
		"испорченная подпись":      parts[0] + "." + parts[1] + "." + parts[2] + "x",
		"другая версия":            "v2." + parts[1] + "." + parts[2],
		"идентификатор не UUID":    parts[0] + ".не-uuid." + parts[2],
		"нулевой идентификатор":    parts[0] + "." + uuid.Nil.String() + "." + parts[2],
		"подпись от другой строки": s.signVisitorToken(uuid.NewString()) + "trailing",
	}
	for name, token := range cases {
		t.Run(name, func(t *testing.T) {
			if _, err := s.parseVisitorToken(token); err == nil {
				t.Fatalf("подделка %q принята", token)
			}
		})
	}
}

// Ключ выводится из секрета сервера, поэтому чужой сервер свои токены нам не
// подпишет.
func TestVisitorTokenIsServerSpecific(t *testing.T) {
	mine := testVisitorServer()
	other := &Server{cfg: &config.Config{DatabaseURL: "postgres://test/другой"}}

	if _, err := mine.parseVisitorToken(other.issueVisitorToken()); err == nil {
		t.Fatal("токен чужого сервера принят")
	}
}
