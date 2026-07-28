#!/usr/bin/env python3
"""Транскрипция эпизодов подкастов через Whisper.

Прежний транскрипт выскребался со страницы подкаста, а тайминги считались
пропорционально длительности — текст не совпадал с речью и убегал вперёд.
Здесь берётся само аудио, и тайминги приходят от модели.

    POLZA_API_KEY=... python web/scripts/transcribe-podcasts.py --limit 3

Результат — по файлу на эпизод в web/public/transcripts/, имя = sha1 ссылки
на аудио. Выкладывается вместе с сайтом.
"""

from __future__ import annotations

import argparse
import hashlib
import json
import os
import struct
import sys
import urllib.request
import xml.etree.ElementTree as ET
from pathlib import Path

FEEDS = [
    ("learn-serbian", "https://rss.buzzsprout.com/1246415.rss"),
    ("moze-kafa", "https://anchor.fm/s/aef64434/podcast/rss"),
]

API_URL = "https://polza.ai/api/v1/audio/transcriptions"
# turbo через этот шлюз отдаёт только текст без таймингов, а тайминги здесь —
# главное, ради чего всё затевалось.
MODEL = "openai/whisper-1"

# Предел загрузки у Whisper — 25 МБ, но кусок такого размера шлюз не успевает
# обработать до таймаута. Шесть мегабайт — это около восьми минут звука.
CHUNK_LIMIT = 6 * 1024 * 1024
ATTEMPTS = 3

ITUNES = "{http://www.itunes.com/dtds/podcast-1.0.dtd}"

BITRATES_V1_L3 = [0, 32, 40, 48, 56, 64, 80, 96, 112, 128, 160, 192, 224, 256, 320, 0]
BITRATES_V2_L3 = [0, 8, 16, 24, 32, 40, 48, 56, 64, 80, 96, 112, 128, 144, 160, 0]
RATES = {0: [44100, 48000, 32000], 2: [22050, 24000, 16000], 3: [11025, 12000, 8000]}


def id3_size(data: bytes) -> int:
    """Длина тега ID3v2 в начале файла — кадры начинаются после него."""
    if len(data) < 10 or data[:3] != b"ID3":
        return 0
    size = struct.unpack(">I", b"\x00" + data[6:9])[0] if False else 0
    size = 0
    for byte in data[6:10]:
        size = (size << 7) | (byte & 0x7F)
    return size + 10


