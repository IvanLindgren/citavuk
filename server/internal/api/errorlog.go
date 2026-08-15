package api

import (
	"context"
	"encoding/json"
	"fmt"
	"log/slog"
	"strings"
	"sync"
	"time"

	"github.com/citavuk/server/internal/store"
)

// Журнал ошибок для админки.
//
// До этого в журнал попадала одна строка на аварию: «POST /v1/… вернул 500».
// Что именно сломалось, знал только текстовый лог на сервере, до которого надо
// идти по ssh. Здесь две части:
//
//   - IncidentLogger перехватывает каждую запись slog уровня error и заводит
//     инцидент с её сообщением и всеми полями — то есть ровно то, что
//     обработчик и написал в лог;
//   - recentErrors помнит последние ответы с ошибкой, включая 4xx. В базу они
//     не пишутся (это не аварии), но именно они показывают, что у людей
//     что-то не работает: пачка 401 — сломан вход, пачка 429 — слишком тугой
//     ограничитель.

// IncidentLogger — обёртка над slog.Handler.
type IncidentLogger struct {
	inner slog.Handler
	store *store.Store
	attrs []slog.Attr
	group string
	// Глушитель общий на все производные обработчики: slog.With порождает
	// копию на каждый вызов, и своя карта у каждой копии не глушила бы ничего.
	// Он же владеет замком — общая карта с разными замками была бы гонкой.
	quiet *quietMap
}

// quietMap помнит, когда отпечаток последний раз доходил до базы.
type quietMap struct {
	mu   sync.Mutex
	last map[string]time.Time
}

// NewIncidentLogger оборачивает обработчик журнала записью инцидентов.
func NewIncidentLogger(inner slog.Handler, st *store.Store) *IncidentLogger {
	return &IncidentLogger{
		inner: inner,
		store: st,
		quiet: &quietMap{last: map[string]time.Time{}},
	}
}

// SameSpanQuiet — как часто одна и та же ошибка доходит до базы.
const SameSpanQuiet = 20 * time.Second

func (h *IncidentLogger) Enabled(ctx context.Context, level slog.Level) bool {
	return h.inner.Enabled(ctx, level)
}

func (h *IncidentLogger) WithAttrs(attrs []slog.Attr) slog.Handler {
	next := h.clone()
	next.inner = h.inner.WithAttrs(attrs)
	next.attrs = append(append([]slog.Attr{}, h.attrs...), attrs...)
	return next
}

func (h *IncidentLogger) WithGroup(name string) slog.Handler {
	next := h.clone()
	next.inner = h.inner.WithGroup(name)
	next.group = name
	return next
}

func (h *IncidentLogger) clone() *IncidentLogger {
	return &IncidentLogger{
		inner: h.inner, store: h.store, attrs: h.attrs, group: h.group, quiet: h.quiet,
	}
}

func (h *IncidentLogger) Handle(ctx context.Context, record slog.Record) error {
	if record.Level >= slog.LevelError && h.store != nil {
		h.record(record)
	}
	return h.inner.Handle(ctx, record)
}

func (h *IncidentLogger) record(record slog.Record) {
	message := record.Message
	details := map[string]any{}
	for _, attr := range h.attrs {
		details[attr.Key] = value(attr.Value)
	}
	record.Attrs(func(attr slog.Attr) bool {
		details[attr.Key] = value(attr.Value)
		return true
	})

	// Отпечаток берётся из сообщения, а не из текста ошибки: сообщение пишет
	// программист и оно постоянно, а в ошибке бывают идентификаторы, и каждая
	// такая ошибка заводила бы отдельную строку журнала.
	fingerprint := "log:" + message
	if source, ok := details["source"].(string); ok && source != "" {
		fingerprint += ":" + source
	}

	if !h.allow(fingerprint) {
		return
	}
	if reason, ok := details["err"].(string); ok && reason != "" {
		message = message + ": " + reason
	}
	body, err := json.Marshal(details)
	if err != nil || len(body) > 8<<10 {
		body = []byte(`{}`)
	}

	go func() {
		ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
		defer cancel()
		// Ошибку записи наружу не выносим: slog.Error здесь означал бы
		// бесконечную петлю через этот же обработчик.
		_ = h.store.RecordIncident(ctx, fingerprint, "error", "server", message, body)
	}()
}

