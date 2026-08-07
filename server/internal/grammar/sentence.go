package grammar

import (
	"regexp"
	"strings"
	"unicode"
)

// Разбор целой фразы, а не одного слова.
//
// Разбор по слову отвечает на вопрос «что это за форма». Но сербская форма сама
// по себе почти всегда неоднозначна: «kući» — и дательный, и местный, «grada» —
// и родительный единственного, и именительный множественного. Что именно перед
// нами, решает соседство: предлог задаёт падеж, вспомогательный глагол вместе с
// причастием даёт время, частица «se» меняет значение глагола.
//
// Поэтому здесь не сумма разборов, а связи между ними. Ровно эти связи учащийся
// и не видит: слова он посмотреть может, а из чего собрана фраза — нет.

// Reading — один из возможных разборов словоформы.
//
// Разборов у формы бывает несколько, и выбрать между ними по самому слову
// нельзя в принципе. Поэтому в предложение они приезжают все, а выбирает
// соседство.
type Reading struct {
	Lemma string            `json:"lemma"`
	UPOS  string            `json:"upos"`
	Feats map[string]string `json:"feats"`
}

// Token — слово фразы вместе с разбором.
type Token struct {
	Index   int    `json:"index"`
	Surface string `json:"surface"`
	// Start, End — границы слова в байтах внутри исходной фразы. По ним клиент
	// подсвечивает слово в тексте, не пересчитывая его сам.
	Start int    `json:"start"`
	End   int    `json:"end"`
	Lemma string `json:"lemma"`
	UPOS  string `json:"upos"`
	// PosShort — «сущ.», «предлог»: подпись под словом в разборе.
	PosShort    string            `json:"posShort"`
	Feats       map[string]string `json:"feats"`
	Known       bool              `json:"known"`
	Translation string            `json:"translation,omitempty"`
	// Readings — все разборы формы. Наружу не отдаются: клиенту нужен выбранный,
	// а не список возможностей.
	Readings []Reading `json:"-"`
	// ChosenByContext означает, что разбор выбран из нескольких по соседям, а не
	// взят как самый вероятный. Показывается человеку: это ровно то место, где
	// разбор фразы даёт больше разбора слова.
	ChosenByContext bool `json:"chosenByContext"`
}

// Chunk — связанная группа слов внутри фразы.
type Chunk struct {
	// Kind: «prep» — предложная группа, «verb» — глагольная, «noun» — именная
	// группа с согласованием.
	Kind string `json:"kind"`
	// Head — индекс главного слова группы.
	Head int `json:"head"`
	// Tokens — индексы всех слов группы по порядку.
	Tokens []int  `json:"tokens"`
	Text   string `json:"text"`
	// Case — падеж именной группы, если он определён.
	Case     string `json:"case,omitempty"`
	CaseName string `json:"caseName,omitempty"`
	// Label — заголовок группы: «предлог u + местный падеж».
	Label string `json:"label"`
	// Note — что это значит: «где? — место, а не движение».
	Note string `json:"note,omitempty"`
}

// SentenceAnalysis — разбор фразы.
type SentenceAnalysis struct {
	Sentence string  `json:"sentence"`
	Tokens   []Token `json:"tokens"`
	Chunks   []Chunk `json:"chunks"`
}

// wordSpan — слово сербской латиницы или кириллицы вместе с апострофом внутри.
var wordSpan = regexp.MustCompile(`[\p{L}][\p{L}'’-]*`)

// Span — границы слова в исходной строке.
type Span struct {
	Text  string
	Start int
	End   int
}

// Tokenize режет фразу на слова, сохраняя их место в строке.
func Tokenize(sentence string) []Span {
	found := wordSpan.FindAllStringIndex(sentence, -1)
	out := make([]Span, 0, len(found))
	for _, pair := range found {
		out = append(out, Span{Text: sentence[pair[0]:pair[1]], Start: pair[0], End: pair[1]})
	}
	return out
}

