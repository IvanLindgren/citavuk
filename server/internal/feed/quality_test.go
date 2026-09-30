package feed

import (
	"encoding/json"
	"strings"
	"testing"

	"github.com/citavuk/server/internal/store"
)

func goodEditorial() (string, []store.DifficultWord) {
	return strings.TrimSpace(strings.Repeat("Српска реч описује пример и свет. ", 14)), []store.DifficultWord{
		{Word: "реч", Lemma: "реч", Transcription: "/retʃ/", TranslationRU: "слово"},
		{Word: "пример", Lemma: "пример", Transcription: "/primer/", TranslationRU: "пример"},
		{Word: "свет", Lemma: "свет", Transcription: "/svet/", TranslationRU: "мир"},
	}
}

func TestEditorialRejectsDamagedWordsButNotRealTerms(t *testing.T) {
	for _, text := range []string{"Северна полулотежа.", "Poluloteža", "небесни tesalas", "ћелутке", "Српskа", "нашего", "සිවි", "ministەر", "кремa", "Тюбинген"} {
		if checkEditorialText(text) == nil {
			t.Errorf("повреждение принято: %s", text)
		}
	}
	for _, text := range []string{"Панчићева оморика", "NASA", "European Journal of Cell Biology", "β-D-глукоза", "неке ретке речи"} {
		if err := checkEditorialText(text); err != nil {
			t.Errorf("правильный материал отвергнут: %s: %v", text, err)
		}
	}
}

func TestCanonicalEditorialDerivesLatinAndKeepsBrands(t *testing.T) {
	body, words := goodEditorial()
	body += " NASA користи Windows. Он је надживео савременике."
	title, latin, err := CanonicalEditorial("Свет", body, words)
	if err != nil {
		t.Fatal(err)
	}
	if title != "Svet" || !strings.Contains(latin, "NASA koristi Windows") || !strings.Contains(latin, "nadživeo") {
		t.Fatalf("bad canonical transliteration: %s / %s", title, latin)
	}
}

func TestCanonicalEditorialRequiresRealVocabularyOccurrenceAndRussian(t *testing.T) {
	body, words := goodEditorial()
	words[0].Word = "полулотежа"
	if _, _, err := CanonicalEditorial("Свет", body, words); err == nil {
		t.Fatal("invented vocabulary accepted")
	}
	_, words = goodEditorial()
	words[0].Word = "кућа"
	if _, _, err := CanonicalEditorial("Свет", body, words); err == nil {
		t.Fatal("absent vocabulary accepted")
	}
	_, words = goodEditorial()
	words[0].TranslationRU = "word"
	if _, _, err := CanonicalEditorial("Свет", body, words); err == nil {
		t.Fatal("English translation accepted")
	}
}

func TestParseGenerationIgnoresIndependentlyInventedLatin(t *testing.T) {
	body, words := goodEditorial()
	input := map[string]any{"kind": "fact", "category": "culture", "cefr": "B1", "original_script": "translated", "tags": []string{"језик", "свет", "култура"}, "title_cyrillic": "Свет", "text_cyrillic": body, "title_latin": "Fake title", "text_latin": "Unrelated text poluloteža", "difficult_words": words}
	raw, _ := json.Marshal(input)
	result, err := parseGeneration(string(raw))
	if err != nil {
		t.Fatal(err)
	}
	if result.TitleLatin != "Svet" || strings.Contains(result.TextLatin, "poluloteža") {
		t.Fatal("second generation survived")
	}
}
