package api

import (
	"bytes"
	"context"
	"io"
	"net/http"
	"os"
	"path/filepath"
	"strconv"
	"testing"
	"time"

	"github.com/google/uuid"

	"github.com/citavuk/server/internal/store"
)

func makeAdmin(t *testing.T, st *store.Store, email string) {
	t.Helper()
	if _, err := st.Pool.Exec(context.Background(), `UPDATE users SET is_admin = true WHERE email = $1`, email); err != nil {
		t.Fatal(err)
	}
}

func makeSupporter(t *testing.T, st *store.Store, email string) {
	t.Helper()
	ctx := context.Background()
	u, err := st.UserByEmail(ctx, email)
	if err != nil {
		t.Fatal(err)
	}
	d, err := st.CreateDonation(ctx, store.NewDonation{UserID: &u.ID, AmountKopecks: 200_00, Source: "manual"})
	if err != nil {
		t.Fatal(err)
	}
	now := time.Now()
	if _, err := st.SetDonationStatus(ctx, d.ID, "succeeded", &now); err != nil {
		t.Fatal(err)
	}
}

// putAudio шлёт часть аудио сырым телом, как это делает админка.
func putAudio(t *testing.T, c *client, id string, offset int, final bool, data []byte) (int, []byte) {
	t.Helper()
	url := c.base + "/v1/admin/supporter-library/" + id + "/audio?offset=" + strconv.Itoa(offset)
	if final {
		url += "&final=1"
	}
	req, err := http.NewRequest(http.MethodPut, url, bytes.NewReader(data))
	if err != nil {
		t.Fatal(err)
	}
	req.Header.Set("Content-Type", "audio/mpeg")
	req.Header.Set("Authorization", "Bearer "+c.token)
	resp, err := http.DefaultClient.Do(req)
	if err != nil {
		t.Fatal(err)
	}
	defer resp.Body.Close()
	raw, _ := io.ReadAll(resp.Body)
	return resp.StatusCode, raw
}

func TestSupporterLibraryAccessAndAudio(t *testing.T) {
	ts, st := testServer(t)
	admin, adminEmail := register(t, ts, st)
	makeAdmin(t, st, adminEmail)
	reader, readerEmail := register(t, ts, st)

	var book, podcast, draft store.LibraryItem
	status, raw := admin.do(http.MethodPost, "/v1/admin/supporter-library", map[string]any{
		"kind": "book", "title": "Na Drini ćuprija", "author": "Ivo Andrić", "level": "b2",
		"body": "Prvi pasus.\n\nDrugi pasus.", "published": true,
	})
	admin.mustJSON(status, raw, &book)
	if book.Level != "B2" || book.BodyChars == 0 {
		t.Fatalf("книга: %+v", book)
	}
	status, raw = admin.do(http.MethodPost, "/v1/admin/supporter-library", map[string]any{
		"kind": "podcast", "title": "Srpski uz kafu", "body": "Transkript.", "published": true,
	})
	admin.mustJSON(status, raw, &podcast)
	status, raw = admin.do(http.MethodPost, "/v1/admin/supporter-library", map[string]any{
		"kind": "book", "title": "Черновик", "published": false,
	})
	admin.mustJSON(status, raw, &draft)
	t.Cleanup(func() {
		_, _ = st.Pool.Exec(context.Background(), `DELETE FROM supporter_library_items WHERE id = ANY($1)`,
			[]uuid.UUID{book.ID, podcast.ID, draft.ID})
	})

	if status, _ := admin.do(http.MethodPost, "/v1/admin/supporter-library", map[string]any{"kind": "video", "title": "x"}); status != http.StatusBadRequest {
		t.Fatalf("неизвестный вид принят: %d", status)
	}

	// Аудио двумя частями; часть с неверным смещением отклоняется.
	first, second := bytes.Repeat([]byte("a"), 1000), bytes.Repeat([]byte("b"), 500)
	if status, raw := putAudio(t, admin, podcast.ID.String(), 0, false, first); status != http.StatusOK {
		t.Fatalf("первая часть: %d %s", status, raw)
	}
	if status, _ := putAudio(t, admin, podcast.ID.String(), 900, false, second); status != http.StatusConflict {
		t.Fatalf("неверное смещение принято: %d", status)
	}
	if status, raw := putAudio(t, admin, podcast.ID.String(), 1000, true, second); status != http.StatusOK {
		t.Fatalf("последняя часть: %d %s", status, raw)
	}

	// Обычный читатель в закрытую библиотеку не попадает.
	status, raw = reader.do(http.MethodGet, "/v1/supporter-library", nil)
	if status != http.StatusForbidden || !bytes.Contains(raw, []byte(codeSupporterOnly)) {
		t.Fatalf("читатель без поддержки: %d %s", status, raw)
	}
	if status, _ := reader.do(http.MethodGet, "/v1/supporter-library/"+book.ID.String(), nil); status != http.StatusForbidden {
		t.Fatalf("текст книги отдан без поддержки: %d", status)
	}

	makeSupporter(t, st, readerEmail)
	var list struct {
		Items []store.LibraryItem `json:"items"`
	}
	status, raw = reader.do(http.MethodGet, "/v1/supporter-library", nil)
	reader.mustJSON(status, raw, &list)
	seen := map[uuid.UUID]store.LibraryItem{}
	for _, it := range list.Items {
		seen[it.ID] = it
		if it.Body != "" {
			t.Fatal("в списке не должно быть текстов")
		}
	}
	if _, ok := seen[draft.ID]; ok {
		t.Fatal("черновик виден читателю")
	}
	if seen[podcast.ID].AudioSize != 1500 {
		t.Fatalf("размер аудио: %+v", seen[podcast.ID])
	}
	var full store.LibraryItem
	status, raw = reader.do(http.MethodGet, "/v1/supporter-library/"+book.ID.String(), nil)
	reader.mustJSON(status, raw, &full)
	if full.Body != "Prvi pasus.\n\nDrugi pasus." {
		t.Fatalf("текст книги: %q", full.Body)
	}
	if status, _ := reader.do(http.MethodGet, "/v1/supporter-library/"+draft.ID.String(), nil); status != http.StatusNotFound {
		t.Fatalf("черновик открылся: %d", status)
	}

	req, _ := http.NewRequest(http.MethodGet, ts.URL+"/v1/supporter-library/"+podcast.ID.String()+"/audio", nil)
	req.Header.Set("Authorization", "Bearer "+reader.token)
	req.Header.Set("Range", "bytes=998-1001")
	resp, err := http.DefaultClient.Do(req)
	if err != nil {
		t.Fatal(err)
	}
	part, _ := io.ReadAll(resp.Body)
	resp.Body.Close()
	if resp.StatusCode != http.StatusPartialContent || string(part) != "aabb" || resp.Header.Get("Content-Type") != "audio/mpeg" {
		t.Fatalf("Range: %d %q %s", resp.StatusCode, part, resp.Header.Get("Content-Type"))
	}

	// Удаление убирает и файл. Каталог — временный каталог теста.
	item, err := st.LibraryItem(context.Background(), podcast.ID)
	if err != nil {
		t.Fatal(err)
	}
	matches, _ := filepath.Glob(filepath.Join(os.TempDir(), "*", "*", item.AudioFile))
	if len(matches) != 1 {
		t.Fatalf("аудиофайл не найден на диске: %v", matches)
	}
	if status, _ := admin.do(http.MethodDelete, "/v1/admin/supporter-library/"+podcast.ID.String(), nil); status != http.StatusNoContent {
		t.Fatalf("удаление: %d", status)
	}
	if _, err := os.Stat(matches[0]); !os.IsNotExist(err) {
		t.Fatal("аудиофайл остался после удаления")
	}
}

