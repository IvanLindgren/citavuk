"""Локальный SQLite-кеш разбора слов (L2 после Redis).

Переживает перезапуск процесса, пока сохраняется диск контейнера, и работает
без Redis. Любая ошибка SQLite гасится логом: кеш не имеет права ронять разбор.
"""

import json
import logging
import os
import sqlite3
import threading
import time
from contextlib import closing
from pathlib import Path
from typing import Optional

_DB_PATH = Path(
    os.environ.get(
        "CITAVUK_ANALYSIS_CACHE_DB",
        str(Path(__file__).parent / "analysis_cache.db"),
    )
)
_TTL_DAYS = 30

_lock = threading.Lock()
_writes = 0  # чистка записей старше TTL — на каждой сотой записи


def _connect() -> sqlite3.Connection:
    _DB_PATH.parent.mkdir(parents=True, exist_ok=True)
    conn = sqlite3.connect(_DB_PATH)
    conn.execute(
        "CREATE TABLE IF NOT EXISTS analysis_cache ("
        "key TEXT PRIMARY KEY, "
        "payload TEXT NOT NULL, "
        "created_at INTEGER NOT NULL)"
    )
    return conn


def get(key: str) -> Optional[dict]:
    try:
        with _lock, closing(_connect()) as conn:
            row = conn.execute(
                "SELECT payload, created_at FROM analysis_cache WHERE key = ?",
                (key,),
            ).fetchone()
        if not row:
            return None
        payload, created_at = row
        if time.time() - created_at > _TTL_DAYS * 24 * 3600:
            return None
        value = json.loads(payload)
        return value if isinstance(value, dict) else None
    except Exception as exc:
        logging.warning("analysis_cache.get failed: %s", exc)
        return None


def set(key: str, payload: dict, ttl_days: int = _TTL_DAYS) -> None:
    global _writes
    try:
        raw = json.dumps(payload, ensure_ascii=False)
        with _lock, closing(_connect()) as conn, conn:
            now = int(time.time())
            conn.execute(
                "INSERT OR REPLACE INTO analysis_cache (key, payload, created_at) "
                "VALUES (?, ?, ?)",
                (key, raw, now),
            )
            _writes += 1
            if _writes % 100 == 0:
                conn.execute(
                    "DELETE FROM analysis_cache WHERE created_at < ?",
                    (now - ttl_days * 24 * 3600,),
                )
    except Exception as exc:
        logging.warning("analysis_cache.set failed: %s", exc)
