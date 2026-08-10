package translationgame

import "testing"

func TestRoundCoversAllLevelsWithoutDuplicates(t *testing.T) {
	for _, direction := range []string{DirectionSrRu, DirectionRuSr} {
		for _, level := range []string{"A1", "A2", "B1", "B2", "C1", "C2"} {
			seen := map[string]bool{}
			for round := 1; round <= 3; round++ {
				items, err := Round(level, round, direction)
				if err != nil {
					t.Fatalf("%s %s/%d: %v", direction, level, round, err)
				}
				if len(items) != 5 {
					t.Fatalf("%s %s/%d: got %d sentences", direction, level, round, len(items))
				}
				for _, item := range items {
					if seen[item.ID] || item.Text == "" {
						t.Fatalf("%s %s: duplicate or empty sentence %q", direction, level, item.ID)
					}
					seen[item.ID] = true
				}
			}
			if len(seen) != 15 {
				t.Fatalf("%s %s: got %d unique sentences", direction, level, len(seen))
			}
		}
	}
}

// Пустое направление обязано остаться сербским: приложение поля не шлёт, и
// молчаливая смена языка сломала бы ему игру.
func TestEmptyDirectionStaysSerbian(t *testing.T) {
	direction, ok := NormalizeDirection("")
	if !ok || direction != DirectionSrRu {
		t.Fatalf("пустое направление дало %q, %v", direction, ok)
	}
	if _, bad := NormalizeDirection("sr-en"); bad {
		t.Fatal("неизвестное направление принято")
	}
	source, target := Languages(DirectionRuSr)
	if source != "ru" || target != "sr" {
		t.Fatalf("ru-sr дал %s→%s", source, target)
	}
}

// Банки не пересекаются: обратное направление написано заново, и совпавшая
// фраза означала бы, что кто-то перевёл сербский список вместо своего.
func TestBanksDoNotShareSentences(t *testing.T) {
	for level, bank := range russianSentences {
		if len(bank) != 15 {
			t.Fatalf("%s: %d русских фраз вместо 15", level, len(bank))
		}
		for _, text := range bank {
			for _, serbian := range serbianSentences[level] {
				if text == serbian {
					t.Fatalf("%s: фраза повторяется в обоих банках: %q", level, text)
				}
			}
		}
	}
}

func TestParseJudgeResult(t *testing.T) {
	raw := `{"verdicts":[
        {"index":0,"winner":"user","userScore":9,"translatorScore":7,"feedback":"Точнее."},
        {"index":1,"winner":"translator","userScore":6,"translatorScore":8,"feedback":"Естественнее."},
        {"index":2,"winner":"tie","userScore":8,"translatorScore":8,"feedback":"Равны."},
        {"index":3,"winner":"user","userScore":9,"translatorScore":8,"feedback":"Лучше стиль."},
        {"index":4,"winner":"translator","userScore":7,"translatorScore":9,"feedback":"Нет пропуска."}
    ],"summary":"Хороший раунд."}`
	result, err := parseResult(raw, 5)
	if err != nil || len(result.Verdicts) != 5 {
		t.Fatalf("parseResult: %#v, %v", result, err)
	}
}
