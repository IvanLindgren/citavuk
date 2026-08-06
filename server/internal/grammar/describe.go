package grammar

import (
	"fmt"
	"strings"
)

// Fact — одна строка разбора: «Падеж — Творительный».
type Fact struct {
	Label string `json:"label"`
	Value string `json:"value"`
}

// Info — разбор формы: часть речи, признаки и объяснение «почему так».
type Info struct {
	PosLabel string `json:"posLabel"`
	Facts    []Fact `json:"facts"`
	Summary  string `json:"summary"`
	Why      string `json:"why"`
}

func verbTenseLabel(feats map[string]string) string {
	tense := feats["Tense"]
	if tense == "" {
		return ""
	}
	switch tense {
	case "Pres":
		return "настоящее (prezent)"
	case "Fut":
		return "будущее (futur)"
	case "Imp":
		return "имперфект (imperfekat) — прошедшее"
	case "Pqp":
		return "плусквамперфект (pluskvamperfekat) — давнопрошедшее"
	case "Past":
		mood := feats["Mood"]
		if feats["VerbForm"] == "Fin" && (mood == "" || mood == "Ind") {
			return "аорист (aorist) — прошедшее"
		}
		return "прошедшее (perfekat)"
	default:
		if label, ok := tenseRu[tense]; ok {
			return label
		}
		return tense
	}
}

// Короткие названия для строки-сводки: в ней перечисление, и развёрнутые
// пояснения с примерами читались бы как каша.
var (
	degreeSummary   = map[string]string{"Cmp": "сравнительная степень", "Sup": "превосходная степень"}
	definiteSummary = map[string]string{"Ind": "неопределённый вид", "Def": "определённый вид"}
)

// verbFormLabel называет именную форму глагола.
//
// Раньше их не было вовсе: `VerbForm=Conv` (глаголски прилог — деепричастие)
// давал пустую карточку, а трпни придев показывался как обычное прилагательное,
// потому что Voice не читался. Обе формы в сербском обычные, а не книжные:
// «radeći» и «urađen» встречаются на первой же странице любого текста.
func verbFormLabel(verbForm, voice string) string {
	switch verbForm {
	case "Inf":
		return "инфинитив"
	case "Conv":
		return "деепричастие (глаголски прилог)"
	case "Part":
		if voice == "Pass" {
			return "страдательное причастие (трпни глаголски придев)"
		}
		return "причастие (радни глаголски придев)"
	case "Ger":
		return "отглагольное существительное (глаголска именица)"
	}
	return ""
}

func verbFormSummary(verbForm, voice string) string {
	switch verbForm {
	case "Inf":
		return "инфинитив"
	case "Conv":
		return "деепричастие"
	case "Part":
		if voice == "Pass" {
			return "страдательное причастие"
		}
		return "причастие"
	}
	return ""
}

func tenseExplain(feats map[string]string) string {
	switch {
	case feats["Tense"] == "Imp":
		return "Имперфект — простое (синтетическое) прошедшее время для длительного " +
			"или повторяющегося действия в прошлом. В современной речи редок, " +
			"встречается в литературе. Пример: govoraše (от govoriti)."
	case feats["Tense"] == "Past" && feats["VerbForm"] == "Fin":
		return "Аорист — простое (синтетическое) прошедшее время для завершённого " +
			"действия. Часто в повествовании и живой речи. Пример: rekoh, reče, " +
			"rekosmo (от reći). Отличается от перфеката тем, что это одна форма, " +
			"без вспомогательного глагола."
	case feats["Tense"] == "Pqp":
		return "Плусквамперфект — давнопрошедшее: действие, случившееся раньше " +
			"другого прошедшего. Строится как biti в прошедшем + причастие."
	}
	return ""
}

