package grammar

import "strings"

// Match — форма, опознанная достраиванием от известной леммы.
type Match struct {
	Lemma string
	Feats map[string]string
}

// LemmaCandidates перечисляет возможные начальные формы для словоформы.
//
// Лексикон хранит в среднем две формы на лемму, поэтому «kućom» в нём просто
// нет. Вместо угадывания разбора по окончанию проверяем обратное: строим от
// каждого кандидата его парадигму и смотрим, получилась ли из неё эта форма.
func LemmaCandidates(form string) []string {
	form = strings.ToLower(form)
	runes := []rune(form)
	seen := map[string]bool{form: true}
	out := []string{form}

	add := func(word string) {
		if len([]rune(word)) < 2 || seen[word] {
			return
		}
		seen[word] = true
		out = append(out, word)
	}

	endings := []string{"", "a", "o", "e", "ti", "iti", "ati", "eti", "nuti", "ovati"}
	for cut := 1; cut <= 4 && cut < len(runes); cut++ {
		base := string(runes[:len(runes)-cut])
		for _, ending := range endings {
			add(base + ending)
		}
	}
	return out
}

// MatchNoun ищет падеж и число, при которых лемма даёт эту форму.
//
// Перебирается список форм, а не строка для показа: там варианты склеены через
// «/», и сравнение со склеенной строкой не совпало бы никогда — «čoveka» так и
// не опозналось бы винительным падежом.
func MatchNoun(lemma, gender, form string) (map[string]string, bool) {
	form = strings.ToLower(form)
	for _, number := range []string{"Sing", "Plur"} {
		for _, caseKey := range CaseOrder {
			for _, candidate := range declensionForms(lemma, gender, number, caseKey) {
				if candidate != form {
					continue
				}
				return map[string]string{
					"Case": caseKey, "Number": number, "Gender": gender,
				}, true
			}
		}
	}
	return nil, false
}

// MatchNounAll возвращает ВСЕ падежи и числа, при которых лемма даёт эту форму.
//
// Отдельно от MatchNoun, потому что задачи разные. Разбору одного слова нужен
// один ответ — самый вероятный, и он его и получает. Разбору фразы нужны все:
// «parku» — это и дательный, и местный, а какой именно, решает предлог рядом.
// Отдай мы сюда первый попавшийся, выбирать было бы не из чего.
func MatchNounAll(lemma, gender, form string) []map[string]string {
	form = strings.ToLower(form)
	out := []map[string]string{}
	for _, number := range []string{"Sing", "Plur"} {
		for _, caseKey := range CaseOrder {
			for _, candidate := range declensionForms(lemma, gender, number, caseKey) {
				if candidate != form {
					continue
				}
				out = append(out, map[string]string{
					"Case": caseKey, "Number": number, "Gender": gender,
				})
				break
			}
		}
	}
	return out
}

// MatchAdjective ищет род, число и падеж, при которых лемма даёт эту форму.
//
// Определённый и неопределённый вид перебираются оба: у мужского рода они
// расходятся («dobar čovek», но «dobri čovek»). Какой вид получился, тоже
// сообщается, но только когда формы различаются: для читателя это разница
// между «хороший» вообще и «тот самый хороший».
func MatchAdjective(lemma, form string) (map[string]string, bool) {
	if feats, ok := matchAdjectiveDegree(lemma, form); ok {
		return feats, true
	}
	// Сравнительная и превосходная степень склоняются как обычное прилагательное,
	// но от своей основы: «najlepšima» — это «najlepši», а не «lep». Без этого
	// шага такие формы не опознавались бы вовсе, а в тексте они частые.
	comparative := Comparative(lemma)
	if comparative == "" || comparative == lemma {
		return nil, false
	}
	if feats, ok := matchAdjectiveDegree(comparative, form); ok {
		feats["Degree"] = "Cmp"
		return feats, true
	}
	if superlative := Superlative(comparative); superlative != "" {
		if feats, ok := matchAdjectiveDegree(superlative, form); ok {
			feats["Degree"] = "Sup"
			return feats, true
		}
	}
	return nil, false
}

func matchAdjectiveDegree(lemma, form string) (map[string]string, bool) {
	form = strings.ToLower(form)
	// Падеж во внешнем цикле намеренно: «lepa» — это и женский именительный, и
	// мужской родительный, и читателю нужен первый. Перебирай мы сначала род,
	// самая частая форма описывалась бы самым редким разбором.
	for _, caseKey := range CaseOrder {
		for _, number := range []string{"Sing", "Plur"} {
			for _, gender := range []string{"Masc", "Fem", "Neut"} {
				indefinite := AdjectiveForm(lemma, gender, number, caseKey, false)
				definite := AdjectiveForm(lemma, gender, number, caseKey, true)
				if !adjectiveHits(indefinite, form, number, caseKey) &&
					!adjectiveHits(definite, form, number, caseKey) {
					continue
				}
				feats := map[string]string{
					"Case": caseKey, "Number": number, "Gender": gender,
				}
				// Вид указывается, только когда формы разные. У женского рода и
				// множественного числа он не различается вовсе, и приписать там
				// «определённое» значило бы сообщить читателю несуществующее.
				switch {
				case indefinite == definite:
				case definite == form:
					feats["Definite"] = "Def"
				default:
					feats["Definite"] = "Ind"
				}
				return feats, true
			}
		}
	}
	return nil, false
}

// adjectiveHits сравнивает построенную форму с разбираемой.
//
// В дательном, творительном и местном падеже множественного числа у
// прилагательного два равноправных окончания: «lepim» и «lepima». Таблица для
// показа даёт одно — второе принимается здесь, чтобы «najlepšima» из книги
// разобралось, а склонение в карточке осталось прежним.
func adjectiveHits(candidate, form, number, caseKey string) bool {
	if candidate == "" {
		return false
	}
	if candidate == form {
		return true
	}
	if number != "Plur" {
		return false
	}
	switch caseKey {
	case "Dat", "Ins", "Loc":
		return candidate+"a" == form
	}
	return false
}

// MatchVerb ищет лицо и число презента или род и число причастия.
func MatchVerb(lemma, form string) (map[string]string, bool) {
	form = strings.ToLower(form)

	if present := presentForms(lemma); len(present) == 6 {
		for i, candidate := range present {
			if candidate == "" || candidate != form {
				continue
			}
			number := "Sing"
			if i >= 3 {
				number = "Plur"
			}
			return map[string]string{
				"Tense": "Pres", "Person": string(rune('1' + i%3)),
				"Number": number, "VerbForm": "Fin", "Mood": "Ind",
			}, true
		}
	}

	if participle := pastParticiple(lemma); len(participle) == 6 {
		genders := []string{"Masc", "Fem", "Neut", "Masc", "Fem", "Neut"}
		for i, candidate := range participle {
			if candidate == "" || candidate != form {
				continue
			}
			number := "Sing"
			if i >= 3 {
				number = "Plur"
			}
			return map[string]string{
				"VerbForm": "Part", "Tense": "Past",
				"Gender": genders[i], "Number": number,
			}, true
		}
	}

	if lemma == form {
		return map[string]string{"VerbForm": "Inf"}, true
	}
	return nil, false
}
