package grammar

import (
	"fmt"
	"strings"
	"unicode"

	"github.com/citavuk/server/internal/lexicon"
)

// Reflexive — возвратная частица «se», относящаяся к разбираемому глаголу.
//
// В сербском «se» почти никогда не стоит вплотную к своему глаголу: это
// клитика, у неё нет своего ударения, и место ей отводит не глагол, а фраза —
// второе место сразу за первым ударным словом. Поэтому «On se zove Marko»
// выглядит так, будто «se» относится к «on», а на самом деле это часть глагола
// «zvati se». Пока разбор показывал одно «zove», читатель видел «зовёт» и не
// понимал, откуда взялось «называется».
type Reflexive struct {
	// Particle — частица как она написана в тексте: «se» или «се».
	Particle string `json:"particle"`
	// Verb — словоформа глагола, к которому частица относится.
	Verb string `json:"verb"`
	// OnParticle — нажали на саму частицу, а не на глагол.
	OnParticle bool `json:"onParticle"`
	// Companion — второе слово пары: то, что нужно подсветить вдобавок к
	// нажатому. Клиент ищет его по написанию и направлению, не пересчитывая
	// байтовые смещения Go в индексы JavaScript.
	Companion string `json:"companion"`
	// Before — спутник стоит ПЕРЕД нажатым словом.
	Before bool `json:"before"`
	// Adjacent — между частицей и глаголом нет других слов.
	Adjacent bool `json:"adjacent"`
	// Phrase — словарный порядок: «zove se», как бы ни стояло в тексте.
	Phrase string `json:"phrase"`
	// Lemma — начальная форма вместе с частицей: «zvati se».
	Lemma string `json:"lemma,omitempty"`
	// Meaning — чем «se» бывает при глаголе.
	Meaning string `json:"meaning"`
	// Why — почему частица оказалась именно на этом месте.
	Why string `json:"why"`
}

// IsVerb сообщает, является ли словоформа глагольной.
type IsVerb func(word string) bool

// sePair находит пару «глагол + частица» вокруг нажатого слова.
//
// Работает в обе стороны. Нажали глагол — ищется частица; нажали саму частицу —
// ищется её глагол. Второе не менее важно: «se» попадается в тексте на каждом
// шагу, и в отрыве от глагола разбирается как местоимение «sebe», а переводится
// и вовсе случайным словом.
//
// Часть предложения ограничивает поиск: в «Vratio se kući, a brat je ostao»
// частица относится к «vratio», и приписывать её «ostao» нельзя.
func sePair(
	sentence string,
	words []seWord,
	index int,
	isVerb IsVerb,
) (verbIndex, seIndex, clauseFrom int, ok bool) {
	from, to := clauseBounds(sentence, words, index)
	if isSeWord(words[index].text) {
		verb := nearestVerb(words, from, to, index, isVerb)
		if verb < 0 {
			return 0, 0, 0, false
		}
		return verb, index, from, true
	}
	se := nearestSe(words, from, to, index)
	if se < 0 {
		return 0, 0, 0, false
	}
	return index, se, from, true
}

func AttachSe(sentence string, start, end int, surface, lemma string, isVerb IsVerb) *Reflexive {
	words := splitWords(sentence)
	index := wordIndexAt(words, start, end)
	if index < 0 {
		return nil
	}
	verbIndex, seIndex, clauseFrom, ok := sePair(sentence, words, index, isVerb)
	if !ok {
		return nil
	}

	particle := words[seIndex].text
	verb := words[verbIndex].text
	onParticle := seIndex == index

	companion, companionIndex := particle, seIndex
	if onParticle {
		companion, companionIndex = verb, verbIndex
	}

	out := &Reflexive{
		Particle:   particle,
		Verb:       verb,
		OnParticle: onParticle,
		Companion:  companion,
		Before:     companionIndex < index,
		Adjacent:   adjacentSe(sentence, words, verbIndex, seIndex),
		Phrase:     verb + " " + strings.ToLower(particle),
		Meaning:    seMeaning(lemma),
		Why:        seWhy(words, clauseFrom, verbIndex, seIndex, verb),
	}
	if lemma != "" {
		out.Lemma = lemma + " " + strings.ToLower(particle)
	}
	return out
}

