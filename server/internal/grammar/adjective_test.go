package grammar

import "strings"

import "testing"

func TestAdjectiveStem(t *testing.T) {
	cases := map[string]string{
		"dobar":   "dobr",
		"hladan":  "hladn",
		"pametan": "pametn",
		"mokar":   "mokr",
		"oštar":   "oštr",
		"topao":   "topl",
		"veseo":   "vesel",
		"debeo":   "debel",
		"beo":     "bel",
		"zao":     "zl",
		"kratak":  "kratk",
		"nizak":   "nisk",
		"veliki":  "velik",
		"letnji":  "letnj",
		"lep":     "lep",
		"nov":     "nov",
		// Односложные беглого «а» не имеют: «stran» не «strn», «star» не «str».
		"stran": "stran",
		"star":  "star",
	}
	for lemma, want := range cases {
		if got := adjectiveStem(lemma); got != want {
			t.Errorf("adjectiveStem(%q) = %q, ожидалось %q", lemma, got, want)
		}
	}
}

// Вид прилагательного — то, чего нет в русском, и именно ради него склонение
// прилагательного вообще имеет смысл показывать.
func TestAdjectiveDefiniteAndIndefinite(t *testing.T) {
	cases := []struct {
		lemma, gender, number, caseKey string
		definite                       bool
		want                           string
	}{
		// Мужской род единственного — там вид виден.
		{"dobar", "Masc", "Sing", "Nom", false, "dobar"},
		{"dobar", "Masc", "Sing", "Nom", true, "dobri"},
		{"dobar", "Masc", "Sing", "Gen", false, "dobra"},
		{"dobar", "Masc", "Sing", "Gen", true, "dobrog"},
		{"dobar", "Masc", "Sing", "Dat", false, "dobru"},
		{"dobar", "Masc", "Sing", "Dat", true, "dobrom"},
		{"dobar", "Masc", "Sing", "Ins", false, "dobrim"},
		{"dobar", "Masc", "Sing", "Ins", true, "dobrim"},
		// Средний род тоже различает вид в косвенных падежах.
		{"dobar", "Neut", "Sing", "Nom", false, "dobro"},
		{"dobar", "Neut", "Sing", "Gen", false, "dobra"},
		{"dobar", "Neut", "Sing", "Gen", true, "dobrog"},
		// Женский род не различает — и это факт языка, а не упрощение.
		{"dobar", "Fem", "Sing", "Nom", false, "dobra"},
		{"dobar", "Fem", "Sing", "Nom", true, "dobra"},
		{"dobar", "Fem", "Sing", "Dat", false, "dobroj"},
		{"dobar", "Fem", "Sing", "Dat", true, "dobroj"},
		{"dobar", "Fem", "Sing", "Ins", false, "dobrom"},
		// Множественное — одно на оба вида.
		{"dobar", "Masc", "Plur", "Nom", false, "dobri"},
		{"dobar", "Masc", "Plur", "Nom", true, "dobri"},
		{"dobar", "Masc", "Plur", "Gen", true, "dobrih"},
		{"dobar", "Fem", "Plur", "Nom", false, "dobre"},
		{"dobar", "Neut", "Plur", "Nom", false, "dobra"},
		// Мягкая основа меняет «о» на «е» в мужском и среднем роде.
		{"vruć", "Masc", "Sing", "Gen", true, "vrućeg"},
		{"vruć", "Masc", "Sing", "Dat", true, "vrućem"},
		{"vruć", "Neut", "Sing", "Nom", false, "vruće"},
		// А в женском — не меняет.
		{"vruć", "Fem", "Sing", "Dat", false, "vrućoj"},
		{"vruć", "Fem", "Sing", "Ins", false, "vrućom"},
		// Лемма в определённой форме тоже разбирается.
		{"veliki", "Masc", "Sing", "Gen", true, "velikog"},
		{"veliki", "Masc", "Sing", "Nom", false, "velik"},
	}
	for _, c := range cases {
		got := AdjectiveForm(c.lemma, c.gender, c.number, c.caseKey, c.definite)
		if got != c.want {
			t.Errorf("%s (%s %s %s, definite=%v) = %q, ожидалось %q",
				c.lemma, c.gender, c.number, c.caseKey, c.definite, got, c.want)
		}
	}
}

func TestComparative(t *testing.T) {
	cases := map[string]string{
		"dobar":   "bolji",
		"velik":   "veći",
		"mali":    "manji",
		"lep":     "lepši",
		"jak":     "jači",
		"mlad":    "mlađi",
		"visok":   "viši",
		"žut":     "žući",
		"nov":     "noviji",
		"star":    "stariji",
		"pametan": "pametniji",
		// Беглое «а» выпадает и в компаративе.
		"hladan": "hladniji",
		"zelen":  "zeleniji",
	}
	for lemma, want := range cases {
		if got := Comparative(lemma); got != want {
			t.Errorf("Comparative(%q) = %q, ожидалось %q", lemma, got, want)
		}
	}
	if got := Superlative("bolji"); got != "najbolji" {
		t.Errorf("Superlative = %q, ожидалось najbolji", got)
	}
	if Superlative("") != "" {
		t.Error("суперлатив без компаратива обязан быть пустым")
	}
}

