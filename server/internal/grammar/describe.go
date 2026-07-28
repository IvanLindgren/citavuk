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

	if gcase != "" {
		facts = append(facts, Fact{"Падеж", CaseName(gcase)})
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
	if person != "" {
		facts = append(facts, Fact{"Лицо", value(personRu, person)})
	}
	if number != "" {
		facts = append(facts, Fact{"Число", value(numberRu, number)})
	}
	if gender != "" {
		facts = append(facts, Fact{"Род", value(genderRu, gender)})
	}
	if verbForm == "Inf" {
		facts = append(facts, Fact{"Форма", "инфинитив"})
	}

	summary := make([]string, 0, 6)
	if gcase != "" {
		summary = append(summary, strings.ToLower(CaseName(gcase)))
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

	switch {
	case gcase != "":
		genderPart := ""
		if gender != "" {
			genderPart = ", " + value(genderRu, gender) + " род"
		}
		use := caseUse[gcase]
		if use == "" {
			use = "—"
		}
		return fmt.Sprintf(
			"Это %s в форме «%s падеж», %s число%s.\n\nЗачем нужен этот падеж: %s",
			posLabel, strings.ToLower(CaseName(gcase)), value(numberRu, number),
			genderPart, use)

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

func value(dict map[string]string, key string) string {
	if v, ok := dict[key]; ok {
		return v
	}
	return key
}
