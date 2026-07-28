package cache

import (
	"context"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"strings"
	"time"

	"github.com/redis/go-redis/v9"
)

// TranslationStore is implemented by the durable PostgreSQL translation
// cache. It intentionally matches translate.Cache without importing it.
type TranslationStore interface {
	Get(ctx context.Context, source, target, text string) (string, string, bool)
	Put(ctx context.Context, source, target, text, translation, provider string) error
}

type translationValue struct {
	Text     string `json:"text"`
	Provider string `json:"provider"`
}

// TranslationCache adds Redis as an L1 in front of a durable cache.
type TranslationCache struct {
	redis *Redis
	next  TranslationStore
	ttl   time.Duration
}

// NewTranslationCache creates a two-level cache. PostgreSQL remains the source
// of truth and Redis failures are treated as cache misses.
func NewTranslationCache(r *Redis, next TranslationStore, ttl time.Duration) *TranslationCache {
	if ttl <= 0 {
		ttl = 24 * time.Hour
	}
	return &TranslationCache{redis: r, next: next, ttl: ttl}
}

func (c *TranslationCache) key(source, target, text string) string {
	normalized := strings.ToLower(strings.TrimSpace(text))
	sum := sha256.Sum256([]byte(normalized))
	return c.redis.Key(
		"translation",
		strings.ToLower(strings.TrimSpace(source)),
		strings.ToLower(strings.TrimSpace(target)),
		hex.EncodeToString(sum[:]),
	)
}

// Get first checks Redis and then PostgreSQL. A PostgreSQL hit warms Redis.
func (c *TranslationCache) Get(
	ctx context.Context,
	source, target, text string,
) (string, string, bool) {
	if c != nil && c.redis != nil && c.redis.Ready() {
		data, err := c.redis.Client().Get(ctx, c.key(source, target, text)).Bytes()
		if err == nil {
			c.redis.MarkSuccess()
			var value translationValue
			if json.Unmarshal(data, &value) == nil && strings.TrimSpace(value.Text) != "" {
				return value.Text, value.Provider, true
			}
		} else if err != redis.Nil {
			c.redis.MarkFailure()
		}
	}

	if c == nil || c.next == nil {
		return "", "", false
	}
	translation, provider, ok := c.next.Get(ctx, source, target, text)
	if ok {
		c.putRedis(ctx, source, target, text, translation, provider)
	}
	return translation, provider, ok
}

// Put writes the durable cache first and warms Redis only after PostgreSQL
// confirms the write.
func (c *TranslationCache) Put(
	ctx context.Context,
	source, target, text, translation, provider string,
) error {
	if c == nil || strings.TrimSpace(translation) == "" {
		return nil
	}
	if c.next != nil {
		if err := c.next.Put(ctx, source, target, text, translation, provider); err != nil {
			return err
		}
	}
	c.putRedis(ctx, source, target, text, translation, provider)
	return nil
}

func (c *TranslationCache) putRedis(
	ctx context.Context,
	source, target, text, translation, provider string,
) {
	if c.redis == nil || !c.redis.Ready() || strings.TrimSpace(translation) == "" {
		return
	}
	data, err := json.Marshal(translationValue{Text: translation, Provider: provider})
	if err != nil {
		return
	}
	if err := c.redis.Client().Set(ctx, c.key(source, target, text), data, c.ttl).Err(); err != nil {
		c.redis.MarkFailure()
		return
	}
	c.redis.MarkSuccess()
}
