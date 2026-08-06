package api

import (
	"net/http"
	"sort"
	"strings"

	"github.com/citavuk/server/internal/english"
	"github.com/citavuk/server/internal/grammar"
	"github.com/citavuk/server/internal/lexicon"
)

type analyzeRequest struct {
	Word string `json:"word"`
	// Sentence — предложение, в котором стоит слово. Нужно для выбора языка:
	// «on», «to», «most» — одновременно сербские и английские слова, и в
	// отрыве от фразы они неразличимы в принципе. Поле необязательное: старый
	// клиент его не шлёт, и разбор остаётся сербским, как раньше.
	Sentence string `json:"sentence"`
	// Границы слова в байтах внутри Sentence — по ним ищется возвратная
	// частица «se». Без них берётся первое вхождение слова во фразу: этого
	// достаточно, чтобы старый клиент тоже получил разбор с частицей.
	Start int `json:"start"`
	End   int `json:"end"`
}

type analyzeResponse struct {
	Surface  string            `json:"surface"`
	Lemma    string            `json:"lemma"`
	UPOS     string            `json:"upos"`
	PosFull  string            `json:"posFull"`
	PosShort string            `json:"posShort"`
	Feats    map[string]string `json:"feats"`
	// Known различает «слова нет в словаре» и «слово есть, но без признаков».
	Known        bool                 `json:"known"`
	Translation  string               `json:"translation,omitempty"`
	Facts        []grammar.Fact       `json:"facts"`
	Summary      string               `json:"summary"`
	Why          string               `json:"why"`
	Paradigms    []grammar.Table      `json:"paradigms"`
	Prepositions []grammar.Government `json:"prepositions,omitempty"`
	// Reflexive заполнен, если при глаголе во фразе стоит частица «se».
	Reflexive *grammar.Reflexive `json:"reflexive,omitempty"`
	// Accent — ударение из словаря. Пусто, если слова в нём нет: достроить
	// ударение правилом нельзя, оно гуляет по парадигме.
	Accent *accentInfo `json:"accent,omitempty"`
	// English заполнен, если слово опознано английским. Тогда сербские поля
	// разбора пустые, а карточка на клиенте показывает английскую ветку.
	English *english.Analysis `json:"english,omitempty"`
}

// accentInfo — ударение словоформы и, если её самой в словаре нет, ударение
// начальной формы.
//
// Разница важна и показывается честно: «knjȉga» — это ударение именно этого
// слова, а для «knjigama» словарь знает только начальную форму, и выдавать её
// ударение за ударение словоформы нельзя — по парадигме оно гуляет.
type accentInfo struct {
	// Written — ударное написание в том же алфавите, что и разбираемое слово.
	Written string `json:"written,omitempty"`
	// IPA — транскрипция с тоном: «/kɲîɡa/».
	IPA string `json:"ipa,omitempty"`
	// OfLemma — ударение относится к начальной форме, а не к слову из текста.
	OfLemma bool `json:"ofLemma,omitempty"`
	// Lemma — та самая начальная форма, ударная.
	Lemma string `json:"lemma,omitempty"`
	// Source — указание источника, обязательное по лицензии CC BY-SA.
	Source string `json:"source"`
}

// accentOf подбирает ударение для слова.
//
// Сначала ищется сама словоформа: только её ударение и можно показать как
// ударение этого слова. Если её нет — берётся начальная форма, но с честной
// пометкой: в сербском ударение переезжает по парадигме («knjȉga», но
// «knjȋgā»), и выдать одно за другое значит научить неправильно.
func accentOf(lex *lexicon.Lexicon, word, lemma string) *accentInfo {
	cyrillic := lexicon.ToLatin(word) != word
	pick := func(accent lexicon.Accent) string {
		if cyrillic && accent.Cyrillic != "" {
			return accent.Cyrillic
		}
		if !cyrillic && accent.Latin != "" {
			return accent.Latin
		}
		return ""
	}

	if accent, ok := lex.Accent(word); ok {
		written := pick(accent)
		if written != "" || accent.IPA != "" {
			return &accentInfo{Written: written, IPA: accent.IPA, Source: lexicon.AccentSource}
		}
	}
	if lemma == "" || lexicon.Normalize(lemma) == lexicon.Normalize(word) {
		return nil
	}
	if accent, ok := lex.Accent(lemma); ok {
		if written := pick(accent); written != "" {
			return &accentInfo{
				OfLemma: true, Lemma: written,
				IPA: accent.IPA, Source: lexicon.AccentSource,
			}
		}
	}
	return nil
}

