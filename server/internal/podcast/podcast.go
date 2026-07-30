// Package podcast собирает список эпизодов подкастов и их расшифровки.
//
// Раньше этим занимался прежний Python-бэкенд, и с ним было две беды. Первая:
// он живёт на бесплатном Space, который засыпает, — раздел «Слушание» отвечал
// 502. Вторая, важнее: тайминги реплик там выдумывались. Текст брался из
// описания эпизода в RSS и растягивался по длительности пропорционально длине
// строк, поэтому подсветка не совпадала с речью ни в одном эпизоде.
//
// Здесь список строится по самому RSS, а реплики берутся только настоящие —
// из расшифровок, сделанных Whisper (web/scripts/transcribe-podcasts.py).
// Если расшифровки для эпизода ещё нет, реплик не будет вовсе: пустой текст
// честнее выдуманного.
package podcast

import (
	"context"
	"encoding/json"
	"encoding/xml"
	"errors"
	"fmt"
	"io"
	"net/http"
	"net/url"
	"path"
	"regexp"
	"strconv"
	"strings"
	"sync"
	"time"
)

// Feed — лента подкаста.
type Feed struct {
	ID    string
	Title string
	URL   string
}

// Feeds — ленты, которые показываются в разделе «Слушание».
var Feeds = []Feed{
	{ID: "learn-serbian", Title: "Learn Serbian", URL: "https://rss.buzzsprout.com/1246415.rss"},
	{ID: "moze-kafa", Title: "Može kafa", URL: "https://anchor.fm/s/aef64434/podcast/rss"},
}

// TranscriptsBase — где лежат наши расшифровки.
const TranscriptsBase = "https://citavuk.ru/transcripts"

// ErrForeignTranscript — запрошена расшифровка не из нашего каталога.
var ErrForeignTranscript = errors.New("посторонний адрес расшифровки")

// Cue — реплика с временем звучания.
type Cue struct {
	Start float64 `json:"start"`
	End   float64 `json:"end"`
	Text  string  `json:"text"`
}

// Lesson — эпизод в списке.
type Lesson struct {
	ID       string `json:"id"`
	Title    string `json:"title"`
	Subtitle string `json:"subtitle"`
	AudioURL string `json:"audio_url"`
	// Cues здесь всегда пуст: список эпизодов не должен тащить с собой сотни
	// реплик на каждый из них. Клиент забирает расшифровку по transcript_url,
	// когда эпизод действительно открывают.
	Cues []Cue `json:"cues"`
	// TranscriptURL пуст, если расшифровки ещё нет.
	TranscriptURL string  `json:"transcript_url,omitempty"`
	Duration      float64 `json:"duration,omitempty"`
}

// Transcript — расшифровка эпизода.
type Transcript struct {
	Duration float64 `json:"duration"`
	Cues     []Cue   `json:"cues"`
	Title    string  `json:"title,omitempty"`
	Audio    string  `json:"audio,omitempty"`
}

// Service отдаёт список эпизодов и расшифровки, держа их в памяти.
type Service struct {
	client          *http.Client
	feeds           []Feed
	transcriptsBase string

	mu        sync.Mutex
	lessons   []Lesson
	lessonsAt time.Time
	index     map[string]string
	indexAt   time.Time
}

// cacheTTL — ленты обновляются раз в неделю, индекс расшифровок — при выкладке
// сайта; чаще часа спрашивать нечего.
const cacheTTL = time.Hour

// New собирает службу.
func New() *Service {
	return newService(
		&http.Client{Timeout: 45 * time.Second},
		Feeds,
		TranscriptsBase,
	)
}

func newService(client *http.Client, feeds []Feed, transcriptsBase string) *Service {
	return &Service{
		client:          client,
		feeds:           feeds,
		transcriptsBase: strings.TrimSuffix(transcriptsBase, "/"),
	}
}

type rssFeed struct {
	Channel struct {
		Items []rssItem `xml:"item"`
	} `xml:"channel"`
}

type rssItem struct {
	Title     string `xml:"title"`
	GUID      string `xml:"guid"`
	Duration  string `xml:"http://www.itunes.com/dtds/podcast-1.0.dtd duration"`
	Enclosure struct {
		URL  string `xml:"url,attr"`
		Type string `xml:"type,attr"`
	} `xml:"enclosure"`
}

// Lessons отдаёт список эпизодов.
func (s *Service) Lessons(ctx context.Context) ([]Lesson, error) {
	s.mu.Lock()
	if time.Since(s.lessonsAt) < cacheTTL && len(s.lessons) > 0 {
		cached := s.lessons
		s.mu.Unlock()
		return cached, nil
	}
	s.mu.Unlock()

	index := s.transcriptIndex(ctx)

	lessons := make([]Lesson, 0, 64)
	for _, feed := range s.feeds {
		items, err := s.fetchFeed(ctx, feed.URL)
		if err != nil {
			// Одна недоступная лента не должна прятать вторую.
			continue
		}
		for _, item := range items {
			audio := strings.SplitN(item.Enclosure.URL, "?", 2)[0]
			if audio == "" {
				continue
			}
			duration := parseDuration(item.Duration)
			lesson := Lesson{
				ID:       lessonID(feed.ID, item),
				Title:    strings.TrimSpace(item.Title),
				Subtitle: subtitle(feed.Title, duration),
				AudioURL: audio,
				Cues:     []Cue{},
				Duration: duration,
			}
			if lesson.Title == "" {
				lesson.Title = "Без названия"
			}
			if name := index[audio]; name != "" {
				lesson.TranscriptURL = s.transcriptsBase + "/" + name
			}
			lessons = append(lessons, lesson)
		}
	}
	if len(lessons) == 0 {
		return nil, errors.New("ленты подкастов недоступны")
	}

	s.mu.Lock()
	s.lessons, s.lessonsAt = lessons, time.Now()
	s.mu.Unlock()
	return lessons, nil
}

