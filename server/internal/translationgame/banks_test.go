package translationgame

import (
	"fmt"
	"reflect"
	"strings"
	"testing"
)

func TestExpandedBanks(t *testing.T) {
	total := 0
	seen := map[string]bool{}
	for _, banks := range []map[string][]string{serbianSentences, russianSentences} {
		for _, level := range Levels {
			if len(banks[level]) < 45 {
				t.Fatalf("%s: только %d фраз", level, len(banks[level]))
			}
			for _, text := range banks[level] {
				key := strings.ToLower(strings.TrimSpace(text))
				if seen[key] || strings.ContainsAny(text, "\r\n") {
					t.Fatalf("повтор или повреждённая фраза: %q", text)
				}
				seen[key] = true
				total++
			}
		}
	}
	if total < 1180 {
		t.Fatalf("добавлено только %d фраз вместо минимум 1000", total-180)
	}
}

func TestSeededMatchIsStableAndDoesNotRepeat(t *testing.T) {
	for _, direction := range []string{DirectionSrRu, DirectionRuSr} {
		for _, level := range Levels {
			seen := map[string]bool{}
			for round := 1; round <= 3; round++ {
				a, err := RoundWithSeed(level, round, direction, "room-123")
				if err != nil {
					t.Fatal(err)
				}
				b, _ := RoundWithSeed(level, round, direction, "room-123")
				if !reflect.DeepEqual(a, b) {
					t.Fatal("повтор запроса изменил задания комнаты")
				}
				for _, sentence := range a {
					if seen[sentence.ID] {
						t.Fatal("фраза повторилась в матче", sentence.ID)
					}
					seen[sentence.ID] = true
				}
			}
		}
	}
}

func TestDifferentMatchesUseExpandedBank(t *testing.T) {
	seen := map[string]bool{}
	for match := 0; match < 120; match++ {
		items, _ := RoundWithSeed("A1", 1, DirectionSrRu, fmt.Sprint(match))
		for _, item := range items {
			seen[item.ID] = true
		}
	}
	if len(seen) < 80 {
		t.Fatalf("не используются новые фразы: %d", len(seen))
	}
}

func TestLegacyClientsDoNotRepeatBetweenRounds(t *testing.T) {
	for match := 0; match < 20; match++ {
		seen := map[string]bool{}
		for round := 1; round <= 3; round++ {
			items, _ := Round("B1", round, "")
			for _, item := range items {
				if seen[item.ID] {
					t.Fatal("старый клиент получил повтор в соседнем раунде")
				}
				seen[item.ID] = true
			}
		}
	}
}

func TestOriginalSentenceIDsPreserved(t *testing.T) {
	if serbianSentences["A1"][0] != "Ja živim u malom gradu." || russianSentences["A1"][0] != "Я живу рядом со школой." {
		t.Fatal("первые строки старых банков изменились")
	}
}

func TestSeedNormalizesLegacyDirectionAndLevel(t *testing.T) {
	a, _ := RoundWithSeed("a1", 1, "", "same-room")
	b, _ := RoundWithSeed("A1", 1, "sr-ru", "same-room")
	if !reflect.DeepEqual(a, b) {
		t.Fatal("равнозначные старые параметры изменили колоду")
	}
}

func TestInvalidRoundsStillRejected(t *testing.T) {
	for _, test := range []struct {
		level     string
		round     int
		direction string
	}{
		{"A0", 1, "sr-ru"}, {"A1", 0, "sr-ru"}, {"B1", 4, "sr-ru"}, {"A2", 1, "sr-en"},
	} {
		if _, err := Round(test.level, test.round, test.direction); err != ErrInvalidRound {
			t.Fatalf("принят неверный запрос: %+v", test)
		}
	}
}
