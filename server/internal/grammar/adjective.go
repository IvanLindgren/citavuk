package grammar

import "strings"

// Склонение прилагательных и степени сравнения.
//
// Раньше прилагательное не склонялось вовсе: BuildParadigms передавал в
// declensionTables пустую лемму, генерация стояла за проверкой `lemma != ""`, и
// в таблице оставалось только то, что нашлось в лексиконе, — в среднем две
// формы на лемму. Человек нажимал «dobrog» и не видел ничего.
//
// Вместе со склонением появляется и вид (određeni / neodređeni). Это то, чем
// сербское прилагательное отличается от русского сильнее всего: «dobar čovek»
// против «dobri čovek», родительный «dobra» против «dobrog». Показывать
// склонение и умалчивать про вид — значит показать половину правила.

// irregularAdjStem — основы, которые правилом не выводятся из-за чередований:
// nizak → niska (z→s), redak → retka (d→t).
var irregularAdjStem = map[string]string{
	"nizak":  "nisk",
	"redak":  "retk",
	"blizak": "blisk",
	"težak":  "tešk",
	"uzak":   "usk",
	"sladak": "slatk",
	"gorak":  "gork",
	"zao":    "zl",
}

// adjectiveStem выделяет основу из начальной формы.
//
// Лемма бывает и определённой («veliki», «letnji»), и неопределённой
// («dobar», «lep»). У неопределённой обычно есть беглое «а», и его надо убрать:
// dobar → dobr, hladan → hladn, topao → topl.
func adjectiveStem(lemma string) string {
	if stem, ok := irregularAdjStem[lemma]; ok {
		return stem
	}
	runes := []rune(lemma)
	if len(runes) < 3 {
		return lemma
	}
	cut := func(n int, add string) string {
		return string(runes[:len(runes)-n]) + add
	}
	switch {
	// Определённый вид уже содержит окончание -i: veliki → velik.
	case strings.HasSuffix(lemma, "i"):
		return cut(1, "")
	// -ao/-eo восходят к основе на -l: topao → topl, veseo → vesel, beo → bel.
	case strings.HasSuffix(lemma, "eo"):
		return cut(2, "el")
	case strings.HasSuffix(lemma, "ao"):
		return cut(2, "l")
	// Беглое «а» только у многосложных: «hladan» → hladn, но «stran» → stran.
	case strings.HasSuffix(lemma, "an") && syllables(lemma) >= 2:
		return cut(2, "n")
	case strings.HasSuffix(lemma, "ar") && syllables(lemma) >= 2:
		return cut(2, "r")
	case strings.HasSuffix(lemma, "ak") && syllables(lemma) >= 2:
		return cut(2, "k")
	}
	return lemma
}

// adjEndings — окончания по роду, числу и падежу.
//
// Женский род и всё множественное у обоих видов совпадают; расходятся только
// мужской и средний род в единственном числе, и именно там вид виден.
var (
	adjIndefSing = map[string]map[string]string{
		"Masc": {"Nom": "", "Gen": "a", "Dat": "u", "Acc": "", "Voc": "", "Ins": "im", "Loc": "u"},
		"Fem":  {"Nom": "a", "Gen": "e", "Dat": "oj", "Acc": "u", "Voc": "a", "Ins": "om", "Loc": "oj"},
		"Neut": {"Nom": "o", "Gen": "a", "Dat": "u", "Acc": "o", "Voc": "o", "Ins": "im", "Loc": "u"},
	}
	adjDefSing = map[string]map[string]string{
		"Masc": {"Nom": "i", "Gen": "og", "Dat": "om", "Acc": "i", "Voc": "i", "Ins": "im", "Loc": "om"},
		"Fem":  {"Nom": "a", "Gen": "e", "Dat": "oj", "Acc": "u", "Voc": "a", "Ins": "om", "Loc": "oj"},
		"Neut": {"Nom": "o", "Gen": "og", "Dat": "om", "Acc": "o", "Voc": "o", "Ins": "im", "Loc": "om"},
	}
	adjPlural = map[string]map[string]string{
		"Masc": {"Nom": "i", "Gen": "ih", "Dat": "im", "Acc": "e", "Voc": "i", "Ins": "im", "Loc": "im"},
		"Fem":  {"Nom": "e", "Gen": "ih", "Dat": "im", "Acc": "e", "Voc": "e", "Ins": "im", "Loc": "im"},
		"Neut": {"Nom": "a", "Gen": "ih", "Dat": "im", "Acc": "a", "Voc": "a", "Ins": "im", "Loc": "im"},
	}
)

