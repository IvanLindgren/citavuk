"""Отчёт о выполненной задаче в Телеграм.

Бот пишет владельцу проекта после каждой задачи: что со статусом, какие файлы
изменены и когда это сделано.

Ключ и адресат лежат в `.env` (он в .gitignore) — в репозиторий они не попадают.

    python tools/report.py --status done \
        --summary "Починил открытие синхронизированных книг" \
        --file "frontend/lib/main.dart: докачка текста при открытии" \
        --file "frontend/lib/services/listening_service.dart: подкасты со своего сервера"

Статусы:
    done       — задача готова
    needs-user — нужны действия с вашей стороны
    blocked    — в текущих условиях невыполнимо
"""

import argparse
import json
import os
import sys
import urllib.error
import urllib.request
from datetime import datetime
from pathlib import Path

ENV_FILE = Path(__file__).resolve().parent.parent / ".env"
API = "https://api.telegram.org/bot{token}/sendMessage"

STATUS_LINE = {
    "done": "✅ <b>Задача готова</b>",
    "needs-user": "🟡 <b>Нужны действия с вашей стороны</b>",
    "blocked": "🔴 <b>Задача невыполнима в текущих условиях</b>",
}


def load_env() -> dict[str, str]:
    """Читает .env. Переменные окружения имеют приоритет над файлом."""
    values: dict[str, str] = {}
    if ENV_FILE.exists():
        for line in ENV_FILE.read_text(encoding="utf-8").splitlines():
            line = line.strip()
            if not line or line.startswith("#") or "=" not in line:
                continue
            key, _, value = line.partition("=")
            values[key.strip()] = value.strip().strip('"').strip("'")
    for key in ("TELEGRAM_BOT_TOKEN", "TELEGRAM_CHAT_ID"):
        if os.environ.get(key):
            values[key] = os.environ[key]
    return values


def escape(text: str) -> str:
    """HTML-разметка сообщения: тело не должно её ломать."""
    return text.replace("&", "&amp;").replace("<", "&lt;").replace(">", "&gt;")


def build_message(status: str, summary: str, files: list[str],
                  note: str | None) -> str:
    parts = [STATUS_LINE.get(status, STATUS_LINE["done"])]
    parts.append(escape(summary))

    if files:
        parts.append("")
        parts.append("<b>Файлы</b>")
        for entry in files:
            path, _, what = entry.partition(":")
            line = f"• <code>{escape(path.strip())}</code>"
            if what.strip():
                line += f" — {escape(what.strip())}"
            parts.append(line)

    if note:
        parts.append("")
        parts.append(escape(note))

    parts.append("")
    parts.append(f"<i>{datetime.now().strftime('%d.%m.%Y %H:%M')}</i>")
    return "\n".join(parts)


def send(text: str) -> bool:
    env = load_env()
    token = env.get("TELEGRAM_BOT_TOKEN")
    chat = env.get("TELEGRAM_CHAT_ID")
    if not token or not chat:
        print("нет TELEGRAM_BOT_TOKEN или TELEGRAM_CHAT_ID в .env", file=sys.stderr)
        return False

    payload = json.dumps({
        "chat_id": chat,
        "text": text,
        "parse_mode": "HTML",
        "disable_web_page_preview": True,
    }).encode("utf-8")

    request = urllib.request.Request(
        API.format(token=token),
        data=payload,
        headers={"Content-Type": "application/json"},
    )
    try:
        with urllib.request.urlopen(request, timeout=20) as response:
            return json.load(response).get("ok", False)
    except urllib.error.HTTPError as error:
        print(f"телеграм ответил {error.code}: {error.read().decode()}",
              file=sys.stderr)
    except OSError as error:
        print(f"сеть недоступна: {error}", file=sys.stderr)
    return False


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--status", default="done",
                        choices=sorted(STATUS_LINE))
    parser.add_argument("--summary", required=True,
                        help="что сделано, одной фразой")
    parser.add_argument("--file", action="append", default=[],
                        metavar="ПУТЬ: что изменено",
                        help="можно повторять для каждого файла")
    parser.add_argument("--note", help="дополнение: что осталось или почему нельзя")
    args = parser.parse_args()

    message = build_message(args.status, args.summary, args.file, args.note)
    return 0 if send(message) else 1


if __name__ == "__main__":
    raise SystemExit(main())
