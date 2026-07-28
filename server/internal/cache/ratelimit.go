package cache

import (
	"context"
	"time"

	"github.com/redis/go-redis/v9"
)

// The script uses Redis TIME, so all API replicas refill buckets against the
// same clock. State is a small hash that expires after inactivity.
var tokenBucketScript = redis.NewScript(`
local now_parts = redis.call("TIME")
local now_ms = tonumber(now_parts[1]) * 1000 + math.floor(tonumber(now_parts[2]) / 1000)
local state = redis.call("HMGET", KEYS[1], "tokens", "last")
local tokens = tonumber(state[1])
local last = tonumber(state[2])

if tokens == nil or last == nil then
  tokens = tonumber(ARGV[2])
  last = now_ms
else
  local elapsed = math.max(0, now_ms - last)
  tokens = math.min(tonumber(ARGV[2]), tokens + elapsed * tonumber(ARGV[1]))
  last = now_ms
end

local allowed = 0
if tokens >= 1 then
  tokens = tokens - 1
  allowed = 1
end

redis.call("HSET", KEYS[1], "tokens", tokens, "last", last)
redis.call("PEXPIRE", KEYS[1], ARGV[3])
return allowed
`)

// RateLimiter is a distributed token bucket backed by Redis.
type RateLimiter struct {
	redis     *Redis
	namespace string
	perMS     float64
	burst     int
	ttl       time.Duration
}

func NewRateLimiter(r *Redis, namespace string, perMinute, burst int) *RateLimiter {
	if r == nil {
		return nil
	}
	if perMinute <= 0 {
		perMinute = 60
	}
	if burst <= 0 {
		burst = perMinute
	}
	return &RateLimiter{
		redis:     r,
		namespace: namespace,
		perMS:     float64(perMinute) / 60_000,
		burst:     burst,
		ttl:       15 * time.Minute,
	}
}

// Allow consumes one token. Errors are returned so the API can fail open to
// its local limiter instead of making Redis an availability dependency.
func (l *RateLimiter) Allow(ctx context.Context, key string) (bool, error) {
	if l == nil || l.redis == nil {
		return true, nil
	}
	if !l.redis.Ready() {
		return false, ErrUnavailable
	}
	result, err := tokenBucketScript.Run(
		ctx,
		l.redis.Client(),
		[]string{l.redis.Key("ratelimit", l.namespace, key)},
		l.perMS,
		l.burst,
		l.ttl.Milliseconds(),
	).Int64()
	if err != nil {
		l.redis.MarkFailure()
		return false, err
	}
	l.redis.MarkSuccess()
	return result == 1, nil
}