// SeSpan расширяет границы слова до пары «глагол + se».
//
// Нужно переводчику: «zove» отдельно переводится как «зовёт», а «zove se» — как
// «называется». Одиночное «se» переводится и вовсе случайным словом. Пара
// «глагол + se» — одно слово по смыслу, и разрывать её перед отправкой в
// переводчик значит спрашивать не о том.
//
// Частица через другие слова не захватывается: помеченный фрагмент обязан быть
// сплошным, иначе выравнивание внутри переведённой фразы теряет смысл.
func SeSpan(sentence string, start, end int, isVerb IsVerb) (int, int, bool) {
	words := splitWords(sentence)
	index := wordIndexAt(words, start, end)
	if index < 0 {
		return start, end, false
	}
	verbIndex, seIndex, _, ok := sePair(sentence, words, index, isVerb)
	if !ok || !adjacentSe(sentence, words, verbIndex, seIndex) {
		return start, end, false
	}
	if seIndex < verbIndex {
		return words[seIndex].start, words[verbIndex].end, true
	}
	return words[verbIndex].start, words[seIndex].end, true
}

// SeMeaning объясняет, чем «se» бывает при этом глаголе.
func SeMeaning(lemma string) string { return seMeaning(lemma) }

func seMeaning(lemma string) string {
	if seTantum[lexicon.Normalize(lemma)] {
		return fmt.Sprintf("«%s» без «se» не бывает — это как «-ся» в «бояться».", lemma)
	}
	return "«se» бывает разным: «umiva se» — умывается (сам себя), " +
		"«vide se» — видят друг друга, «ovde se ne puši» — здесь не курят."
}

// seWhy объясняет место частицы: не «так принято», а по какому правилу она
// оказалась здесь. Правило одно на все безударные словечки (se, me, ga, sam,
// je, bih), и, поняв его раз, читатель перестаёт спотыкаться обо все остальные.
//
// Коротко и без терминов. «Клитика» — слово из учебника лингвистики: русскому
// читателю оно ничего не объясняет, а объяснение с ним становится вдвое длиннее
// и перестаёт читаться.
func seWhy(words []seWord, clauseFrom, index, seIndex int, surface string) string {
	position := seIndex - clauseFrom
	switch {
	case position == 0:
		return "«se» — безударная частица и фразу не открывает: ей нужно слово, " +
			"на которое опереться."

	case position == 1 && seIndex-1 == index:
		return fmt.Sprintf(
			"«se» всегда стоит вторым словом. Здесь фразу открывает сам глагол «%s», "+
				"поэтому частица встала сразу за ним.", surface)

	case position == 1:
		return fmt.Sprintf(
			"«se» всегда стоит вторым словом фразы — здесь после «%s». Место ей задаёт "+
				"фраза, а не глагол, поэтому она и оказалась вдали от «%s».",
			words[seIndex-1].text, surface)
	}

	group := make([]string, 0, position)
	for i := clauseFrom; i < seIndex; i++ {
		group = append(group, words[i].text)
	}
	return fmt.Sprintf(
		"«%s» — это одно смысловое начало фразы, и «se» встаёт сразу за ним, "+
			"а не рядом с глаголом «%s».", strings.Join(group, " "), surface)
}

// seWord — слово предложения вместе с байтовыми границами.
type seWord struct {
	text  string
	start int
	end   int
}

func splitWords(sentence string) []seWord {
	out := make([]seWord, 0, 16)
	begin := -1
	for i, r := range sentence {
		if unicode.IsLetter(r) || unicode.IsDigit(r) || r == '-' || r == '\'' {
			if begin < 0 {
				begin = i
			}
			continue
		}
		if begin >= 0 {
			out = append(out, seWord{sentence[begin:i], begin, i})
			begin = -1
		}
	}
	if begin >= 0 {
		out = append(out, seWord{sentence[begin:], begin, len(sentence)})
	}
	return out
}

func wordIndexAt(words []seWord, start, end int) int {
	for i, w := range words {
		if w.start <= start && end <= w.end {
			return i
		}
	}
	return -1
}

