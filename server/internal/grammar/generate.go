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

// Глаголы на -ati, спрягающиеся по i-типу: držati → držim, а не «držam».
//
// Список, а не правило по окончанию основы. Правило напрашивается — почти у
// всех этих глаголов основа кончается на č/ž/š, — но оно неверно: «slušati»
// даёт «slušam», а не «slušim», и по форме эти два класса неразличимы.
// Угадывать здесь нельзя ровно по той же причине, по которой presentForms
// молчит про «-sti»: неверная форма хуже отсутствующей.
var iConjugationAti = map[string]bool{
	"bežati": true, "bojati": true, "brujati": true, "ćutati": true,
	"držati": true, "klečati": true, "ležati": true, "pištati": true,
	"škripati": true, "trčati": true, "vrištati": true, "zviždati": true,
	"zvučati": true, "šuštati": true,
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
	// Собирательные на -ad склоняются как женский род на согласный, а не как
	// обычное множественное. Правилом это не выводится, поэтому списком.
	"tele":   {"Nom": "telad", "Gen": "teladi", "Dat": "teladi", "Acc": "telad", "Voc": "telad", "Ins": "teladi", "Loc": "teladi"},
	"jagnje": {"Nom": "jagnjad", "Gen": "jagnjadi", "Dat": "jagnjadi", "Acc": "jagnjad", "Voc": "jagnjad", "Ins": "jagnjadi", "Loc": "jagnjadi"},
	"pile":   {"Nom": "pilad", "Gen": "piladi", "Dat": "piladi", "Acc": "pilad", "Voc": "pilad", "Ins": "piladi", "Loc": "piladi"},
	"dugme":  {"Nom": "dugmad", "Gen": "dugmadi", "Dat": "dugmadi", "Acc": "dugmad", "Voc": "dugmad", "Ins": "dugmadi", "Loc": "dugmadi"},
}

// Средний род с расширением основы. Без него «ime» склонялось как «ima»,
// а «vreme» — как «vrema»: слова из первой сотни любого учебника.
//
// Оба класса закрытые и правилом из формы не выводятся: -e в конце одинаково у
// «selo/polje» (расширения нет), «ime» (-men-) и «tele» (-et-).
var (
	neuterMenStems = map[string]bool{
		"ime": true, "vreme": true, "breme": true, "pleme": true, "seme": true,
		"teme": true, "rame": true, "vime": true, "sleme": true, "prezime": true,
	}
	neuterEtStems = map[string]bool{
		"dete": true, "tele": true, "jagnje": true, "pile": true, "prase": true,
		"mače": true, "štene": true, "kuče": true, "momče": true, "unuče": true,
		"dugme": true, "uže": true, "bure": true, "đubre": true,
	}
)

// Беглое «а» (непостојано а). Оно исчезает во всех падежах, кроме
// именительного единственного и родительного множественного: otac → oca, но
// otaca. Часть выводится правилом (-ac, многосложное -ak), остальное — списком:
// «dan» и «znak» беглого «а» не имеют, и отличить их по форме нельзя.
var irregularFugitive = map[string]string{
	"otac":  "oc",
	"pas":   "ps",
	"san":   "sn",
	"vetar": "vetr",
	"metar": "metr",
	"litar": "litr",
	"mozak": "mozg",
	"nokat": "nokt",
	"lakat": "lakt",
	"vosak": "vosk",
	"orao":  "orl",
	"posao": "posl",
	"ugao":  "ugl",
}

// Односложные слова, множественное которых обходится без -ov-/-ev-.
//
// Правило «односложное → длинное множественное» верное, но исключений у него
// столько, что без списка оно учит «danovi» и «zubovi».
// Слова здесь только односложные: многосложные и без списка обходятся коротким
// множественным. «ključ», «muž», «nož» в список НЕ входят — у них как раз
// «ključevi», «muževi», «noževi», и правило для них верно.
var shortPluralNouns = map[string]bool{
	"dan": true, "zub": true, "gost": true, "konj": true, "prst": true,
	"crv": true, "mrav": true, "vuk": true, "sat": true, "zec": true,
}

// vowels — гласные для подсчёта слогов.
var vowels = map[rune]bool{'a': true, 'e': true, 'i': true, 'o': true, 'u': true}

// syllables считает слоги. Слоговое «р» («prst», «vrt», «trg») даёт слог без
// единой гласной, и без этой оговорки такие слова считались бы нулевыми.
func syllables(word string) int {
	count := 0
	hasR := false
	for _, r := range word {
		if vowels[r] {
			count++
		}
		if r == 'r' {
			hasR = true
		}
	}
	if count == 0 && hasR {
		return 1
	}
	return count
}

