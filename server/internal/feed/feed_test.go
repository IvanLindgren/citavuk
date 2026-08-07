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

// --- Картинка карточки ------------------------------------------------------
//
// Поле картинки существовало с самого начала, но заполнять его было нечем, и
// лента оставалась стеной текста. Проверяем оба конца: что адрес достаётся из
// всех форм, какими его называют ленты, и что чужой адрес не проходит.

const longDescription = `<p>Ово је довољно дугачак опис вести који садржи више од сто двадесет знакова. Он служи само као улаз за нови сажетак и не објављује се директно у ленти корисника.</p>`

func rssWith(extra, description string) string {
	return `<rss><channel><item><title>Наслов</title>` +
		`<link>https://www.rts.rs/vesti/test.html</link><guid>x</guid>` +
		extra +
		`<description><![CDATA[` + description + `]]></description>` +
		`</item></channel></rss>`
}

func TestParseRSSFindsImageInEveryForm(t *testing.T) {
	const want = "https://img.rts.rs/slika.jpg"
	cases := map[string]string{
		"enclosure":       `<enclosure url="` + want + `" type="image/jpeg"/>`,
		"media:thumbnail": `<media:thumbnail url="` + want + `"/>`,
		"media:content":   `<media:content url="` + want + `" medium="image"/>`,
	}
	for name, extra := range cases {
		items, err := parseRSS([]byte(rssWith(extra, longDescription)))
		if err != nil || len(items) != 1 {
			t.Fatalf("%s: items=%d err=%v", name, len(items), err)
		}
		if items[0].ImageURL != want {
			t.Errorf("%s: картинка = %q", name, items[0].ImageURL)
		}
	}
}

// Многие ленты картинку отдельным полем не дают вовсе и просто вставляют её
// в описание. Не разобрать этот случай значило бы остаться без картинок у
// доброй половины источников.
func TestParseRSSTakesImageFromDescription(t *testing.T) {
	body := `<img src="https://img.rts.rs/u-tekstu.jpg"/>` + longDescription
	items, err := parseRSS([]byte(rssWith("", body)))
	if err != nil || len(items) != 1 {
		t.Fatalf("items=%d err=%v", len(items), err)
	}
	if items[0].ImageURL != "https://img.rts.rs/u-tekstu.jpg" {
		t.Errorf("картинка = %q", items[0].ImageURL)
	}
}

// Adpec приходит из чужого XML — это данные, которым нельзя верить. Сервер
// потом сам пойдёт по этому адресу, и без проверки его можно было бы отправить
// куда угодно, хоть во внутреннюю сеть.
func TestParseRSSRejectsForeignImageHost(t *testing.T) {
	for _, bad := range []string{
		`<enclosure url="https://evil.example/pixel.jpg" type="image/jpeg"/>`,
		`<enclosure url="http://img.rts.rs/bez-tls.jpg" type="image/jpeg"/>`,
		`<enclosure url="https://169.254.169.254/latest/meta-data" type="image/jpeg"/>`,
	} {
		items, err := parseRSS([]byte(rssWith(bad, longDescription)))
		if err != nil || len(items) != 1 {
			t.Fatalf("items=%d err=%v", len(items), err)
		}
		if items[0].ImageURL != "" {
			t.Errorf("чужой адрес принят: %q", items[0].ImageURL)
		}
	}
}

// enclosure в RSS сплошь и рядом оказывается звуком или видео. Поставить в
// карточку mp3 вместо картинки хуже, чем не ставить ничего.
func TestParseRSSIgnoresNonImageEnclosure(t *testing.T) {
	extra := `<enclosure url="https://img.rts.rs/epizoda.mp3" type="audio/mpeg"/>`
	items, err := parseRSS([]byte(rssWith(extra, longDescription)))
	if err != nil || len(items) != 1 {
		t.Fatalf("items=%d err=%v", len(items), err)
	}
	if items[0].ImageURL != "" {
		t.Errorf("звук принят за картинку: %q", items[0].ImageURL)
	}
}

func TestParseMediaWikiTakesPageThumbnail(t *testing.T) {
	raw := `{"query":{"pages":[{"pageid":7,"title":"Београд",` +
		`"fullurl":"https://sr.wikipedia.org/wiki/%D0%91%D0%B5%D0%BE%D0%B3%D1%80%D0%B0%D0%B4",` +
		`"thumbnail":{"source":"https://upload.wikimedia.org/beograd.jpg"},` +
		`"extract":"` + strings.Repeat("Београд је главни град Србије. ", 20) + `"}]}}`
	items, err := parseMediaWiki([]byte(raw))
	if err != nil || len(items) != 1 {
		t.Fatalf("items=%d err=%v", len(items), err)
	}
	if items[0].ImageURL != "https://upload.wikimedia.org/beograd.jpg" {
		t.Errorf("картинка = %q", items[0].ImageURL)
	}
}

func TestAllowedImageURL(t *testing.T) {
	good := []string{
		"https://upload.wikimedia.org/a.png",
		"https://img.rts.rs/b.jpg",
		"https://www.gradnja.rs/wp-content/uploads/example.jpg",
	}
	bad := []string{
		"", "not a url", "http://img.rts.rs/a.jpg",
		"https://img.rts.rs.evil.example/a.jpg",
		"https://localhost/a.jpg", "file:///etc/passwd",
	}
	for _, value := range good {
		if !AllowedImageURL(value) {
			t.Errorf("отвергнут допустимый адрес %q", value)
		}
	}
	for _, value := range bad {
		if AllowedImageURL(value) {
			t.Errorf("принят недопустимый адрес %q", value)
		}
	}
}

func TestRSSPageURLPreservesExistingQuery(t *testing.T) {
	got := rssPageURL("https://putuj.rs/feed/?category=putovanja", 3)
	if got != "https://putuj.rs/feed/?category=putovanja&paged=3" {
		t.Fatalf("page URL = %q", got)
	}
	if got := rssPageURL("https://putuj.rs/feed/", 1); got != "https://putuj.rs/feed/" {
		t.Fatalf("first page URL changed to %q", got)
	}
}
