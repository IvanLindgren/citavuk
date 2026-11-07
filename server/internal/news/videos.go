package news

import (
	"context"
	"encoding/xml"
	"regexp"
	"sort"
	"strings"
	"sync"
	"time"
)

// Channel — канал YouTube, который мы предлагаем смотреть.
type Channel struct {
	ID   string
	Name string
}

// Interest — тема, по которой человек настраивает подборку роликов.
type Interest struct {
	Code     string    `json:"code"`
	Title    string    `json:"title"`
	Channels []Channel `json:"-"`
}

// Interests — подборка каналов по темам. Каждый канал проверен вручную:
// говорят по-сербски, выходит регулярно, без политической агитации. Список
// правится здесь же.
var Interests = []Interest{
	{Code: "jezik", Title: "Сербский для изучающих", Channels: []Channel{
		{"UCbWJOQ7td4kgHZPw0WCXMzQ", "Comprehensible Serbian"},
		{"UCY-P5lDQ0xRyZ5_6Za5D2mQ", "Relaxing Serbian"},
		{"UC8rRNd8UZglOPAjz4cu1ooA", "Serbian Language Podcast"},
		{"UCLTRFHiyWOzLw7118E38nLA", "Serbian with Boko"},
	}},
	{Code: "putovanja", Title: "Путешествия и Сербия", Channels: []Channel{
		{"UCIlrPK_7IAbFHcvJtBrO06w", "RTS — Ovo je Srbija"},
		{"UCZEyloJWOGA6Wt6T7V18zPQ", "Sergio Spector"},
		{"UCRBMN1O01FgVAWDBaLlZ6DQ", "Mima putovanja"},
		{"UC3DRmQlXu3_LpdTH37uvqxA", "Luna Srbija"},
	}},
	{Code: "kuhinja", Title: "Кухня", Channels: []Channel{
		{"UCX-dJJRl3qUbyHrgcDZhUiw", "Šerpica Recepti"},
		{"UC_e7TmcT04BXc_apok0HJlw", "Hrana i Vino"},
		{"UCziASxiSNISFR_FxJ8vFjnA", "Domaći Recepti"},
	}},
	{Code: "istorija", Title: "История", Channels: []Channel{
		{"UCux63_Z-YPubnWzzSrE7geg", "HistoryCast"},
		{"UCAFlyoJ6KpMeKZat_O0vVeg", "Točak istorije"},
		{"UC7YXaFfjb6bZ7hCBazybS8w", "RTS Merila vremena"},
	}},
	{Code: "nauka", Title: "Наука", Channels: []Channel{
		{"UCsrKDhcBsB31Xclq5meaJ_w", "RTS Obrazovno-naučni program"},
		{"UCxunmKtYfMYjnf6Mp4eWBxg", "Agelast"},
	}},
	{Code: "razgovori", Title: "Подкасты и интервью", Channels: []Channel{
		{"UCMN38-CYinfQT3t_3HIpOtA", "Još podkast jedan"},
		{"UCEASCzL4XbzCFu8JhryzkNg", "Biznis Priče"},
		{"UCxunmKtYfMYjnf6Mp4eWBxg", "Agelast"},
	}},
	{Code: "humor", Title: "Юмор и шоу", Channels: []Channel{
		{"UCbYHvSoOkkHfhPTNkz4RmQg", "Njuz Net"},
		{"UCFVlorp0-3KEDsqQv6LHmSQ", "RTS Šou program"},
	}},
	{Code: "sport", Title: "Спорт", Channels: []Channel{
		{"UChpzBje9Ro6CComXe3BgNaw", "Sport Klub"},
		{"UCJnZouZlCJYjPe4wIHvfIJQ", "RTS Sport"},
		{"UC-SYaiaBb5P-xcNTzcvkqkA", "Arena Sport"},
	}},
	{Code: "kultura", Title: "Культура", Channels: []Channel{
		{"UCPqQWdcS_Qq_vxD0qKMt3Pg", "RTS Kulturno-umetnički program"},
		{"UC9XtmpcPIr-Zv-2S427YffQ", "RTS Oko"},
	}},
	{Code: "auto", Title: "Машины", Channels: []Channel{
		{"UCrk3XHbIlfFFQzskyGq87jg", "PetrolHeads"},
	}},
	{Code: "vesti", Title: "Новости", Channels: []Channel{
		{"UCX32bBbDzEPJhxowcEXu1Rw", "Insajder"},
		{"UC9XtmpcPIr-Zv-2S427YffQ", "RTS Oko"},
	}},
}