func TestCaseGameOpenForDates(t *testing.T) {
	before := caseGamePublicFrom.Add(-time.Hour)
	after := caseGamePublicFrom.Add(time.Hour)
	since := time.Now()
	friend := &store.User{SupporterSince: &since}
	switch {
	case caseGameOpenFor(nil, before), caseGameOpenFor(&store.User{}, before):
		t.Fatal("до публичного дня игра закрыта для остальных")
	case !caseGameOpenFor(friend, before), !caseGameOpenFor(&store.User{IsAdmin: true}, before):
		t.Fatal("друзья и администратор играют сразу")
	case !caseGameOpenFor(nil, after), !caseGameOpenFor(&store.User{}, after):
		t.Fatal("после публичного дня игра открыта всем")
	}
}

func TestCaseGameResultsSaveOnceAndLightStreak(t *testing.T) {
	ts, st := testServer(t)
	player, email := register(t, ts, st)

	id := uuid.NewString()
	result := map[string]any{
		"id": id, "scope": "case:gen", "limitSeconds": 60, "elapsedSeconds": 60,
		"words": 12, "correct": 10, "wrong": 2, "diacriticSlips": 1, "chars": 90, "cpm": 90,
		"accuracy": 83.3, "weak": []map[string]any{{"label": "Генитив мн. ч.", "wrong": 2, "total": 5}},
	}
	status, _ := player.do(http.MethodPost, "/v1/games/cases/results", result)
	if time.Now().Before(caseGamePublicFrom) && status != http.StatusForbidden {
		t.Fatalf("до публичного дня результат обычного игрока принят: %d", status)
	}
	makeSupporter(t, st, email)

	for i := 0; i < 2; i++ { // повторная отправка той же партии — не дубль
		status, raw := player.do(http.MethodPost, "/v1/games/cases/results", result)
		if status != http.StatusOK {
			t.Fatalf("сохранение %d: %d %s", i, status, raw)
		}
	}
	var history struct {
		Results []store.CaseGameResult `json:"results"`
	}
	status, raw := player.do(http.MethodGet, "/v1/games/cases/results", nil)
	player.mustJSON(status, raw, &history)
	if len(history.Results) != 1 || history.Results[0].Correct != 10 || len(history.Results[0].Weak) != 1 {
		t.Fatalf("история: %+v", history.Results)
	}
	status, raw = player.do(http.MethodGet, "/v1/study", nil)
	if status != http.StatusOK || !bytes.Contains(raw, []byte(`"todayActive":true`)) {
		t.Fatalf("партия не зажгла серию: %d %s", status, raw)
	}

	bad := map[string]any{}
	for k, v := range result {
		bad[k] = v
	}
	bad["id"], bad["elapsedSeconds"] = uuid.NewString(), 400
	if status, _ := player.do(http.MethodPost, "/v1/games/cases/results", bad); status != http.StatusBadRequest {
		t.Fatalf("партия длиннее минуты принята: %d", status)
	}
}
