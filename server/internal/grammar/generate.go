package grammar

import "strings"

// Достраивание форм правилами.
//
// Лексикон разрежен — на лемму приходится около двух форм, поэтому таблица без
// генерации состояла бы из прочерков. Правила и списки исключений повторяют
// frontend/lib/services/grammar_engine.dart.

var irregularPresent = map[string][]string{
	"biti":      {"sam", "si", "je", "smo", "ste", "su"},
	"hteti":     {"hoću", "hoćeš", "hoće", "hoćemo", "hoćete", "hoće"},
	"moći":      {"mogu", "možeš", "može", "možemo", "možete", "mogu"},
	"ići":       {"idem", "ideš", "ide", "idemo", "idete", "idu"},
	"doći":      {"dođem", "dođeš", "dođe", "dođemo", "dođete", "dođu"},
	"otići":     {"odem", "odeš", "ode", "odemo", "odete", "odu"},
	"naći":      {"nađem", "nađeš", "nađe", "nađemo", "nađete", "nađu"},
	"stići":     {"stignem", "stigneš", "stigne", "stignemo", "stignete", "stignu"},
	"jesti":     {"jedem", "jedeš", "jede", "jedemo", "jedete", "jedu"},
	"sesti":     {"sednem", "sedneš", "sedne", "sednemo", "sednete", "sednu"},
	"pasti":     {"padnem", "padneš", "padne", "padnemo", "padnete", "padnu"},
	"piti":      {"pijem", "piješ", "pije", "pijemo", "pijete", "piju"},
	"čuti":      {"čujem", "čuješ", "čuje", "čujemo", "čujete", "čuju"},
	"uzeti":     {"uzmem", "uzmeš", "uzme", "uzmemo", "uzmete", "uzmu"},
	"početi":    {"počnem", "počneš", "počne", "počnemo", "počnete", "počnu"},
	"umreti":    {"umrem", "umreš", "umre", "umremo", "umrete", "umru"},
	"doneti":    {"donesem", "doneseš", "donese", "donesemo", "donesete", "donesu"},
	"pisati":    {"pišem", "pišeš", "piše", "pišemo", "pišete", "pišu"},
	"kazati":    {"kažem", "kažeš", "kaže", "kažemo", "kažete", "kažu"},
	"vikati":    {"vičem", "vičeš", "viče", "vičemo", "vičete", "viču"},
	"plakati":   {"plačem", "plačeš", "plače", "plačemo", "plačete", "plaču"},
	"skakati":   {"skačem", "skačeš", "skače", "skačemo", "skačete", "skaču"},
	"zvati":     {"zovem", "zoveš", "zove", "zovemo", "zovete", "zovu"},
	"brati":     {"berem", "bereš", "bere", "beremo", "berete", "beru"},
	"prati":     {"perem", "pereš", "pere", "peremo", "perete", "peru"},
	"slati":     {"šaljem", "šalješ", "šalje", "šaljemo", "šaljete", "šalju"},
	"davati":    {"dajem", "daješ", "daje", "dajemo", "dajete", "daju"},
	"prodavati": {"prodajem", "prodaješ", "prodaje", "prodajemo", "prodajete", "prodaju"},
	"poznavati": {"poznajem", "poznaješ", "poznaje", "poznajemo", "poznajete", "poznaju"},
	"spavati":   {"spavam", "spavaš", "spava", "spavamo", "spavate", "spavaju"},
	"očekivati": {"očekujem", "očekuješ", "očekuje", "očekujemo", "očekujete", "očekuju"},
	"plivati":   {"plivam", "plivaš", "pliva", "plivamo", "plivate", "plivaju"},
	"uživati":   {"uživam", "uživaš", "uživa", "uživamo", "uživate", "uživaju"},
	"dati":      {"dam", "daš", "da", "damo", "date", "daju"},
	"smeti":     {"smem", "smeš", "sme", "smemo", "smete", "smeju"},
	"umeti":     {"umem", "umeš", "ume", "umemo", "umete", "umeju"},
	"razumeti":  {"razumem", "razumeš", "razume", "razumemo", "razumete", "razumeju"},
	"smejati":   {"smejem", "smeješ", "smeje", "smejemo", "smejete", "smeju"},
	"stajati":   {"stojim", "stojiš", "stoji", "stojimo", "stojite", "stoje"},
}

