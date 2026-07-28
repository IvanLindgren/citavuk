package api

import (
	"context"
	"log/slog"
	"sync"
	"sync/atomic"
	"time"

	rediscache "github.com/citavuk/server/internal/cache"
)

// limiter — ограничитель частоты по принципу «дырявого ведра».
//
// Реализация в памяти процесса, без Redis: сервер запускается в одном
// экземпляре, и распределённый счётчик здесь был бы лишней зависимостью и
// лишней точкой отказа. Если экземпляров станет несколько, ограничитель
// придётся вынести наружу — иначе каждый будет считать свою долю.
type limiter struct {
	mu      sync.Mutex
	buckets map[string]*bucket
	rate    float64       // пополнение, токенов в секунду
	burst   float64       // ёмкость ведра
	ttl     time.Duration // когда забывать неактивный ключ
	now     func() time.Time

	distributed     *rediscache.RateLimiter
	lastRedisReport atomic.Int64
}

type bucket struct {
	tokens float64
	last   time.Time
}

func newLimiter(
	namespace string,
	perMinute, burst int,
	redisClient *rediscache.Redis,
) *limiter {
	if perMinute <= 0 {
		perMinute = 60
	}
	if burst <= 0 {
		burst = perMinute
	}
	return &limiter{
		buckets: make(map[string]*bucket),
		rate:    float64(perMinute) / 60,
		burst:   float64(burst),
		ttl:     15 * time.Minute,
		now:     time.Now,
		distributed: rediscache.NewRateLimiter(
			redisClient, namespace, perMinute, burst,
		),
	}
}

// allow забирает один токен. Возвращает false, если лимит исчерпан.
func (l *limiter) allow(ctx context.Context, key string) bool {
	if l.distributed != nil {
		allowed, err := l.distributed.Allow(ctx, key)
		if err == nil {
			return allowed
		}
		// Redis не должен превращаться в точку отказа. Предупреждение
		// ограничено одним сообщением в минуту, затем работает локальный bucket.
		now := time.Now().Unix()
		last := l.lastRedisReport.Load()
		if now-last >= 60 && l.lastRedisReport.CompareAndSwap(last, now) {
			slog.Warn("Redis rate limit недоступен, используется локальный", "err", err)
		}
	}
	return l.allowLocal(key)
}

func (l *limiter) allowLocal(key string) bool {
	l.mu.Lock()
	defer l.mu.Unlock()

	now := l.now()
	b, ok := l.buckets[key]
	if !ok {
		// Новый ключ начинает с полного ведра минус текущий запрос.
		l.buckets[key] = &bucket{tokens: l.burst - 1, last: now}
		return true
	}

	b.tokens += now.Sub(b.last).Seconds() * l.rate
	if b.tokens > l.burst {
		b.tokens = l.burst
	}
	b.last = now

	if b.tokens < 1 {
		return false
	}
	b.tokens--
	return true
}

// cleanup удаляет ведра, которых давно не касались. Без этого карта росла бы
// по одной записи на каждый уникальный адрес и стала бы утечкой памяти.
func (l *limiter) cleanup() {
	l.mu.Lock()
	defer l.mu.Unlock()

	cutoff := l.now().Add(-l.ttl)
	for key, b := range l.buckets {
		if b.last.Before(cutoff) {
			delete(l.buckets, key)
		}
	}
}

// runCleanup периодически чистит карту, пока не закроют stop.
func (l *limiter) runCleanup(stop <-chan struct{}) {
	t := time.NewTicker(5 * time.Minute)
	defer t.Stop()
	for {
		select {
		case <-t.C:
			l.cleanup()
		case <-stop:
			return
		}
	}
}
