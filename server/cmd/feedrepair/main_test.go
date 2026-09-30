package main

import (
	"context"
	"encoding/json"
	"os"
	"path/filepath"
	"strings"
	"testing"
	"time"

	"github.com/citavuk/server/internal/lexicon"
	"github.com/citavuk/server/internal/store"
	"github.com/google/uuid"
)

func fixture() (snapshot, editorial) {
	id := uuid.New()
	body := strings.TrimSpace(strings.Repeat("Српска реч описује пример и свет. ", 14))
	words := []store.DifficultWord{{Word: "реч", Lemma: "реч", TranslationRU: "слово"}, {Word: "пример", Lemma: "пример", TranslationRU: "пример"}, {Word: "свет", Lemma: "свет", TranslationRU: "мир"}}
	s := snapshot{ID: id, Kind: "fact", Category: "culture", CEFR: "B1", Tags: []string{"језик", "свет", "култура"}, TitleLatin: "Svet", TitleCyrillic: "Свет", TextCyrillic: body, TextLatin: lexicon.ToLatin(body), Words: words, UpdatedAt: time.Now().UTC()}
	p := editorial{ID: id, TitleLatin: "Srpski svet", TitleCyrillic: "Српски свет", TextCyrillic: body, TextLatin: lexicon.ToLatin(body), Words: words}
	return s, p
}

func packetFiles(t *testing.T, snapshots []snapshot, records []record) (string, string) {
	t.Helper()
	dir := t.TempDir()
	sf, rf := filepath.Join(dir, "snapshot.json"), filepath.Join(dir, "reviewed.jsonl")
	b, _ := json.Marshal(snapshots)
	if err := os.WriteFile(sf, b, 0600); err != nil {
		t.Fatal(err)
	}
	f, err := os.Create(rf)
	if err != nil {
		t.Fatal(err)
	}
	for _, r := range records {
		if err := json.NewEncoder(f).Encode(r); err != nil {
			t.Fatal(err)
		}
	}
	if err := f.Close(); err != nil {
		t.Fatal(err)
	}
	return sf, rf
}

func TestPacketRejectsMissingForeignAndInvalidIDs(t *testing.T) {
	s, p := fixture()
	other, _ := fixture()
	sf, rf := packetFiles(t, []snapshot{s, other}, []record{{ID: s.ID, OK: true, Editorial: p}})
	if _, _, err := loadPacket(sf, rf, false); err == nil {
		t.Fatal("incomplete full packet accepted")
	}
	if _, patches, err := loadPacket(sf, rf, true); err != nil || len(patches) != 1 {
		t.Fatal(err)
	}
	p.ID = other.ID
	sf, rf = packetFiles(t, []snapshot{s}, []record{{ID: s.ID, OK: true, Editorial: p}})
	if _, _, err := loadPacket(sf, rf, true); err == nil {
		t.Fatal("wrong editorial ID accepted")
	}
	p.ID = s.ID
	p.TextLatin = "Unrelated text"
	sf, rf = packetFiles(t, []snapshot{s}, []record{{ID: s.ID, OK: true, Editorial: p}})
	if _, _, err := loadPacket(sf, rf, false); err == nil {
		t.Fatal("mismatched alphabets accepted")
	}
}

func TestPublishPreservesSocialDataAndRollsBackStaleSnapshot(t *testing.T) {
	url := os.Getenv("CITAVUK_TEST_DATABASE_URL")
	if url == "" {
		t.Skip("нужна отдельная тестовая БД")
	}
	ctx := context.Background()
	st, err := store.Open(ctx, url)
	if err != nil {
		t.Fatal(err)
	}
	defer st.Close()
	if _, err := st.Migrate(ctx); err != nil {
		t.Fatal(err)
	}
	s, p := fixture()
	words, _ := json.Marshal(s.Words)
	_, err = st.Pool.Exec(ctx, `INSERT INTO micro_feed_content_items (id,status,kind,category,title_latin,title_cyrillic,text_latin,text_cyrillic,cefr,tags,difficult_words,source_url,license_code,likes_count,comments_count)
	 VALUES ($1,'published','fact','culture',$2,$3,$4,$5,'B1',$6,$7,'https://example.com/original','CC-BY-SA-4.0',5,2)`, s.ID, s.TitleLatin, s.TitleCyrillic, s.TextLatin, s.TextCyrillic, s.Tags, words)
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { _, _ = st.Pool.Exec(ctx, "DELETE FROM micro_feed_content_items WHERE id=$1", s.ID) })
	if err := st.Pool.QueryRow(ctx, "SELECT updated_at FROM micro_feed_content_items WHERE id=$1", s.ID).Scan(&s.UpdatedAt); err != nil {
		t.Fatal(err)
	}
	dir := t.TempDir()
	backup := filepath.Join(dir, "preimage.jsonl")
	count, err := publish(ctx, st, []snapshot{s}, map[uuid.UUID]editorial{s.ID: p}, backup)
	if err != nil || count != 1 {
		t.Fatalf("publish %d: %v", count, err)
	}
	var title, source, license string
	var likes, comments int
	if err := st.Pool.QueryRow(ctx, "SELECT title_latin,source_url,license_code,likes_count,comments_count FROM micro_feed_content_items WHERE id=$1", s.ID).Scan(&title, &source, &license, &likes, &comments); err != nil {
		t.Fatal(err)
	}
	if title != p.TitleLatin || likes != 5 || comments != 2 || source != "https://example.com/original" || license != "CC-BY-SA-4.0" {
		t.Fatal("social/source data changed")
	}
	if info, err := os.Stat(backup); err != nil || info.Size() == 0 {
		t.Fatal("missing preimage")
	}
	p.TitleLatin = "Overwrite"
	p.TitleCyrillic = "Перезапись"
	if _, err := publish(ctx, st, []snapshot{s}, map[uuid.UUID]editorial{s.ID: p}, filepath.Join(dir, "stale.jsonl")); err == nil {
		t.Fatal("stale snapshot accepted")
	}
	if _, err := publish(ctx, st, []snapshot{s}, map[uuid.UUID]editorial{s.ID: p}, backup); err == nil {
		t.Fatal("preimage overwrite accepted")
	}
}