func (s *Service) fetchFeed(ctx context.Context, url string) ([]rssItem, error) {
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, url, nil)
	if err != nil {
		return nil, err
	}
	req.Header.Set("User-Agent", "Mozilla/5.0 (compatible; Citavuk/1.0)")
	resp, err := s.client.Do(req)
	if err != nil {
		return nil, err
	}
	defer resp.Body.Close()
	if resp.StatusCode != http.StatusOK {
		return nil, fmt.Errorf("лента ответила кодом %d", resp.StatusCode)
	}
	var parsed rssFeed
	if err := xml.NewDecoder(io.LimitReader(resp.Body, 8<<20)).Decode(&parsed); err != nil {
		return nil, err
	}
	return parsed.Channel.Items, nil
}

// transcriptIndex читает карту «ссылка на аудио → файл расшифровки».
func (s *Service) transcriptIndex(ctx context.Context) map[string]string {
	s.mu.Lock()
	if time.Since(s.indexAt) < cacheTTL && s.index != nil {
		cached := s.index
		s.mu.Unlock()
		return cached
	}
	s.mu.Unlock()

	index := map[string]string{}
	if req, err := http.NewRequestWithContext(
		ctx, http.MethodGet, s.transcriptsBase+"/index.json", nil,
	); err == nil {
		if resp, err := s.client.Do(req); err == nil {
			if resp.StatusCode == http.StatusOK {
				_ = json.NewDecoder(io.LimitReader(resp.Body, 1<<20)).Decode(&index)
			}
			resp.Body.Close()
		}
	}

	s.mu.Lock()
	s.index, s.indexAt = index, time.Now()
	s.mu.Unlock()
	return index
}

// Transcript забирает расшифровку по её адресу.
//
// Разрешён только наш каталог: обработчик не должен превращаться в открытый
// прокси, которым можно тянуть что угодно через наш сервер.
func (s *Service) Transcript(ctx context.Context, url string) (*Transcript, error) {
	parsed, err := s.validTranscriptURL(url)
	if err != nil {
		return nil, ErrForeignTranscript
	}
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, parsed.String(), nil)
	if err != nil {
		return nil, err
	}
	resp, err := s.client.Do(req)
	if err != nil {
		return nil, err
	}
	defer resp.Body.Close()
	if resp.StatusCode != http.StatusOK {
		return nil, fmt.Errorf("расшифровка ответила кодом %d", resp.StatusCode)
	}
	var transcript Transcript
	if err := json.NewDecoder(io.LimitReader(resp.Body, 8<<20)).Decode(&transcript); err != nil {
		return nil, err
	}
	return &transcript, nil
}

func (s *Service) validTranscriptURL(raw string) (*url.URL, error) {
	base, err := url.Parse(s.transcriptsBase)
	if err != nil {
		return nil, err
	}
	candidate, err := url.Parse(raw)
	if err != nil ||
		candidate.Scheme != base.Scheme ||
		candidate.Host != base.Host ||
		candidate.User != nil ||
		candidate.RawQuery != "" ||
		candidate.Fragment != "" ||
		!strings.HasPrefix(candidate.Path, base.Path+"/") ||
		path.Clean(candidate.Path) != candidate.Path ||
		path.Ext(candidate.Path) != ".json" {
		return nil, ErrForeignTranscript
	}
	return candidate, nil
}

var notWord = regexp.MustCompile(`[^a-zA-Z0-9_-]+`)

func lessonID(feedID string, item rssItem) string {
	raw := item.GUID
	if raw == "" {
		raw = item.Title
	}
	id := feedID + "-" + notWord.ReplaceAllString(raw, "_")
	if len(id) > 120 {
		id = id[:120]
	}
	return id
}

func subtitle(feedTitle string, duration float64) string {
	if duration <= 0 {
		return feedTitle
	}
	return fmt.Sprintf("%s · %d мин", feedTitle, int(duration)/60)
}

// parseDuration понимает и «1:02:03», и «3723» — itunes:duration пишут по-разному.
func parseDuration(value string) float64 {
	value = strings.TrimSpace(value)
	if value == "" {
		return 0
	}
	total := 0.0
	for _, part := range strings.Split(value, ":") {
		number, err := strconv.ParseFloat(strings.TrimSpace(part), 64)
		if err != nil {
			return 0
		}
		total = total*60 + number
	}
	return total
}
