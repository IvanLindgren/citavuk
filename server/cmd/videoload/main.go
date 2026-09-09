// Command videoload imports an explicitly approved JSONL batch of YouTube
// metadata into Vukotok. It never discovers videos and cannot publish unless
// the operator explicitly confirms both publication and Serbian speech.
package main

import (
	"bufio"
	"context"
	"encoding/json"
	"errors"
	"flag"
	"fmt"
	"log/slog"
	"os"
	"os/signal"
	"strings"
	"syscall"
	"time"

	"github.com/citavuk/server/internal/config"
	"github.com/citavuk/server/internal/store"
	"github.com/citavuk/server/internal/video"
)

type candidate struct {
	ID       string `json:"id"`
	Title    string `json:"title"`
	Duration int    `json:"duration"`
	Channel  string `json:"channel"`
}

func main() {
	envPath := flag.String("env", ".env", "server environment file")
	inputs := flag.String("input", "", "comma-separated yt-dlp JSONL files")
	target := flag.Int("target", 0, "number of videos to publish")
	publish := flag.Bool("publish", false, "publish instead of dry run")
	confirmLanguage := flag.Bool("confirm-serbian-speech", false, "operator confirms Serbian speech for the batch")
	flag.Parse()
	if strings.TrimSpace(*inputs) == "" || *target < 1 || !*publish || !*confirmLanguage {
		fatal(errors.New("input, positive target, -publish and -confirm-serbian-speech are required"))
	}

	ctx, stop := signal.NotifyContext(context.Background(), os.Interrupt, syscall.SIGTERM)
	defer stop()
	cfg, err := config.Load(*envPath)
	if err != nil {
		fatal(err)
	}
	openCtx, cancel := context.WithTimeout(ctx, 20*time.Second)
	st, err := store.Open(openCtx, cfg.DatabaseURL)
	cancel()
	if err != nil {
		fatal(err)
	}
	defer st.Close()

	candidates, err := readCandidates(strings.Split(*inputs, ","))
	if err != nil {
		fatal(err)
	}
	published, skipped := 0, 0
	for _, item := range candidates {
		if published >= *target {
			break
		}
		if item.Duration < 1 || item.Duration > 180 {
			skipped++
			continue
		}
		meta, err := video.Lookup(ctx, item.ID)
		if err != nil {
			slog.Warn("YouTube rejected video", "id", item.ID, "err", err)
			skipped++
			continue
		}
		category, cefr, tags := classify(item.Channel, item.Title)
		created, err := st.CreateMicroVideo(ctx, item.ID, meta.Title, meta.Author, category, cefr, tags)
		if err != nil {
			slog.Warn("cannot create video", "id", item.ID, "err", err)
			skipped++
			continue
		}
		if err = st.PublishMicroVideo(ctx, created.ID, item.Duration); err != nil {
			slog.Warn("cannot publish video", "id", item.ID, "err", err)
			skipped++
			continue
		}
		published++
		if published%25 == 0 {
			slog.Info("video batch progress", "published", published, "skipped", skipped)
		}
	}
	slog.Info("video batch finished", "published", published, "skipped", skipped, "candidates", len(candidates))
	if published != *target {
		os.Exit(2)
	}
}

func readCandidates(paths []string) ([]candidate, error) {
	result := []candidate{}
	seen := map[string]bool{}
	for _, path := range paths {
		file, err := os.Open(strings.TrimSpace(path))
		if err != nil {
			return nil, err
		}
		scanner := bufio.NewScanner(file)
		scanner.Buffer(make([]byte, 64<<10), 4<<20)
		for scanner.Scan() {
			var item candidate
			if err = json.Unmarshal(scanner.Bytes(), &item); err != nil {
				file.Close()
				return nil, fmt.Errorf("%s: %w", path, err)
			}
			if item.ID != "" && !seen[item.ID] {
				seen[item.ID] = true
				result = append(result, item)
			}
		}
		err = scanner.Err()
		file.Close()
		if err != nil {
			return nil, err
		}
	}
	return result, nil
}

func classify(channel, title string) (string, string, []string) {
	lower := strings.ToLower(title)
	if strings.Contains(channel, "Ozbiljne") {
		category := "history"
		if strings.Contains(lower, "držav") || strings.Contains(lower, "grad") || strings.Contains(lower, "ostr") || strings.Contains(lower, "put") {
			category = "travel"
		}
		if strings.Contains(lower, "jezik") || strings.Contains(lower, "ćiril") {
			category = "language"
		}
		return category, "B1", []string{"Ozbiljne Teme", "istorija", "geografija"}
	}
	category := "news"
	if strings.Contains(lower, "klim") || strings.Contains(lower, "temperatur") || strings.Contains(lower, "zdrav") || strings.Contains(lower, "virus") {
		category = "science"
	}
	if strings.Contains(lower, "kultur") || strings.Contains(lower, "knjig") || strings.Contains(lower, "film") || strings.Contains(lower, "univerzitet") {
		category = "culture"
	}
	return category, "B2", []string{channel, "Srbija", "vesti"}
}

func fatal(err error) { slog.Error("videoload", "err", err); os.Exit(1) }
