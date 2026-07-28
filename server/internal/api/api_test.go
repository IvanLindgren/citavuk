package api

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"net/http"
	"net/http/httptest"
	"os"
	"testing"
	"time"

	"github.com/citavuk/server/internal/auth"
	"github.com/citavuk/server/internal/config"
	"github.com/citavuk/server/internal/store"
	"github.com/google/uuid"
)

type testMailer struct {
	store *store.Store
}

func (m *testMailer) Enabled() bool { return true }

func (m *testMailer) SendVerification(
	ctx context.Context,
	_, _ string,
	token string,
) error {
	_, err := m.store.VerifyEmailToken(ctx, auth.HashToken(token))
	return err
}

// testServer поднимает настоящий HTTP-сервер поверх настоящей базы.
// Без базы тест пропускается.
func testServer(t *testing.T) (*httptest.Server, *store.Store) {
	t.Helper()

	url := os.Getenv("CITAVUK_TEST_DATABASE_URL")
	if url == "" {
		if cfg, err := config.Load("../../../.env"); err == nil {
			url = cfg.DatabaseURL
		}
	}
	if url == "" {
		t.Skip("нет строки подключения к PostgreSQL — тест пропущен")
	}

	ctx, cancel := context.WithTimeout(context.Background(), 30*time.Second)
	defer cancel()
	st, err := store.Open(ctx, url)
	if err != nil {
		t.Skipf("PostgreSQL недоступен: %v", err)
	}
	if _, err := st.Migrate(ctx); err != nil {
		t.Fatal(err)
	}
	t.Cleanup(st.Close)

	cfg := &config.Config{
		Addr:           "127.0.0.1:0",
		SessionTTLDays: 30,
		MaxBookBytes:   4 << 20,
		AllowedOrigins: []string{"https://citavuk.ru"},
		// Переводчик и верхний сервис в тестах не нужны: они ходят в сеть.
		UpstreamURL: "",
	}
	srv, err := New(cfg, st)
	if err != nil {
		t.Fatal(err)
	}
	srv.mailer = &testMailer{store: st}
	t.Cleanup(srv.Close)

	ts := httptest.NewServer(srv.Handler())
	t.Cleanup(ts.Close)
	return ts, st
}

// client — минимальный клиент к тестовому серверу.
type client struct {
	t     *testing.T
	base  string
	token string
}

func (c *client) do(method, path string, body any) (int, []byte) {
	c.t.Helper()

	var reader *bytes.Reader
	if body != nil {
		raw, err := json.Marshal(body)
		if err != nil {
			c.t.Fatal(err)
		}
		reader = bytes.NewReader(raw)
	} else {
		reader = bytes.NewReader(nil)
	}

	req, err := http.NewRequest(method, c.base+path, reader)
	if err != nil {
		c.t.Fatal(err)
	}
	req.Header.Set("Content-Type", "application/json")
	if c.token != "" {
		req.Header.Set("Authorization", "Bearer "+c.token)
	}

	resp, err := http.DefaultClient.Do(req)
	if err != nil {
		c.t.Fatal(err)
	}
	defer resp.Body.Close()

	out := new(bytes.Buffer)
	_, _ = out.ReadFrom(resp.Body)
	return resp.StatusCode, out.Bytes()
}

func (c *client) mustJSON(status int, raw []byte, dst any) {
	c.t.Helper()
	if status < 200 || status >= 300 {
		c.t.Fatalf("статус %d, тело: %s", status, raw)
	}
	if err := json.Unmarshal(raw, dst); err != nil {
		c.t.Fatalf("не разобран ответ %s: %v", raw, err)
	}
}

func newEmail() string {
	return fmt.Sprintf("api-%s@citavuk.invalid", uuid.NewString())
}