var irregularParticiple = map[string][]string{
	"biti":   {"bio", "bila", "bilo", "bili", "bile", "bila"},
	"moći":   {"mogao", "mogla", "moglo", "mogli", "mogle", "mogla"},
	"ići":    {"išao", "išla", "išlo", "išli", "išle", "išla"},
	"doći":   {"došao", "došla", "došlo", "došli", "došle", "došla"},
	"otići":  {"otišao", "otišla", "otišlo", "otišli", "otišle", "otišla"},
	"naći":   {"našao", "našla", "našlo", "našli", "našle", "našla"},
	"stići":  {"stigao", "stigla", "stiglo", "stigli", "stigle", "stigla"},
	"reći":   {"rekao", "rekla", "reklo", "rekli", "rekle", "rekla"},
	"jesti":  {"jeo", "jela", "jelo", "jeli", "jele", "jela"},
	"sesti":  {"seo", "sela", "selo", "seli", "sele", "sela"},
	"pasti":  {"pao", "pala", "palo", "pali", "pale", "pala"},
	"umreti": {"umro", "umrla", "umrlo", "umrli", "umrle", "umrla"},
	"doneti": {"doneo", "donela", "donelo", "doneli", "donele", "donela"},
}

var irregularPlural = map[string]map[string]string{
	"čovek": {"Nom": "ljudi", "Gen": "ljudi", "Dat": "ljudima", "Acc": "ljude", "Voc": "ljudi", "Ins": "ljudima", "Loc": "ljudima"},
	"dete":  {"Nom": "deca", "Gen": "dece", "Dat": "deci", "Acc": "decu", "Voc": "deco", "Ins": "decom", "Loc": "deci"},
	"brat":  {"Nom": "braća", "Gen": "braće", "Dat": "braći", "Acc": "braću", "Voc": "braćo", "Ins": "braćom", "Loc": "braći"},
	"oko":   {"Nom": "oči", "Gen": "očiju", "Dat": "očima", "Acc": "oči", "Voc": "oči", "Ins": "očima", "Loc": "očima"},
	"uho":   {"Nom": "uši", "Gen": "ušiju", "Dat": "ušima", "Acc": "uši", "Voc": "uši", "Ins": "ušima", "Loc": "ušima"},
}

var softFinals = map[rune]bool{'š': true, 'ž': true, 'č': true, 'ć': true, 'đ': true, 'j': true, 'c': true}

// softFinal — «мягкий» финал основы: после него Voc -u, Ins -em, мн. -evi.
func softFinal(s string) bool {
	if strings.HasSuffix(s, "lj") || strings.HasSuffix(s, "nj") {
		return true
	}
	runes := []rune(s)
	return len(runes) > 0 && softFinals[runes[len(runes)-1]]
}

var sibilarBlockers = map[rune]bool{'c': true, 'č': true, 'ć': true, 'z': true, 's': true, 'š': true, 'đ': true}

// sibilarize: k/g/h → c/z/s перед -i/-ima (vojnik → vojnici, knjiga → knjizi).
// Блокируется после c/č/ć/z/s/š/đ: mačka → mački, а не «mačci».
func sibilarize(stem string) string {
	runes := []rune(stem)
	if len(runes) == 0 {
		return stem
	}
	if len(runes) > 1 && sibilarBlockers[runes[len(runes)-2]] {
		return stem
	}
	swap := map[rune]rune{'k': 'c', 'g': 'z', 'h': 's'}
	if r, ok := swap[runes[len(runes)-1]]; ok {
		runes[len(runes)-1] = r
		return string(runes)
	}
	return stem
}

// palatalize: k/g/h → č/ž/š перед вокативным -e (čovek → čoveče, bog → bože).
func palatalize(stem string) string {
	runes := []rune(stem)
	if len(runes) == 0 {
		return stem
	}
	swap := map[rune]rune{'k': 'č', 'g': 'ž', 'h': 'š', 'c': 'č'}
	if r, ok := swap[runes[len(runes)-1]]; ok {
		runes[len(runes)-1] = r
		return string(runes)
	}
	return stem
}

func trimRunes(s string, n int) string {
	runes := []rune(s)
	if len(runes) <= n {
		return ""
	}
	return string(runes[:len(runes)-n])
}

// presentForms строит презент по инфинитиву. Пустая строка — там, где правила
// нет: očekivati → očekujem, но plivati → plivam, и угадывать нельзя.
func presentForms(inf string) []string {
	inf = strings.ToLower(inf)
	if forms, ok := irregularPresent[inf]; ok {
		return forms
	}
	var stem string
	var endings []string
	switch {
	case strings.HasSuffix(inf, "ovati"):
		stem = trimRunes(inf, 5) + "uj"
		endings = []string{"em", "eš", "e", "emo", "ete", "u"}
	case strings.HasSuffix(inf, "ivati"), strings.HasSuffix(inf, "avati"):
		return nil
	case strings.HasSuffix(inf, "nuti"):
		stem = trimRunes(inf, 4) + "n"
		endings = []string{"em", "eš", "e", "emo", "ete", "u"}
	case strings.HasSuffix(inf, "sti"):
		return nil
	case strings.HasSuffix(inf, "ati"):
		stem = trimRunes(inf, 3)
		endings = []string{"am", "aš", "a", "amo", "ate", "aju"}
	case strings.HasSuffix(inf, "iti"), strings.HasSuffix(inf, "eti"):
		stem = trimRunes(inf, 3)
		endings = []string{"im", "iš", "i", "imo", "ite", "e"}
	default:
		return nil
	}
	forms := make([]string, 0, 6)
	for _, e := range endings {
		forms = append(forms, stem+e)
	}
	return forms
}

