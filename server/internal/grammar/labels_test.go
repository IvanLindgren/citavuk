package grammar

import "testing"

func TestDeterminerUsesEducationalPronounLabel(t *testing.T) {
	if got := PosShort("DET"); got != "опред. местоимение" {
		t.Fatalf("короткая подпись DET = %q", got)
	}
	if got := PosFull("DET"); got != "определительное местоимение" {
		t.Fatalf("полная подпись DET = %q", got)
	}
}