// register заводит аккаунт и возвращает клиента с токеном.
func register(t *testing.T, ts *httptest.Server, st *store.Store) (*client, string) {
	t.Helper()
	c := &client{t: t, base: ts.URL}
	email := newEmail()

	status, raw := c.do(http.MethodPost, "/v1/auth/register", map[string]any{
		"email":       email,
		"password":    "надёжный-пароль-1",
		"displayName": "Денис",
		"device":      map[string]string{"id": "dev-1", "name": "Ноутбук", "platform": "windows"},
	})
	var registered registrationResponse
	c.mustJSON(status, raw, &registered)
	if !registered.VerificationRequired || registered.Email != email {
		t.Fatalf("неверный ответ регистрации: %+v", registered)
	}

	status, raw = c.do(http.MethodPost, "/v1/auth/login", map[string]any{
		"email": email, "password": "надёжный-пароль-1",
		"device": map[string]string{
			"id": "dev-1", "name": "Ноутбук", "platform": "windows",
		},
	})
	var res authResponse
	c.mustJSON(status, raw, &res)
	c.token = res.Token

	t.Cleanup(func() {
		_, _ = st.Pool.Exec(context.Background(), `DELETE FROM users WHERE email = $1`, email)
	})
	return c, email
}

func TestHealth(t *testing.T) {
	ts, _ := testServer(t)
	c := &client{t: t, base: ts.URL}

	status, raw := c.do(http.MethodGet, "/health", nil)
	var res healthResponse
	c.mustJSON(status, raw, &res)

	if res.Status != "ok" || !res.Database {
		t.Errorf("сервер нездоров: %+v", res)
	}
}

func TestRegisterLoginAndMe(t *testing.T) {
	ts, st := testServer(t)
	c, email := register(t, ts, st)

	if c.token == "" {
		t.Fatal("вход после подтверждения не выдал токен")
	}

	status, raw := c.do(http.MethodGet, "/v1/auth/me", nil)
	var me userView
	c.mustJSON(status, raw, &me)
	if me.Email != email {
		t.Errorf("почта = %q, ожидалась %q", me.Email, email)
	}
	if me.DisplayName != "Денис" {
		t.Errorf("имя = %q", me.DisplayName)
	}
	if !me.HasPassword {
		t.Error("аккаунт с паролем помечен как беспарольный")
	}

	// Повторный вход тем же паролем выдаёт новую действующую сессию.
	fresh := &client{t: t, base: ts.URL}
	status, raw = fresh.do(http.MethodPost, "/v1/auth/login", map[string]any{
		"email": email, "password": "надёжный-пароль-1",
	})
	var login authResponse
	fresh.mustJSON(status, raw, &login)
	if login.Token == c.token {
		t.Error("повторный вход выдал тот же токен")
	}
}

func TestRegisterRejectsDuplicateEmail(t *testing.T) {
	ts, st := testServer(t)
	_, email := register(t, ts, st)

	c := &client{t: t, base: ts.URL}
	status, _ := c.do(http.MethodPost, "/v1/auth/register", map[string]any{
		"email": email, "password": "другой-пароль-9",
	})
	if status != http.StatusConflict {
		t.Errorf("повторная регистрация вернула %d, ожидался 409", status)
	}
}

// Ответ на неверный пароль не должен отличаться от ответа на несуществующий
// адрес: иначе перебором узнают, кто зарегистрирован.
func TestLoginDoesNotRevealAccountExistence(t *testing.T) {
	ts, st := testServer(t)
	_, email := register(t, ts, st)
	c := &client{t: t, base: ts.URL}

	wrongPass, bodyA := c.do(http.MethodPost, "/v1/auth/login", map[string]any{
		"email": email, "password": "неверный-пароль-1",
	})
	noSuchUser, bodyB := c.do(http.MethodPost, "/v1/auth/login", map[string]any{
		"email": newEmail(), "password": "неверный-пароль-1",
	})

	if wrongPass != noSuchUser {
		t.Errorf("разные статусы: %d против %d", wrongPass, noSuchUser)
	}
	if string(bodyA) != string(bodyB) {
		t.Errorf("разные тела ответа:\n%s\n%s", bodyA, bodyB)
	}
}

func TestRegisterValidatesInput(t *testing.T) {
	ts, _ := testServer(t)
	c := &client{t: t, base: ts.URL}

	cases := []struct {
		name  string
		email string
		pass  string
	}{
		{"без собаки", "не-почта", "нормальный-пароль"},
		{"пустая почта", "", "нормальный-пароль"},
		{"домен без точки", "a@localhost", "нормальный-пароль"},
		{"короткий пароль", newEmail(), "1234567"},
		{"пустой пароль", newEmail(), ""},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			status, _ := c.do(http.MethodPost, "/v1/auth/register", map[string]any{
				"email": tc.email, "password": tc.pass,
			})
			if status != http.StatusBadRequest {
				t.Errorf("статус %d, ожидался 400", status)
			}
		})
	}
}

