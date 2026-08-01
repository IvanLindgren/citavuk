// Package english разбирает английские слова: начальная форма, часть речи,
// признаки формы.
//
// Читавук — про сербский, но в сербских учебниках английский работает
// языком-посредником, и по такому слову тоже нажимают. Сайт своей копии
// словаря не имеет, поэтому разбор живёт здесь — ровно как сербский.
//
// Словарь собирается `tools/build_english_lexicon.py` из WordNet (леммы,
// части речи, таблица исключений) и Brown (частотность, служебные слова).
// Тот же файл лежит в ассетах приложения: правила разбора обязаны совпадать,
// иначе сайт и приложение показали бы для одного слова разную начальную форму.
package english

import (
	_ "embed"
	"encoding/json"
	"sort"
	"strings"
	"sync"
)

//go:embed data/english_lexicon.json
var lexiconJSON []byte

// FormKind — как слово соотносится со своей начальной формой.
type FormKind string

const (
	// KindLemma — слово и есть начальная форма.
	KindLemma FormKind = "lemma"
	// KindRegular — форма построена по правилу (books, walked, making).
	KindRegular FormKind = "regular"
	// KindIrregular — форма из таблицы исключений (children, ran, better).
	KindIrregular FormKind = "irregular"
)

// Fact — факт о форме слова: «Число: множественное».
type Fact struct {
	Label string `json:"label"`
	Value string `json:"value"`
}

// Analysis — разбор английского слова.
type Analysis struct {
	Surface  string   `json:"surface"`
	Lemma    string   `json:"lemma"`
	UPOS     string   `json:"upos"`
	PosFull  string   `json:"posFull"`
	PosShort string   `json:"posShort"`
	FormKind FormKind `json:"formKind"`
	Facts    []Fact   `json:"facts"`
	// FormLabel — короткое имя формы для словаря: «мн. ч.», «прош. вр.».
	FormLabel string `json:"formLabel,omitempty"`
	Why       string `json:"why,omitempty"`
	// AlsoLemma — слово бывает и самостоятельным: «saw» это и «пила», и
	// прошедшее от «see». Молчать об этом нельзя.
	AlsoLemma bool `json:"alsoLemma,omitempty"`
}

// Lexicon — английский словарь в памяти.
type Lexicon struct {
	words     map[string]string
	irregular map[string]string
}

type payload struct {
	Words     map[string]string `json:"words"`
	Irregular map[string]string `json:"irregular"`
}

var (
	once   sync.Once
	shared *Lexicon
	loeErr error
)

// Shared загружает словарь один раз на процесс.
func Shared() (*Lexicon, error) {
	once.Do(func() {
		var p payload
		if err := json.Unmarshal(lexiconJSON, &p); err != nil {
			loeErr = err
			return
		}
		shared = &Lexicon{words: p.Words, irregular: p.Irregular}
	})
	return shared, loeErr
}

var posByCode = map[byte]string{
	'n': "NOUN", 'v': "VERB", 'a': "ADJ", 'r': "ADV", 'p': "PRON",
	'd': "DET", 'i': "ADP", 'c': "CONJ", 't': "PART", 'm': "NUM",
}

var posRu = map[string]string{
	"NOUN": "существительное", "VERB": "глагол", "ADJ": "прилагательное",
	"ADV": "наречие", "PRON": "местоимение", "DET": "определитель (артикль)",
	"ADP": "предлог", "CONJ": "союз", "PART": "частица", "NUM": "числительное",
}

var posShortRu = map[string]string{
	"NOUN": "сущ.", "VERB": "глаг.", "ADJ": "прил.", "ADV": "нареч.",
	"PRON": "мест.", "DET": "артикль", "ADP": "предлог", "CONJ": "союз",
	"PART": "частица", "NUM": "числ.",
}

// PosFull возвращает русское название части речи.
func PosFull(upos string) string {
	if v, ok := posRu[upos]; ok {
		return v
	}
	return "слово"
}

