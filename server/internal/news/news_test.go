package news

import (
	"strings"
	"testing"
	"time"
)

const sampleRSS = `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0" xmlns:content="http://purl.org/rss/1.0/modules/content/" xmlns:media="http://search.yahoo.com/mrss/">
<channel><title>Danas</title>
<item>
  <title>&#8222;Hrana ne može da čeka&#8220;: nova vlada</title>
  <link>https://www.danas.rs/vesti/hrana/</link>
  <pubDate>Sat, 07 Nov 2026 10:00:00 +0100</pubDate>
  <description><![CDATA[<p>Narodni pokret traži hitne mere. Cene hrane rastu treći mesec zaredom.</p> The post Hrana appeared first on Danas.]]></description>
  <content:encoded><![CDATA[<p>Tekst</p><iframe src="https://www.youtube.com/embed/N-ZNBnLqloQ?feature=oembed"></iframe>]]></content:encoded>
  <enclosure url="https://www.danas.rs/wp-content/uploads/2026/11/hrana.jpg" type="image/jpeg" length="1"/>
</item>
<item>
  <title>Stranac</title>
  <link>https://evil.example/vest</link>
  <description>Ne sme u novine.</description>
</item>
<item>
  <title>Bez slike</title>
  <link>https://www.danas.rs/vesti/bez-slike/</link>
  <description><![CDATA[<img src="http://169.254.169.254/latest.jpg"> Kratak tekst.]]></description>
</item>
</channel></rss>`

func TestParseFeed(t *testing.T) {
	stories, err := parseFeed([]byte(sampleRSS), "Danas")
	if err != nil {
		t.Fatal(err)
	}
	if len(stories) != 2 {
		t.Fatalf("заметок %d, ждём 2 (чужой хост отброшен)", len(stories))
	}
	first := stories[0]
	if first.Title != "„Hrana ne može da čeka“: nova vlada" {
		t.Errorf("title = %q", first.Title)
	}
	if strings.Contains(first.Summary, "appeared first") || !strings.HasPrefix(first.Summary, "Narodni pokret") {
		t.Errorf("summary = %q", first.Summary)
	}
	if first.Image != "https://www.danas.rs/wp-content/uploads/2026/11/hrana.jpg" {
		t.Errorf("image = %q", first.Image)
	}
	if first.Video == nil || first.Video.YouTube != "N-ZNBnLqloQ" {
		t.Errorf("video = %+v", first.Video)
	}
	if first.Published == nil || first.Published.Hour() != 9 {
		t.Errorf("published = %v", first.Published)
	}
	if stories[1].Image != "" {
		t.Errorf("картинка с внутреннего адреса принята: %q", stories[1].Image)
	}
}

const sampleArticle = `<!doctype html><html><head>
<meta property="og:title" content="Srušio se krov zgrade">
<meta property="og:image" content="https://n1info.rs/media/krov.jpg">
<meta property="article:published_time" content="2026-11-07T10:00:00+01:00">
</head><body>
<div class="container grid-cols-main-sidebar-wide">
<nav><p>Početna stranica sajta sa mnogo linkova i menija koji nisu deo vesti.</p></nav>
<article class="article-wrapper">
  <header><h1>Srušio se krov zgrade</h1></header>
  <p>Četvoro ljudi povređeno je kada se urušio krov četvorospratne poslovne zgrade u centru grada.</p>
  <div class="article-content-wrapper">
    <div class="rich-text-block"><p>Vatrogasci su na mestu nesreće bili za nekoliko minuta i izvukli povređene.</p></div>
    <div class="rich-text-block"><h2>Šta se zna o uzroku</h2></div>
    <div class="rich-text-block"><p>Uzrok urušavanja još nije poznat, a istraga je u toku od jutros.</p></div>
    <figure><img src="https://n1info.rs/media/zgrada.jpg" alt="Zgrada posle nesreće"></figure>
    <div class="embed"><iframe src="https://www.youtube-nocookie.com/embed/hEJnMQG9ev8"></iframe></div>
    <div class="related-posts"><p>Pročitajte i ovu dugačku vest o nečemu sasvim drugom što nije deo teksta.</p></div>
    <div class="rich-text-block"><p>Foto: Agencija Beta i ostali izvori fotografija ovog dana.</p></div>
  </div>
</article>
<div class="comments"><p>Komentar čitaoca koji je dovoljno dugačak da bi ličio na pravi pasus vesti.</p></div>
</div></body></html>`