func TestProtectedRoutesRequireToken(t *testing.T) {
	ts, _ := testServer(t)

	paths := []struct{ method, path string }{
		{http.MethodGet, "/v1/auth/me"},
		{http.MethodGet, "/v1/sync/changes"},
		{http.MethodPost, "/v1/sync/push"},
		{http.MethodGet, "/v1/sync/content/" + fmt.Sprintf("%064d", 1)},
		{http.MethodGet, "/v1/course/progress/serbian-grammar"},
	}
	for _, p := range paths {
		t.Run(p.path, func(t *testing.T) {
			anon := &client{t: t, base: ts.URL}
			if status, _ := anon.do(p.method, p.path, map[string]any{}); status != http.StatusUnauthorized {
				t.Errorf("без токена статус %d, ожидался 401", status)
			}
			bad := &client{t: t, base: ts.URL, token: "ctv_поддельный-токен"}
			if status, _ := bad.do(p.method, p.path, map[string]any{}); status != http.StatusUnauthorized {
				t.Errorf("с поддельным токеном статус %d, ожидался 401", status)
			}
		})
	}
}

func TestAdminCourseLifecycle(t *testing.T) {
	ts, st := testServer(t)
	admin, email := register(t, ts, st)

	if status, _ := admin.do(http.MethodGet, "/v1/admin/overview", nil); status != http.StatusForbidden {
		t.Fatalf("обычный пользователь получил админку: статус %d", status)
	}
	if _, err := st.Pool.Exec(
		context.Background(),
		`UPDATE users SET is_admin = true WHERE email = $1`,
		email,
	); err != nil {
		t.Fatal(err)
	}

	status, raw := admin.do(http.MethodGet, "/v1/admin/overview", nil)
	var overview store.AdminOverview
	admin.mustJSON(status, raw, &overview)
	if overview.Users < 1 {
		t.Fatalf("админская статистика не видит пользователей: %+v", overview)
	}
	for _, endpoint := range []string{"/v1/admin/incidents", "/v1/admin/courses"} {
		status, raw = admin.do(http.MethodGet, endpoint, nil)
		if status != http.StatusOK {
			t.Fatalf("%s вернул статус %d: %s", endpoint, status, raw)
		}
		if bytes.Contains(raw, []byte(`"items":null`)) {
			t.Fatalf("%s вернул null вместо пустого списка: %s", endpoint, raw)
		}
	}

	courseID := "test-" + uuid.NewString()
	public := &client{t: t, base: ts.URL}
	status, raw = public.do(
		http.MethodGet,
		"/v1/course/bundle/"+courseID,
		nil,
	)
	if status != http.StatusNoContent || len(raw) != 0 {
		t.Fatalf("неопубликованный курс: статус %d, тело %s", status, raw)
	}
	t.Cleanup(func() {
		_, _ = st.Pool.Exec(
			context.Background(),
			`DELETE FROM course_releases WHERE course_id = $1`,
			courseID,
		)
	})
	bundle := map[string]any{
		"courseId":      courseID,
		"courseVersion": "1.0.0",
		"title":         "Тестовый курс",
		"config": map[string]any{
			"passThreshold":     0.8,
			"acceptBothScripts": false,
		},
		"units": []map[string]any{{
			"id": "unit", "title": "Раздел", "description": "",
			"skills": []map[string]any{{
				"id": "skill", "title": "Тема", "objectives": []any{},
				"lessons": []map[string]any{{
					"id": "lesson", "title": "Урок", "exercises": []map[string]any{{
						"id": "exercise", "type": "multiple_choice",
					}},
				}},
			}},
		}},
	}

	status, raw = admin.do(http.MethodPost, "/v1/admin/courses", map[string]any{
		"bundle": bundle,
	})
	var created store.CourseRelease
	admin.mustJSON(status, raw, &created)
	if created.Status != "draft" || created.ID == uuid.Nil {
		t.Fatalf("получен неверный черновик: %+v", created)
	}

	status, raw = admin.do(
		http.MethodPost,
		"/v1/admin/courses/"+created.ID.String()+"/publish",
		nil,
	)
	var published store.CourseRelease
	admin.mustJSON(status, raw, &published)
	if published.Status != "published" {
		t.Fatalf("курс не опубликован: %+v", published)
	}

	status, raw = public.do(
		http.MethodGet,
		"/v1/course/bundle/"+courseID,
		nil,
	)
	var got map[string]any
	public.mustJSON(status, raw, &got)
	if got["courseId"] != courseID || got["contentChecksum"] == "" {
		t.Fatalf("публичный bundle повреждён: %s", raw)
	}
}

