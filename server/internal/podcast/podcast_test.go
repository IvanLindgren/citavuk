package podcast

import (
	"context"
	"errors"
	"fmt"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
)

func TestParseDuration(t *testing.T) {
	cases := map[string]float64{
		"":         0,
		"3723":     3723,
		"1:02:03":  3723,
		"36:00":    2160,
		" 12:30 ":  750,
		"невнятно": 0,
	}
	for value, want := range cases {
		if got := parseDuration(value); got != want {
			t.Fatalf("parseDuration(%q) = %v, ожидалось %v", value, got, want)
		}
	}
}

func TestSubtitleShowsMinutesOnlyWhenKnown(t *testing.T) {
	if got := subtitle("Learn Serbian", 2160); got != "Learn Serbian · 36 мин" {
		t.Fatalf("неожиданный подзаголовок: %q", got)
	}
	if got := subtitle("Learn Serbian", 0); got != "Learn Serbian" {
		t.Fatalf("без длительности минут быть не должно: %q", got)
	}
}

func TestLessonIDIsStableAndSafe(t *testing.T) {
	item := rssItem{GUID: "https://buzzsprout.com/1246415/16988481.mp3?x=1"}
	first := lessonID("learn-serbian", item)
	if first != lessonID("learn-serbian", item) {
		t.Fatal("идентификатор эпизода должен быть устойчивым")
	}
	for _, char := range first {
		ok := char == '-' || char == '_' ||
			(char >= 'a' && char <= 'z') || (char >= 'A' && char <= 'Z') ||
			(char >= '0' && char <= '9')
		if !ok {
			t.Fatalf("в идентификаторе посторонний символ %q: %s", char, first)
		}
	}

	// Заголовок вместо guid: у части лент guid нет вовсе.
	if lessonID("moze-kafa", rssItem{Title: "Epizoda 5"}) == "moze-kafa-" {
		t.Fatal("заголовок должен попадать в идентификатор")
	}
}

func TestTranscriptRejectsForeignAddress(t *testing.T) {
	service := New()
	addresses := []string{
		"https://example.com/steal.json",
		"https://citavuk.ru/transcripts/../secret.json",
		"https://citavuk.ru/transcripts/file.json?redirect=1",
		"https://citavuk.ru/transcripts/file.txt",
	}
	for _, address := range addresses {
		_, err := service.Transcript(context.Background(), address)
		if !errors.Is(err, ErrForeignTranscript) {
			t.Fatalf("посторонний адрес %q должен отклоняться, получено: %v", address, err)
		}
	}
}

func TestLessonsUseOnlyWhisperTranscriptFromIndex(t *testing.T) {
	var base string
	upstream := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		switch r.URL.Path {
		case "/feed.xml":
			w.Header().Set("Content-Type", "application/rss+xml")
			_, _ = fmt.Fprintf(w, `<?xml version="1.0"?><rss><channel><item>
				<title>Prava epizoda</title>
				<guid>episode-1</guid>
				<enclosure url="https://cdn.example/episode.mp3?token=temporary" type="audio/mpeg"/>
				<duration xmlns="http://www.itunes.com/dtds/podcast-1.0.dtd">12:30</duration>
			</item></channel></rss>`)
		case "/transcripts/index.json":
			w.Header().Set("Content-Type", "application/json")
			_, _ = fmt.Fprint(w, `{"https://cdn.example/episode.mp3":"real.json"}`)
		case "/transcripts/real.json":
			w.Header().Set("Content-Type", "application/json")
			_, _ = fmt.Fprint(w, `{"duration":750,"cues":[{"start":1.2,"end":2.1,"text":"Zdravo!"}]}`)
		default:
			http.NotFound(w, r)
		}
	}))
	defer upstream.Close()
	base = upstream.URL

	service := newService(
		upstream.Client(),
		[]Feed{{ID: "test", Title: "Test", URL: base + "/feed.xml"}},
		base+"/transcripts",
	)
	lessons, err := service.Lessons(context.Background())
	if err != nil {
		t.Fatal(err)
	}
	if len(lessons) != 1 {
		t.Fatalf("ожидался один эпизод, получено %d", len(lessons))
	}
	lesson := lessons[0]
	if lesson.AudioURL != "https://cdn.example/episode.mp3" {
		t.Fatalf("временный query должен быть убран: %q", lesson.AudioURL)
	}
	if lesson.TranscriptURL != base+"/transcripts/real.json" {
		t.Fatalf("должна использоваться только расшифровка из индекса: %q", lesson.TranscriptURL)
	}
	if len(lesson.Cues) != 0 {
		t.Fatal("каталог не должен тащить реплики всех эпизодов")
	}

	transcript, err := service.Transcript(context.Background(), lesson.TranscriptURL)
	if err != nil {
		t.Fatal(err)
	}
	if len(transcript.Cues) != 1 || strings.TrimSpace(transcript.Cues[0].Text) != "Zdravo!" {
		t.Fatalf("неожиданная расшифровка: %+v", transcript.Cues)
	}
}
