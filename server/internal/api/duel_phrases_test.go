package api

import (
	"encoding/json"
	"reflect"
	"testing"
	"time"

	"github.com/citavuk/server/internal/duel"
)

func TestDuelPhraseShuffleSurvivesStoredRoom(t *testing.T) {
	now := time.Now() // В памяти есть monotonic clock; JSON его удалит.
	room := &duel.Room{
		Code: "TEST42", Level: "B1", Direction: "sr-ru", Seats: 2,
		Phase: duel.PhaseLobby, CreatedAt: now, UpdatedAt: now,
		Players: []duel.Player{{ID: "one", Name: "Аня", Joined: true}, {ID: "two", Name: "Борис", Joined: true}},
	}
	raw, err := json.Marshal(room)
	if err != nil {
		t.Fatal(err)
	}
	var stored duel.Room
	if err := json.Unmarshal(raw, &stored); err != nil {
		t.Fatal(err)
	}
	if err := startDuelRound(room, now); err != nil {
		t.Fatal(err)
	}
	if err := startDuelRound(&stored, now); err != nil {
		t.Fatal(err)
	}
	if !reflect.DeepEqual(room.Sentences, stored.Sentences) {
		t.Fatal("сериализация комнаты изменила общую колоду")
	}
}
