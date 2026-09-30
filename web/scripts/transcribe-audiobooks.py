#!/usr/bin/env python3
"""Реальная ASR публичных фрагментов каталога: Groq Fast -> quality gate -> Aiesa.

Запуск из корня с ключами в окружении:
    python web/scripts/transcribe-audiobooks.py
Не скачивает коммерческие полные книги и не публикует сам звук.
"""
from __future__ import annotations
import argparse
import hashlib
import json
import os
from pathlib import Path
import sys
import urllib.request
from urllib.parse import urlparse

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT / "backend"))
from audio_transcription import transcribe_audio  # noqa: E402


def transcript(result: dict, lesson: dict) -> dict:
    if result.get("language_code") != "srp":
        raise ValueError("В записи не подтверждена сербская речь")
    cues = [{key: segment[key] for key in ("text", "start", "end", "speaker", "words") if key in segment}
            for segment in result.get("segments", []) if segment.get("text", "").strip()]
    if not cues:
        raise ValueError("Речь в записи не распознана")
    return {"title": lesson["title"], "audio": lesson["audio_url"],
            "source_url": lesson.get("source_url"), "duration": result.get("duration", cues[-1]["end"]),
            "source": result.get("provider"), "model": result.get("model"),
            "language_code": "srp", "cues": cues}


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--catalog", default="https://citavuk.ru/api/audio/lessons")
    parser.add_argument("--out", type=Path, default=ROOT / "web/public/transcripts")
    parser.add_argument("--force", action="store_true")
    parser.add_argument("--only", default="")
    args = parser.parse_args()
    if not (os.getenv("GROQ_AUDIO_TRANSCRIPTION_KEY") or os.getenv("GROQ_API_KEY") or os.getenv("POLZA_AI_KEY")):
        raise SystemExit("Нужен ключ Groq или Polza в окружении")
    with urllib.request.urlopen(args.catalog, timeout=45) as response:
        lessons = json.load(response)["items"]
    args.out.mkdir(parents=True, exist_ok=True)
    index_path = args.out / "index.json"
    index = json.loads(index_path.read_text(encoding="utf-8")) if index_path.exists() else {}
    failed = 0
    for lesson in lessons:
        if lesson.get("kind") != "audiobook" or args.only not in lesson["id"]:
            continue
        audio = lesson["audio_url"]
        uri = urlparse(audio)
        if uri.scheme != "https" or uri.hostname != "slusaj.rs" or not uri.path.startswith("/wp-content/uploads/"):
            raise ValueError("Неизвестный источник публичного фрагмента")
        name = hashlib.sha1(audio.encode()).hexdigest() + ".json"
        target = args.out / name
        if target.exists() and not args.force:
            index[audio] = name
            continue
        try:
            print(lesson["title"], flush=True)
            req = urllib.request.Request(audio, headers={"User-Agent": "Citavuk/1.0"})
            with urllib.request.urlopen(req, timeout=90) as response:
                if urlparse(response.url).hostname != "slusaj.rs":
                    raise ValueError("Неожиданное перенаправление источника")
                data = response.read(48 * 1024 * 1024 + 1)
            if len(data) > 48 * 1024 * 1024:
                raise ValueError("Фрагмент превышает лимит 48 МБ")
            result = transcribe_audio(data, Path(uri.path).name, "audio/mpeg")
            target.write_text(json.dumps(transcript(result, lesson), ensure_ascii=False, indent=1), encoding="utf-8")
            index[audio] = name
            # Каждая удачная запись сохраняется сразу, сбой следующей не теряет её.
            index_path.write_text(json.dumps(index, ensure_ascii=False, indent=1), encoding="utf-8")
            print(f"  {len(result.get('segments', []))} реплик", flush=True)
        except Exception as error:
            failed += 1
            print(f"  Не опубликовано: {type(error).__name__}", flush=True)
    return 1 if failed else 0


if __name__ == "__main__":
    raise SystemExit(main())
