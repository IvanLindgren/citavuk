package api

import (
	"net"
	"net/url"
	"testing"
)

func TestValidateRemoteDocumentURL(t *testing.T) {
	for _, raw := range []string{
		"https://example.com/book.pdf",
		"http://example.com/text.docx?download=1",
	} {
		parsed, err := url.Parse(raw)
		if err != nil || validateRemoteDocumentURL(parsed) != nil {
			t.Fatalf("публичная ссылка отклонена: %s", raw)
		}
	}
	for _, raw := range []string{
		"file:///etc/passwd",
		"ftp://example.com/book.pdf",
		"https://user:pass@example.com/book.pdf",
		"https:///book.pdf",
	} {
		parsed, _ := url.Parse(raw)
		if validateRemoteDocumentURL(parsed) == nil {
			t.Fatalf("опасная ссылка разрешена: %s", raw)
		}
	}
}

func TestIsPublicDocumentIP(t *testing.T) {
	for _, raw := range []string{
		"127.0.0.1",
		"10.0.0.1",
		"100.64.0.1",
		"169.254.169.254",
		"192.168.1.1",
		"::1",
		"fe80::1",
		"fc00::1",
	} {
		if isPublicDocumentIP(net.ParseIP(raw)) {
			t.Fatalf("служебный адрес разрешён: %s", raw)
		}
	}
	for _, raw := range []string{"1.1.1.1", "8.8.8.8", "2606:4700:4700::1111"} {
		if !isPublicDocumentIP(net.ParseIP(raw)) {
			t.Fatalf("публичный адрес отклонён: %s", raw)
		}
	}
}

func TestSupportedRemoteDocument(t *testing.T) {
	cases := []struct {
		contentType string
		filename    string
		want        bool
	}{
		{"application/pdf", "book", true},
		{"application/octet-stream", "book.docx", true},
		{"text/plain; charset=utf-8", "story.txt", true},
		{"text/html", "index.html", false},
		{"application/octet-stream", "program.exe", false},
	}
	for _, test := range cases {
		if got := supportedRemoteDocument(test.contentType, test.filename); got != test.want {
			t.Fatalf("%s / %s: got %v, want %v",
				test.contentType, test.filename, got, test.want)
		}
	}
}
