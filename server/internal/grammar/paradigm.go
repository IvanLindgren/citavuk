package grammar

import "strings"

// Cell — строка таблицы склонения или спряжения.
type Cell struct {
	Label string `json:"label"`
	Form  string `json:"form"`
	// Current отмечает форму, по которой пользователь нажал.
	Current bool `json:"current,omitempty"`
	// Generated — форма достроена правилом, а не взята из словаря. Показывать
	// такую надо с оговоркой: правила покрывают не все слова.
	Generated bool   `json:"generated,omitempty"`
	CaseKey   string `json:"caseKey,omitempty"`
}

// Table — таблица парадигмы.
type Table struct {
	Title            string `json:"title"`
	Subtitle         string `json:"subtitle,omitempty"`
	Rows             []Cell `json:"rows"`
	HighlightEndings bool   `json:"highlightEndings,omitempty"`
}

// Entry — форма из лексикона в виде, удобном для построения таблиц.
type Entry struct {
	Form  string
	Feats map[string]string
}

// BuildParadigms собирает таблицы для слова: сначала точные формы из словаря,
// недостающие достраиваются правилами и помечаются Generated.
func BuildParadigms(upos, lemma string, feats map[string]string, entries []Entry, surface string) []Table {
	surface = strings.ToLower(surface)
	lemma = strings.ToLower(lemma)
	switch upos {
	case "NOUN", "PROPN":
		gender := feats["Gender"]
		if gender == "" {
			gender = GuessGender(lemma, entries)
		}
		return declensionTables(lemma, gender, entries, surface)
	case "PRON", "NUM":
		return declensionTables("", "", entries, surface)
	case "ADJ":
		return append(adjectiveGenders(entries, surface),
			declensionTables("", "", entries, surface)...)
	case "VERB", "AUX":
		return conjugation(lemma, entries, surface)
	}
	return nil
}

func find(entries []Entry, match func(map[string]string) bool) string {
	for _, e := range entries {
		if match(e.Feats) {
			return e.Form
		}
	}
	return ""
}

func declensionTables(lemma, gender string, entries []Entry, surface string) []Table {
	var tables []Table
	for _, number := range []string{"Sing", "Plur"} {
		rows := make([]Cell, 0, len(CaseOrder))
		filled := 0
		for _, key := range CaseOrder {
			generated := false
			form := find(entries, func(f map[string]string) bool {
				return f["Number"] == number && f["Case"] == key
			})
			if form == "" && lemma != "" {
				form = declension(lemma, gender, number, key)
				generated = form != ""
			}
			if form != "" {
				filled++
			} else {
				form = "—"
			}
			rows = append(rows, Cell{
				Label:     caseRu[key],
				Form:      form,
				Current:   form != "—" && form == surface,
				Generated: generated,
				CaseKey:   key,
			})
		}
		if filled == 0 {
			continue
		}
		tables = append(tables, Table{
			Title:            "Склонение — " + numberRu[number] + " число",
			Rows:             rows,
			HighlightEndings: true,
		})
	}
	return tables
}

func adjectiveGenders(entries []Entry, surface string) []Table {
	rows := make([]Cell, 0, 3)
	filled := 0
	for _, gender := range []string{"Masc", "Fem", "Neut"} {
		form := find(entries, func(f map[string]string) bool {
			return f["Case"] == "Nom" && f["Number"] == "Sing" && f["Gender"] == gender
		})
		if form != "" {
			filled++
		} else {
			form = "—"
		}
		rows = append(rows, Cell{
			Label:   genderRu[gender] + " род",
			Form:    form,
			Current: form != "—" && form == surface,
		})
	}
	if filled == 0 {
		return nil
	}
	return []Table{{
		Title:            "Именительный падеж по родам",
		Rows:             rows,
		HighlightEndings: true,
	}}
}

