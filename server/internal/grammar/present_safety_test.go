package grammar

import "testing"

func TestPresentRequiresKnownClass(t *testing.T) {
	for _, pair := range [][2]string{{"izabrati", "izabram"}, {"ustati", "ustam"}} {
		if _, ok := MatchVerb(pair[0], pair[1]); ok {
			t.Fatalf("принята выдуманная форма: %v", pair)
		}
	}
	for _, pair := range [][2]string{{"izabrati", "izaberem"}, {"raditi", "radim"}} {
		if _, ok := MatchVerb(pair[0], pair[1]); !ok {
			t.Fatalf("утрачена подтверждённая форма: %v", pair)
		}
	}
}