// pastParticiple: [муж.ед, жен.ед, ср.ед, муж.мн, жен.мн, ср.мн].
// Для -ći и -sti правила нет — молчим, чтобы не учить «ićio» и «jesto».
func pastParticiple(inf string) []string {
	inf = strings.ToLower(inf)
	if forms, ok := irregularParticiple[inf]; ok {
		return forms
	}
	if strings.HasSuffix(inf, "ći") || strings.HasSuffix(inf, "sti") ||
		!strings.HasSuffix(inf, "ti") {
		return nil
	}
	s := trimRunes(inf, 2)
	return []string{s + "o", s + "la", s + "lo", s + "li", s + "le", s + "la"}
}

// declension достраивает падежную форму существительного.
func declension(lemma, gender, number, caseKey string) string {
	if number == "Plur" {
		if irr, ok := irregularPlural[lemma]; ok {
			return irr[caseKey]
		}
	}

	if gender == "Fem" && strings.HasSuffix(lemma, "a") {
		s := trimRunes(lemma, 1)
		if number == "Sing" {
			switch caseKey {
			case "Nom":
				return lemma
			case "Gen":
				return s + "e"
			case "Dat", "Loc":
				return sibilarize(s) + "i"
			case "Acc":
				return s + "u"
			case "Voc":
				return s + "o"
			case "Ins":
				return s + "om"
			}
			return ""
		}
		return s + map[string]string{
			"Nom": "e", "Gen": "a", "Dat": "ama", "Acc": "e",
			"Voc": "e", "Ins": "ama", "Loc": "ama",
		}[caseKey]
	}

	if gender == "Masc" {
		soft := softFinal(lemma)
		if number == "Sing" {
			switch caseKey {
			case "Nom":
				return lemma
			case "Gen":
				return lemma + "a"
			case "Dat", "Loc":
				return lemma + "u"
			case "Acc":
				// Зависит от одушевлённости: vidim grad, но vidim čoveka.
				return lemma + " / " + lemma + "a"
			case "Voc":
				if soft {
					return lemma + "u"
				}
				return palatalize(lemma) + "e"
			case "Ins":
				if soft {
					return lemma + "em"
				}
				return lemma + "om"
			}
			return ""
		}
		// Односложные основы расширяются -ov-/-ev-: grad → gradovi, muž → muževi.
		stem := lemma
		if len([]rune(lemma)) <= 4 {
			if soft {
				stem += "ev"
			} else {
				stem += "ov"
			}
		}
		switch caseKey {
		case "Nom", "Voc":
			return sibilarize(stem) + "i"
		case "Gen":
			return stem + "a"
		case "Dat", "Ins", "Loc":
			return sibilarize(stem) + "ima"
		case "Acc":
			return stem + "e"
		}
		return ""
	}

	if gender == "Neut" && (strings.HasSuffix(lemma, "o") || strings.HasSuffix(lemma, "e")) {
		s := trimRunes(lemma, 1)
		table := map[string]string{
			"Nom": "", "Gen": "a", "Dat": "u", "Acc": "",
			"Voc": "", "Ins": "om", "Loc": "u",
		}
		if number == "Plur" {
			table = map[string]string{
				"Nom": "a", "Gen": "a", "Dat": "ima", "Acc": "a",
				"Voc": "a", "Ins": "ima", "Loc": "ima",
			}
		}
		suffix, ok := table[caseKey]
		if !ok {
			return ""
		}
		if suffix == "" {
			return lemma
		}
		return s + suffix
	}

	return ""
}

// GuessGender определяет род, когда признаков нет.
func GuessGender(lemma string, entries []Entry) string {
	for _, e := range entries {
		if g := e.Feats["Gender"]; g != "" {
			return g
		}
	}
	switch {
	case strings.HasSuffix(lemma, "a"):
		return "Fem"
	case strings.HasSuffix(lemma, "o"), strings.HasSuffix(lemma, "e"):
		return "Neut"
	}
	return "Masc"
}
