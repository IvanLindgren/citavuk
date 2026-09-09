package grammar

import (
	"strings"
	"testing"
)

func sentenceFixture(text string, values []Token) []Token {
	for i, span := range Tokenize(text) {
		values[i].Index, values[i].Start, values[i].End = i, span.Start, span.End
		values[i].Surface = span.Text
	}
	return values
}

func TestCliticsDoNotSeparatePerfect(t *testing.T) {
	for _, text := range []string{"Ja sam mu rekao", "Ja sam, mu rekao"} {
		tokens := sentenceFixture(text, []Token{
			{Lemma: "ja", UPOS: "PRON"},
			{Lemma: "biti", UPOS: "AUX", Feats: map[string]string{"Tense": "Pres", "VerbForm": "Fin"}},
			{Lemma: "on", UPOS: "PRON", Feats: map[string]string{"Case": "Dat"}},
			{Lemma: "reći", UPOS: "VERB", Feats: map[string]string{"VerbForm": "Part", "Voice": "Act"}},
		})
		found := false
		for _, chunk := range Analyze(text, tokens).Chunks {
			if strings.Contains(chunk.Label, "перфекат") && len(chunk.Tokens) >= 2 {
				found = true
			}
		}
		if found != !strings.Contains(text, ",") {
			t.Fatalf("неверные границы группы: %q", text)
		}
	}
}

func TestPassiveInBothWordOrders(t *testing.T) {
	for _, reverse := range []bool{false, true} {
		part := Token{Lemma: "izgraditi", UPOS: "ADJ", Feats: map[string]string{"VerbForm": "Part", "Voice": "Pass"}}
		aux := Token{Lemma: "biti", UPOS: "AUX", Feats: map[string]string{"Tense": "Pres", "VerbForm": "Fin"}}
		text, tokens := "Izgrađen je", []Token{part, aux}
		if reverse {
			text, tokens = "Je izgrađen", []Token{aux, part}
		}
		chunks := Analyze(text, sentenceFixture(text, tokens)).Chunks
		if len(chunks) != 1 || !strings.Contains(chunks[0].Label, "пассив") {
			t.Fatalf("неверный разбор пассива: %+v", chunks)
		}
	}
}

func TestNegationDoesNotCrossSentence(t *testing.T) {
	text := "Rekao. Ne znam"
	tokens := sentenceFixture(text, []Token{
		{Lemma: "reći", UPOS: "VERB", Feats: map[string]string{"VerbForm": "Part"}},
		{Lemma: "ne", UPOS: "PART"},
		{Lemma: "znati", UPOS: "VERB", Feats: map[string]string{"VerbForm": "Fin"}},
	})
	chunks := Analyze(text, tokens).Chunks
	if len(chunks) != 2 || len(chunks[0].Tokens) != 1 || !strings.Contains(chunks[1].Note, "отрицание") {
		t.Fatalf("отрицание перешло границу предложения: %+v", chunks)
	}
}