// VideoItem — ролик в подборке.
type VideoItem struct {
	ID        string    `json:"id"`
	Title     string    `json:"title"`
	Channel   string    `json:"channel"`
	Interest  string    `json:"interest"`
	Published time.Time `json:"published"`
	Short     bool      `json:"short,omitempty"`
}

type channelEntry struct {
	videos []VideoItem
	at     time.Time
}

type videoCache struct {
	mu       sync.Mutex
	channels map[string]channelEntry
}

func newVideoCache() *videoCache {
	return &videoCache{channels: map[string]channelEntry{}}
}

var videoIDPattern = regexp.MustCompile(`^[A-Za-z0-9_-]{11}$`)

// ValidVideoID проверяет идентификатор ролика YouTube.
func ValidVideoID(id string) bool { return videoIDPattern.MatchString(id) }

type youtubeFeed struct {
	Entries []struct {
		VideoID   string `xml:"videoId"`
		Title     string `xml:"title"`
		Published string `xml:"published"`
		Link      struct {
			Href string `xml:"href,attr"`
		} `xml:"link"`
	} `xml:"entry"`
}

func parseChannel(raw []byte, channel Channel) ([]VideoItem, error) {
	var feed youtubeFeed
	if err := xml.Unmarshal(raw, &feed); err != nil {
		return nil, err
	}
	videos := make([]VideoItem, 0, len(feed.Entries))
	for _, entry := range feed.Entries {
		if !ValidVideoID(entry.VideoID) {
			continue
		}
		published, _ := time.Parse(time.RFC3339, strings.TrimSpace(entry.Published))
		videos = append(videos, VideoItem{
			ID: entry.VideoID, Title: plain(entry.Title), Channel: channel.Name,
			Published: published.UTC(), Short: strings.Contains(entry.Link.Href, "/shorts/"),
		})
	}
	return videos, nil
}

func (s *Service) channelVideos(ctx context.Context, channel Channel) []VideoItem {
	s.videos.mu.Lock()
	entry, ok := s.videos.channels[channel.ID]
	s.videos.mu.Unlock()
	if ok && s.now().Sub(entry.at) < 3*time.Hour {
		return entry.videos
	}
	raw, _, err := s.get(ctx, "https://www.youtube.com/feeds/videos.xml?channel_id="+channel.ID, "application/atom+xml, application/xml;q=0.9", 2<<20)
	if err != nil {
		return entry.videos
	}
	videos, err := parseChannel(raw, channel)
	if err != nil {
		return entry.videos
	}
	s.videos.mu.Lock()
	s.videos.channels[channel.ID] = channelEntry{videos: videos, at: s.now()}
	s.videos.mu.Unlock()
	return videos
}

// Videos собирает ролики по выбранным темам; пустой список — все темы.
// Короткие вертикальные ролики идут в конец: для понимания речи нужен
// связный рассказ, а не пятнадцать секунд под музыку.
func (s *Service) Videos(ctx context.Context, codes []string) []VideoItem {
	wanted := map[string]bool{}
	for _, code := range codes {
		wanted[strings.TrimSpace(code)] = true
	}
	type job struct {
		channel  Channel
		interest string
	}
	var jobs []job
	seenChannel := map[string]bool{}
	for _, interest := range Interests {
		if len(wanted) > 0 && !wanted[interest.Code] {
			continue
		}
		for _, channel := range interest.Channels {
			if seenChannel[channel.ID] {
				continue
			}
			seenChannel[channel.ID] = true
			jobs = append(jobs, job{channel, interest.Code})
		}
	}
	fetchCtx, cancel := context.WithTimeout(context.WithoutCancel(ctx), 20*time.Second)
	defer cancel()
	var mu sync.Mutex
	var wg sync.WaitGroup
	var all []VideoItem
	for _, j := range jobs {
		wg.Add(1)
		go func(j job) {
			defer wg.Done()
			videos := s.channelVideos(fetchCtx, j.channel)
			mu.Lock()
			for _, video := range videos {
				video.Interest = j.interest
				all = append(all, video)
			}
			mu.Unlock()
		}(j)
	}
	wg.Wait()
	sort.SliceStable(all, func(i, j int) bool {
		if all[i].Short != all[j].Short {
			return !all[i].Short
		}
		return all[i].Published.After(all[j].Published)
	})
	seen := map[string]bool{}
	out := make([]VideoItem, 0, 60)
	for _, video := range all {
		if seen[video.ID] {
			continue
		}
		seen[video.ID] = true
		out = append(out, video)
		if len(out) == 60 {
			break
		}
	}
	return out
}