// nominalPos — части речи, из которых состоит именная группа.
var nominalPos = map[string]bool{
	"NOUN": true, "PROPN": true, "PRON": true, "ADJ": true, "DET": true, "NUM": true,
}

// headPos — части речи, на которых именная группа заканчивается.
var headPos = map[string]bool{"NOUN": true, "PROPN": true, "PRON": true, "NUM": true}

// Analyze связывает разобранные слова в группы.
//
// Токены приходят уже разобранными: словарь лежит в другом пакете, а здесь
// правила языка. Функция чистая, и потому проверяемая на выдуманных разборах,
// без словаря вовсе.
func Analyze(sentence string, tokens []Token) SentenceAnalysis {
	normalizeEducationalPOS(tokens)
	result := SentenceAnalysis{Sentence: sentence, Tokens: tokens, Chunks: []Chunk{}}
	if len(tokens) == 0 {
		return result
	}
	// Порядок важен: предложные группы разбираются первыми и уточняют падеж
	// своих слов. Именные группы строятся уже по уточнённому.
	taken := make([]bool, len(tokens))
	result.Chunks = append(result.Chunks, prepositionChunks(result.Tokens, taken)...)
	result.Chunks = append(result.Chunks, verbChunks(result.Tokens, taken)...)
	result.Chunks = append(result.Chunks, nounChunks(result.Tokens, taken)...)
	sortChunks(result.Chunks)
	return result
}

// normalizeEducationalPOS переводит технические категории UD в привычные
// школьные названия сербской грамматики. UPOS удобен для синтаксического
// движка, но показывать его дословно нельзя: DET — не «определение», а `bio`
// с VerbForm=Part — радни глаголски придев, хотя в трибанке lemma `biti`
// размечена как AUX.
func normalizeEducationalPOS(tokens []Token) {
	for i := range tokens {
		token := &tokens[i]
		if token.Feats["VerbForm"] == "Part" && token.Feats["Voice"] == "Act" {
			// Для ученика это форма смыслового глагола. Конечная форма `je/sam/su`
			// остаётся вспомогательным глаголом и образует с ней сложное время.
			if token.UPOS == "AUX" {
				token.UPOS = "VERB"
			}
			token.PosShort = "глаг. прил."
			continue
		}
		if token.UPOS == "DET" && isUninflectedQuantity(token) {
			// Традиционная сербская грамматика относит `mnogo`, `malo`,
			// `dovoljno` к прилозима за количину. В UD они неоднозначны и
			// иногда попадают в DET, если определяют именную группу.
			token.UPOS = "ADV"
			token.PosShort = PosShort("ADV")
		}
	}
	promoteProperNameRuns(tokens)
}

var quantityAdverbs = map[string]bool{
	"dosta": true, "dovoljno": true, "koliko": true, "malo": true,
	"mnogo": true, "nekoliko": true, "onoliko": true, "previše": true,
	"puno": true, "toliko": true, "više": true,
}

func isUninflectedQuantity(token *Token) bool {
	if !quantityAdverbs[strings.ToLower(token.Lemma)] {
		return false
	}
	return token.Feats["Case"] == "" && token.Feats["Gender"] == "" &&
		token.Feats["Number"] == ""
}

// Два написанных с прописной слова подряд почти всегда составляют имя. Это
// позволяет честно разобрать `Hari Poter`, даже если словарь знает Hari, но не
// содержит фамилию Poter. Одиночное неизвестное слово в начале предложения
// собственным именем не объявляется.
func promoteProperNameRuns(tokens []Token) {
	for i := range tokens {
		if !isUnknownPOS(tokens[i].UPOS) || !startsWithUpper(tokens[i].Surface) {
			continue
		}
		if (i > 0 && isNameNeighbour(tokens[i-1])) ||
			(i+1 < len(tokens) && isNameNeighbour(tokens[i+1])) {
			tokens[i].UPOS = "PROPN"
			tokens[i].PosShort = PosShort("PROPN")
			tokens[i].ChosenByContext = true
		}
	}
}