func (h *IncidentLogger) allow(fingerprint string) bool {
	now := time.Now()
	h.quiet.mu.Lock()
	defer h.quiet.mu.Unlock()
	if seen, ok := h.quiet.last[fingerprint]; ok && now.Sub(seen) < SameSpanQuiet {
		return false
	}
	// Карта не растёт бесконечно: раз в тысячу отпечатков она чистится
	// целиком. Потерять отметку не страшно — худшее следствие в том, что одна
	// ошибка запишется в базу лишний раз.
	if len(h.quiet.last) > 1000 {
		h.quiet.last = map[string]time.Time{}
	}
	h.quiet.last[fingerprint] = now
	return true
}

func value(v slog.Value) any {
	switch v.Kind() {
	case slog.KindString, slog.KindBool, slog.KindInt64, slog.KindUint64, slog.KindFloat64:
		return v.Any()
	case slog.KindDuration:
		return v.Duration().String()
	case slog.KindTime:
		return v.Time().Format(time.RFC3339)
	default:
		return trim(fmt.Sprint(v.Any()), 2000)
	}
}

func trim(text string, limit int) string {
	if len(text) <= limit {
		return text
	}
	return text[:limit] + "…"
}

// ErrorEvent — ответ с ошибкой, попавший в живой список.
type ErrorEvent struct {
	At      time.Time `json:"at"`
	Method  string    `json:"method"`
	Path    string    `json:"path"`
	Status  int       `json:"status"`
	Ms      int64     `json:"ms"`
	User    string    `json:"user,omitempty"`
	Message string    `json:"message,omitempty"`
}

// recentErrors — кольцо последних ошибочных ответов.
type recentErrors struct {
	mu    sync.Mutex
	items []ErrorEvent
	next  int
	full  bool
}

func newRecentErrors(size int) *recentErrors {
	return &recentErrors{items: make([]ErrorEvent, size)}
}

// Пустое кольцо молча принимает записи: в тестах сервер собирают частично, и
// падать из-за журнала ошибок было бы издевательством.
func (r *recentErrors) add(event ErrorEvent) {
	if r == nil {
		return
	}
	r.mu.Lock()
	defer r.mu.Unlock()
	r.items[r.next] = event
	r.next = (r.next + 1) % len(r.items)
	if r.next == 0 {
		r.full = true
	}
}

// list отдаёт события от свежих к старым.
func (r *recentErrors) list(limit int) []ErrorEvent {
	if r == nil {
		return []ErrorEvent{}
	}
	r.mu.Lock()
	defer r.mu.Unlock()
	total := r.next
	if r.full {
		total = len(r.items)
	}
	if limit < 1 || limit > total {
		limit = total
	}
	out := make([]ErrorEvent, 0, limit)
	for i := range limit {
		at := (r.next - 1 - i + len(r.items)*2) % len(r.items)
		out = append(out, r.items[at])
	}
	return out
}

// PathStat — сколько ошибок собрала одна ручка.
type PathStat struct {
	Path   string `json:"path"`
	Method string `json:"method"`
	Count  int    `json:"count"`
	Worst  int    `json:"worst"`
	Last   string `json:"last,omitempty"`
}

// byPath собирает сводку по ручкам: где именно сыплется.
func (r *recentErrors) byPath() []PathStat {
	events := r.list(0)
	index := map[string]*PathStat{}
	order := []string{}
	for _, event := range events {
		key := event.Method + " " + event.Path
		stat, ok := index[key]
		if !ok {
			stat = &PathStat{Path: event.Path, Method: event.Method}
			index[key] = stat
			order = append(order, key)
		}
		stat.Count++
		if event.Status > stat.Worst {
			stat.Worst = event.Status
		}
		if stat.Last == "" && event.Message != "" {
			stat.Last = event.Message
		}
	}
	out := make([]PathStat, 0, len(order))
	for _, key := range order {
		out = append(out, *index[key])
	}
	// Сортировка пузырьком по числу ошибок: ручек в списке десятки, а не
	// тысячи, и тянуть sort ради этого незачем.
	for i := range out {
		for j := i + 1; j < len(out); j++ {
			if out[j].Count > out[i].Count {
				out[i], out[j] = out[j], out[i]
			}
		}
	}
	if len(out) > 20 {
		out = out[:20]
	}
	return out
}

// errorText достаёт из тела ответа сообщение, которое увидел человек.
func errorText(body []byte) string {
	if len(body) == 0 {
		return ""
	}
	var parsed struct {
		Message string `json:"message"`
	}
	if err := json.Unmarshal(body, &parsed); err == nil && parsed.Message != "" {
		return trim(parsed.Message, 300)
	}
	return trim(strings.TrimSpace(string(body)), 300)
}
