"""Создаёт заранее подготовленные MP3 через ElevenLabs.

Входной JSON:
{"items": [{"id": "course-welcome", "text": "Dobro došao!", "voice": "sophie"}]}

Запуск:
  python generate_studio_tts.py studio-lines.json --out studio-audio

Команда не является частью HTTP-сервера: пользовательский трафик никогда её
не вызывает и не расходует платную квоту.
"""

from __future__ import annotations

import argparse
import hashlib
import json
import re
from pathlib import Path

from tts_service import synthesize_studio


SAFE_ID = re.compile(r"^[a-zA-Z0-9][a-zA-Z0-9_-]{0,79}$")


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("manifest", type=Path)
    parser.add_argument("--out", type=Path, default=Path("studio-audio"))
    parser.add_argument("--force", action="store_true")
    args = parser.parse_args()

    payload = json.loads(args.manifest.read_text(encoding="utf-8"))
    items = payload.get("items")
    if not isinstance(items, list) or not items:
        raise SystemExit("manifest must contain a non-empty items array")
    args.out.mkdir(parents=True, exist_ok=True)
    index: dict[str, dict[str, str]] = {}
    for raw in items:
        item_id = str(raw.get("id", "")).strip()
        text = str(raw.get("text", "")).strip()
        voice = str(raw.get("voice", "sophie")).strip()
        if not SAFE_ID.fullmatch(item_id) or not text or len(text) > 5000:
            raise SystemExit(f"invalid item: {item_id!r}")
        target = args.out / f"{item_id}.mp3"
        digest = hashlib.sha256(f"{voice}\0{text}".encode()).hexdigest()
        if args.force or not target.exists():
            target.write_bytes(synthesize_studio(text, voice))
        index[item_id] = {"file": target.name, "sha256": digest, "voice": voice}
        print(target)
    (args.out / "index.json").write_text(
        json.dumps(index, ensure_ascii=False, indent=2) + "\n",
        encoding="utf-8",
    )


if __name__ == "__main__":
    main()