func isNameNeighbour(token Token) bool {
	return startsWithUpper(token.Surface) &&
		(token.UPOS == "PROPN" || isUnknownPOS(token.UPOS))
}

func isUnknownPOS(upos string) bool { return upos == "UNKNOWN" || upos == "X" }

func startsWithUpper(word string) bool {
	for _, char := range word {
		return unicode.IsUpper(char)
	}
	return false
}

// prepositionChunks собирает группы «предлог + то, чем он управляет».
//
// Здесь же снимается омонимия падежа: у двусторонних предлогов (u, na, za, pod,
// pred, nad) падеж разводит смысл — «u grad» это куда, «u gradu» это где, — и
// без предлога выбрать между разборами формы нельзя вовсе.
func prepositionChunks(tokens []Token, taken []bool) []Chunk {
	out := []Chunk{}
	for i := range tokens {
		if tokens[i].UPOS != "ADP" || taken[i] {
			continue
		}
		// Управление ищется по начальной форме, а не по написанию: таблица
		// предлогов ведётся латиницей, и «у великом парку» кириллицей не
		// находило в ней ничего — падеж выбирался наугад.
		gov := PrepositionGovernment(prepKey(tokens[i]))
		if len(gov) == 0 {
			continue
		}
		members, head := nominalRun(tokens, i+1, taken)
		if head < 0 {
			continue
		}

		// Падеж выбирается тот, который предлог допускает: из разборов слова
		// берётся подходящий, а если подходит уже выбранный — он и остаётся.
		chosen := matchGovernedCase(tokens, head, gov)
		if chosen == "" {
			continue
		}
		applyCase(tokens, members, chosen)

		group := append([]int{i}, members...)
		chunk := Chunk{
			Kind:     "prep",
			Head:     head,
			Tokens:   group,
			Text:     spanText(tokens, group),
			Case:     chosen,
			CaseName: CaseName(chosen),
			Label: "предлог «" + tokens[i].Surface + "» + " +
				strings.ToLower(shortCaseName(chosen)),
			Note: governmentMeaning(gov, chosen),
		}
		for _, index := range group {
			taken[index] = true
		}
		out = append(out, chunk)
	}
	return out
}

// nominalRun находит именную группу, начиная с позиции from.
//
// Возвращает индексы слов группы и индекс её главного слова. Главное — первое
// существительное, местоимение или числительное; всё до него (прилагательные,
// определители) идёт в группу. Если такого слова нет до ближайшего глагола или
// конца фразы, группы нет: «u» без своего слова — не предложная группа, а
// оборванная фраза.
func nominalRun(tokens []Token, from int, taken []bool) ([]int, int) {
	members := []int{}
	for i := from; i < len(tokens); i++ {
		if taken[i] || !nominalPos[tokens[i].UPOS] {
			break
		}
		members = append(members, i)
		if headPos[tokens[i].UPOS] {
			return members, i
		}
		// Больше трёх слов до главного — это уже не одна группа, а разбор,
		// сползший на соседнее предложение.
		if len(members) >= 4 {
			break
		}
	}
	return nil, -1
}

// matchGovernedCase выбирает падеж, который допускает предлог.
//
// Перебор идёт по правилам предлога, а НЕ по разборам слова, и порядок правил в
// таблице — это порядок предпочтения. Разница видна на «o ljubavi»: у «ljubavi»
// есть и местный падеж единственного, и винительный множественного, оба
// настоящие. Перебирая разборы, мы брали первый попавшийся и объявляли фразу
// «удар обо что-то». Перебирая правила, берём то, ради чего предлог обычно и
// стоит: «o» — это прежде всего «о чём».
//
// Не подошло ни одно правило — берётся падеж, которого предлог требует
// единственным: словарь мог просто не знать нужной строки, а «u» с местным
// падежом остаётся местным падежом.
func matchGovernedCase(tokens []Token, head int, gov []Government) string {
	for _, rule := range gov {
		if tokens[head].Feats["Case"] == rule.CaseKey {
			return rule.CaseKey
		}
		for _, reading := range tokens[head].Readings {
			if reading.Feats["Case"] != rule.CaseKey {
				continue
			}
			tokens[head].Feats = reading.Feats
			tokens[head].Lemma = reading.Lemma
			tokens[head].UPOS = reading.UPOS
			tokens[head].PosShort = PosShort(reading.UPOS)
			tokens[head].ChosenByContext = true
			return rule.CaseKey
		}
	}
	if len(gov) == 1 {
		return gov[0].CaseKey
	}
	return ""
}