func TestExtractArticle(t *testing.T) {
	article, err := extractArticle([]byte(sampleArticle), "text/html; charset=utf-8", "https://n1info.rs/svet/krov/")
	if err != nil {
		t.Fatal(err)
	}
	if article.Title != "Srušio se krov zgrade" || article.Image != "https://n1info.rs/media/krov.jpg" || article.Published == nil {
		t.Errorf("meta: %+v", article)
	}
	var kinds []string
	for _, block := range article.Blocks {
		kinds = append(kinds, block.Kind)
		if strings.Contains(block.Text, "Pročitajte") || strings.Contains(block.Text, "Komentar") || strings.HasPrefix(block.Text, "Foto:") {
			t.Errorf("обвязка в тексте: %q", block.Text)
		}
	}
	if got := strings.Join(kinds, ","); got != "p,p,h,p,img,youtube" {
		t.Errorf("блоки = %s", got)
	}
}

func TestAllowedHosts(t *testing.T) {
	for raw, want := range map[string]bool{
		"https://n1info.rs/vesti/x/":           true,
		"http://n1info.rs/vesti/x/":            false,
		"https://n1info.rs:8443/x":             false,
		"https://user@n1info.rs/x":             false,
		"https://n1info.rs.evil.example/x":     false,
		"https://127.0.0.1/x":                  false,
		"https://www.bbc.com/serbian/articles": true,
	} {
		if got := AllowedArticle(raw); got != want {
			t.Errorf("AllowedArticle(%q) = %v", raw, got)
		}
	}
	if !AllowedImage("https://i.ytimg.com/vi/abc/hqdefault.jpg") || AllowedImage("https://www.youtube.com/x.jpg") {
		t.Error("список хостов картинок нарушен")
	}
}

func TestPickStoriesLeadsWithPicture(t *testing.T) {
	now := time.Now()
	older := now.Add(-time.Hour)
	stories := []Story{
		{Title: "Starija sa slikom", Link: "a", Image: "x", Summary: strings.Repeat("reč ", 30), Published: &older},
		{Title: "Nova bez slike", Link: "b", Published: &now},
		{Title: "Nova bez slike", Link: "c", Published: &now},
	}
	got := pickStories(stories, map[string]bool{})
	if len(got) != 2 || got[0].Link != "a" {
		t.Fatalf("got = %+v", got)
	}
}

func TestParseChannel(t *testing.T) {
	raw := `<feed xmlns:yt="http://www.youtube.com/xml/schemas/2015" xmlns="http://www.w3.org/2005/Atom">
<entry><yt:videoId>N-ZNBnLqloQ</yt:videoId><title>Pita &amp; burek</title><link rel="alternate" href="https://www.youtube.com/watch?v=N-ZNBnLqloQ"/><published>2026-11-05T10:00:00+00:00</published></entry>
<entry><yt:videoId>hEJnMQG9ev8</yt:videoId><title>Kratko</title><link rel="alternate" href="https://www.youtube.com/shorts/hEJnMQG9ev8"/><published>2026-11-06T10:00:00+00:00</published></entry>
<entry><yt:videoId>bad</yt:videoId><title>x</title></entry>
</feed>`
	videos, err := parseChannel([]byte(raw), Channel{ID: "c", Name: "Kanal"})
	if err != nil {
		t.Fatal(err)
	}
	if len(videos) != 2 || videos[0].Title != "Pita & burek" || videos[0].Short || !videos[1].Short {
		t.Fatalf("videos = %+v", videos)
	}
}

func TestKeepParagraphDropsDateline(t *testing.T) {
	for _, text := range []string{
		"субота, 07.11.2026, 13:08 -> 13:16",
		"Petak, 6. 11. 2026. 21:40",
		"07.11.2026. 09:15",
	} {
		if keepParagraph(text) {
			t.Errorf("строка времени осталась в тексте: %q", text)
		}
	}
	for _, text := range []string{
		"Policija je 7.11.2026. uhapsila tri osobe zbog laboratorije za marihuanu.",
		"Саобраћај на том делу пута је у прекиду, а полиција врши увиђај.",
	} {
		if !keepParagraph(text) {
			t.Errorf("абзац выпал: %q", text)
		}
	}
}
