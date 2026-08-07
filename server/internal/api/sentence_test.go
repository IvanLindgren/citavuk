package api

import (
	"strings"
	"testing"

	"github.com/citavuk/server/internal/grammar"
	"github.com/citavuk/server/internal/lexicon"
)

// analyzeSentence прогоняет фразу через тот же путь, что и обработчик.
func analyzeSentence(t *testing.T, sentence string) grammar.SentenceAnalysis {
	t.Helper()
	lex := testLexicon(t)
	spans := grammar.Tokenize(sentence)
	tokens := make([]grammar.Token, 0, len(spans))
	for i, span := range spans {
		tokens = append(tokens, tokenOf(lex, i, span))
	}
	return grammar.Analyze(sentence, tokens)
}

func chunkAt(analysis grammar.SentenceAnalysis, kind, text string) *grammar.Chunk {
	for i := range analysis.Chunks {
		if analysis.Chunks[i].Kind == kind &&
			strings.EqualFold(analysis.Chunks[i].Text, text) {
			return &analysis.Chunks[i]
		}
	}
	return nil
}

// Ради этого всё и затевалось: «u» с местным падежом — это где, с винительным —
// куда. По самому слову «kući»/«grad» различить нельзя, по предлогу рядом —
// можно.
func TestSentencePicksCaseByPreposition(t *testing.T) {
	where := analyzeSentence(t, "Živim u kući.")
	group := chunkAt(where, "prep", "u kući")
	if group == nil {
		t.Fatalf("предложная группа не найдена: %+v", where.Chunks)
	}
	if group.Case != "Loc" {
		t.Errorf("«u kući» получила падеж %q, ожидался Loc", group.Case)
	}

	whereTo := analyzeSentence(t, "Idem u grad.")
	group = chunkAt(whereTo, "prep", "u grad")
	if group == nil {
		t.Fatalf("предложная группа не найдена: %+v", whereTo.Chunks)
	}
	if group.Case != "Acc" {
		t.Errorf("«u grad» получила падеж %q, ожидался Acc", group.Case)
	}
	if group.Note == "" {
		t.Error("не сказано, что значит предлог с этим падежом")
	}
}

// Определение согласуется с существительным, и падеж, уточнённый предлогом,
// обязан дойти и до него. Иначе в «u velikoj kući» дом стоит в местном падеже,
// а «большой» — в дательном: формы совпадают, и по слову они неразличимы.
func TestSentenceSpreadsCaseToModifier(t *testing.T) {
	analysis := analyzeSentence(t, "Živim u velikoj kući.")
	group := chunkAt(analysis, "prep", "u velikoj kući")
	if group == nil {
		t.Fatalf("группа не собралась: %+v", group)
	}
	for _, index := range group.Tokens {
		token := analysis.Tokens[index]
		if token.UPOS == "ADP" {
			continue
		}
		if got := token.Feats["Case"]; got != "Loc" {
			t.Errorf("слово %q в падеже %q, ожидался Loc", token.Surface, got)
		}
	}
}

// Перфект собирается из двух слов, и по отдельности они описываются неверно:
// «sam» само по себе — «я есть», а не признак прошедшего времени.
func TestSentenceJoinsAuxiliaryWithParticiple(t *testing.T) {
	analysis := analyzeSentence(t, "Juče sam čitao knjigu.")
	var verb *grammar.Chunk
	for i := range analysis.Chunks {
		if analysis.Chunks[i].Kind == "verb" {
			verb = &analysis.Chunks[i]
			break
		}
	}
	if verb == nil {
		t.Fatalf("глагольная группа не найдена: %+v", analysis.Chunks)
	}
	if len(verb.Tokens) < 2 {
		t.Fatalf("«sam čitao» разобрано по одному слову: %+v", verb)
	}
	if !strings.Contains(verb.Label, "прошедшее") {
		t.Errorf("время не названо: %q", verb.Label)
	}
}

// Частица «se» относится к глаголу и меняет его значение — об этом и надо
// сказать, а не разбирать её отдельным словом.
func TestSentenceAttachesReflexiveParticle(t *testing.T) {
	analysis := analyzeSentence(t, "On se vraća kući.")
	for _, chunk := range analysis.Chunks {
		if chunk.Kind == "verb" && strings.Contains(chunk.Note, "возвратный") {
			return
		}
	}
	t.Errorf("частица «se» не привязана к глаголу: %+v", analysis.Chunks)
}

