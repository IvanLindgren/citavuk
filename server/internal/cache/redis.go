// Package cache contains optional, disposable Redis-backed caches.
//
// PostgreSQL remains the source of truth. Redis is allowed to be unavailable:
// callers must fall back to durable storage or local process memory.
package cache

import (
	"context"
	"errors"
	"strings"
	"sync/atomic"
	"time"

	"github.com/redis/go-redis/v9"
)

// Redis is the shared Redis connection and key namespace used by the API.
type Redis struct {
	client *redis.Client
	prefix string

	disabledUntil atomic.Int64
}

// ErrUnavailable means the Redis circuit is temporarily open after a network
// failure. Callers should immediately use their local fallback.
var ErrUnavailable = errors.New("Redis temporarily unavailable")

// NewRedis parses REDIS_URL and creates a lazy client. An empty URL disables
// Redis without returning an error.
func NewRedis(rawURL, prefix string) (*Redis, error) {
	rawURL = strings.TrimSpace(rawURL)
	if rawURL == "" {
		return nil, nil
	}

	options, err := redis.ParseURL(rawURL)
	if err != nil {
		return nil, err
	}
	options.DialTimeout = 2 * time.Second
	options.ReadTimeout = 1500 * time.Millisecond
	options.WriteTimeout = 1500 * time.Millisecond
	options.PoolTimeout = 2 * time.Second
	options.MaxRetries = 0

	prefix = strings.Trim(strings.TrimSpace(prefix), ":")
	if prefix == "" {
		prefix = "citavuk"
	}
	return &Redis{
		client: redis.NewClient(options),
		prefix: prefix,
	}, nil
}

// Client exposes the underlying client to the small cache implementations in
// this package. Application code should use the higher-level wrappers.
func (r *Redis) Client() *redis.Client {
	if r == nil {
		return nil
	}
	return r.client
}

// Key creates a namespaced Redis key.
func (r *Redis) Key(parts ...string) string {
	all := make([]string, 0, len(parts)+1)
	all = append(all, r.prefix)
	for _, part := range parts {
		if part = strings.Trim(part, ":"); part != "" {
			all = append(all, part)
		}
	}
	return strings.Join(all, ":")
}

// Ping checks whether Redis is currently reachable.
func (r *Redis) Ping(ctx context.Context) bool {
	if !r.Ready() {
		return false
	}
	if err := r.client.Ping(ctx).Err(); err != nil {
		r.MarkFailure()
		return false
	}
	r.MarkSuccess()
	return true
}

// Ready reports whether a Redis operation should be attempted now.
func (r *Redis) Ready() bool {
	if r == nil || r.client == nil {
		return false
	}
	return time.Now().UnixMilli() >= r.disabledUntil.Load()
}

// MarkFailure opens the circuit briefly. This bounds the latency added by an
// unavailable external Redis to one request per recovery interval.
func (r *Redis) MarkFailure() {
	if r != nil {
		r.disabledUntil.Store(time.Now().Add(30 * time.Second).UnixMilli())
	}
}

// MarkSuccess closes the circuit after a successful command.
func (r *Redis) MarkSuccess() {
	if r != nil {
		r.disabledUntil.Store(0)
	}
}

// Close releases the connection pool.
func (r *Redis) Close() error {
	if r == nil || r.client == nil {
		return nil
	}
	return r.client.Close()
}
