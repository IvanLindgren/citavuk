package news

import (
	"context"
	"os"
	"testing"
	"time"
)

// Живой номер из настоящих лент. Запуск: CITAVUK_NETWORK_TESTS=1.
func TestLiveIssue(t *testing.T) {
	if os.Getenv("CITAVUK_NETWORK_TESTS") != "1" {
		t.Skip("сетевой тест: CITAVUK_NETWORK_TESTS=1")
	}
	service := New()
	ctx, cancel := context.WithTimeout(context.Background(), time.Minute)
	defer cancel()
	issue, err := service.Issue(ctx, false)
	if err != nil {
		t.Fatal(err)
	}
	for _, page := range issue.Sections {
		images, videos := 0, 0
		for _, story := range page.Stories {
			if story.Image != "" {
				images++
			}
			if story.Video != nil {
				videos++
			}
		}
		t.Logf("%s: %d заметок, картинок %d, видео %d; передовица: %s", page.Title, len(page.Stories), images, videos, page.Stories[0].Title)
		article, err := service.Article(ctx, page.Stories[0].Link)
		if err != nil {
			t.Errorf("  %s: %v", page.Stories[0].Link, err)
			continue
		}
		kinds := map[string]int{}
		for _, block := range article.Blocks {
			kinds[block.Kind]++
		}
		first := ""
		for _, block := range article.Blocks {
			if block.Kind == "p" {
				first = block.Text
				break
			}
		}
		if len([]rune(first)) > 120 {
			first = string([]rune(first)[:120])
		}
		t.Logf("  заметка %s: %v; «%s»", article.Source, kinds, first)
	}
	videos := service.Videos(ctx, []string{"kuhinja", "istorija"})
	if len(videos) == 0 {
		t.Fatal("роликов нет")
	}
	t.Logf("роликов: %d, первый: %s — %s", len(videos), videos[0].Channel, videos[0].Title)
}