func TestCourseProgressRoundTrip(t *testing.T) {
	ts, st := testServer(t)
	first, email := register(t, ts, st)

	second := &client{t: t, base: ts.URL}
	status, raw := second.do(http.MethodPost, "/v1/auth/login", map[string]any{
		"email": email, "password": "надёжный-пароль-1",
	})
	var login authResponse
	second.mustJSON(status, raw, &login)
	second.token = login.Token

	updated := time.Now().UTC().Truncate(time.Millisecond)
	payload := map[string]any{
		"courseId": "serbian-grammar",
		"xp":       70,
		"lessons": map[string]any{
			"l_pismo_1": map[string]any{"status": "completed", "bestScore": 0.9},
		},
	}
	status, raw = first.do(http.MethodPut, "/v1/course/progress/serbian-grammar", map[string]any{
		"payload": payload, "updatedAt": updated,
	})
	var saved struct {
		Applied bool `json:"applied"`
	}
	first.mustJSON(status, raw, &saved)
	if !saved.Applied {
		t.Fatal("первое сохранение прогресса не применилось")
	}

	status, raw = second.do(http.MethodGet, "/v1/course/progress/serbian-grammar", nil)
	var got store.CourseProgress
	second.mustJSON(status, raw, &got)
	if got.CourseID != "serbian-grammar" {
		t.Fatalf("получен другой курс: %q", got.CourseID)
	}
	var decoded map[string]any
	if err := json.Unmarshal(got.Payload, &decoded); err != nil {
		t.Fatal(err)
	}
	if decoded["xp"] != float64(70) {
		t.Fatalf("xp = %#v", decoded["xp"])
	}

	// Более старое устройство не должно откатить прогресс.
	status, raw = second.do(http.MethodPut, "/v1/course/progress/serbian-grammar", map[string]any{
		"payload":   map[string]any{"courseId": "serbian-grammar", "xp": 1},
		"updatedAt": updated.Add(-time.Hour),
	})
	second.mustJSON(status, raw, &saved)
	if saved.Applied {
		t.Error("устаревший прогресс был применён")
	}
}

func TestLogoutInvalidatesToken(t *testing.T) {
	ts, st := testServer(t)
	c, _ := register(t, ts, st)

	if status, raw := c.do(http.MethodPost, "/v1/auth/logout", nil); status != http.StatusOK {
		t.Fatalf("выход вернул %d: %s", status, raw)
	}
	if status, _ := c.do(http.MethodGet, "/v1/auth/me", nil); status != http.StatusUnauthorized {
		t.Errorf("после выхода токен всё ещё действует: статус %d", status)
	}
}

