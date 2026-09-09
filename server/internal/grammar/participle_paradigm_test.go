package grammar

import "testing"

func TestPassiveParticipleOnlyUsesLexicon(t *testing.T) {
	feats := map[string]string{"Gender": "Fem", "Number": "Sing", "VerbForm": "Part", "Voice": "Pass"}
	entries := []Entry{{Form: "izabrana", Feats: map[string]string{"Gender": "Fem", "Number": "Sing", "Case": "Nom", "Definite": "Def", "VerbForm": "Part", "Voice": "Pass"}}}
	tables := BuildParadigms("ADJ", "izabrati", feats, entries, "izabrana")
	if len(tables) == 0 {
		t.Fatal("утрачены словарные формы")
	}
	for _, table := range tables {
		for _, row := range table.Rows {
			if row.Form != "—" && (row.Form != "izabrana" || row.Generated) {
				t.Fatalf("выдуманная форма причастия: %+v", row)
			}
		}
	}
}