// PosShort возвращает короткое название части речи.
func PosShort(upos string) string {
	if v, ok := posShortRu[upos]; ok {
		return v
	}
	return "?"
}

// KnowsLemma сообщает, есть ли такая начальная форма в словаре.
func (l *Lexicon) KnowsLemma(word string) bool {
	_, ok := l.words[strings.ToLower(word)]
	return ok
}

// Knows сообщает, знает ли словарь слово хоть в каком-то виде.
func (l *Lexicon) Knows(word string) bool {
	low := strings.ToLower(word)
	if _, ok := l.words[low]; ok {
		return true
	}
	_, ok := l.irregular[low]
	return ok
}

// Analyze разбирает слово. nil — словарь его не опознал.
func (l *Lexicon) Analyze(word string) *Analysis {
	low := strings.ToLower(strings.TrimSpace(word))
	if low == "" || LooksSerbian(low) || !isLatinWord(low) {
		return nil
	}

	if raw, ok := l.irregular[low]; ok {
		slash := strings.LastIndex(raw, "/")
		if slash > 0 {
			lemma := raw[:slash]
			upos := posByCode[raw[slash+1]]
			if upos != "" {
				return l.describeIrregular(low, lemma, upos)
			}
		}
	}

	if codes, ok := l.words[low]; ok {
		// WordNet держит отпричастные прилагательные и отглагольные
		// существительные отдельными леммами: «walked», «making», «reading»,
		// «quickly» есть в словаре сами по себе. Человеку, нажавшему такое
		// слово в предложении, нужна не эта статья, а разбор формы.
		if prefersRule(low, codes) {
			if byRule := l.byRule(low); byRule != nil {
				return byRule
			}
		}
		upos := preferredPos(codes)
		return &Analysis{
			Surface:  low,
			Lemma:    low,
			UPOS:     upos,
			PosFull:  PosFull(upos),
			PosShort: PosShort(upos),
			FormKind: KindLemma,
			Facts:    []Fact{{Label: "Часть речи", Value: PosFull(upos)}},
			Why:      whyLemma(upos, codes),
		}
	}

	return l.byRule(low)
}

func isLatinWord(word string) bool {
	for _, r := range word {
		if (r < 'a' || r > 'z') && r != '\'' {
			return false
		}
	}
	return true
}

// preferredPos выбирает наиболее вероятную часть речи для омонима.
//
// Порядок отражает, чем слово оказывается чаще при чтении, а не алфавит:
// служебные слова важнее знаменательных, как и в сербском разборе.
func preferredPos(codes string) string {
	for _, code := range []byte{'d', 'p', 'i', 'c', 't', 'm', 'n', 'v', 'a', 'r'} {
		if strings.IndexByte(codes, code) >= 0 {
			return posByCode[code]
		}
	}
	return "NOUN"
}

// prefersRule решает, разбирать ли слово как форму, хотя оно есть в словаре.
//
// Да — если оно оканчивается на словообразующий суффикс И записано ТОЛЬКО
// теми частями речи, которые этот суффикс и порождает. «walked» — только
// глагол/прилагательное, значит это форма. А «news» тоже кончается на -s, но
// существительное, и разбирать его как множественное от «new» нельзя, поэтому
// «-s» в список не входит вовсе.
func prefersRule(form, codes string) bool {
	derived := []struct {
		suffix string
		allow  string
	}{
		{"ing", "an"}, {"est", "a"}, {"ly", "r"}, {"ed", "av"}, {"er", "a"},
	}
	for _, d := range derived {
		if !strings.HasSuffix(form, d.suffix) {
			continue
		}
		for i := 0; i < len(codes); i++ {
			if strings.IndexByte(d.allow, codes[i]) < 0 {
				return false
			}
		}
		return true
	}
	return false
}

