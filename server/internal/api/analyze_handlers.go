package api

import (
	"net/http"
	"sort"
	"strings"

	"github.com/citavuk/server/internal/grammar"
	"github.com/citavuk/server/internal/lexicon"
)

type analyzeRequest struct {
	Word string `json:"word"`
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

	writeJSON(w, http.StatusOK, analyze(lex, word))
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
		best := bestReading(rows)
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
func bestReading(rows []lexicon.Form) lexicon.Form {
	score := func(row lexicon.Form) int {
		s := 3
		switch row.UPOS {
		case "ADP", "CCONJ", "SCONJ", "PART":
			s = 10
		case "NOUN", "VERB", "ADJ", "PROPN", "ADV", "NUM":
			s = 5
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