// applyCase распространяет выбранный падеж на согласованные слова группы.
//
// Прилагательное согласуется с существительным, и если падеж существительного
// уточнён предлогом, то и у прилагательного он тот же. Без этого в «u velikoj
// kući» дом стоял бы в местном падеже, а «большой» — в дательном: обе формы
// совпадают, и по слову они неразличимы.
func applyCase(tokens []Token, members []int, gcase string) {
	for _, i := range members {
		if tokens[i].Feats["Case"] == gcase {
			continue
		}
		for _, reading := range tokens[i].Readings {
			if reading.Feats["Case"] != gcase {
				continue
			}
			tokens[i].Feats = reading.Feats
			tokens[i].Lemma = reading.Lemma
			tokens[i].ChosenByContext = true
			break
		}
	}
}

// prepKey — под каким видом искать предлог в таблице управления.
//
// Начальная форма уже приведена к латинице разбором слова, написание — нет.
// Запасной путь через написание оставлен на случай, когда леммы нет вовсе.
func prepKey(token Token) string {
	if token.Lemma != "" {
		return token.Lemma
	}
	return token.Surface
}

func governmentMeaning(gov []Government, gcase string) string {
	for _, rule := range gov {
		if rule.CaseKey == gcase {
			return rule.Meaning
		}
	}
	return ""
}

// verbChunks собирает глагол вместе с тем, что к нему относится.
//
// В сербском время и наклонение почти всегда собираются из нескольких слов:
// «sam čitao» — перфект, «ću čitati» — будущее, «bih čitao» — условное. По
// отдельности эти слова описываются неверно: «sam» само по себе — «я есть».
func verbChunks(tokens []Token, taken []bool) []Chunk {
	promoteAuxiliaries(tokens)
	out := []Chunk{}
	for i := range tokens {
		if taken[i] || (tokens[i].UPOS != "VERB" && tokens[i].UPOS != "AUX") {
			continue
		}
		group := []int{i}
		// Вспомогательный глагол ищется и слева, и справа: «sam čitao», но и
		// «čitao sam» — порядок в сербском свободный.
		for _, j := range []int{i - 1, i + 1} {
			if j < 0 || j >= len(tokens) || taken[j] || contains(group, j) {
				continue
			}
			if pairsWithVerb(tokens[i], tokens[j]) {
				group = append(group, j)
			}
		}
		// Отрицание и возвратная частица — часть той же формы.
		for j := max(0, i-2); j < min(len(tokens), i+3); j++ {
			if taken[j] || contains(group, j) {
				continue
			}
			if isNegation(tokens[j]) || isReflexiveParticle(tokens[j]) {
				group = append(group, j)
			}
		}
		sortInts(group)

		head := verbHead(tokens, group)
		chunk := Chunk{
			Kind:   "verb",
			Head:   head,
			Tokens: group,
			Text:   spanText(tokens, group),
			Label:  verbLabel(tokens, group, head),
			Note:   verbNote(tokens, group),
		}
		for _, index := range group {
			taken[index] = true
		}
		out = append(out, chunk)
	}
	return out
}