func whyLemma(upos, codes string) string {
	seen := map[string]bool{}
	var names []string
	for i := 0; i < len(codes); i++ {
		if name := posByCode[codes[i]]; name != "" && !seen[PosFull(name)] {
			seen[PosFull(name)] = true
			names = append(names, PosFull(name))
		}
	}
	if len(names) > 1 {
		sort.Strings(names)
		return "Это начальная (словарная) форма. В английском одно и то же слово часто " +
			"бывает разными частями речи без изменения написания — здесь это " +
			strings.Join(names, ", ") + ". Какая именно, показывает место в предложении."
	}
	return "Это начальная (словарная) форма — " + PosFull(upos) + "."
}

func (l *Lexicon) describeIrregular(form, lemma, upos string) *Analysis {
	facts := []Fact{{Label: "Часть речи", Value: PosFull(upos)}}
	label := "неправильная форма"
	why := ""

	switch upos {
	case "NOUN":
		label = "мн. ч."
		facts = append(facts, Fact{Label: "Число", Value: "множественное"})
		why = "Множественное число образовано не по правилу «+s»: «" + lemma +
			"» → «" + form + "». Такие существительные приходится запоминать."
	case "VERB":
		label = "прош. вр. / причастие"
		facts = append(facts, Fact{Label: "Форма", Value: "прошедшее время или причастие"})
		why = "Неправильный глагол: прошедшее время образуется не через «-ed». " +
			"Начальная форма — «" + lemma + "»."
	case "ADJ", "ADV":
		label = "степень сравнения"
		facts = append(facts, Fact{Label: "Степень", Value: "сравнительная или превосходная"})
		why = "Степень сравнения образована не по правилу «-er/-est»: начальная форма — «" +
			lemma + "»."
	}

	_, alsoLemma := l.words[form]
	return &Analysis{
		Surface:   form,
		Lemma:     lemma,
		UPOS:      upos,
		PosFull:   PosFull(upos),
		PosShort:  PosShort(upos),
		FormKind:  KindIrregular,
		Facts:     facts,
		FormLabel: label,
		Why:       why,
		AlsoLemma: alsoLemma,
	}
}

type rule struct {
	lemma string
	code  byte
	label string
	why   string
	facts []Fact
}

// byRule подбирает начальную форму правилом. Кандидат ПРОВЕРЯЕТСЯ по словарю,
// а не принимается по одному лишь окончанию.
func (l *Lexicon) byRule(form string) *Analysis {
	for _, r := range rulesFor(form) {
		codes, ok := l.words[r.lemma]
		if !ok || strings.IndexByte(codes, r.code) < 0 {
			continue
		}
		upos := posByCode[r.code]
		facts := append([]Fact{{Label: "Часть речи", Value: PosFull(upos)}}, r.facts...)
		_, alsoLemma := l.words[form]
		return &Analysis{
			Surface:   form,
			Lemma:     r.lemma,
			UPOS:      upos,
			PosFull:   PosFull(upos),
			PosShort:  PosShort(upos),
			FormKind:  KindRegular,
			Facts:     facts,
			FormLabel: r.label,
			Why:       r.why,
			AlsoLemma: alsoLemma,
		}
	}
	return nil
}

