"""Optional Redis cache used by the Python NLP/audio service.

Redis is never a source of truth here. Every operation fails as a cache miss so
an unavailable external service cannot break analysis, news, or listening.
"""

from __future__ import annotations

import json
import logging
import os
import threading
import time
from typing import Any, Optional

try:
    import redis as redis_lib
except ImportError:  # Local development can still run without the extra package.
    redis_lib = None


class RedisCache:
    def __init__(self) -> None:
        self._client = None
        self._prefix = os.getenv("CITAVUK_REDIS_PREFIX", "citavuk").strip(": ") or "citavuk"
        self._last_error_at = 0.0
        self._disabled_until = 0.0
        self._error_lock = threading.Lock()

        url = os.getenv("REDIS_URL", "").strip()
        if not url or redis_lib is None:
            return
        try:
            self._client = redis_lib.Redis.from_url(
                url,
                socket_connect_timeout=2,
                socket_timeout=1.5,
                retry_on_timeout=False,
                health_check_interval=30,
                decode_responses=False,
            )
        except Exception as exc:
            self._report(exc)

    @property
    def configured(self) -> bool:
        return self._client is not None

    def key(self, value: str) -> str:
        return f"{self._prefix}:python:{value.strip(':')}"

    def ping(self) -> bool:
        if not self._ready():
            return False
        try:
            result = bool(self._client.ping())
            if result:
                self._disabled_until = 0.0
            return result
        except Exception as exc:
            self._report(exc)
            return False

    def get_json(self, key: str) -> Optional[Any]:
        raw = self.get_bytes(key)
        if raw is None:
            return None
        try:
            return json.loads(raw.decode("utf-8"))
        except (UnicodeDecodeError, json.JSONDecodeError):
            return None

    def set_json(self, key: str, value: Any, ttl: int) -> None:
        try:
            raw = json.dumps(
                value,
                ensure_ascii=False,
                separators=(",", ":"),
            ).encode("utf-8")
        except (TypeError, ValueError):
            return
        self.set_bytes(key, raw, ttl)

    def get_text(self, key: str) -> Optional[str]:
        raw = self.get_bytes(key)
        if raw is None:
            return None
        try:
            return raw.decode("utf-8")
        except UnicodeDecodeError:
            return None

    def set_text(self, key: str, value: str, ttl: int) -> None:
        self.set_bytes(key, value.encode("utf-8"), ttl)

    def get_bytes(self, key: str) -> Optional[bytes]:
        if not self._ready():
            return None
        try:
            value = self._client.get(self.key(key))
            self._disabled_until = 0.0
            return bytes(value) if value is not None else None
        except Exception as exc:
            self._report(exc)
            return None

    def set_bytes(self, key: str, value: bytes, ttl: int) -> None:
        if not self._ready() or not value:
            return
        try:
            self._client.set(self.key(key), value, ex=max(1, int(ttl)))
            self._disabled_until = 0.0
        except Exception as exc:
            self._report(exc)

    def _ready(self) -> bool:
        return self._client is not None and time.monotonic() >= self._disabled_until

    def _report(self, exc: Exception) -> None:
        # A sleeping Redis provider should not flood Space logs on every word.
        now = time.monotonic()
        with self._error_lock:
            self._disabled_until = now + 30
            if now - self._last_error_at < 60:
                return
            self._last_error_at = now
        logging.warning("Redis cache unavailable; using local fallback: %s", exc)


redis_cache = RedisCache()
