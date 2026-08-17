"""Тонкий клиент API Читавука для скриптов заливки контента.

Только stdlib: скрипты должны запускаться на голой машине без установки
зависимостей, как `tools/report.py`.

Доступы берутся из `.env` в корне репозитория (он в .gitignore):

    CITAVUK_API_URL="https://api.citavuk.ru"   # необязательно
    CITAVUK_CONTENT_EMAIL="..."
    CITAVUK_CONTENT_PASSWORD="..."

Пароль можно не хранить и передавать готовый токен сессии в
CITAVUK_CONTENT_TOKEN — тогда скрипт не увидит пароль вовсе.
"""

from __future__ import annotations

import json
import os
import urllib.error
import urllib.request
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent.parent
ENV_FILE = ROOT / ".env"
DEFAULT_API = "https://api.citavuk.ru"


class ApiError(RuntimeError):
    """Сервер ответил ошибкой. Текст — тот, что он вернул человеку."""

    def __init__(self, status: int, code: str, message: str):
        super().__init__(f"HTTP {status} {code}: {message}")
        self.status = status
        self.code = code


def read_env() -> dict[str, str]:
    """Читает .env. Кавычки снимаются: с ними ключ длиннее на два знака и
    сервер отвечает 401 — на это уже наступали."""
    values: dict[str, str] = {}
    if ENV_FILE.exists():
        for line in ENV_FILE.read_text(encoding="utf-8").splitlines():
            line = line.strip()
            if not line or line.startswith("#") or "=" not in line:
                continue
            name, _, value = line.partition("=")
            values[name.strip()] = value.strip().strip('"').strip("'")
    values.update({k: v for k, v in os.environ.items() if k.startswith("CITAVUK_")})
    return values


class Citavuk:
    def __init__(self, base_url: str | None = None, token: str | None = None):
        env = read_env()
        self.base = (base_url or env.get("CITAVUK_API_URL") or DEFAULT_API).rstrip("/")
        self.token = token or env.get("CITAVUK_CONTENT_TOKEN") or ""
        self._env = env

    # --- транспорт ---

    def request(self, method: str, path: str, body: dict | None = None,
                timeout: int = 60) -> dict:
        data = json.dumps(body, ensure_ascii=False).encode() if body is not None else None
        request = urllib.request.Request(self.base + path, data=data, method=method)
        request.add_header("Accept", "application/json")
        if data is not None:
            request.add_header("Content-Type", "application/json; charset=utf-8")
        if self.token:
            request.add_header("Authorization", f"Bearer {self.token}")
        try:
            with urllib.request.urlopen(request, timeout=timeout) as response:
                raw = response.read()
                return json.loads(raw) if raw else {}
        except urllib.error.HTTPError as error:
            raw = error.read().decode("utf-8", "replace")
            code, message = "", raw
            try:
                parsed = json.loads(raw)
                code = parsed.get("code") or parsed.get("error") or ""
                message = parsed.get("message") or parsed.get("error") or raw
            except json.JSONDecodeError:
                pass
            raise ApiError(error.code, code, message) from None

    # --- вход ---

    def login(self) -> None:
        """Вход по почте и паролю из .env, если токена ещё нет."""
        if self.token:
            return
        email = self._env.get("CITAVUK_CONTENT_EMAIL", "")
        password = self._env.get("CITAVUK_CONTENT_PASSWORD", "")
        if not email or not password:
            raise RuntimeError(
                "Нет доступа: задайте CITAVUK_CONTENT_TOKEN либо "
                "CITAVUK_CONTENT_EMAIL и CITAVUK_CONTENT_PASSWORD в .env"
            )
        answer = self.request("POST", "/v1/auth/login",
                              {"email": email, "password": password})
        self.token = answer.get("token") or answer.get("sessionToken") or ""
        if not self.token:
            raise RuntimeError("Сервер не вернул токен сессии")

    # --- уроки ---

    def own_lessons(self) -> list[dict]:
        return self.request("GET", "/v1/teachers/lessons").get("items") or []

    def create_lesson(self, lesson: dict) -> dict:
        return self.request("POST", "/v1/teachers/lessons", lesson)

    def update_lesson(self, lesson_id: str, lesson: dict) -> dict:
        return self.request("PUT", f"/v1/teachers/lessons/{lesson_id}", lesson)

    def publish_unlisted(self, lesson_id: str, revision_id: str) -> dict:
        return self.request("POST", f"/v1/teachers/lessons/{lesson_id}/publish-unlisted",
                            {"revisionId": revision_id})

    def submit_public(self, lesson_id: str, revision_id: str) -> dict:
        return self.request("POST", f"/v1/teachers/lessons/{lesson_id}/submit",
                            {"revisionId": revision_id})

    # --- модерация (нужна роль администратора) ---

    def review_revision(self, revision_id: str, approve: bool, comment: str = "") -> dict:
        return self.request(
            "POST", f"/v1/admin/lesson-revisions/{revision_id}/review",
            {"status": "approved" if approve else "rejected", "comment": comment},
        )
