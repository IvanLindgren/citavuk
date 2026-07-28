package grammar

import (
	"regexp"
	"strings"
)

// Government — падеж, которого требует предлог, и значение этого сочетания.
type Government struct {
	CaseKey  string `json:"caseKey"`
	CaseName string `json:"caseName"`
	Meaning  string `json:"meaning"`
}

type govRule struct {
	caseKey string
	meaning string
}

// У двусторонних предлогов (u, na, za, pod, pred, nad) падеж разводит смысл:
// движение — акузатив, место — локатив или инструментал.
var prepGov = map[string][]govRule{
	"od":     {{"Gen", "от / из / у (откуда, от кого)"}},
	"do":     {{"Gen", "до (предела, места)"}},
	"iz":     {{"Gen", "из (изнутри)"}},
	"bez":    {{"Gen", "без чего-либо"}},
	"kod":    {{"Gen", "у / возле (kod doktora — у врача)"}},
	"oko":    {{"Gen", "вокруг / около"}},
	"posle":  {{"Gen", "после (во времени)"}},
	"pre":    {{"Gen", "до / перед (во времени)"}},
	"protiv": {{"Gen", "против"}},
	"zbog":   {{"Gen", "из-за (причина)"}},
	"radi":   {{"Gen", "ради / для"}},
	"preko":  {{"Gen", "через / поверх / свыше"}},
	"ispod":  {{"Gen", "под (ниже чего-либо)"}},
	"iznad":  {{"Gen", "над (выше чего-либо)"}},
	"ispred": {{"Gen", "перед (впереди чего-либо)"}},
	"iza":    {{"Gen", "за / позади"}},
	"pored":  {{"Gen", "рядом / возле"}},
	"pokraj": {{"Gen", "рядом / возле"}},
	"umesto": {{"Gen", "вместо"}},
	"tokom":  {{"Gen", "в течение"}},
	"blizu":  {{"Gen", "близко от"}},
	"van":    {{"Gen", "вне / снаружи"}},
	"izvan":  {{"Gen", "вне / снаружи"}},
	"unutar": {{"Gen", "внутри"}},
	"između": {{"Gen", "между"}},

	"k":        {{"Dat", "к (направление к кому/чему)"}},
	"ka":       {{"Dat", "к (направление к кому/чему)"}},
	"nasuprot": {{"Dat", "напротив"}},
	"uprkos":   {{"Dat", "вопреки"}},
	"prema": {
		{"Dat", "к / по направлению к; согласно"},
		{"Loc", "по / согласно (prema dogovoru)"},
	},

	"u": {
		{"Acc", "в (куда — движение): u grad"},
		{"Loc", "в (где — место): u gradu"},
	},
	"na": {
		{"Acc", "на (куда — движение): na sto"},
		{"Loc", "на (где — место): na stolu"},
	},
	"o": {
		{"Loc", "о / об (о ком, о чём): o ljubavi"},
		{"Acc", "обо (удар обо что)"},
	},
	"po": {
		{"Loc", "по (по чему, после): po gradu"},
		{"Acc", "за (сходить за чем-то)"},
	},
	"pri": {{"Loc", "при / возле / в процессе"}},
	"s":   {{"Ins", "с (с кем/чем — вместе): s prijateljem"}},
	"sa": {
		{"Ins", "с (с кем/чем — вместе): sa drugom"},
		{"Gen", "с / со (откуда: sa stola)"},
	},
	"nad":  {{"Ins", "над (где): nad gradom"}, {"Acc", "над (куда)"}},
	"pod":  {{"Ins", "под (где): pod stolom"}, {"Acc", "под (куда): pod sto"}},
	"pred": {{"Ins", "перед (где): pred kućom"}, {"Acc", "перед (куда)"}},
	"među": {{"Ins", "между / среди"}},
	"za": {
		{"Acc", "за / для (uzeti za ruku; za tebe)"},
		{"Ins", "за (следовать за, позади)"},
		{"Gen", "во время (za vreme rata)"},
	},
	"kroz": {{"Acc", "сквозь / через"}},
	"niz":  {{"Acc", "вниз по"}},
	"uz":   {{"Acc", "вверх по / вдоль / рядом с"}},
}

var notLetters = regexp.MustCompile(`[^a-zšđžčć]`)

// PrepositionGovernment сообщает, каких падежей требует предлог.
// Для остальных слов возвращает пустой список.
func PrepositionGovernment(word string) []Government {
	key := notLetters.ReplaceAllString(strings.ToLower(word), "")
	rules, ok := prepGov[key]
	if !ok {
		return nil
	}
	out := make([]Government, 0, len(rules))
	for _, rule := range rules {
		out = append(out, Government{
			CaseKey:  rule.caseKey,
			CaseName: CaseName(rule.caseKey),
			Meaning:  rule.meaning,
		})
	}
	return out
}
