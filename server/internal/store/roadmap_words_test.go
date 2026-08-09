package store

import "testing"

func TestDefaultRoadmapWordExample(t *testing.T) {
	tests := []struct {
		word RoadmapWord
		want string
	}{
		{RoadmapWord{Lemma: "vrata", POS: "NOUN", Note: "мн."}, "Ovo su vrata."},
		{RoadmapWord{Lemma: "odmoriti se", POS: "VERB"}, "Sutra ću se odmoriti."},
		{RoadmapWord{Lemma: "lep", POS: "ADJ"}, "Ovo je lep primer."},
	}
	for _, test := range tests {
		if got := defaultRoadmapWordExample(test.word); got != test.want {
			t.Errorf("defaultRoadmapWordExample(%q) = %q, want %q", test.word.Lemma, got, test.want)
		}
	}
}
