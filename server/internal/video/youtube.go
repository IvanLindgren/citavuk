// Package video принимает только оригинальные YouTube-встраивания. Ни
// скачивания MP4, ни обхода ограничений воспроизведения здесь нет.
package video

import (
	"context"
	"encoding/json"
	"errors"
	"io"
	"net/http"
	"net/url"
	"regexp"
	"strings"
	"time"
)

var ErrURL = errors.New("нужна ссылка на YouTube-видео или Shorts")
var idPattern = regexp.MustCompile(`^[A-Za-z0-9_-]{11}$`)

func ID(raw string) (string, error) {
	u, err := url.Parse(strings.TrimSpace(raw))
	if err != nil || u.Scheme != "https" || u.User != nil || u.Port() != "" {
		return "", ErrURL
	}
	var id string
	switch strings.ToLower(u.Hostname()) {
	case "youtu.be":
		id = strings.Trim(u.Path, "/")
	case "youtube.com", "www.youtube.com", "m.youtube.com":
		if u.Path == "/watch" {
			id = u.Query().Get("v")
		} else if strings.HasPrefix(u.Path, "/shorts/") {
			id = strings.TrimSuffix(strings.TrimPrefix(u.Path, "/shorts/"), "/")
		}
	default:
		return "", ErrURL
	}
	if !idPattern.MatchString(id) {
		return "", ErrURL
	}
	return id, nil
}

type Metadata struct {
	Title  string `json:"title"`
	Author string `json:"author_name"`
}

func Lookup(ctx context.Context, id string) (Metadata, error) {
	var m Metadata
	if !idPattern.MatchString(id) {
		return m, ErrURL
	}
	endpoint := "https://www.youtube.com/oembed?format=json&url=" + url.QueryEscape("https://www.youtube.com/watch?v="+id)
	req, err := http.NewRequestWithContext(ctx, "GET", endpoint, nil)
	if err != nil {
		return m, err
	}
	client := http.Client{Timeout: 10 * time.Second, CheckRedirect: func(*http.Request, []*http.Request) error { return http.ErrUseLastResponse }}
	resp, err := client.Do(req)
	if err != nil {
		return m, err
	}
	defer resp.Body.Close()
	if resp.StatusCode != 200 {
		return m, errors.New("YouTube не подтвердил доступность встраивания")
	}
	if err = json.NewDecoder(io.LimitReader(resp.Body, 128<<10)).Decode(&m); err != nil {
		return m, err
	}
	if strings.TrimSpace(m.Title) == "" || strings.TrimSpace(m.Author) == "" || len(m.Title) > 1000 || len(m.Author) > 300 {
		return m, ErrURL
	}
	return m, nil
}
