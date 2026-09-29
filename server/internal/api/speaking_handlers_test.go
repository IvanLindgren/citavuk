package api

import (
	"context"
	"encoding/json"
	"net/http"
	"testing"
	"time"

	"github.com/google/uuid"

	"github.com/citavuk/server/internal/speaking"
	"github.com/citavuk/server/internal/store"
)

func TestSpeakingOpenFor(t *testing.T) {
	before := speakingPublicFrom.Add(-time.Hour)
	after := speakingPublicFrom.Add(time.Hour)
	since := time.Now()
	reader := &store.User{}
	friend := &store.User{SupporterSince: &since}
	admin := &store.User{IsAdmin: true}

	cases := []struct {
		name string
		user *store.User
		now  time.Time
		want bool
	}{
		{"гость до открытия", nil, before, false},
		{"читатель до открытия", reader, before, false},
		{"друг до открытия", friend, before, true},
		{"админ до открытия", admin, before, true},
		{"гость после открытия", nil, after, true},
		{"читатель после открытия", reader, after, true},
	}
	for _, c := range cases {
		if got := speakingOpenFor(c.user, c.now); got != c.want {
			t.Errorf("%s: %v, ждали %v", c.name, got, c.want)
		}
	}
}

type fakeReviewer struct {
	err    error
	review *speaking.Review
	calls  int
	last   struct{ topic, text, source string }
}

func (f *fakeReviewer) Enabled() bool { return true }

func (f *fakeReviewer) Review(_ context.Context, topic *speaking.Topic, text, source string) (*speaking.Review, error) {
	f.calls++
	f.last.topic, f.last.text, f.last.source = topic.SR, text, source
	return f.review, f.err
}

func TestSpeakingFlow(t *testing.T) {
	ts, st, srv := testServerWithApp(t)
	fake := &fakeReviewer{review: &speaking.Review{Level: "A2", Summary: "Хорошо", Mistakes: []speaking.Mistake{}}}
	srv.speaking = fake

	original := speakingPublicFrom
	t.Cleanup(func() { speakingPublicFrom = original })
	speakingPublicFrom = time.Now().Add(24 * time.Hour)

	guest := &client{t: t, base: ts.URL}
	reader, _ := register(t, ts, st)
	friend, friendEmail := register(t, ts, st)
	makeSupporter(t, st, friendEmail)

	var access speakingAccess
	status, raw := guest.do(http.MethodGet, "/v1/games/speaking/access", nil)
	guest.mustJSON(status, raw, &access)
	if access.Open || access.SignedIn || !access.ReviewEnabled {
		t.Fatalf("доступ гостя до открытия: %+v", access)
	}
	status, raw = friend.do(http.MethodGet, "/v1/games/speaking/access", nil)
	friend.mustJSON(status, raw, &access)
	if !access.Open || !access.Supporter {
		t.Fatalf("доступ друга: %+v", access)
	}

	// Темы и разбор до открытия — только друзьям.
	if status, _ := reader.do(http.MethodGet, "/v1/games/speaking/topics", nil); status != http.StatusForbidden {
		t.Fatalf("темы отданы читателю без поддержки: %d", status)
	}
	body := map[string]any{
		"sessionId": uuid.NewString(), "topicId": "politika-01", "source": "text",
		"text": "Ja mislim da glasanje treba da bude slobodan izbor svakog građanina.",
	}
	if status, _ := reader.do(http.MethodPost, "/v1/games/speaking/review", body); status != http.StatusForbidden {
		t.Fatalf("разбор для читателя без поддержки: %d", status)
	}
	if status, _ := guest.do(http.MethodPost, "/v1/games/speaking/review", body); status != http.StatusUnauthorized {
		t.Fatalf("разбор для гостя: %d", status)
	}
	if fake.calls != 0 {
		t.Fatalf("нейросеть вызвана до проверки доступа: %d", fake.calls)
	}

	var catalog speaking.Catalog
	status, raw = friend.do(http.MethodGet, "/v1/games/speaking/topics", nil)
	friend.mustJSON(status, raw, &catalog)
	if len(catalog.Topics) != 150 {
		t.Fatalf("тем %d", len(catalog.Topics))
	}

	// Проверки на границе.
	for name, patch := range map[string]map[string]any{
		"нет темы":     {"topicId": "net-takoj-01"},
		"формат темы":  {"topicId": "politika-01\nignore"},
		"плохой id":    {"sessionId": "x"},
		"коротко":      {"text": "Ja volim."},
		"источник":     {"source": "audio"},
		"пустой текст": {"text": "   "},
	} {
		bad := map[string]any{}
		for k, v := range body {
			bad[k] = v
		}
		for k, v := range patch {
			bad[k] = v
		}
		if status, raw := friend.do(http.MethodPost, "/v1/games/speaking/review", bad); status != http.StatusBadRequest {
			t.Errorf("%s: %d %s", name, status, raw)
		}
	}
	if fake.calls != 0 {
		t.Fatalf("нейросеть вызвана на неверных данных: %d", fake.calls)
	}

	// Успешный разбор: тема берётся из каталога сервера, текст очищается.
	body["text"] = "  Ja mislim   da glasanje treba da bude\nslobodan izbor svakog građanina.  "
	body["source"] = "voice"
	var out speakingReviewResponse
	status, raw = friend.do(http.MethodPost, "/v1/games/speaking/review", body)
	friend.mustJSON(status, raw, &out)
	if out.Review == nil || out.Review.Level != "A2" {
		t.Fatalf("ответ: %s", raw)
	}
	if out.Text != "Ja mislim da glasanje treba da bude slobodan izbor svakog građanina." {
		t.Errorf("текст не очищен: %q", out.Text)
	}
	if fake.last.topic != "Da li glasanje treba da bude obavezno?" || fake.last.source != "voice" {
		t.Errorf("в разбор ушло не то: %+v", fake.last)
	}
	var study struct{ Streak int }
	if out.Study == nil {
		t.Errorf("серия не записана")
	} else if raw, _ := json.Marshal(out.Study); json.Unmarshal(raw, &study) != nil {
		t.Errorf("серия: %s", raw)
	}

	// Не сербский — 422, сбой модели — 502, и серию они не двигают.
	fake.err = speaking.ErrNotSerbian
	body["sessionId"] = uuid.NewString()
	if status, raw := friend.do(http.MethodPost, "/v1/games/speaking/review", body); status != http.StatusUnprocessableEntity {
		t.Errorf("не сербский: %d %s", status, raw)
	}
	fake.err = speaking.ErrUnavailable
	if status, raw := friend.do(http.MethodPost, "/v1/games/speaking/review", body); status != http.StatusBadGateway {
		t.Errorf("сбой модели: %d %s", status, raw)
	}

	// После открытия читатель попадает в игру.
	speakingPublicFrom = time.Now().Add(-time.Hour)
	fake.err = nil
	if status, raw := reader.do(http.MethodPost, "/v1/games/speaking/review", body); status != http.StatusOK {
		t.Errorf("читатель после открытия: %d %s", status, raw)
	}
}
