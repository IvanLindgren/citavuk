package api

import (
	"context"
	"log/slog"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"github.com/citavuk/server/internal/config"
)

// Журнал аварий заводится из slog.Error, поэтому проверяем именно то, что
// доходит до обработчика логов.
func recordLog(t *testing.T) *strings.Builder {
	t.Helper()
	var out strings.Builder
	before := slog.Default()
	slog.SetDefault(slog.New(slog.NewTextHandler(&out, &slog.HandlerOptions{Level: slog.LevelInfo})))
	t.Cleanup(func() { slog.SetDefault(before) })
	return &out
}

func TestAbortedDownloadIsNotAnIncident(t *testing.T) {
	// Слушатель закрыл вкладку посреди подкаста: ReverseProxy сообщает об этом
	// паникой ErrAbortHandler. Раньше каждый такой обрыв поднимал в админке
	// аварию со стеком на пол-экрана.
	out := recordLog(t)
	s := &Server{cfg: &config.Config{}}
	handler := s.withLogging(http.HandlerFunc(func(http.ResponseWriter, *http.Request) {
		panic(http.ErrAbortHandler)
	}))

	// Контекст оборванного запроса уже отменён — как и у настоящего слушателя,
	// закрывшего вкладку. Заодно withLogging не полезет в базу за инцидентом.
	ctx, cancel := context.WithCancel(context.Background())
	cancel()
	rec := httptest.NewRecorder()
	handler.ServeHTTP(rec, httptest.NewRequest(http.MethodGet, "/audio/proxy", nil).WithContext(ctx))

	if got := out.String(); strings.Contains(got, "level=ERROR") {
		t.Fatalf("обрыв загрузки не должен писать ошибку, а в журнале:\n%s", got)
	}
	if !strings.Contains(out.String(), "path=/audio/proxy") {
		t.Fatalf("строка запроса всё равно должна попасть в журнал:\n%s", out.String())
	}
}

func TestRealPanicStillLogged(t *testing.T) {
	out := recordLog(t)
	s := &Server{cfg: &config.Config{}}
	handler := s.withLogging(http.HandlerFunc(func(http.ResponseWriter, *http.Request) {
		panic("делить на ноль")
	}))

	// Контекст отменён намеренно: так withLogging не пойдёт заводить инцидент в
	// базу, которой у частично собранного сервера нет.
	ctx, cancel := context.WithCancel(context.Background())
	cancel()
	rec := httptest.NewRecorder()
	handler.ServeHTTP(rec, httptest.NewRequest(http.MethodGet, "/v1/books", nil).WithContext(ctx))

	if !strings.Contains(out.String(), "паника в обработчике") {
		t.Fatalf("настоящая паника обязана остаться в журнале:\n%s", out.String())
	}
	if rec.Code != http.StatusInternalServerError {
		t.Fatalf("клиенту полагается 500, получено %d", rec.Code)
	}
}
