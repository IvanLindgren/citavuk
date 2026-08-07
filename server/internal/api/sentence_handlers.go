package api

import (
	"net/http"
	"strings"

	"github.com/citavuk/server/internal/grammar"
	"github.com/citavuk/server/internal/lexicon"
)

// Разбор целой фразы.
//
// Разбор по слову отвечает «что это за форма», но сербская форма сама по себе
// почти всегда неоднозначна: «kući» — и дательный, и местный. Что перед нами,
// решает соседство, и увидеть это соседство учащемуся негде: слова он посмотреть
// может, а из чего собрана фраза — нет.

type sentenceRequest struct {
	Sentence string `json:"sentence"`
}

// maxSentenceWords — сколько слов разбирается за раз.
//
// Это фраза, а не страница: разбор каждого слова идёт по словарю, и абзац в
// триста слов превратил бы полезную подсказку в секундную паузу.
const maxSentenceWords = 40

func (s *Server) handleAnalyzeSentence(w http.ResponseWriter, r *http.Request) {
	var request sentenceRequest
	if err := decodeJSON(w, r, &request, 8<<10); err != nil {
		writeError(w, http.StatusBadRequest, codeBadRequest, "Не удалось прочитать запрос.")
		return
	}
	sentence := strings.TrimSpace(request.Sentence)
	if sentence == "" {
		writeError(w, http.StatusBadRequest, codeBadRequest, "Не указана фраза.")
		return
	}
	lex, err := lexicon.Shared()
	if err != nil {
		writeError(w, http.StatusServiceUnavailable, codeInternal, "Словарь недоступен.")
		return
	}

	spans := grammar.Tokenize(sentence)
	if len(spans) > maxSentenceWords {
		writeError(w, http.StatusUnprocessableEntity, codeTooLarge,
			"Слишком длинная фраза для разбора.")
		return
	}

	tokens := make([]grammar.Token, 0, len(spans))
	for i, span := range spans {
		tokens = append(tokens, tokenOf(lex, i, span))
	}
	writeJSON(w, http.StatusOK, grammar.Analyze(sentence, tokens))
}

// tokenOf разбирает одно слово и приносит ВСЕ его разборы, а не только лучший.
//
// Именно в этом смысл разбора фразы: выбрать между «дательный» и «местный» по
// самому слову нельзя в принципе, а по предлогу рядом — можно. Отбрось мы
// лишние разборы здесь, выбирать было бы уже не из чего.
func tokenOf(lex *lexicon.Lexicon, index int, span grammar.Span) grammar.Token {
	analyzed := analyze(lex, span.Text)
	token := grammar.Token{
		Index:       index,
		Surface:     span.Text,
		Start:       span.Start,
		End:         span.End,
		Lemma:       analyzed.Lemma,
		UPOS:        analyzed.UPOS,
		PosShort:    analyzed.PosShort,
		Feats:       analyzed.Feats,
		Known:       analyzed.Known,
		Translation: analyzed.Translation,
	}
	for _, row := range lex.LookupForm(span.Text) {
		if row.UPOS == "X" {
			continue
		}
		token.Readings = append(token.Readings, grammar.Reading{
			Lemma: row.Lemma,
			UPOS:  row.UPOS,
			Feats: grammar.ParseFeats(row.Feats),
		})
	}
	if len(token.Readings) == 0 {
		// Словаря словоформ не хватило — достраиваем парадигмой. Без этого шага
		// «парку» приходило вовсе без разборов: сама форма словарю неизвестна,
		// а «park» известен. Тогда предлог рядом выбирать не из чего, и падеж
		// оставался тем, который угадал разбор слова.
		token.Readings = ruleReadings(lex, span.Text)
	}
	return token
}

// ruleReadings достраивает разборы формы по парадигмам известных лемм.
//
// Возвращает ВСЕ подходящие, а не лучший: в этом и смысл. «kući» — дательный и
// местный сразу, и выбрать между ними может только предлог рядом.
func ruleReadings(lex *lexicon.Lexicon, word string) []grammar.Reading {
	form := lexicon.Normalize(word)
	for _, candidate := range grammar.LemmaCandidates(form) {
		rows := lex.Paradigm(candidate)
		if len(rows) == 0 {
			continue
		}
		upos := dominantPos(rows)
		if upos != "NOUN" && upos != "PROPN" {
			continue
		}
		gender := ""
		for _, row := range rows {
			if g := grammar.ParseFeats(row.Feats)["Gender"]; g != "" {
				gender = g
				break
			}
		}
		if gender == "" {
			gender = grammar.GuessGender(candidate, paradigmEntries(lex, candidate))
		}
		matches := grammar.MatchNounAll(candidate, gender, form)
		if len(matches) == 0 {
			continue
		}
		out := make([]grammar.Reading, 0, len(matches))
		for _, feats := range matches {
			out = append(out, grammar.Reading{Lemma: candidate, UPOS: upos, Feats: feats})
		}
		return out
	}
	return nil
}