// Отрицание — часть глагольной формы, а не отдельное слово рядом.
func TestSentenceAttachesNegation(t *testing.T) {
	analysis := analyzeSentence(t, "Ne razumem pitanje.")
	for _, chunk := range analysis.Chunks {
		if chunk.Kind == "verb" && strings.Contains(chunk.Note, "отрицание") {
			return
		}
	}
	t.Errorf("«ne» не привязано к глаголу: %+v", analysis.Chunks)
}

// Границы слов нужны клиенту, чтобы подсветить разбираемое место в тексте, не
// пересчитывая его самому. Смещения в байтах, и на кириллице это не то же
// самое, что смещения в символах.
func TestSentenceKeepsWordOffsets(t *testing.T) {
	sentence := "Живим у великој кући."
	analysis := analyzeSentence(t, sentence)
	if len(analysis.Tokens) != 4 {
		t.Fatalf("слов разобрано %d, ожидалось 4", len(analysis.Tokens))
	}
	for _, token := range analysis.Tokens {
		if sentence[token.Start:token.End] != token.Surface {
			t.Errorf("смещения слова %q не сходятся с текстом", token.Surface)
		}
	}
}

// Пустая фраза и фраза без единого разбора не должны ронять разбор: словарь
// разрежен, и незнакомое слово — обычное дело.
func TestSentenceSurvivesUnknownWords(t *testing.T) {
	analysis := analyzeSentence(t, "Bzzz qwerty zzz.")
	if len(analysis.Tokens) != 3 {
		t.Errorf("слов разобрано %d", len(analysis.Tokens))
	}
}

func TestAnalyzeEmptySentence(t *testing.T) {
	if got := grammar.Analyze("", nil); len(got.Chunks) != 0 {
		t.Errorf("на пустой фразе собраны группы: %+v", got.Chunks)
	}
}

// Форма бывает подходящей сразу под два падежа, которых требует предлог:
// «ljubavi» — и местный единственного, и винительный множественного. Брать надо
// то, ради чего предлог обычно и стоит, иначе «o ljubavi» становится «ударом
// обо что-то».
func TestSentencePrefersPrimaryMeaningOfPreposition(t *testing.T) {
	analysis := analyzeSentence(t, "Pišem o ljubavi.")
	group := chunkAt(analysis, "prep", "o ljubavi")
	if group == nil {
		t.Fatalf("группа не собралась: %+v", analysis.Chunks)
	}
	if group.Case != "Loc" {
		t.Errorf("«o ljubavi» получила падеж %q, ожидался Loc", group.Case)
	}
}

// Вспомогательный глагол с причастием — это четыре разные формы, а не одна:
// «sam» даёт перфект, «bih» условное, «budeš» футур второй. Без разбора по
// самому вспомогательному «Ne bih rekao» подписывалось прошедшим временем.
func TestSentenceNamesCompoundFormByAuxiliary(t *testing.T) {
	for _, item := range []struct{ sentence, want string }{
		{"Juče sam čitao knjigu.", "прошедшее"},
		{"Ne bih rekao ništa.", "условное"},
		{"Ako budeš imao vremena, javi se.", "футур II"},
	} {
		analysis := analyzeSentence(t, item.sentence)
		found := false
		for _, chunk := range analysis.Chunks {
			if chunk.Kind == "verb" && strings.Contains(chunk.Label, item.want) {
				found = true
				break
			}
		}
		if !found {
			t.Errorf("в %q не найдено «%s»: %+v", item.sentence, item.want, analysis.Chunks)
		}
	}
}

// Расширенный словарь добирает то, чего не было в трибанке. Без него «pišem» и
// «olovkom» приходили вовсе без разбора, и разбирать во фразе было нечего.
func TestSentenceKnowsCommonWordsBeyondTreebank(t *testing.T) {
	analysis := analyzeSentence(t, "Pišem olovkom.")
	for _, token := range analysis.Tokens {
		if !token.Known {
			t.Errorf("слово %q не опознано", token.Surface)
		}
	}
}

var _ = lexicon.AccentSource
