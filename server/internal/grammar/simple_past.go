package grammar

import "strings"

// Те же осторожные правила, что в офлайн-движке Dart.
func simplePastForms(lemma, tense string) []string {
	lemma = strings.ToLower(lemma)
	if tense == "Past" {
		irregular := map[string][]string{
			"biti":  {"bih", "bi", "bi", "bismo", "biste", "biše"},
			"reći":  {"rekoh", "reče", "reče", "rekosmo", "rekoste", "rekoše"},
			"doći":  {"dođoh", "dođe", "dođe", "dođosmo", "dođoste", "dođoše"},
			"otići": {"odoh", "ode", "ode", "odosmo", "odoste", "odoše"},
			"naći":  {"nađoh", "nađe", "nađe", "nađosmo", "nađoste", "nađoše"},
			"stići": {"stigoh", "stiže", "stiže", "stigosmo", "stigoste", "stigoše"},
			"pasti": {"padoh", "pade", "pade", "padosmo", "padoste", "padoše"},
			"sesti": {"sedoh", "sede", "sede", "sedosmo", "sedoste", "sedoše"},
			"jesti": {"jedoh", "jede", "jede", "jedosmo", "jedoste", "jedoše"},
		}
		if forms := irregular[lemma]; forms != nil {
			return forms
		}
		if !strings.HasSuffix(lemma, "ti") || strings.HasSuffix(lemma, "sti") {
			return nil
		}
		stem := strings.TrimSuffix(lemma, "ti")
		return []string{stem + "h", stem, stem, stem + "smo", stem + "ste", stem + "še"}
	}
	if lemma == "biti" {
		return []string{"bejah", "beše", "beše", "bejasmo", "bejaste", "bejahu"}
	}
	known := " gledati čitati slušati pevati igrati čekati pričati spavati plivati kuvati šetati sanjati padati davati imati znati pitati trčati plakati "
	if !strings.Contains(known, " "+lemma+" ") {
		return nil
	}
	stem := strings.TrimSuffix(lemma, "ti")
	return []string{stem + "h", stem + "še", stem + "še", stem + "smo", stem + "ste", stem + "hu"}
}

func simplePastTable(lemma string, entries []Entry, surface, tense string) *Table {
	rule := simplePastForms(lemma, tense)
	rows := make([]Cell, 0, 6)
	filled := false
	for i := 0; i < 6; i++ {
		person := string(rune('1' + i%3))
		number := "Sing"
		if i >= 3 {
			number = "Plur"
		}
		form := find(entries, func(f map[string]string) bool {
			return f["Tense"] == tense && f["VerbForm"] == "Fin" && f["Person"] == person && f["Number"] == number && (tense != "Past" || f["Mood"] == "" || f["Mood"] == "Ind")
		})
		generated := false
		if form == "" && len(rule) == 6 {
			form = rule[i]
			generated = form != ""
		}
		if form != "" {
			filled = true
		} else {
			form = "—"
		}
		rows = append(rows, Cell{Label: Persons[i], Form: form, Current: form == surface, Generated: generated})
	}
	if !filled {
		return nil
	}
	title := "Аорист — книжное прошедшее"
	if tense == "Imp" {
		title = "Имперфект — книжное прошедшее"
	}
	return &Table{Title: title, Rows: rows, HighlightEndings: true}
}