// Describe строит разбор формы по части речи и признакам.
func Describe(upos string, feats map[string]string) Info {
	posLabel := PosFull(upos)
	facts := make([]Fact, 0, 6)

	gcase := feats["Case"]
	number := feats["Number"]
	gender := feats["Gender"]
	tense := feats["Tense"]
	person := feats["Person"]
	verbForm := feats["VerbForm"]
	mood := feats["Mood"]
	degree := feats["Degree"]
	definite := feats["Definite"]
	voice := feats["Voice"]

	// Именная форма глагола называется первой: без этого «radeći» описывалось
	// пустой карточкой, а «urađen» — как обычное прилагательное.
	if label := verbFormLabel(verbForm, voice); label != "" {
		facts = append(facts, Fact{"Форма", label})
	}
	if gcase != "" {
		facts = append(facts, Fact{"Падеж", CaseName(gcase)})
	}
	// Степень сравнения не повторяется для положительной: «прилагательное в
	// положительной степени» — это просто прилагательное.
	if degree != "" && degree != "Pos" {
		facts = append(facts, Fact{"Степень сравнения", value(degreeRu, degree)})
	}
	if definite != "" {
		facts = append(facts, Fact{"Вид прилагательного", value(definiteRu, definite)})
	}
	if tense != "" {
		facts = append(facts, Fact{"Время", verbTenseLabel(feats)})
	}
	if mood == "Imp" {
		facts = append(facts, Fact{"Наклонение", "повелительное (императив)"})
	}
	if mood == "Cnd" {
		facts = append(facts, Fact{"Наклонение", "условное (потенцијал)"})
	}
	if voice == "Pass" {
		facts = append(facts, Fact{"Залог", value(voiceRu, voice)})
	}
	if person != "" {
		facts = append(facts, Fact{"Лицо", value(personRu, person)})
	}
	if number != "" {
		facts = append(facts, Fact{"Число", value(numberRu, number)})
	}
	if gender != "" {
		facts = append(facts, Fact{"Род", value(genderRu, gender)})
	}

	summary := make([]string, 0, 8)
	if label := verbFormSummary(verbForm, voice); label != "" {
		summary = append(summary, label)
	}
	if gcase != "" {
		summary = append(summary, strings.ToLower(CaseName(gcase)))
	}
	if degree != "" && degree != "Pos" {
		summary = append(summary, degreeSummary[degree])
	}
	if definite != "" {
		summary = append(summary, definiteSummary[definite])
	}
	if tense != "" {
		summary = append(summary, verbTenseLabel(feats))
	}
	if mood == "Imp" {
		summary = append(summary, "повелительное наклонение")
	}
	if mood == "Cnd" {
		summary = append(summary, "условное наклонение")
	}
	if person != "" {
		summary = append(summary, value(personRu, person))
	}
	if number != "" {
		summary = append(summary, value(numberRu, number))
	}
	if gender != "" {
		summary = append(summary, "род: "+value(genderRu, gender))
	}

	return Info{
		PosLabel: posLabel,
		Facts:    facts,
		Summary:  strings.Join(summary, ", "),
		Why:      why(posLabel, feats),
	}
}