// handleAnalyze разбирает одну словоформу по встроенному лексикону.
//
// Разбор нужен сайту: приложение делает его офлайн по своей копии словаря, а в
// браузере такой копии нет.
func (s *Server) handleAnalyze(w http.ResponseWriter, r *http.Request) {
	var req analyzeRequest
	if err := decodeJSON(w, r, &req, 8<<10); err != nil {
		writeError(w, http.StatusBadRequest, codeBadRequest, "Не удалось прочитать запрос.")
		return
	}

	word := strings.TrimSpace(req.Word)
	if word == "" {
		writeError(w, http.StatusBadRequest, codeBadRequest, "Не указано слово.")
		return
	}
	if len([]rune(word)) > 64 {
		writeError(w, http.StatusBadRequest, codeTooLarge, "Слишком длинное слово.")
		return
	}

	lex, err := lexicon.Shared()
	if err != nil {
		writeError(w, http.StatusServiceUnavailable, codeInternal, "Словарь недоступен.")
		return
	}

	// Английская ветка идёт первой: сербский разбор для английского слова
	// выдаёт мусор, а лексикон его всё равно не знает. Ошибка загрузки
	// английского словаря не должна ломать сербский разбор — он основной.
	if eng, err := english.Shared(); err == nil && eng != nil {
		known := func(form string) bool {
			for _, row := range lex.LookupForm(form) {
				if row.UPOS != "X" {
					return true
				}
			}
			return false
		}
		if eng.IsEnglish(word, req.Sentence, known) {
			if parsed := eng.Analyze(word); parsed != nil {
				writeJSON(w, http.StatusOK, englishResponse(parsed))
				return
			}
		}
	}

	res := analyze(lex, word)
	res.Reflexive = reflexiveOf(lex, &res, word, req.Sentence, req.Start, req.End)
	// Ударение подбирается ПОСЛЕ разбора: тот мог уточнить начальную форму по
	// списку глагольных форм, и без неё запасной вариант не нашёлся бы.
	res.Accent = accentOf(lex, word, res.Lemma)
	writeJSON(w, http.StatusOK, res)
}

// verbForm сообщает, что словоформа известна как глагольная, и даёт её
// начальную форму.
//
// Свой лексикон разрежен — целых глаголов вроде «bližiti» в нём нет вовсе, —
// поэтому рядом лежит список глагольных форм из Викисловаря. Без него частица
// «se» не находила своего глагола в первом же попавшемся предложении.
func verbLemma(lex *lexicon.Lexicon, word string) (string, bool) {
	for _, row := range lex.LookupForm(word) {
		if row.UPOS == "VERB" || row.UPOS == "AUX" {
			return row.Lemma, true
		}
	}
	if lemma, upos, _, ok := resolveByRule(lex, lexicon.Normalize(word)); ok &&
		(upos == "VERB" || upos == "AUX") {
		return lemma, true
	}
	return lex.VerbLemma(word)
}

