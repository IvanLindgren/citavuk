// Package grammar описывает сербскую словоформу по-русски.
//
// Правила повторяют frontend/lib/services/grammar_engine.dart: приложение
// разбирает слово офлайн по своей копии лексикона, сайт — этим пакетом.
// Расхождение в формулировках пользователь заметит сразу, поэтому тексты
// объяснений здесь дословные.
package grammar

import "strings"

var posFull = map[string]string{
	"NOUN":    "существительное",
	"PROPN":   "имя собственное",
	"ADJ":     "прилагательное",
	"VERB":    "глагол",
	"AUX":     "вспомогательный глагол",
	"PRON":    "местоимение",
	"ADV":     "наречие",
	"NUM":     "числительное",
	"ADP":     "предлог",
	"CCONJ":   "союз",
	"SCONJ":   "союз",
	"PART":    "частица",
	"DET":     "определитель",
	"INTJ":    "междометие",
	"UNKNOWN": "слово (часть речи не определена)",
	"X":       "слово (часть речи не определена)",
}

var posShort = map[string]string{
	"NOUN":    "сущ.",
	"PROPN":   "имя собств.",
	"ADJ":     "прил.",
	"VERB":    "глагол",
	"AUX":     "всп. глагол",
	"PRON":    "мест.",
	"ADV":     "нареч.",
	"NUM":     "числит.",
	"ADP":     "предлог",
	"CCONJ":   "союз",
	"SCONJ":   "союз",
	"PART":    "частица",
	"DET":     "опред.",
	"INTJ":    "межд.",
	"UNKNOWN": "слово",
	"X":       "слово",
}

// CaseOrder — порядок падежей в таблицах склонения.
var CaseOrder = []string{"Nom", "Gen", "Dat", "Acc", "Voc", "Ins", "Loc"}

var caseRu = map[string]string{
	"Nom": "Именительный (nominativ)",
	"Gen": "Родительный (genitiv)",
	"Dat": "Дательный (dativ)",
	"Acc": "Винительный (akuzativ)",
	"Voc": "Звательный (vokativ)",
	"Ins": "Творительный (instrumental)",
	"Loc": "Предложный/Местный (lokativ)",
}

var caseUse = map[string]string{
	"Nom": "Это основной падеж любого языка. Выражает неизменную форму слова. Вопрос: ко? шта? " +
		"Пример: «Pas spava» — пёс спит.",
	"Gen": "Падеж принадлежности и отрицания. Вопрос: кога? чега? " +
		"После предлогов iz/od/do/bez и при отрицании. Пример: «nema vremena» — нет времени.",
	"Dat": "Падеж направления, а также указания. Вопрос: коме? чему? " +
		"Пример: «dajem prijatelju» — даю другу.",
	"Acc": "Падеж прямого дополнения. Используется после глаголов действия. Вопрос: кога? шта? " +
		"Пример: «volim muziku» — я люблю музыку.",
	"Voc": "Падеж для обращения. Пример: «Marko!», «prijatelju!».",
	"Ins": "Падеж указания инструмента, авторства. Вопрос: ким? чим? " +
		"После предлога s/sa. Пример: «pišem olovkom» — пишу карандашом.",
	"Loc": "Падеж местоположения и некоторых предлогов. Вопрос: о коме? о чему? где? " +
		"Пример: «u školi» — в школе.",
}

var casePreps = map[string][]string{
	"Nom": {},
	"Gen": {"od", "do", "iz", "sa", "bez", "kod", "oko", "posle", "pre", "protiv",
		"zbog", "radi", "preko", "ispod", "iznad", "ispred", "iza", "pored",
		"umesto", "tokom", "blizu", "između"},
	"Dat": {"k", "ka", "prema", "nasuprot", "uprkos"},
	"Acc": {"u", "na", "kroz", "niz", "uz", "za", "po", "o", "pod", "pred", "nad"},
	"Voc": {},
	"Ins": {"s", "sa", "nad", "pod", "pred", "među", "za"},
	"Loc": {"u", "na", "o", "po", "pri", "prema"},
}

var numberRu = map[string]string{"Sing": "единственное", "Plur": "множественное"}

var genderRu = map[string]string{"Masc": "мужской", "Fem": "женский", "Neut": "средний"}

var tenseRu = map[string]string{
	"Pres": "настоящее (prezent)",
	"Past": "прошедшее (perfekat)",
	"Fut":  "будущее (futur)",
	"Imp":  "имперфект (imperfekat)",
	"Pqp":  "плусквамперфект (pluskvamperfekat)",
}

var personRu = map[string]string{"1": "1-е лицо", "2": "2-е лицо", "3": "3-е лицо"}

// Степень сравнения. Без неё «bolji» описывался как обычное прилагательное:
// то, что это компаратив, не говорилось нигде.
var degreeRu = map[string]string{
	"Pos": "положительная (dobar)",
	"Cmp": "сравнительная (bolji)",
	"Sup": "превосходная (najbolji)",
}

// Вид прилагательного — то, чем сербское прилагательное отличается от русского
// сильнее всего, и клетка таблицы без подписи объяснить это не может.
var definiteRu = map[string]string{
	"Ind": "неопределённый (dobar čovek — какой-то)",
	"Def": "определённый (dobri čovek — тот самый)",
}

// Залог нужен ровно для трпног придева: «urađen» без пометки читается как
// обычное прилагательное.
var voiceRu = map[string]string{
	"Act":  "действительный",
	"Pass": "страдательный",
}

// Persons, PerfAux и FutClitic задают строки таблиц спряжения.
var (
	Persons   = []string{"ja", "ti", "on/ona", "mi", "vi", "oni/one"}
	PerfAux   = []string{"sam", "si", "je", "smo", "ste", "su"}
	FutClitic = []string{"ću", "ćeš", "će", "ćemo", "ćete", "će"}
)

// ParseFeats разбирает строку признаков UD «Case=Nom|Number=Sing».
func ParseFeats(raw string) map[string]string {
	feats := make(map[string]string)
	if raw == "" {
		return feats
	}
	for _, part := range strings.Split(raw, "|") {
		key, value, ok := strings.Cut(part, "=")
		if !ok || key == "" || value == "" {
			continue
		}
		feats[key] = value
	}
	return feats
}

// PosFull возвращает полное русское название части речи.
func PosFull(upos string) string {
	if label, ok := posFull[upos]; ok {
		return label
	}
	return upos
}

// PosShort возвращает сокращённое название части речи.
func PosShort(upos string) string {
	if label, ok := posShort[upos]; ok {
		return label
	}
	return upos
}

// CaseName возвращает русское название падежа.
func CaseName(key string) string {
	if name, ok := caseRu[key]; ok {
		return name
	}
	return key
}

// CaseReference — справка о падеже для шпаргалки.
type CaseReference struct {
	Key   string   `json:"key"`
	Name  string   `json:"name"`
	Use   string   `json:"use"`
	Preps []string `json:"preps"`
}

// Cases возвращает справочник падежей.
func Cases() []CaseReference {
	out := make([]CaseReference, 0, len(CaseOrder))
	for _, key := range CaseOrder {
		preps := casePreps[key]
		if preps == nil {
			preps = []string{}
		}
		out = append(out, CaseReference{
			Key:   key,
			Name:  caseRu[key],
			Use:   caseUse[key],
			Preps: preps,
		})
	}
	return out
}
