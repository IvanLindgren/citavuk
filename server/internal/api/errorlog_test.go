package api

import (
	"context"
	"log/slog"
	"testing"
	"time"
)

func TestRecentErrorsKeepsLastOnes(t *testing.T) {
	ring := newRecentErrors(3)
	for i := range 5 {
		ring.add(ErrorEvent{Path: "/p" + string(rune('0'+i)), Status: 500})
	}
	got := ring.list(0)
	if len(got) != 3 {
		t.Fatalf("кольцо на три записи вернуло %d", len(got))
	}
	// Свежие идут первыми: админ смотрит журнал сверху.
	if got[0].Path != "/p4" || got[2].Path != "/p2" {
		t.Fatalf("порядок нарушен: %s … %s", got[0].Path, got[2].Path)
	}
}

func TestRecentErrorsGroupsByPath(t *testing.T) {
	ring := newRecentErrors(10)
	ring.add(ErrorEvent{Method: "GET", Path: "/a", Status: 404, Message: "нет"})
	ring.add(ErrorEvent{Method: "GET", Path: "/b", Status: 500})
	ring.add(ErrorEvent{Method: "GET", Path: "/a", Status: 500})

	paths := ring.byPath()
	if len(paths) != 2 {
		t.Fatalf("ожидались две ручки, получено %d", len(paths))
	}
	if paths[0].Path != "/a" || paths[0].Count != 2 {
		t.Fatalf("самая шумная ручка не первая: %+v", paths[0])
	}
	// Худший код — чтобы отличить «сыплет 404» от «падает».
	if paths[0].Worst != 500 {
		t.Fatalf("худший код посчитан неверно: %d", paths[0].Worst)
	}
}

func TestErrorTextTakesMessage(t *testing.T) {
	if got := errorText([]byte(`{"code":"bad_request","message":"Комната занята."}`)); got != "Комната занята." {
		t.Fatalf("сообщение не разобрано: %q", got)
	}
	// Не-JSON тоже показывается: лучше кусок текста, чем пустая строка.
	if got := errorText([]byte("upstream is down")); got != "upstream is down" {
		t.Fatalf("простой текст потерян: %q", got)
	}
	if got := errorText(nil); got != "" {
		t.Fatalf("пустое тело дало %q", got)
	}
}

func TestIncidentLoggerHushesRepeats(t *testing.T) {
	logger := NewIncidentLogger(slog.NewTextHandler(discard{}, nil), nil)
	if !logger.allow("log:одно и то же") {
		t.Fatal("первая ошибка обязана дойти до журнала")
	}
	if logger.allow("log:одно и то же") {
		t.Fatal("повтор в ту же секунду не должен писаться в базу")
	}
	if !logger.allow("log:другая") {
		t.Fatal("другая ошибка не связана с первой")
	}
	// Через паузу та же ошибка снова попадает в журнал: иначе после починки
	// не видно, что она вернулась.
	logger.quiet.last["log:одно и то же"] = time.Now().Add(-2 * SameSpanQuiet)
	if !logger.allow("log:одно и то же") {
		t.Fatal("после паузы ошибка должна записаться заново")
	}
}

func TestIncidentLoggerSharesQuietWithChildren(t *testing.T) {
	// slog.With порождает копию обработчика. Со своим глушителем у каждой
	// копии повторы не глушились бы вовсе, а общая карта с разными замками
	// была бы гонкой.
	logger := NewIncidentLogger(slog.NewTextHandler(discard{}, nil), nil)
	child, ok := logger.WithAttrs([]slog.Attr{slog.String("часть", "матч")}).(*IncidentLogger)
	if !ok {
		t.Fatal("производный обработчик потерял тип")
	}
	if !logger.allow("log:общая") {
		t.Fatal("первая запись обязана пройти")
	}
	if child.allow("log:общая") {
		t.Fatal("копия обработчика должна помнить ту же ошибку")
	}
}

func TestIncidentLoggerPassesThrough(t *testing.T) {
	// Без хранилища обёртка обязана просто передавать записи дальше.
	logger := NewIncidentLogger(slog.NewTextHandler(discard{}, nil), nil)
	record := slog.NewRecord(time.Now(), slog.LevelError, "проверка", 0)
	if err := logger.Handle(context.Background(), record); err != nil {
		t.Fatalf("запись не прошла: %v", err)
	}
}

type discard struct{}

func (discard) Write(p []byte) (int, error) { return len(p), nil }