// reflexiveOf связывает нажатое слово с его парой: глагол с частицей «se» или
// частицу с её глаголом.
//
// К существительному частица не привязывается: в «kuća se prodaje» она
// относится к глаголу, и подписать дом возвратным было бы прямой ошибкой
// разбора. Само «se» — исключение: нажали именно на него, и ответ обязан
// объяснить, при каком оно глаголе.
func reflexiveOf(
	lex *lexicon.Lexicon,
	res *analyzeResponse,
	word, sentence string,
	start, end int,
) *grammar.Reflexive {
	if sentence == "" || res.English != nil {
		return nil
	}
	isVerb := func(candidate string) bool {
		_, ok := verbLemma(lex, candidate)
		return ok
	}
	onParticle := lexicon.Normalize(word) == "se"
	if !onParticle && !isVerb(word) {
		return nil
	}
	if start >= end || start < 0 || end > len(sentence) || sentence[start:end] != word {
		// Смещений нет или они не сходятся с текстом — ищем слово сами.
		found := strings.Index(sentence, word)
		if found < 0 {
			return nil
		}
		start, end = found, found+len(word)
	}

	lemma := res.Lemma
	if onParticle {
		lemma = ""
	} else if known, ok := verbLemma(lex, word); ok && !res.Known {
		// Лексикон слова не знает, а список глагольных форм знает — начальная
		// форма берётся оттуда, иначе в карточке стояло бы само слово.
		lemma = known
		res.Lemma = known
		res.UPOS = "VERB"
		res.Known = true
		res.PosFull = grammar.PosFull("VERB")
		res.PosShort = grammar.PosShort("VERB")
	}

	out := grammar.AttachSe(sentence, start, end, word, lemma, isVerb)
	// Нажали частицу: разбор относится к глаголу, а не к ней. «se» в отрыве от
	// глагола — это местоимение «sebe», и такой ответ читателю бесполезен.
	if out != nil && out.OnParticle {
		if verb, ok := verbLemma(lex, out.Verb); ok {
			out.Lemma = verb + " se"
			out.Meaning = grammar.SeMeaning(verb)
		}
	}
	return out
}

// englishResponse укладывает английский разбор в общий контракт ответа.
func englishResponse(parsed *english.Analysis) analyzeResponse {
	return analyzeResponse{
		Surface:   parsed.Surface,
		Lemma:     parsed.Lemma,
		UPOS:      parsed.UPOS,
		PosFull:   parsed.PosFull,
		PosShort:  parsed.PosShort,
		Feats:     map[string]string{},
		Known:     true,
		Facts:     []grammar.Fact{},
		Summary:   parsed.PosFull,
		Why:       parsed.Why,
		Paradigms: []grammar.Table{},
		English:   parsed,
	}
}

// handleGrammarCases отдаёт справочник падежей для шпаргалки на сайте.
func (s *Server) handleGrammarCases(w http.ResponseWriter, r *http.Request) {
	writeJSON(w, http.StatusOK, map[string]any{"cases": grammar.Cases()})
}

func analyze(lex *lexicon.Lexicon, word string) analyzeResponse {
	normalized := lexicon.Normalize(word)
	res := analyzeResponse{
		Surface:   word,
		Lemma:     normalized,
		UPOS:      "UNKNOWN",
		Feats:     map[string]string{},
		Facts:     []grammar.Fact{},
		Paradigms: []grammar.Table{},
	}

	rows := lex.LookupForm(normalized)
	switch {
	case len(rows) > 0:
		best := bestReading(rows, word)
		res.Known = true
		res.Lemma = best.Lemma
		res.UPOS = best.UPOS
		res.Feats = grammar.ParseFeats(best.Feats)

	default:
		if paradigm := lex.Paradigm(normalized); len(paradigm) > 0 {
			// Слово известно словарю только как начальная форма.
			res.Known = true
			res.UPOS = dominantPos(paradigm)
			break
		}
		if lemma, upos, feats, ok := resolveByRule(lex, normalized); ok {
			res.Known = true
			res.Lemma = lemma
			res.UPOS = upos
			res.Feats = feats
		}
	}

	info := grammar.Describe(res.UPOS, res.Feats)
	res.PosFull = info.PosLabel
	res.PosShort = grammar.PosShort(res.UPOS)
	res.Facts = info.Facts
	res.Summary = info.Summary
	res.Why = info.Why

	res.Paradigms = grammar.BuildParadigms(
		res.UPOS, res.Lemma, res.Feats, paradigmEntries(lex, res.Lemma), normalized)
	if res.Paradigms == nil {
		res.Paradigms = []grammar.Table{}
	}

	res.Translation = lex.Translate(res.Lemma)
	if res.Translation == "" {
		res.Translation = lex.Translate(normalized)
	}
	res.Prepositions = grammar.PrepositionGovernment(normalized)

	return res
}

