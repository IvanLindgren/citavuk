"""Простой per-IP token bucket без внешних зависимостей.

HF Space стоит за прокси и выставляет X-Forwarded-For — реальный клиент
берём оттуда. Состояние в памяти процесса и сбрасывается при перезапуске
контейнера; для защиты от случайного флуда этого достаточно.
"""

import threading
import time

from fastapi import HTTPException, Request

_CLEANUP_INTERVAL = 300  # раз в 5 минут выкидываем устаревшие корзины


class TokenBucketLimiter:
    def __init__(self, name: str, rate_per_min: int, burst: int) -> None:
        self._name = name
        self._rate_per_sec = rate_per_min / 60.0
        self._burst = burst
        self._buckets = {}  # (bucket_name, ip) -> [tokens, updated_ts]
        self._lock = threading.Lock()
        self._last_cleanup = time.monotonic()

    def allow(self, ip: str) -> bool:
        now = time.monotonic()
        with self._lock:
            if now - self._last_cleanup > _CLEANUP_INTERVAL:
                self._cleanup(now)
            key = (self._name, ip)
            tokens, updated = self._buckets.get(key, [self._burst, now])
            tokens = min(
                self._burst, tokens + (now - updated) * self._rate_per_sec
            )
            if tokens < 1.0:
                self._buckets[key] = [tokens, now]
                return False
            self._buckets[key] = [tokens - 1.0, now]
            return True

    def _cleanup(self, now: float) -> None:
        # Корзина, давно не тронутая, уже пополнилась до burst и не нужна.
        stale_after = self._burst / self._rate_per_sec
        self._buckets = {
            key: bucket
            for key, bucket in self._buckets.items()
            if now - bucket[1] < stale_after
        }
        self._last_cleanup = now


def _client_ip(request: Request) -> str:
    forwarded = request.headers.get("x-forwarded-for", "")
    if forwarded:
        return forwarded.split(",")[0].strip()
    return request.client.host if request.client else "unknown"


def make_limiter(rate_per_min: int, burst: int):
    """FastAPI dependency: 429, если клиент превысил rate_per_min (burst стартовый)."""
    bucket = TokenBucketLimiter(f"{rate_per_min}/{burst}", rate_per_min, burst)

    async def dependency(request: Request) -> None:
        if not bucket.allow(_client_ip(request)):
            raise HTTPException(
                status_code=429,
                detail="Слишком много запросов. Подождите минуту.",
            )

    return dependency
