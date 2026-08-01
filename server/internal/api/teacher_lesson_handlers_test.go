package api

import (
	"encoding/json"
	"strings"
	"testing"
)

func TestNormalizeVideoURL(t *testing.T) {
	tests := []struct{ raw, provider, contains string }{
		{"https://youtu.be/dQw4w9WgXcQ", "youtube", "youtube-nocookie.com/embed/dQw4w9WgXcQ"},
		{"https://vimeo.com/123456789", "vimeo", "player.vimeo.com/video/123456789"},
		{"https://rutube.ru/video/0123456789abcdef/", "rutube", "rutube.ru/play/embed/0123456789abcdef"},
		{"https://vk.com/video-123_456", "vk", "oid=-123&id=456"},
	}
	for _, tc := range tests {
		provider, embed, err := normalizeVideoURL(tc.raw)
		if err != nil {
			t.Fatalf("%s: %v", tc.raw, err)
		}
		if provider != tc.provider || !strings.Contains(embed, tc.contains) {
			t.Fatalf("%s: got %q %q", tc.raw, provider, embed)
		}
	}
	if _, _, err := normalizeVideoURL("https://example.com/movie.mp4"); err == nil {
		t.Fatal("unknown video provider accepted")
	}
}

func TestNormalizeLessonContentAddsSafeEmbed(t *testing.T) {
	raw := json.RawMessage(`{"theory":[{"type":"paragraph","text":"Zdravo"},{"type":"video","url":"https://vimeo.com/123456789"}],"exercises":[{"type":"explain_word"}]}`)
	out, err := normalizeLessonContent(raw)
	if err != nil {
		t.Fatal(err)
	}
	if !strings.Contains(string(out), `"provider":"vimeo"`) || !strings.Contains(string(out), `"embedUrl":"https://player.vimeo.com/video/123456789"`) {
		t.Fatalf("normalized content does not contain embed: %s", out)
	}
}

func TestNormalizeLessonContentRejectsLongTheory(t *testing.T) {
	raw, _ := json.Marshal(map[string]any{"theory": []any{map[string]any{"type": "paragraph", "text": strings.Repeat("a", 6001)}}})
	if _, err := normalizeLessonContent(raw); err == nil {
		t.Fatal("long theory accepted")
	}
}