// clauseBounds очерчивает часть предложения вокруг слова: диапазон индексов
// [from, to). Границей служит знак препинания либо союз — он относится уже к
// своей части и потому включается в неё слева.
func clauseBounds(sentence string, words []seWord, index int) (int, int) {
	from := index
	for from > 0 {
		if breaksClause(sentence[words[from-1].end:words[from].start]) {
			break
		}
		from--
		if clauseOpeners[lexicon.Normalize(words[from].text)] {
			break
		}
	}

	to := index + 1
	for to < len(words) {
		if breaksClause(sentence[words[to-1].end:words[to].start]) {
			break
		}
		if clauseOpeners[lexicon.Normalize(words[to].text)] {
			break
		}
		to++
	}
	return from, to
}

func breaksClause(gap string) bool {
	return strings.ContainsAny(gap, ".,;:!?()[]{}\"\n\r…«»„“”—–")
}

// nearestSe возвращает индекс ближайшей частицы в пределах части предложения.
// Ближайшей, а не первой: в «Kad se vrati, javi se» обе части свои.
func nearestSe(words []seWord, from, to, index int) int {
	best := -1
	for i := from; i < to; i++ {
		if i == index || !isSeWord(words[i].text) {
			continue
		}
		if best < 0 || distance(i, index) < distance(best, index) {
			best = i
		}
	}
	return best
}

// nearestVerb ищет глагол, к которому относится частица.
//
// Перебор идёт от ближайшего слова наружу: «Bližila se ponoć» — глагол слева,
// «On se zove Marko» — справа, и заранее сторона неизвестна. При равном
// расстоянии первым проверяется слово слева: клитика чаще идёт следом за своим
// глаголом, чем перед ним.
func nearestVerb(words []seWord, from, to, index int, isVerb IsVerb) int {
	if isVerb == nil {
		return -1
	}
	for step := 1; step < to-from; step++ {
		for _, at := range [2]int{index - step, index + step} {
			if at < from || at >= to || at == index {
				continue
			}
			if !isSeWord(words[at].text) && isVerb(words[at].text) {
				return at
			}
		}
	}
	return -1
}

func adjacentSe(sentence string, words []seWord, index, seIndex int) bool {
	if distance(index, seIndex) != 1 {
		return false
	}
	left, right := index, seIndex
	if seIndex < index {
		left, right = seIndex, index
	}
	return strings.TrimSpace(sentence[words[left].end:words[right].start]) == ""
}

func distance(a, b int) int {
	if a > b {
		return a - b
	}
	return b - a
}

func isSeWord(word string) bool {
	return lexicon.Normalize(word) == "se"
}

// clauseOpeners — слова, с которых начинается новая часть предложения. Своя
// клитика есть у каждой части, и без этого списка «Kad se vrati, reći ću mu»
// приписало бы частицу глаголу «reći».
var clauseOpeners = map[string]bool{
	"i": true, "a": true, "ali": true, "pa": true, "te": true, "ili": true,
	"jer": true, "nego": true, "već": true, "da": true, "ako": true,
	"kad": true, "kada": true, "dok": true, "što": true, "iako": true,
	"mada": true, "pošto": true, "ukoliko": true, "čim": true,
	"koji": true, "koja": true, "koje": true, "kojeg": true, "kojem": true,
	"gde": true, "gdje": true, "kako": true, "jel": true,
}

// seTantum — глаголы, у которых «se» входит в словарную форму: без частицы их
// просто нет. Отделять их важно: у остальных «se» — отдельное значение
// (возвратное, взаимное, безличное), и объяснять их одинаково было бы неверно.
var seTantum = map[string]bool{
	"bojati": true, "smejati": true, "smijati": true, "nadati": true,
	"truditi": true, "potruditi": true, "sećati": true, "sjećati": true,
	"setiti": true, "sjetiti": true, "ponašati": true, "dogoditi": true,
	"desiti": true, "diviti": true, "snalaziti": true, "snaći": true,
	"sviđati": true, "svideti": true, "svidjeti": true, "dopadati": true,
	"dopasti": true, "usuditi": true, "rugati": true, "šaliti": true,
	"kajati": true, "boriti": true, "starati": true, "protiviti": true,
	"sastojati": true, "baviti": true, "ticati": true, "čuditi": true,
	"zaljubiti": true, "raspitivati": true, "smilovati": true,
	"nadmetati": true, "prisećati": true, "prisjećati": true,
}
