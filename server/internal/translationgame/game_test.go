package translationgame

import "testing"

func TestRoundCoversAllLevelsWithoutDuplicates(t *testing.T) {
	for _, level := range []string{"A1", "A2", "B1", "B2", "C1", "C2"} {
		seen := map[string]bool{}
		for round := 1; round <= 3; round++ {
			items, err := Round(level, round)
			if err != nil {
				t.Fatalf("%s/%d: %v", level, round, err)
			}
			if len(items) != 5 {
				t.Fatalf("%s/%d: got %d sentences", level, round, len(items))
			}
			for _, item := range items {
				if seen[item.ID] || item.Text == "" {
					t.Fatalf("%s: duplicate or empty sentence %q", level, item.ID)
				}
				seen[item.ID] = true
			}
		}
		if len(seen) != 15 {
			t.Fatalf("%s: got %d unique sentences", level, len(seen))
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