// AdjectiveForm строит форму прилагательного.
//
// definite выбирает вид. Для женского рода и множественного числа он не влияет
// ни на что — так устроен язык, а не упрощение таблицы.
func AdjectiveForm(lemma, gender, number, caseKey string, definite bool) string {
	stem := adjectiveStem(lemma)
	if stem == "" || gender == "" {
		return ""
	}
	table := adjPlural
	if number == "Sing" {
		table = adjIndefSing
		if definite {
			table = adjDefSing
		}
	}
	byCase, ok := table[gender]
	if !ok {
		return ""
	}
	ending, ok := byCase[caseKey]
	if !ok {
		return ""
	}
	// Нулевое окончание — это неопределённый именительный мужского рода, и
	// беглое «а» в нём НА МЕСТЕ: «dobar», а не «dobr». Основа без «а» нужна
	// всем остальным падежам, поэтому голая форма собирается отдельно.
	if ending == "" {
		return adjectiveBare(lemma, stem)
	}
	return stem + softenAdjEnding(stem, gender, ending)
}

// adjectiveBare возвращает неопределённый именительный мужского рода.
//
// Если лемма пришла в определённом виде («veliki»), голой формой служит основа;
// если в неопределённом («dobar», «topao») — сама лемма.
func adjectiveBare(lemma, stem string) string {
	if strings.HasSuffix(lemma, "i") {
		return stem
	}
	return lemma
}

// softenAdjEnding заменяет «о» на «е» после мягкой основы: vruć → vrućeg,
// vrućem, vruće. Женского рода это не касается — там «vrućoj» и «vrućom».
func softenAdjEnding(stem, gender, ending string) string {
	if gender == "Fem" || !softFinal(stem) || !strings.HasPrefix(ending, "o") {
		return ending
	}
	return "e" + ending[1:]
}

// irregularComparative повторяет frontend/lib/services/grammar_engine.dart.
// Списки обязаны совпадать: иначе сайт и приложение назовут разный компаратив
// для одного слова.
var irregularComparative = map[string]string{
	"dobar":   "bolji",
	"loš":     "gori",
	"zao":     "gori",
	"velik":   "veći",
	"veliki":  "veći",
	"mali":    "manji",
	"dug":     "duži",
	"lep":     "lepši",
	"lak":     "lakši",
	"mek":     "mekši",
	"brz":     "brži",
	"jak":     "jači",
	"drag":    "draži",
	"tih":     "tiši",
	"strog":   "stroži",
	"mlad":    "mlađi",
	"tvrd":    "tvrđi",
	"čest":    "češći",
	"gust":    "gušći",
	"ljut":    "ljući",
	"skup":    "skuplji",
	"visok":   "viši",
	"nizak":   "niži",
	"dubok":   "dublji",
	"širok":   "širi",
	"dalek":   "dalji",
	"težak":   "teži",
	"kratak":  "kraći",
	"blizak":  "bliži",
	"sladak":  "slađi",
	"žut":     "žući",
	"krut":    "krući",
	"glup":    "gluplji",
	"suv":     "suvlji",
	"grub":    "grublji",
	"čvrst":   "čvršći",
	"gorak":   "gorči",
	"redak":   "ređi",
	"uzak":    "uži",
	"debeo":   "deblji",
	"beo":     "belji",
	"star":    "stariji",
	"nov":     "noviji",
	"jeftin":  "jeftiniji",
	"pametan": "pametniji",
}

// Comparative строит компаратив. Пустая строка означает, что правила нет.
//
// Правило по умолчанию — суффикс -iji, и он верен для большинства
// многосложных. Односложные образуют компаратив йотованием (-ji), и вывести
// его правилом нельзя: lep → lepši, jak → jači, mlad → mlađi, brz → brži — во
// всех четырёх случаях разное чередование. Поэтому они перечислены списком, а
// правило работает там, где оно действительно работает.
func Comparative(lemma string) string {
	lemma = strings.ToLower(lemma)
	if form, ok := irregularComparative[lemma]; ok {
		return form
	}
	if len([]rune(lemma)) < 3 {
		return ""
	}
	base := lemma
	// Беглое «а» выпадает и здесь: pametan → pametniji, hladan → hladniji.
	if strings.HasSuffix(base, "an") && syllables(base) >= 2 {
		base = trimRunes(base, 2) + "n"
	}
	return base + "iji"
}

// Superlative — всегда naj- + компаратив, без исключений.
func Superlative(comparative string) string {
	if comparative == "" {
		return ""
	}
	return "naj" + comparative
}