// resolveByRule опознаёт форму, которой нет в словаре, достраивая парадигмы
// известных лемм. Совпадение проверяется, а не угадывается по окончанию.
func resolveByRule(lex *lexicon.Lexicon, form string) (string, string, map[string]string, bool) {
	for _, candidate := range grammar.LemmaCandidates(form) {
		rows := lex.Paradigm(candidate)
		if len(rows) == 0 {
			continue
		}
		upos := dominantPos(rows)
		entries := paradigmEntries(lex, candidate)

		switch upos {
		case "NOUN", "PROPN":
			gender := ""
			for _, row := range rows {
				if g := grammar.ParseFeats(row.Feats)["Gender"]; g != "" {
					gender = g
					break
				}
			}
			if gender == "" {
				gender = grammar.GuessGender(candidate, entries)
			}
			if feats, ok := grammar.MatchNoun(candidate, gender, form); ok {
				return candidate, upos, feats, true
			}
		case "VERB", "AUX":
			if feats, ok := grammar.MatchVerb(candidate, form); ok {
				return candidate, upos, feats, true
			}
		}
	}
	return "", "", nil, false
}

func paradigmEntries(lex *lexicon.Lexicon, lemma string) []grammar.Entry {
	rows := lex.Paradigm(lemma)
	entries := make([]grammar.Entry, 0, len(rows))
	for _, row := range rows {
		entries = append(entries, grammar.Entry{
			Form:  row.Form,
			Feats: grammar.ParseFeats(row.Feats),
		})
	}
	return entries
}

// bestReading выбирает наиболее вероятный разбор омонима.
//
// Служебные слова важнее знаменательных: «da» — это союз, а не форма глагола
// «dati», и спрягать его не нужно. Контекстного снятия омонимии здесь нет.
//
// Имя собственное со строчной буквы не бывает, и написание слова — это всё, что
// нужно, чтобы отсечь такой разбор. Без проверки «se» разбиралось как имя (в
// словаре есть и такая строка), и самая частая частица сербского языка
// описывалась карточкой «имя собственное, именительный падеж».
func bestReading(rows []lexicon.Form, surface string) lexicon.Form {
	lower := surface != "" && surface == strings.ToLower(surface)
	score := func(row lexicon.Form) int {
		s := 3
		switch row.UPOS {
		case "ADP", "CCONJ", "SCONJ", "PART":
			s = 10
		case "PRON", "DET":
			s = 6
		case "NOUN", "VERB", "ADJ", "PROPN", "ADV", "NUM":
			s = 5
		}
		if row.UPOS == "PROPN" && lower {
			s = 1
		}
		if row.Feats != "" {
			s++
		}
		return s
	}
	sorted := make([]lexicon.Form, len(rows))
	copy(sorted, rows)
	sort.SliceStable(sorted, func(i, j int) bool {
		return score(sorted[i]) > score(sorted[j])
	})
	return sorted[0]
}

// dominantPos определяет часть речи по большинству строк парадигмы.
func dominantPos(rows []lexicon.Form) string {
	counts := make(map[string]int, 4)
	for _, row := range rows {
		if row.UPOS != "" && row.UPOS != "UNKNOWN" {
			counts[row.UPOS]++
		}
	}
	best, bestCount := "UNKNOWN", 0
	for pos, count := range counts {
		if count > bestCount || (count == bestCount && pos < best) {
			best, bestCount = pos, count
		}
	}
	return best
}