// Прилагательное обязано получать таблицы даже тогда, когда лексикон о нём
// ничего не знает: раньше в этом случае таблиц не было вовсе.
func TestAdjectiveParadigmsWithoutLexicon(t *testing.T) {
	tables := BuildParadigms("ADJ", "dobar", map[string]string{
		"Gender": "Masc", "Number": "Sing", "Case": "Gen", "Definite": "Def",
	}, nil, "dobrog")
	if len(tables) < 2 {
		t.Fatalf("таблиц %d, ожидались склонение и степени сравнения", len(tables))
	}

	var declension, degrees *Table
	for i := range tables {
		switch {
		case strings.HasPrefix(tables[i].Title, "Склонение"):
			declension = &tables[i]
		case tables[i].Title == "Степени сравнения":
			degrees = &tables[i]
		}
	}
	if declension == nil {
		t.Fatal("таблицы склонения нет")
	}
	if len(declension.Rows) != len(CaseOrder) {
		t.Fatalf("строк склонения %d, ожидалось %d", len(declension.Rows), len(CaseOrder))
	}
	if got := declension.Rows[1].Form; got != "dobra / dobrog" {
		t.Errorf("родительный падеж показан как %q", got)
	}
	if !declension.Rows[1].Current {
		t.Error("разобранная форма dobrog не отмечена как текущая")
	}
	if degrees == nil {
		t.Fatal("таблицы степеней сравнения нет")
	}
	if got := degrees.Rows[1].Form; got != "bolji" {
		t.Errorf("компаратив показан как %q", got)
	}
}

// Признаки, которых движок раньше не читал вовсе.
func TestDescribeReadsDegreeDefiniteAndVerbForms(t *testing.T) {
	fact := func(info Info, label string) string {
		for _, f := range info.Facts {
			if f.Label == label {
				return f.Value
			}
		}
		return ""
	}

	cmp := Describe("ADJ", map[string]string{
		"Degree": "Cmp", "Case": "Nom", "Number": "Sing", "Gender": "Masc",
	})
	if got := fact(cmp, "Степень сравнения"); got == "" {
		t.Error("компаратив не отмечен степенью сравнения")
	}
	if !strings.Contains(cmp.Summary, "сравнительная степень") {
		t.Errorf("сводка компаратива: %q", cmp.Summary)
	}

	def := Describe("ADJ", map[string]string{
		"Definite": "Def", "Case": "Gen", "Number": "Sing", "Gender": "Masc",
	})
	if got := fact(def, "Вид прилагательного"); got == "" {
		t.Error("вид прилагательного не показан")
	}
	if !strings.Contains(def.Why, "određeni") {
		t.Errorf("пояснение к определённому виду: %q", def.Why)
	}

	conv := Describe("VERB", map[string]string{"VerbForm": "Conv"})
	if got := fact(conv, "Форма"); got == "" {
		t.Error("деепричастие осталось без разбора")
	}
	if conv.Summary == "" || conv.Why == "" {
		t.Errorf("деепричастие: сводка %q, пояснение %q", conv.Summary, conv.Why)
	}

	pass := Describe("ADJ", map[string]string{
		"VerbForm": "Part", "Voice": "Pass",
		"Gender": "Masc", "Number": "Sing", "Case": "Nom",
	})
	if got := fact(pass, "Залог"); got == "" {
		t.Error("страдательный залог не показан")
	}
	if !strings.Contains(pass.Why, "трпни") {
		t.Errorf("пояснение к трпном придеву: %q", pass.Why)
	}
}

func TestPresentFormsIConjugationAti(t *testing.T) {
	cases := map[string][]string{
		"držati": {"držim", "držiš", "drži", "držimo", "držite", "drže"},
		"trčati": {"trčim", "trčiš", "trči", "trčimo", "trčite", "trče"},
		// a-спряжение обязано остаться a-спряжением.
		"slušati": {"slušam", "slušaš", "sluša", "slušamo", "slušate", "slušaju"},
		"čitati":  {"čitam", "čitaš", "čita", "čitamo", "čitate", "čitaju"},
		"igrati":  {"igram", "igraš", "igra", "igramo", "igrate", "igraju"},
	}
	for inf, want := range cases {
		got := presentForms(inf)
		if len(got) != len(want) {
			t.Errorf("presentForms(%q) = %v", inf, got)
			continue
		}
		for i := range want {
			if got[i] != want[i] {
				t.Errorf("presentForms(%q)[%d] = %q, ожидалось %q", inf, i, got[i], want[i])
			}
		}
	}
}