// Сквозной сценарий двух устройств: одно записало книгу и слово, второе их
// получило.
func TestSyncBetweenTwoDevices(t *testing.T) {
	ts, st := testServer(t)
	first, email := register(t, ts, st)

	// Второе устройство входит в тот же аккаунт.
	second := &client{t: t, base: ts.URL}
	status, raw := second.do(http.MethodPost, "/v1/auth/login", map[string]any{
		"email": email, "password": "надёжный-пароль-1",
		"device": map[string]string{"id": "dev-2", "name": "Телефон", "platform": "android"},
	})
	var login authResponse
	second.mustJSON(status, raw, &login)
	second.token = login.Token

	bookID := uuid.NewString()
	vocabID := uuid.NewString()
	palaceID := uuid.NewString()
	now := time.Now().UTC()

	status, raw = first.do(http.MethodPost, "/v1/sync/push", map[string]any{
		"books": []map[string]any{{
			"id": bookID, "title": "Мали принц", "folder": "Књиге",
			"paraCount": 120, "lastPara": 7, "updatedAt": now,
		}},
		"vocabulary": []map[string]any{{
			"id": vocabID, "bookId": bookID, "word": "кућа", "lemma": "кућа",
			"pos": "NOUN", "translation": "дом", "updatedAt": now,
		}},
		"palaces": []map[string]any{{
			"id": palaceID, "name": "Кухня бабушки", "sceneId": "kuhinja",
			"pins": map[string]any{
				"prozor": map[string]any{"word": "прозор", "translation": "окно", "vocabId": ""},
				"sto":    map[string]any{"word": "сто", "translation": "стол", "vocabId": vocabID},
			},
			"updatedAt": now,
		}},
	})
	var push pushResponse
	first.mustJSON(status, raw, &push)
	if push.Rev <= 0 {
		t.Fatalf("push вернул ревизию %d", push.Rev)
	}

	status, raw = second.do(http.MethodGet, "/v1/sync/changes?since=0", nil)
	var pull store.PullResult
	second.mustJSON(status, raw, &pull)

	if len(pull.Books) != 1 || pull.Books[0].Title != "Мали принц" {
		t.Fatalf("второе устройство не получило книгу: %+v", pull.Books)
	}
	if len(pull.Vocabulary) != 1 || pull.Vocabulary[0].Word != "кућа" {
		t.Fatalf("второе устройство не получило слово: %+v", pull.Vocabulary)
	}
	if len(pull.Palaces) != 1 || pull.Palaces[0].Name != "Кухня бабушки" {
		t.Fatalf("второе устройство не получило дворец: %+v", pull.Palaces)
	}
	// Развеска обязана дойти целиком: это и есть содержимое дворца, без неё
	// приезжает пустая комната.
	pins := pull.Palaces[0].Pins
	if len(pins) != 2 || pins["prozor"].Word != "прозор" || pins["sto"].VocabID != vocabID {
		t.Fatalf("развеска дошла не полностью: %+v", pins)
	}
	if pull.Rev != push.Rev {
		t.Errorf("курсор %d, ожидался %d", pull.Rev, push.Rev)
	}
}

// Текст книги: выгрузка, повторная выгрузка того же содержимого и скачивание.
func TestBookContentRoundTrip(t *testing.T) {
	ts, st := testServer(t)
	c, _ := register(t, ts, st)

	paragraphs := []string{
		"Ово је прва глава књиге.",
		"Čitao sam je celu noć — bila je divna.",
		"Услов a < b & c > d остаје важећи.",
	}
	sha, _, err := store.ContentSHA(paragraphs)
	if err != nil {
		t.Fatal(err)
	}

	status, raw := c.do(http.MethodPut, "/v1/sync/content/"+sha, paragraphs)
	var put struct{ Stored, Existed bool }
	c.mustJSON(status, raw, &put)
	if !put.Stored || put.Existed {
		t.Errorf("первая выгрузка: stored=%v existed=%v", put.Stored, put.Existed)
	}

	// Повторная выгрузка того же текста не должна создавать вторую копию.
	status, raw = c.do(http.MethodPut, "/v1/sync/content/"+sha, paragraphs)
	c.mustJSON(status, raw, &put)
	if !put.Existed {
		t.Error("повторная выгрузка не распознана как уже имеющаяся")
	}

	status, raw = c.do(http.MethodGet, "/v1/sync/content/"+sha, nil)
	var got []string
	c.mustJSON(status, raw, &got)
	if len(got) != len(paragraphs) {
		t.Fatalf("получено %d абзацев, ожидалось %d", len(got), len(paragraphs))
	}
	for i := range got {
		if got[i] != paragraphs[i] {
			t.Errorf("абзац %d исказился:\n  получено: %q\n  ожидалось: %q", i, got[i], paragraphs[i])
		}
	}
}

// Подмена содержимого под чужим адресом обязана отвергаться: иначе одно
// устройство подменило бы книгу на всех остальных.
func TestContentRejectsMismatchedHash(t *testing.T) {
	ts, st := testServer(t)
	c, _ := register(t, ts, st)

	honest := []string{"Честный текст."}
	sha, _, err := store.ContentSHA(honest)
	if err != nil {
		t.Fatal(err)
	}

	status, _ := c.do(http.MethodPut, "/v1/sync/content/"+sha, []string{"Подменённый текст."})
	if status != http.StatusBadRequest {
		t.Errorf("подмена содержимого принята со статусом %d", status)
	}
}

func TestContentNotFound(t *testing.T) {
	ts, st := testServer(t)
	c, _ := register(t, ts, st)

	status, _ := c.do(http.MethodGet, "/v1/sync/content/"+fmt.Sprintf("%064d", 7), nil)
	if status != http.StatusNotFound {
		t.Errorf("статус %d, ожидался 404", status)
	}
}