func rulesFor(form string) []rule {
	var out []rule
	add := func(lemma string, code byte, label, why string, facts []Fact) {
		if len(lemma) >= 2 {
			out = append(out, rule{lemma, code, label, why, facts})
		}
	}
	n := len(form)

	// -s / -es: множественное число или 3 л. ед. настоящего времени.
	if n > 2 && strings.HasSuffix(form, "s") && !strings.HasSuffix(form, "ss") {
		for _, c := range pluralStems(form[:n-1]) {
			add(c, 'n', "мн. ч.",
				"Множественное число: «"+c+"» + окончание -s.",
				[]Fact{{Label: "Число", Value: "множественное"}})
			add(c, 'v', "3 л. ед. ч.",
				"Настоящее время, 3-е лицо единственного числа (he/she/it): «"+c+
					"» + окончание -s.",
				[]Fact{
					{Label: "Лицо", Value: "3-е"},
					{Label: "Число", Value: "единственное"},
					{Label: "Время", Value: "настоящее"},
				})
		}
	}

	// -ing: причастие настоящего времени или герундий.
	if n > 4 && strings.HasSuffix(form, "ing") {
		for _, c := range stems(form[:n-3]) {
			add(c, 'v', "форма -ing",
				"Форма на -ing: причастие настоящего времени или герундий от «"+c+
					"». Употребляется в длительных временах (is "+form+").",
				[]Fact{{Label: "Форма", Value: "причастие -ing / герундий"}})
		}
	}

	// -ed: прошедшее время и причастие прошедшего времени.
	if n > 3 && strings.HasSuffix(form, "ed") {
		for _, c := range stems(form[:n-2]) {
			add(c, 'v', "прош. вр.",
				"Правильный глагол: прошедшее время или причастие прошедшего времени от «"+
					c+"» через -ed.",
				[]Fact{{Label: "Время", Value: "прошедшее"}})
		}
	}

	// -est / -er: степени сравнения.
	if n > 3 && strings.HasSuffix(form, "est") {
		for _, c := range stems(form[:n-3]) {
			add(c, 'a', "превосх. степень",
				"Превосходная степень: «"+c+"» + -est (the "+form+").",
				[]Fact{{Label: "Степень", Value: "превосходная"}})
		}
	}
	if n > 3 && strings.HasSuffix(form, "er") {
		for _, c := range stems(form[:n-2]) {
			add(c, 'a', "сравн. степень",
				"Сравнительная степень: «"+c+"» + -er ("+form+" than…).",
				[]Fact{{Label: "Степень", Value: "сравнительная"}})
			add(c, 'v', "производное",
				"Существительное от глагола «"+c+
					"»: -er обозначает того, кто выполняет действие.",
				[]Fact{{Label: "Образование", Value: "от глагола, суффикс -er"}})
		}
	}

	// -ly: наречие от прилагательного.
	if n > 3 && strings.HasSuffix(form, "ly") {
		stem := form[:n-2]
		cands := []string{stem, stem + "e"}
		if strings.HasSuffix(stem, "i") {
			cands = append(cands, stem[:len(stem)-1]+"y")
		}
		for _, c := range cands {
			add(c, 'a', "наречие",
				"Наречие от прилагательного «"+c+"» через -ly: отвечает на вопрос «как?».",
				[]Fact{{Label: "Образование", Value: "наречие на -ly"}})
		}
	}

	return out
}

// pluralStems: books → book, boxes → box, cities → city, wolves → wolf.
func pluralStems(stem string) []string {
	out := []string{stem}
	if strings.HasSuffix(stem, "e") {
		short := stem[:len(stem)-1]
		if strings.HasSuffix(stem, "ie") {
			out = append(out, stem[:len(stem)-2]+"y")
		}
		for _, s := range []string{"s", "x", "z", "ch", "sh"} {
			if strings.HasSuffix(short, s) {
				out = append(out, short)
				break
			}
		}
		if strings.HasSuffix(stem, "ve") {
			base := stem[:len(stem)-2]
			out = append(out, base+"f", base+"fe")
		}
	}
	return out
}

// stems учитывает немое «e» и удвоение согласной:
// making → make, stopped → stop, bigger → big, studied → study.
func stems(stem string) []string {
	out := []string{stem, stem + "e"}
	if len(stem) >= 2 {
		last := stem[len(stem)-1]
		prev := stem[len(stem)-2]
		if last == prev && strings.IndexByte("aeiou", last) < 0 {
			out = append(out, stem[:len(stem)-1])
		}
		if last == 'i' {
			out = append(out, stem[:len(stem)-1]+"y")
		}
	}
	return out
}