def mp3_frames(data: bytes):
    """Границы кадров MP3: (смещение, длина, длительность в секундах).

    Нужны, чтобы резать файл там, где кадр кончается: кусок, начатый с
    середины кадра, ломает и звук, и отсчёт времени.
    """
    pos = id3_size(data)
    end = len(data)
    while pos + 4 <= end:
        if data[pos] != 0xFF or (data[pos + 1] & 0xE0) != 0xE0:
            pos += 1
            continue
        header = data[pos + 1]
        version = (header >> 3) & 0x03
        layer = (header >> 1) & 0x03
        if layer != 0x01 or version == 0x01:  # только Layer III
            pos += 1
            continue
        flags = data[pos + 2]
        bitrate_index = (flags >> 4) & 0x0F
        rate_index = (flags >> 2) & 0x03
        padding = (flags >> 1) & 0x01
        if bitrate_index in (0, 15) or rate_index == 3:
            pos += 1
            continue
        mpeg1 = version == 0x03
        bitrate = (BITRATES_V1_L3 if mpeg1 else BITRATES_V2_L3)[bitrate_index] * 1000
        rate = RATES[0 if mpeg1 else (2 if version == 0x02 else 3)][rate_index]
        samples = 1152 if mpeg1 else 576
        size = (samples // 8 * bitrate) // rate + padding
        if size <= 4 or pos + size > end:
            break
        yield pos, size, samples / rate
        pos += size


def split_audio(data: bytes):
    """Куски не крупнее лимита загрузки: (байты, смещение по времени)."""
    chunks = []
    start_offset = None
    start_time = 0.0
    elapsed = 0.0
    current = 0
    for offset, size, duration in mp3_frames(data):
        if start_offset is None:
            start_offset = offset
            start_time = elapsed
        if current + size > CHUNK_LIMIT:
            chunks.append((data[start_offset:offset], start_time))
            start_offset, start_time, current = offset, elapsed, 0
        current += size
        elapsed += duration
    if start_offset is not None and current > 0:
        chunks.append((data[start_offset:], start_time))
    return chunks, elapsed


def post_audio(chunk: bytes, key: str) -> dict:
    boundary = "----citavuk" + hashlib.sha1(chunk[:64]).hexdigest()[:16]
    parts = []
    for name, value in (("model", MODEL), ("response_format", "verbose_json")):
        parts.append(
            f'--{boundary}\r\nContent-Disposition: form-data; name="{name}"\r\n\r\n{value}\r\n'.encode()
        )
    parts.append(
        f'--{boundary}\r\nContent-Disposition: form-data; name="file"; '
        f'filename="chunk.mp3"\r\nContent-Type: audio/mpeg\r\n\r\n'.encode()
    )
    body = b"".join(parts) + chunk + f"\r\n--{boundary}--\r\n".encode()
    request = urllib.request.Request(
        API_URL,
        data=body,
        headers={
            "Authorization": f"Bearer {key}",
            "Content-Type": f"multipart/form-data; boundary={boundary}",
        },
    )
    with urllib.request.urlopen(request, timeout=900) as response:
        return json.loads(response.read().decode("utf-8"))


def transcribe(audio_url: str, key: str) -> dict:
    request = urllib.request.Request(audio_url, headers={"User-Agent": "Mozilla/5.0"})
    with urllib.request.urlopen(request, timeout=600) as response:
        data = response.read()

    chunks, duration = split_audio(data)
    if not chunks:
        raise RuntimeError("не разобрать MP3")

    cues = []
    for index, (chunk, offset) in enumerate(chunks, 1):
        print(f"    кусок {index}/{len(chunks)} ({len(chunk) // 1024} КБ)", flush=True)
        result = None
        for attempt in range(1, ATTEMPTS + 1):
            try:
                result = post_audio(chunk, key)
                break
            except Exception as error:  # noqa: BLE001
                print(f"      попытка {attempt}: {error}", flush=True)
                if attempt == ATTEMPTS:
                    raise
        assert result is not None
        for segment in result.get("segments") or []:
            text = (segment.get("text") or "").strip()
            if not text:
                continue
            cues.append(
                {
                    "start": round(offset + float(segment.get("start", 0)), 2),
                    "end": round(offset + float(segment.get("end", 0)), 2),
                    "text": text,
                }
            )
    return {"duration": round(duration, 2), "cues": cues}


def episodes():
    for feed_id, url in FEEDS:
        request = urllib.request.Request(url, headers={"User-Agent": "Mozilla/5.0"})
        with urllib.request.urlopen(request, timeout=60) as response:
            root = ET.fromstring(response.read())
        for item in root.findall(".//item"):
            enclosure = item.find("enclosure")
            if enclosure is None or not enclosure.get("url"):
                continue
            yield {
                "feed": feed_id,
                "title": (item.findtext("title") or "").strip(),
                "audio": enclosure.get("url").split("?")[0],
            }


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--limit", type=int, default=0, help="сколько эпизодов взять")
    parser.add_argument("--out", default="public/transcripts")
    parser.add_argument("--force", action="store_true", help="перезаписать готовые")
    args = parser.parse_args()

    key = os.environ.get("POLZA_API_KEY", "").strip()
    if not key:
        print("нет POLZA_API_KEY в окружении", file=sys.stderr)
        return 1

    out = Path(args.out)
    out.mkdir(parents=True, exist_ok=True)

    items = list(episodes())
    if args.limit:
        items = items[: args.limit]
    print(f"эпизодов к обработке: {len(items)}")

    index_path = out / "index.json"
    index = {}
    if index_path.exists():
        index = json.loads(index_path.read_text(encoding="utf-8"))

    for number, episode in enumerate(items, 1):
        key_hash = hashlib.sha1(episode["audio"].encode("utf-8")).hexdigest()
        target = out / f"{key_hash}.json"
        print(f"[{number}/{len(items)}] {episode['title']}", flush=True)
        if target.exists() and not args.force:
            print("    уже есть", flush=True)
            index[episode["audio"]] = f"{key_hash}.json"
            continue
        try:
            result = transcribe(episode["audio"], key)
        except Exception as error:  # noqa: BLE001
            print(f"    не вышло: {error}", file=sys.stderr, flush=True)
            continue
        result["title"] = episode["title"]
        result["audio"] = episode["audio"]
        target.write_text(
            json.dumps(result, ensure_ascii=False, indent=1), encoding="utf-8"
        )
        index[episode["audio"]] = f"{key_hash}.json"
        index_path.write_text(
            json.dumps(index, ensure_ascii=False, indent=1), encoding="utf-8"
        )
        print(f"    реплик: {len(result['cues'])}", flush=True)

    index_path.write_text(
        json.dumps(index, ensure_ascii=False, indent=1), encoding="utf-8"
    )
    print(f"готово, транскриптов в индексе: {len(index)}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
