package feed

import (
	"fmt"
	"strings"
	"testing"
)

func TestParseRSSKeepsAttributionTargetAndCleansHTML(t *testing.T) {
	raw := `<rss><channel><item><title>Наслов</title><link>https://www.rts.rs/vesti/test.html</link><guid>x</guid><description><![CDATA[<p>Ово је довољно дугачак опис вести који садржи више од сто двадесет знакова. Он служи само као улаз за нови сажетак и не објављује се директно у ленти корисника.</p><script>bad()</script>]]></description><pubDate>Mon, 27 Jul 2026 15:43:25 +0200</pubDate></item></channel></rss>`
	items, err := parseRSS([]byte(raw))
	if err != nil {
		t.Fatal(err)
	}
	if len(items) != 1 {
		t.Fatalf("items=%d", len(items))
	}
	if strings.Contains(items[0].RawText, "bad") || items[0].SourceURL == "" {
		t.Fatalf("bad parsed item: %#v", items[0])
	}
}

func TestParseGenerationRejectsShortCard(t *testing.T) {
	_, err := parseGeneration(`{"kind":"fact","category":"culture","title_cyrillic":"Тест","title_latin":"Test","text_cyrillic":"Кратко.","text_latin":"Kratko.","original_script":"latin","cefr":"A2","tags":["a","b","c"],"difficult_words":[{"word":"a","translation_ru":"а"},{"word":"b","translation_ru":"б"},{"word":"c","translation_ru":"в"}]}`)
	if err == nil {
		t.Fatal("short card must be rejected")
	}
}

func TestParseGenerationAcceptsPromptTranslationField(t *testing.T) {
	latin := strings.TrimSpace(strings.Repeat("rec ", 80))
	cyrillic := strings.TrimSpace(strings.Repeat("реч ", 80))
	raw := fmt.Sprintf(`{"kind":"fact","category":"culture","title_cyrillic":"Тест","title_latin":"Test","text_cyrillic":%q,"text_latin":%q,"original_script":"translated","cefr":"A2","tags":["a","b","c"],"difficult_words":[{"word":"реч","lemma":"реч","transcription":"/retʃ/","translation_ru":"слово"},{"word":"тест","lemma":"тест","transcription":"/test/","translation_ru":"тест"},{"word":"пример","lemma":"пример","transcription":"/primer/","translationRu":"пример"}]}`, cyrillic, latin)

	result, err := parseGeneration(raw)
	if err != nil {
		t.Fatal(err)
	}
	words := storeDifficultWords(result.DifficultWords)
	if words[0].TranslationRU != "слово" || words[2].TranslationRU != "пример" {
		t.Fatalf("translations were not decoded: %#v", words)
	}
}