// promoteAuxiliaries перечитывает слово как вспомогательный глагол, если рядом
// стоит причастие или инфинитив.
//
// Разбор по слову выбирает самое частое прочтение, и обычно оно верное. Но
// «bio» рядом с «je» — это перфект, а не прилагательное, и решает тут именно
// соседство. Проверка идёт по разборам, которые у формы уже есть: выдумывать
// вспомогательный глагол там, где словарь его не видит, нельзя.
func promoteAuxiliaries(tokens []Token) {
	for i := range tokens {
		if tokens[i].UPOS == "AUX" || !hasNeighbourVerbForm(tokens, i) {
			continue
		}
		for _, reading := range tokens[i].Readings {
			if reading.UPOS != "AUX" {
				continue
			}
			tokens[i].UPOS = "AUX"
			tokens[i].Lemma = reading.Lemma
			tokens[i].Feats = reading.Feats
			tokens[i].PosShort = PosShort("AUX")
			tokens[i].ChosenByContext = true
			break
		}
	}
}

// hasNeighbourVerbForm сообщает, стоит ли вплотную причастие или инфинитив —
// то, с чем вспомогательный глагол и образует форму.
func hasNeighbourVerbForm(tokens []Token, i int) bool {
	for _, j := range []int{i - 1, i + 1} {
		if j < 0 || j >= len(tokens) {
			continue
		}
		if form := tokens[j].Feats["VerbForm"]; form == "Part" || form == "Inf" {
			return true
		}
	}
	return false
}

// pairsWithVerb решает, образуют ли два слова одну глагольную форму.
//
// Пара — это вспомогательный глагол и смысловой: причастие с «biti» даёт
// перфект, инфинитив с «hteti» — будущее. Два полноценных глагола рядом парой
// не считаются: «hoću da radim» — это два разных сказуемых.
func pairsWithVerb(main, other Token) bool {
	if other.UPOS != "AUX" && main.UPOS != "AUX" {
		return false
	}
	aux, verb := other, main
	if main.UPOS == "AUX" && other.UPOS != "AUX" {
		aux, verb = main, other
	}
	if aux.UPOS != "AUX" {
		return false
	}
	form := verb.Feats["VerbForm"]
	return form == "Part" || form == "Inf" || verb.UPOS == "VERB"
}

// verbHead — смысловой глагол группы, а не вспомогательный: разбор относится к
// нему, «sam» ничего не сообщает о действии.
func verbHead(tokens []Token, group []int) int {
	for _, i := range group {
		if tokens[i].UPOS == "VERB" {
			return i
		}
	}
	return group[0]
}

func verbLabel(tokens []Token, group []int, head int) string {
	form := ""
	if aux := auxOf(tokens, group, head); aux >= 0 {
		form = compoundForm(tokens[aux], tokens[head])
	}
	if form == "" {
		form = Describe(tokens[head].UPOS, tokens[head].Feats).Summary
	}
	if form == "" {
		return PosFull(tokens[head].UPOS)
	}
	return "глагол «" + tokens[head].Lemma + "»: " + form
}

// compoundForm называет время или наклонение, собранное из двух слов.
//
// Одного «вспомогательный + причастие» мало: так выглядят четыре разные формы
// сразу. Различает их сам вспомогательный глагол — «sam» даёт перфект, «budeš»
// футур второй, «bih» условное, «ću» будущее. Без разбора по нему «Ne bih
// rekao» («я бы не сказал») подписывалось прошедшим временем.
func compoundForm(aux, verb Token) string {
	switch {
	case aux.Feats["Mood"] == "Cnd":
		return "условное наклонение (потенцијал)"
	case aux.Lemma == "hteti" || aux.Lemma == "htjeti":
		return "будущее время (футур I)"
	case strings.HasPrefix(strings.ToLower(aux.Surface), "bud") ||
		strings.HasPrefix(strings.ToLower(aux.Surface), "буд"):
		return "будущее второе (футур II) — действие раньше другого будущего"
	case verb.Feats["VerbForm"] == "Part":
		return "прошедшее время (перфекат)"
	}
	return ""
}

// auxOf находит вспомогательный глагол группы. Возвращает -1, если его нет.
func auxOf(tokens []Token, group []int, head int) int {
	for _, i := range group {
		if i != head && tokens[i].UPOS == "AUX" {
			return i
		}
	}
	return -1
}

