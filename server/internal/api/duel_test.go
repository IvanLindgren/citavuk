package api

import (
	"context"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"github.com/google/uuid"

	"github.com/citavuk/server/internal/config"
	"github.com/citavuk/server/internal/store"
)

func duelServer() *Server {
	return &Server{cfg: &config.Config{DatabaseURL: "postgres://secret@localhost/citavuk"}}
}

func TestDuelTokenSurvivesRoundTripAndCatchesForgery(t *testing.T) {
	s := duelServer()
	token := s.issueDuelToken()
	id, err := s.parseDuelToken(token)
	if err != nil {
		t.Fatalf("свой же токен не разобрался: %v", err)
	}
	if _, err := uuid.Parse(id); err != nil {
		t.Fatalf("в токене не идентификатор: %q", id)
	}

	// Подставить чужого участника нельзя: подпись считается от секрета сервера.
	forged := "d1." + uuid.NewString() + "." + strings.Split(token, ".")[2]
	if _, err := s.parseDuelToken(forged); err == nil {
		t.Fatal("подделанный токен принят")
	}
	for _, bad := range []string{"", "мусор", "d1.не-uuid.подпись", token + "x", "d0." + id + ".x"} {
		if _, err := s.parseDuelToken(bad); err == nil {
			t.Fatalf("принят негодный токен %q", bad)
		}
	}

	// Секрет другого сервера чужие токены не открывает.
	other := &Server{cfg: &config.Config{DatabaseURL: "postgres://other@localhost/citavuk"}}
	if _, err := other.parseDuelToken(token); err == nil {
		t.Fatal("токен принят сервером с другим секретом")
	}
}

func TestDuelActorPrefersAccountOverToken(t *testing.T) {
	s := duelServer()
	user := &store.User{ID: uuid.New(), DisplayName: "Аня", Email: "anya@example.com"}

	request := httptest.NewRequest(http.MethodGet, "/v1/duel/rooms/ABCDEF", nil)
	request.Header.Set("X-Duel-Player", s.issueDuelToken())
	request = request.WithContext(context.WithValue(request.Context(), userKey, user))

	actor := s.duelWho(request)
	if actor.ID != user.ID.String() || actor.UserID != user.ID.String() {
		t.Fatalf("вошедший опознан как гость: %+v", actor)
	}
	if actor.Name != "Аня" {
		t.Fatalf("имя за столом %q", actor.Name)
	}
}

func TestAccountNameFallsBackToMail(t *testing.T) {
	if got := accountName(&store.User{Email: "petar@example.com"}); got != "petar" {
		t.Fatalf("имя без профиля %q, ожидалось petar", got)
	}
	if got := accountName(&store.User{}); got != "Игрок" {
		t.Fatalf("имя без почты и профиля %q", got)
	}
}

func TestGuestGetsSignatureOnFirstEntry(t *testing.T) {
	s := duelServer()
	request := httptest.NewRequest(http.MethodPost, "/v1/duel/rooms", nil)

	actor, err := s.duelEnter(request, "  Гость  ")
	if err != nil {
		t.Fatalf("гость не вошёл: %v", err)
	}
	if actor.Token == "" {
		t.Fatal("гостю не выдали подпись")
	}
	if actor.Name != "Гость" {
		t.Fatalf("имя гостя %q", actor.Name)
	}
	if _, err := s.duelEnter(request, "   "); err == nil {
		t.Fatal("гость вошёл без имени")
	}

	// Со своей подписью гость возвращается тем же участником.
	back := httptest.NewRequest(http.MethodPost, "/v1/duel/rooms/ABCDEF/join", nil)
	back.Header.Set("X-Duel-Player", actor.Token)
	again, err := s.duelEnter(back, "Гость")
	if err != nil {
		t.Fatalf("возврат гостя: %v", err)
	}
	if again.ID != actor.ID {
		t.Fatalf("гость вернулся другим участником: %q вместо %q", again.ID, actor.ID)
	}
	if again.Token != "" {
		t.Fatal("гостю выдали вторую подпись поверх своей")
	}
}

// Образцы маршрутов матча не должны конфликтовать между собой: ServeMux
// паникует на неоднозначных парах при запуске, то есть выкатка не поднимется.
func TestDuelRoutesResolve(t *testing.T) {
	mux := http.NewServeMux()
	handler := func(w http.ResponseWriter, r *http.Request) {}
	patterns := []string{
		"POST /v1/duel/rooms",
		"GET /v1/duel/queue",
		"POST /v1/duel/queue",
		"DELETE /v1/duel/queue",
		"GET /v1/duel/rooms/{code}",
		"POST /v1/duel/rooms/{code}/join",
		"POST /v1/duel/rooms/{code}/machine",
		"POST /v1/duel/rooms/{code}/start",
		"POST /v1/duel/rooms/{code}/answer",
		"POST /v1/duel/rooms/{code}/ready",
		"POST /v1/duel/rooms/{code}/vote",
		"POST /v1/duel/rooms/{code}/leave",
	}
	for _, pattern := range patterns {
		mux.HandleFunc(pattern, handler)
	}
	for _, item := range []struct{ method, path, want string }{
		{http.MethodGet, "/v1/duel/rooms/ABCDEF", "GET /v1/duel/rooms/{code}"},
		{http.MethodPost, "/v1/duel/rooms/ABCDEF/vote", "POST /v1/duel/rooms/{code}/vote"},
		{http.MethodPost, "/v1/duel/rooms", "POST /v1/duel/rooms"},
		{http.MethodGet, "/v1/duel/queue", "GET /v1/duel/queue"},
	} {
		_, pattern := mux.Handler(httptest.NewRequest(item.method, item.path, nil))
		if pattern != item.want {
			t.Errorf("%s %s → %q, ожидался %q", item.method, item.path, pattern, item.want)
		}
	}
}
