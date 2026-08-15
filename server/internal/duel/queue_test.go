package duel

import (
	"testing"
	"time"
)

func waiting(id string, seats int, ago time.Duration) Waiting {
	return Waiting{
		ID: id, Name: id, Level: "A2", Direction: "sr-ru",
		Seats: seats, Since: start.Add(-ago),
	}
}

// ids возвращает состав группы для сравнения.
func ids(group Group) []string {
	out := make([]string, 0, len(group.Players))
	for _, player := range group.Players {
		out = append(out, player.ID)
	}
	return out
}

func same(left, right []string) bool {
	if len(left) != len(right) {
		return false
	}
	for i := range left {
		if left[i] != right[i] {
			return false
		}
	}
	return true
}

func TestPairFormsAtOnce(t *testing.T) {
	groups := Match([]Waiting{waiting("anya", 2, time.Second), waiting("boris", 2, 0)}, start)
	if len(groups) != 1 {
		t.Fatalf("двое желающих сыграть вдвоём дали %d комнат", len(groups))
	}
	if !same(ids(groups[0]), []string{"anya", "boris"}) {
		t.Fatalf("состав комнаты %v", ids(groups[0]))
	}
	if groups[0].Seats != 2 {
		t.Fatalf("мест в комнате %d", groups[0].Seats)
	}
}

func TestOneIsNotAMatch(t *testing.T) {
	if groups := Match([]Waiting{waiting("anya", 2, time.Hour)}, start); len(groups) != 0 {
		t.Fatalf("одинокий игрок собрал %d комнат", len(groups))
	}
}

func TestLevelAndDirectionNeverMix(t *testing.T) {
	other := waiting("boris", 2, 0)
	other.Level = "B2"
	third := waiting("vera", 2, 0)
	third.Direction = "ru-sr"

	groups := Match([]Waiting{waiting("anya", 2, time.Minute), other, third}, start)
	if len(groups) != 0 {
		t.Fatalf("подбор смешал уровни и направления: %+v", groups)
	}
}

func TestBiggerRoomWaitsForItsPeople(t *testing.T) {
	queue := []Waiting{waiting("anya", 4, time.Second), waiting("boris", 4, 0)}
	if groups := Match(queue, start); len(groups) != 0 {
		t.Fatalf("комната на четверых собралась из двоих: %+v", groups)
	}

	queue = append(queue, waiting("vera", 4, 0), waiting("gleb", 4, 0))
	groups := Match(queue, start)
	if len(groups) != 1 || len(groups[0].Players) != 4 {
		t.Fatalf("четверо не собрались: %+v", groups)
	}
}

func TestLongWaitAcceptsSmallerRoom(t *testing.T) {
	// Оба ждут комнату на четверых, но уже слишком долго.
	queue := []Waiting{waiting("anya", 4, Relax), waiting("boris", 4, Relax)}
	groups := Match(queue, start)
	if len(groups) != 1 || groups[0].Seats != 2 {
		t.Fatalf("после долгого ожидания пара не собралась: %+v", groups)
	}
}

func TestSmallRoomChoiceIsNotOverridden(t *testing.T) {
	// Один просил комнату на двоих и ждёт целую вечность, другой — на шестерых
	// и только что пришёл. Вдвоём они сыграть не могут: тот, кто просил шестерых,
	// ещё не согласился на меньшее.
	queue := []Waiting{waiting("anya", 2, time.Hour), waiting("boris", 6, 0)}
	if groups := Match(queue, start); len(groups) != 0 {
		t.Fatalf("выбор размера комнаты нарушен: %+v", groups)
	}

	// А когда согласился — играют вдвоём, как просил первый.
	queue[1] = waiting("boris", 6, Relax)
	groups := Match(queue, start)
	if len(groups) != 1 || groups[0].Seats != 2 {
		t.Fatalf("уступивший не сел за стол на двоих: %+v", groups)
	}
}

func TestLongestWaitIsServedFirst(t *testing.T) {
	queue := []Waiting{
		waiting("noviy", 2, time.Second),
		waiting("stariy", 2, 10*time.Minute),
		waiting("sredniy", 2, 5*time.Minute),
	}
	groups := Match(queue, start)
	if len(groups) != 1 {
		t.Fatalf("из троих собралось %d комнат", len(groups))
	}
	if !same(ids(groups[0]), []string{"stariy", "sredniy"}) {
		t.Fatalf("вперёд пропустили новичка: %v", ids(groups[0]))
	}
}

func TestSixWaitingGiveThreeRooms(t *testing.T) {
	queue := []Waiting{
		waiting("a", 2, 6*time.Second), waiting("b", 2, 5*time.Second),
		waiting("c", 2, 4*time.Second), waiting("d", 2, 3*time.Second),
		waiting("e", 2, 2*time.Second), waiting("f", 2, time.Second),
	}
	groups := Match(queue, start)
	if len(groups) != 3 {
		t.Fatalf("шестеро дали %d комнат, ожидалось 3", len(groups))
	}
	seen := map[string]bool{}
	for _, group := range groups {
		for _, player := range group.Players {
			if seen[player.ID] {
				t.Fatalf("игрок %s попал в две комнаты", player.ID)
			}
			seen[player.ID] = true
		}
	}
}

func TestBiggerRoomIsPreferredWhenPeopleAreThere(t *testing.T) {
	// Все четверо давно ждут комнату на четверых: смягчение размера не должно
	// разрывать их на две пары.
	queue := []Waiting{
		waiting("a", 4, Relax+4*time.Second), waiting("b", 4, Relax+3*time.Second),
		waiting("c", 4, Relax+2*time.Second), waiting("d", 4, Relax+time.Second),
	}
	groups := Match(queue, start)
	if len(groups) != 1 || groups[0].Seats != 4 {
		t.Fatalf("четверо разошлись по парам: %+v", groups)
	}
}

func TestRipeSuggestsMachineAfterPatience(t *testing.T) {
	if Ripe(start, start.Add(Patience-time.Second)) {
		t.Fatal("предложение сыграть с машиной пришло слишком рано")
	}
	if !Ripe(start, start.Add(Patience)) {
		t.Fatal("ожидание затянулось, а машину не предложили")
	}
}