func verbNote(tokens []Token, group []int) string {
	notes := []string{}
	for _, i := range group {
		if isNegation(tokens[i]) {
			notes = append(notes, "отрицание: «ne» перед глаголом")
		}
		if isReflexiveParticle(tokens[i]) {
			notes = append(notes, "частица «se» — глагол возвратный, действие обращено на само подлежащее")
		}
	}
	return strings.Join(notes, "; ")
}

func hasAux(tokens []Token, group []int) bool {
	for _, i := range group {
		if tokens[i].UPOS == "AUX" {
			return true
		}
	}
	return false
}

// nounChunks собирает именные группы вне предлогов: «velika kuća», «moj brat».
//
// Показывают они одно, но важное: прилагательное согласуется с существительным
// в роде, числе и падеже, и увидеть это согласование можно только рядом.
func nounChunks(tokens []Token, taken []bool) []Chunk {
	out := []Chunk{}
	for i := 0; i < len(tokens); i++ {
		if taken[i] || (tokens[i].UPOS != "ADJ" && tokens[i].UPOS != "DET") {
			continue
		}
		members, head := nominalRun(tokens, i, taken)
		if head < 0 || len(members) < 2 {
			continue
		}
		gcase := tokens[head].Feats["Case"]
		applyCase(tokens, members, gcase)

		chunk := Chunk{
			Kind:     "noun",
			Head:     head,
			Tokens:   members,
			Text:     spanText(tokens, members),
			Case:     gcase,
			CaseName: CaseName(gcase),
			Label:    "согласование: " + agreementLabel(tokens[head].Feats),
			Note:     "определение согласуется с существительным в роде, числе и падеже",
		}
		for _, index := range members {
			taken[index] = true
		}
		out = append(out, chunk)
		i = head
	}
	return out
}

func agreementLabel(feats map[string]string) string {
	parts := []string{}
	if gcase := feats["Case"]; gcase != "" {
		parts = append(parts, strings.ToLower(shortCaseName(gcase)))
	}
	if number := feats["Number"]; number != "" {
		parts = append(parts, value(numberRu, number))
	}
	if gender := feats["Gender"]; gender != "" {
		parts = append(parts, "род: "+value(genderRu, gender))
	}
	if len(parts) == 0 {
		return "по роду, числу и падежу"
	}
	return strings.Join(parts, ", ")
}

// shortCaseName — «Местный падеж» без латинской подписи: в заголовке группы
// «предлог u + местный падеж (lokativ)» скобка мешает читать.
func shortCaseName(key string) string {
	name := CaseName(key)
	if open := strings.Index(name, " ("); open > 0 {
		name = name[:open]
	}
	if !strings.Contains(strings.ToLower(name), "падеж") {
		name += " падеж"
	}
	return name
}

func spanText(tokens []Token, group []int) string {
	parts := make([]string, 0, len(group))
	for _, i := range group {
		parts = append(parts, tokens[i].Surface)
	}
	return strings.Join(parts, " ")
}

func isNegation(token Token) bool {
	return strings.EqualFold(token.Surface, "ne") || strings.EqualFold(token.Surface, "не")
}

func isReflexiveParticle(token Token) bool {
	return strings.EqualFold(token.Surface, "se") || strings.EqualFold(token.Surface, "се")
}

func contains(list []int, value int) bool {
	for _, item := range list {
		if item == value {
			return true
		}
	}
	return false
}

func sortInts(list []int) {
	for i := 1; i < len(list); i++ {
		for j := i; j > 0 && list[j] < list[j-1]; j-- {
			list[j], list[j-1] = list[j-1], list[j]
		}
	}
}

// sortChunks расставляет группы в порядке фразы: разбор читается вместе с
// текстом, и группы вразнобой пришлось бы искать глазами.
func sortChunks(chunks []Chunk) {
	for i := 1; i < len(chunks); i++ {
		for j := i; j > 0 && chunks[j].Tokens[0] < chunks[j-1].Tokens[0]; j-- {
			chunks[j], chunks[j-1] = chunks[j-1], chunks[j]
		}
	}
}