// fugitiveStem возвращает основу без беглого «а».
//
// Второе значение сообщает, что «а» действительно беглое: от этого зависит не
// только основа, но и звательный падеж (starac → starče, а не «starcu»).
func fugitiveStem(lemma string) (string, bool) {
	if stem, ok := irregularFugitive[lemma]; ok {
		return stem, true
	}
	runes := []rune(lemma)
	if len(runes) < 4 {
		return lemma, false
	}
	// -ac: starac → starc, borac → borc, novac → novc. Односложные «zec» и
	// «stric» под правило не попадают — там не «-ac».
	if strings.HasSuffix(lemma, "ac") {
		return string(runes[:len(runes)-2]) + "c", true
	}
	// -ak: беглое «а» только у многосложных. «znak», «rak», «mrak» — односложные
	// и «а» сохраняют.
	if strings.HasSuffix(lemma, "ak") && syllables(lemma) >= 2 {
		return string(runes[:len(runes)-2]) + "k", true
	}
	return lemma, false
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
	// Часть глаголов на -ati спрягается по i-типу: držati → držim,
	// trčati → trčim. Правило «всё на -ati даёт -am» учило «držam» и «trčam».
	case strings.HasSuffix(inf, "ati") && iConjugationAti[inf]:
		stem = trimRunes(inf, 3)
		endings = []string{"im", "iš", "i", "imo", "ite", "e"}
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

// declension достраивает падежную форму существительного для показа.
//
// Где норма допускает два варианта, оба и показываются через «/»: винительный
// мужского рода зависит от одушевлённости («vidim grad», но «vidim čoveka»), а
// творительный женского на согласный — от того, прошла ли основа йотование.
func declension(lemma, gender, number, caseKey string) string {
	return strings.Join(declensionForms(lemma, gender, number, caseKey), " / ")
}

// declensionForms возвращает все допустимые формы падежа, канонической первой.
//
// Опознание словоформы (MatchNoun) обязано перебирать ИМЕННО этот список, а не
// склеенную строку: иначе «čoveka» не опозналось бы винительным, потому что
// сравнивалось бы с «čovek / čoveka».
func declensionForms(lemma, gender, number, caseKey string) []string {
	if number == "Plur" {
		if irr, ok := irregularPlural[lemma]; ok {
			return nonEmpty(irr[caseKey])
		}
	}

	// Мужской род на -a («tata», «sudija», «vladika», «Nikola») склоняется по
	// женскому типу, а согласуется по мужскому. Без этой ветки получалось
	// «tataa» и «sudijau».
	if strings.HasSuffix(lemma, "a") && (gender == "Fem" || gender == "Masc") {
		return nonEmpty(femAForm(lemma, number, caseKey))
	}
	if gender == "Fem" {
		// Женский род на согласный — третья врста: noć, stvar, ljubav, reč,
		// kost. Раньше весь класс возвращал пустоту.
		return femConsonantForms(lemma, number, caseKey)
	}
	if gender == "Masc" {
		return mascForms(lemma, number, caseKey)
	}
	if gender == "Neut" {
		return nonEmpty(neuterForm(lemma, number, caseKey))
	}
	return nil
}

func nonEmpty(values ...string) []string {
	out := make([]string, 0, len(values))
	for _, value := range values {
		if value != "" {
			out = append(out, value)
		}
	}
	return out
}

// femAForm — первая врста: kuća, žena, knjiga.
func femAForm(lemma, number, caseKey string) string {
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

// femConsonantForms — третья врста: noć, stvar, ljubav, kost, reč.
//
// Все падежи, кроме именительного и винительного единственного, оканчиваются на
// -i, поэтому таблица выглядит однообразно — и это правда о языке, а не
// упрощение. Отдельного правила требует только творительный единственного.
func femConsonantForms(lemma, number, caseKey string) []string {
	if number == "Sing" {
		switch caseKey {
		case "Nom", "Acc":
			return []string{lemma}
		case "Gen", "Dat", "Voc", "Loc":
			return []string{lemma + "i"}
		case "Ins":
			// Норма даёт и йотованную форму («noću», «ljubavlju»), и форму на
			// -i. Йотованная идёт первой: именно она стоит в словарях.
			return nonEmpty(femInstrumental(lemma), lemma+"i")
		}
		return nil
	}
	switch caseKey {
	case "Nom", "Gen", "Acc", "Voc":
		return []string{lemma + "i"}
	case "Dat", "Ins", "Loc":
		return []string{lemma + "ima"}
	}
	return nil
}

// femInstrumental применяет йотование к основе на согласный: kost → košću,
// ljubav → ljubavlju, noć → noću. Пустая строка означает «правила нет».
func femInstrumental(lemma string) string {
	switch {
	case strings.HasSuffix(lemma, "st"):
		return trimRunes(lemma, 2) + "šću"
	case strings.HasSuffix(lemma, "zd"):
		return trimRunes(lemma, 2) + "ždu"
	case strings.HasSuffix(lemma, "ć"), strings.HasSuffix(lemma, "č"),
		strings.HasSuffix(lemma, "š"), strings.HasSuffix(lemma, "ž"),
		strings.HasSuffix(lemma, "j"), strings.HasSuffix(lemma, "lj"),
		strings.HasSuffix(lemma, "nj"):
		return lemma + "u"
	case strings.HasSuffix(lemma, "t"):
		return trimRunes(lemma, 1) + "ću"
	case strings.HasSuffix(lemma, "d"):
		return trimRunes(lemma, 1) + "đu"
	case strings.HasSuffix(lemma, "s"):
		return trimRunes(lemma, 1) + "šu"
	case strings.HasSuffix(lemma, "z"):
		return trimRunes(lemma, 1) + "žu"
	case strings.HasSuffix(lemma, "n"):
		return trimRunes(lemma, 1) + "nju"
	case strings.HasSuffix(lemma, "l"):
		return trimRunes(lemma, 1) + "lju"
	case strings.HasSuffix(lemma, "b"), strings.HasSuffix(lemma, "p"),
		strings.HasSuffix(lemma, "m"), strings.HasSuffix(lemma, "v"),
		strings.HasSuffix(lemma, "f"):
		return lemma + "lju"
	}
	// После «р» йотования нет вовсе: «stvar» → только «stvari».
	return ""
}

// mascForms — вторая врста: grad, čovek, konj, starac.
func mascForms(lemma, number, caseKey string) []string {
	stem, fugitive := fugitiveStem(lemma)
	soft := softFinal(stem)

	if number == "Sing" {
		switch caseKey {
		case "Nom":
			return []string{lemma}
		case "Gen":
			return []string{stem + "a"}
		case "Dat", "Loc":
			return []string{stem + "u"}
		case "Acc":
			// Зависит от одушевлённости: vidim grad, но vidim čoveka.
			return []string{lemma, stem + "a"}
		case "Voc":
			// У слов с беглым «а» звательный всегда на -e с чередованием:
			// starac → starče, momak → momče, otac → oče. Мягкость основы,
			// возникшая после выпадения «а», здесь ни при чём.
			if fugitive {
				return []string{palatalize(stem) + "e"}
			}
			if soft {
				return []string{stem + "u"}
			}
			return []string{palatalize(stem) + "e"}
		case "Ins":
			if soft {
				return []string{stem + "em"}
			}
			return []string{stem + "om"}
		}
		return nil
	}

	// Односложные основы расширяются -ov-/-ev-: grad → gradovi, muž → muževi.
	// Считаем СЛОГИ, а не буквы: по буквам «sport» получал «sporti», а «dan» —
	// «danovi». Слова с беглым «а» многосложны по определению.
	plural := stem
	if !fugitive && syllables(lemma) == 1 && !shortPluralNouns[lemma] {
		if soft {
			plural += "ev"
		} else {
			plural += "ov"
		}
	}
	switch caseKey {
	case "Nom", "Voc":
		return []string{sibilarize(plural) + "i"}
	case "Gen":
		// Родительный множественного — единственное место, где беглое «а»
		// возвращается: momak → momaka, starac → staraca.
		if fugitive {
			return []string{lemma + "a"}
		}
		return []string{plural + "a"}
	case "Dat", "Ins", "Loc":
		return []string{sibilarize(plural) + "ima"}
	case "Acc":
		return []string{plural + "e"}
	}
	return nil
}

// neuterForm — третья врста среднего рода: selo, polje, ime, tele.
func neuterForm(lemma, number, caseKey string) string {
	if !strings.HasSuffix(lemma, "o") && !strings.HasSuffix(lemma, "e") {
		return ""
	}
	stem := trimRunes(lemma, 1)

	// Расширение основы: ime → imen-, tele → telet-. Без него получалось
	// «ima» и «tela». Расширенная основа кончается на согласный и дальше ведёт
	// себя как твёрдая, поэтому «imenom», а не «imenem».
	// Расширение достраивается к ЦЕЛОЙ лемме, а не к обрезанной основе: -e
	// остаётся частью основы. ime → imen-, vreme → vremen-, dete → detet-.
	extended := false
	switch {
	case neuterMenStems[lemma]:
		stem = lemma + "n"
		extended = true
	case neuterEtStems[lemma]:
		stem = lemma + "t"
		extended = true
		if number == "Plur" {
			// Множественное у этого класса собирательное («telad», «dugmad») и
			// склоняется по женскому типу. Что есть — лежит в irregularPlural;
			// правилом такое не достраивается, и молчание честнее выдумки.
			return ""
		}
	}

	// У среднего рода мягкость решает само окончание: -o даёт «selom», -e даёт
	// «poljem» и «morem». Расширенная основа из этого правила выходит.
	soft := !extended && strings.HasSuffix(lemma, "e")

	if number == "Plur" {
		return stem + map[string]string{
			"Nom": "a", "Gen": "a", "Dat": "ima", "Acc": "a",
			"Voc": "a", "Ins": "ima", "Loc": "ima",
		}[caseKey]
	}
	switch caseKey {
	case "Nom", "Acc", "Voc":
		return lemma
	case "Gen":
		return stem + "a"
	case "Dat", "Loc":
		return stem + "u"
	case "Ins":
		if soft {
			return stem + "em"
		}
		return stem + "om"
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
