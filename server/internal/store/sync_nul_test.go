package store

import "testing"

func TestChangesStripNUL(t *testing.T) {
	nul := string(rune(0))
	changes := Changes{
		Books:      []Book{{Title: "Na" + nul + "slov"}},
		Vocabulary: []VocabEntry{{Word: "ku" + nul + "ća", Forms: map[string]any{"gen" + nul: []any{"ku" + nul + "će"}}}},
		Palaces:    []Palace{{Name: "Soba", Pins: map[string]PalacePin{"sto" + nul: {Word: "sto" + nul}}}},
		Quotes:     []ReaderQuote{{Text: "a" + nul + "b"}},
	}
	changes.StripNUL()
	if changes.Books[0].Title != "Naslov" || changes.Vocabulary[0].Word != "kuća" || changes.Quotes[0].Text != "ab" {
		t.Fatalf("NUL остался: %+v", changes)
	}
	forms := changes.Vocabulary[0].Forms.(map[string]any)
	if got := forms["gen"].([]any)[0]; got != "kuće" {
		t.Fatalf("forms = %v", forms)
	}
	if pin, ok := changes.Palaces[0].Pins["sto"]; !ok || pin.Word != "sto" {
		t.Fatalf("pins = %v", changes.Palaces[0].Pins)
	}
}
