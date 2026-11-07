// Package news собирает газету «Вести»: свежие сербские новости по разделам,
// полный текст заметки и подборку роликов сербских блогеров.
//
// Источники — открытые RSS-ленты изданий и ленты каналов YouTube. Список
// закрытый: сервер ходит только по адресам отсюда, и никакой адрес из запроса
// браузера сам по себе за собой не тянет.
package news

import (
	"net/url"
	"strings"
)

// Feed — лента одного издания в разделе газеты.
type Feed struct {
	Source string
	URL    string
}

// Section — полоса газеты.
type Section struct {
	Code  string
	Title string
	Feeds []Feed
}

// Sections — полосы в порядке вёрстки. Названия по-сербски: это заголовки
// самой газеты, а не интерфейс.
var Sections = []Section{
	{Code: "srbija", Title: "Србија", Feeds: []Feed{
		{"N1", "https://n1info.rs/vesti/feed/"},
		{"RTS", "https://www.rts.rs/page/stories/sr/rss.html"},
		{"BBC na srpskom", "https://feeds.bbci.co.uk/serbian/lat/rss.xml"},
	}},
	{Code: "svet", Title: "Свет", Feeds: []Feed{
		{"N1", "https://n1info.rs/svet/feed/"},
	}},
	{Code: "ekonomija", Title: "Економија", Feeds: []Feed{
		{"N1", "https://n1info.rs/biznis/feed/"},
		{"B92", "https://www.b92.net/info/rss/biz.xml"},
	}},
	{Code: "kultura", Title: "Култура", Feeds: []Feed{
		{"Danas", "https://www.danas.rs/rubrika/kultura/feed/"},
		{"Nova", "https://nova.rs/kultura/feed/"},
		{"B92", "https://www.b92.net/info/rss/kultura.xml"},
	}},
	{Code: "tehnologija", Title: "Технологија", Feeds: []Feed{
		{"B92", "https://www.b92.net/info/rss/tehnopolis.xml"},
		{"Startit", "https://startit.rs/feed/"},
	}},
	{Code: "sport", Title: "Спорт", Feeds: []Feed{
		{"Sport Klub", "https://sportklub.n1info.rs/feed/"},
		{"B92", "https://www.b92.net/info/rss/sport.xml"},
	}},
	{Code: "zivot", Title: "Живот", Feeds: []Feed{
		{"Danas", "https://www.danas.rs/rubrika/zivot/feed/"},
		{"B92", "https://www.b92.net/info/rss/zivot.xml"},
		{"Nova", "https://nova.rs/zabava/feed/"},
	}},
}

// articleHosts — откуда разрешено забирать полный текст заметки. Ссылки на
// заметки приходят из лент, то есть это чужие данные, и сервер по ним идёт
// только в пределах этого списка.
var articleHosts = map[string]bool{
	"n1info.rs":           true,
	"www.rts.rs":          true,
	"rts.rs":              true,
	"www.bbc.com":         true,
	"www.danas.rs":        true,
	"danas.rs":            true,
	"nova.rs":             true,
	"www.b92.net":         true,
	"b92.net":             true,
	"startit.rs":          true,
	"sportklub.rs":        true,
	"sportklub.n1info.rs": true,
}

// imageHosts — откуда сервер согласен брать картинки.
var imageHosts = map[string]bool{
	"n1info.rs":        true,
	"www.rts.rs":       true,
	"rts.rs":           true,
	"ichef.bbci.co.uk": true,
	"www.danas.rs":     true,
	"danas.rs":         true,
	"nova.rs":          true,
	"www.b92.net":      true,
	"b92.net":          true,
	"startit.rs":       true,
	"sportklub.rs":     true,
	"i.ytimg.com":      true,
}

func allowed(raw string, hosts map[string]bool) bool {
	parsed, err := url.Parse(strings.TrimSpace(raw))
	if err != nil || parsed.Scheme != "https" || parsed.User != nil || parsed.Port() != "" {
		return false
	}
	return hosts[strings.ToLower(parsed.Hostname())]
}

// AllowedArticle сообщает, можно ли забрать текст заметки по ссылке.
func AllowedArticle(raw string) bool { return allowed(raw, articleHosts) }

// AllowedImage сообщает, можно ли забрать картинку по ссылке.
func AllowedImage(raw string) bool { return allowed(raw, imageHosts) }