// Чужой текст не должен отдаваться даже при известном адресе.
func TestContentIsolatedBetweenUsers(t *testing.T) {
	ts, st := testServer(t)
	owner, _ := register(t, ts, st)
	stranger, _ := register(t, ts, st)

	paragraphs := []string{"Личный текст пользователя."}
	sha, _, err := store.ContentSHA(paragraphs)
	if err != nil {
		t.Fatal(err)
	}
	if status, raw := owner.do(http.MethodPut, "/v1/sync/content/"+sha, paragraphs); status != http.StatusOK {
		t.Fatalf("выгрузка не удалась: %d %s", status, raw)
	}

	if status, _ := stranger.do(http.MethodGet, "/v1/sync/content/"+sha, nil); status != http.StatusNotFound {
		t.Errorf("чужой текст отдан со статусом %d", status)
	}
}

func TestChangePasswordEndsOtherSessions(t *testing.T) {
	ts, st := testServer(t)
	first, email := register(t, ts, st)

	second := &client{t: t, base: ts.URL}
	status, raw := second.do(http.MethodPost, "/v1/auth/login", map[string]any{
		"email": email, "password": "надёжный-пароль-1",
	})
	var login authResponse
	second.mustJSON(status, raw, &login)
	second.token = login.Token

	status, raw = first.do(http.MethodPost, "/v1/auth/password", map[string]any{
		"currentPassword": "надёжный-пароль-1",
		"newPassword":     "новый-пароль-2026",
	})
	var changed authResponse
	first.mustJSON(status, raw, &changed)

	// Старая сессия второго устройства обязана перестать работать.
	if status, _ := second.do(http.MethodGet, "/v1/auth/me", nil); status != http.StatusUnauthorized {
		t.Errorf("чужая сессия пережила смену пароля: статус %d", status)
	}
	// А выданная взамен — работать.
	first.token = changed.Token
	if status, _ := first.do(http.MethodGet, "/v1/auth/me", nil); status != http.StatusOK {
		t.Errorf("новая сессия недействительна: статус %d", status)
	}
	// Старый пароль больше не подходит.
	anon := &client{t: t, base: ts.URL}
	if status, _ := anon.do(http.MethodPost, "/v1/auth/login", map[string]any{
		"email": email, "password": "надёжный-пароль-1",
	}); status != http.StatusUnauthorized {
		t.Errorf("вход по старому паролю вернул %d", status)
	}
}

func TestChangePasswordRequiresCurrent(t *testing.T) {
	ts, st := testServer(t)
	c, _ := register(t, ts, st)

	status, _ := c.do(http.MethodPost, "/v1/auth/password", map[string]any{
		"currentPassword": "не-тот-пароль",
		"newPassword":     "новый-пароль-2026",
	})
	if status != http.StatusUnauthorized {
		t.Errorf("смена пароля без верного текущего вернула %d", status)
	}
}

func TestCORSAllowsOnlyKnownOrigins(t *testing.T) {
	ts, _ := testServer(t)

	req, _ := http.NewRequest(http.MethodOptions, ts.URL+"/v1/auth/login", nil)
	req.Header.Set("Origin", "https://citavuk.ru")
	resp, err := http.DefaultClient.Do(req)
	if err != nil {
		t.Fatal(err)
	}
	resp.Body.Close()
	if got := resp.Header.Get("Access-Control-Allow-Origin"); got != "https://citavuk.ru" {
		t.Errorf("свой origin не разрешён: %q", got)
	}

	req, _ = http.NewRequest(http.MethodOptions, ts.URL+"/v1/auth/login", nil)
	req.Header.Set("Origin", "https://зловред.example")
	resp, err = http.DefaultClient.Do(req)
	if err != nil {
		t.Fatal(err)
	}
	resp.Body.Close()
	if got := resp.Header.Get("Access-Control-Allow-Origin"); got != "" {
		t.Errorf("чужой origin разрешён: %q", got)
	}
}

func TestUnknownPathIsNotProxiedWithoutUpstream(t *testing.T) {
	ts, _ := testServer(t)
	c := &client{t: t, base: ts.URL}

	if status, _ := c.do(http.MethodGet, "/такого-нет", nil); status != http.StatusNotFound {
		t.Errorf("статус %d, ожидался 404", status)
	}
}