func conjugation(lemma string, entries []Entry, surface string) []Table {
	var tables []Table

	present := presentForms(lemma)
	rows := make([]Cell, 0, 6)
	filled := 0
	for i := 0; i < 6; i++ {
		person := string(rune('1' + i%3))
		number := "Sing"
		if i >= 3 {
			number = "Plur"
		}
		generated := false
		form := find(entries, func(f map[string]string) bool {
			return f["Tense"] == "Pres" && f["Person"] == person && f["Number"] == number
		})
		if form == "" && len(present) == 6 {
			form = present[i]
			generated = form != ""
		}
		if form != "" {
			filled++
		} else {
			form = "—"
		}
		rows = append(rows, Cell{
			Label:     Persons[i],
			Form:      form,
			Current:   form != "—" && form == surface,
			Generated: generated,
		})
	}
	if filled > 0 {
		tables = append(tables, Table{
			Title:            "Презент — настоящее время",
			Rows:             rows,
			HighlightEndings: true,
		})
	}

	if perfect := perfectTable(lemma, entries, surface); perfect != nil {
		tables = append(tables, *perfect)
	}
	if future := futureTable(lemma, entries); future != nil {
		tables = append(tables, *future)
	}
	return tables
}

func participle(entries []Entry, gender, number string) string {
	return find(entries, func(f map[string]string) bool {
		return f["VerbForm"] == "Part" && f["Tense"] == "Past" &&
			f["Gender"] == gender && f["Number"] == number
	})
}

func perfectTable(lemma string, entries []Entry, surface string) *Table {
	rule := pastParticiple(lemma)
	// Порядок в rule: муж.ед, жен.ед, ср.ед, муж.мн, жен.мн, ср.мн.
	pick := func(gender, number string, index int) (string, bool) {
		if form := participle(entries, gender, number); form != "" {
			return form, false
		}
		if len(rule) == 6 {
			return rule[index], true
		}
		return "", false
	}

	mascSg, genMascSg := pick("Masc", "Sing", 0)
	femSg, _ := pick("Fem", "Sing", 1)
	mascPl, _ := pick("Masc", "Plur", 3)
	femPl, _ := pick("Fem", "Plur", 4)
	if mascSg == "" && femSg == "" {
		return nil
	}

	singular := []string{mascSg, femSg}
	plural := []string{mascPl, femPl}
	rows := make([]Cell, 0, 6)
	for i := 0; i < 6; i++ {
		parts := singular
		if i >= 3 {
			parts = plural
		}
		form := "—"
		if parts[0] != "" {
			form = PerfAux[i] + " " + parts[0]
			if parts[1] != "" && parts[1] != parts[0] {
				form += " / " + parts[1]
			}
		}
		rows = append(rows, Cell{
			Label:     Persons[i],
			Form:      form,
			Current:   surface != "" && strings.Contains(form, surface),
			Generated: genMascSg,
		})
	}
	return &Table{
		Title:    "Перфекат — прошедшее время",
		Subtitle: "вспомогательный глагол biti + причастие (мужской / женский род)",
		Rows:     rows,
	}
}

func futureTable(lemma string, entries []Entry) *Table {
	infinitive := find(entries, func(f map[string]string) bool {
		return f["VerbForm"] == "Inf"
	})
	if infinitive == "" {
		infinitive = lemma
	}
	if infinitive == "" {
		return nil
	}
	rows := make([]Cell, 0, 6)
	for i := 0; i < 6; i++ {
		rows = append(rows, Cell{
			Label: Persons[i],
			Form:  FutClitic[i] + " " + infinitive,
		})
	}
	return &Table{
		Title:    "Футур I — будущее время",
		Subtitle: "клитика hteti + инфинитив; в письме часто слитно: " + mergedFuture(infinitive),
		Rows:     rows,
	}
}

// mergedFuture показывает слитную запись: raditi → radiću.
func mergedFuture(infinitive string) string {
	switch {
	case strings.HasSuffix(infinitive, "ti"):
		return strings.TrimSuffix(infinitive, "ti") + "ću"
	case strings.HasSuffix(infinitive, "ći"):
		return infinitive + " ću"
	}
	return infinitive + " ću"
}