func why(posLabel string, feats map[string]string) string {
	gcase := feats["Case"]
	number := feats["Number"]
	gender := feats["Gender"]
	tense := feats["Tense"]
	person := feats["Person"]
	verbForm := feats["VerbForm"]
	mood := feats["Mood"]
	voice := feats["Voice"]

	switch {
	// Именные формы глагола проверяются РАНЬШЕ падежа: у страдательного
	// причастия падеж есть, и без этой ветки «urađen» объяснялся бы как
	// обычное прилагательное в именительном падеже.
	case verbForm == "Conv":
		return "Это деепричастие (глаголски прилог) — неизменяемая форма глагола, " +
			"которая называет побочное действие: «radeći» — работая, «ušavši» — войдя.\n\n" +
			"Настоящего времени (садашњи) образуется от 3-го лица множественного " +
			"презента с -ći: rade → radeći. Прошедшего (прошли) — от инфинитива " +
			"с -vši: uraditi → uradivši. Деепричастие не склоняется и не спрягается."

	case verbForm == "Part" && voice == "Pass":
		return "Это страдательное причастие (трпни глаголски придев) — форма глагола, " +
			"которая ведёт себя как прилагательное: склоняется по родам, числам и " +
			"падежам («urađen posao», «urađena kuća»).\n\n" +
			"Образуется от инфинитива суффиксами -n/-en/-t: pisati → pisan, " +
			"uraditi → urađen, otvoriti → otvoren. Именно из него строится " +
			"страдательный залог: «Posao je urađen» — работа сделана."

	case verbForm == "Part":
		return "Это радни глаголски придев — причастие на -o/-la/-lo, из которого " +
			"строится прошедшее время.\n\nСамо по себе оно не употребляется: " +
			"перфекат — это вспомогательный глагол biti плюс это причастие " +
			"(«ja sam radio», «ona je radila»). Род и число причастие берёт от " +
			"подлежащего, а лицо выражает вспомогательный глагол."

	case gcase != "":
		genderPart := ""
		if gender != "" {
			genderPart = ", " + value(genderRu, gender) + " род"
		}
		use := caseUse[gcase]
		if use == "" {
			use = "—"
		}
		explain := fmt.Sprintf(
			"Это %s в форме «%s падеж», %s число%s.\n\nЗачем нужен этот падеж: %s",
			posLabel, strings.ToLower(CaseName(gcase)), value(numberRu, number),
			genderPart, use)
		if extra := adjectiveExplain(feats); extra != "" {
			explain += "\n\n" + extra
		}
		return explain

	case verbForm == "Inf":
		return "Это инфинитив — начальная форма глагола (отвечает на «что делать?»). " +
			"От неё образуются все времена."

	case tense != "" && mood != "Imp" && mood != "Cnd":
		explain := tenseExplain(feats)
		if explain != "" {
			explain = "\n\n" + explain
		}
		return fmt.Sprintf(
			"Глагол в форме «%s», %s, %s число.%s\n\n"+
				"Ниже — спряжение в трёх самых употребительных временах: презент, "+
				"перфекат, футур I. В сербском есть и другие времена (аорист, "+
				"имперфекат, плусквамперфекат, футур II), но в живой речи чаще всего "+
				"используются эти три.",
			verbTenseLabel(feats), value(personRu, person), value(numberRu, number), explain)

	case mood == "Imp":
		return fmt.Sprintf(
			"Это повелительное наклонение (императив) — выражает приказ или просьбу "+
				"(%s, %s число).\n\nНиже — спряжение этого глагола в основных временах.",
			value(personRu, person), value(numberRu, number))

	case mood == "Cnd":
		return "Это условное наклонение (потенцијал) — выражает возможность или условие " +
			"(бы, если бы).\n\nНиже — спряжение этого глагола в основных временах."

	case len(feats) > 0:
		return "Это " + posLabel + ". Базовые грамматические признаки указаны выше."
	}

	return "Базовый разбор: " + posLabel + ". Полный разбор доступен для слов, " +
		"которые есть в словаре форм."
}

// adjectiveExplain дописывает то, чего нет в русском языке и о чём поэтому
// нужно сказать словами: вид прилагательного и степень сравнения.
func adjectiveExplain(feats map[string]string) string {
	var parts []string
	switch feats["Definite"] {
	case "Ind":
		parts = append(parts, "Неопределённый вид (neodređeni): называет признак "+
			"впервые, отвечает на «kakav?». «Ovo je dobar čovek» — это хороший человек.")
	case "Def":
		parts = append(parts, "Определённый вид (određeni): указывает на уже известный "+
			"предмет, отвечает на «koji?». «Dobri čovek je došao» — тот самый хороший "+
			"человек пришёл. В родительном и дательном виды различаются окончанием: "+
			"«dobra» против «dobrog», «dobru» против «dobrom».")
	}
	switch feats["Degree"] {
	case "Cmp":
		parts = append(parts, "Сравнительная степень (komparativ): образуется "+
			"суффиксами -iji, -ji или -ši. Сравнение вводится словом «od» с "+
			"родительным падежом либо «nego»: «viši od mene», «viši nego ja».")
	case "Sup":
		parts = append(parts, "Превосходная степень (superlativ): приставка naj- "+
			"к сравнительной степени, всегда слитно — «najviši», «najbolji».")
	}
	return strings.Join(parts, "\n\n")
}

func value(dict map[string]string, key string) string {
	if v, ok := dict[key]; ok {
		return v
	}
	return key
}
