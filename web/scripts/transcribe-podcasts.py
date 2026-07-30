#!/usr/bin/env python3
"""Расшифровка эпизодов подкастов через Whisper на Groq.

Прежний транскрипт выскребался со страницы автора, а тайминги считались
пропорционально длительности — текст не совпадал с речью и убегал вперёд.
Здесь берётся само аудио, и тайминги приходят от модели.

    GROQ_API_KEY=... python web/scripts/transcribe-podcasts.py --limit 10

Результат — по файлу на эпизод в web/public/transcripts/, имя = sha1 ссылки
на аудио, плюс index.json со сопоставлением «ссылка на аудио → файл».
Выкладывается вместе с сайтом.

Почему Groq, а не polza.ai
--------------------------
Через polza.ai ключу доступны только две модели aiesa, и обе — русские ASR:
сербское «Krave, kokoške, ovce, koze, svinje» они отдают как «краве кокушке
овце козе свине», русскими буквами и с повтором каждой строки. Остальные
модели (whisper, voxtral, qwen-asr, gpt-4o-transcribe) ключу запрещены.
Whisper на Groq тот же текст пишет правильно, латиницей и с диакритикой,
и заодно дешевле всего перечисленного.

Подкасты двуязычные: часть эпизода по-сербски, часть по-английски. Язык
намеренно не задаётся — Whisper определяет его сам по каждому куску, а
принудительный `language` испортил бы вторую половину записи.
"""

from __future__ import annotations

import argparse
import hashlib
import json
import os
import re
import shutil
import struct
import subprocess
import sys
import tempfile
import time
import urllib.error
import urllib.request
import xml.etree.ElementTree as ET
from pathlib import Path

FEEDS = {
    "learn-serbian": "https://rss.buzzsprout.com/1246415.rss",
    "moze-kafa": "https://anchor.fm/s/aef64434/podcast/rss",
}

API_URL = "https://api.groq.com/openai/v1/audio/transcriptions"
MODEL = "whisper-large-v3-turbo"

USER_AGENT = "Mozilla/5.0 (compatible; Citavuk transcriber)"

# Кусок аудио на один запрос. Предел загрузки у Groq 25 МБ, но восьмимегабайтная
# посылка обрывалась на середине, поэтому берём вчетверо меньше: пять мегабайт —
# это около семи минут звука и запрос на пару секунд.
CHUNK_LIMIT = 5 * 1024 * 1024

# Предел загрузки у Groq — 25 МБ. Своё ограничение чуть ниже: к куску ещё
# добавляются поля multipart, и упереться в предел на границе незачем.
MAX_UPLOAD = 24 * 1024 * 1024

ATTEMPTS = 4

ITUNES = "{http://www.itunes.com/dtds/podcast-1.0.dtd}"

BITRATES_V1_L3 = [0, 32, 40, 48, 56, 64, 80, 96, 112, 128, 160, 192, 224, 256, 320, 0]
BITRATES_V2_L3 = [0, 8, 16, 24, 32, 40, 48, 56, 64, 80, 96, 112, 128, 144, 160, 0]
RATES = {0: [44100, 48000, 32000], 2: [22050, 24000, 16000], 3: [11025, 12000, 8000]}

# Заголовки VBR/CBR в самом первом кадре файла. Звука в этом кадре нет, зато в
# нём записано число кадров ВСЕГО файла — и по нему декодер на стороне Groq
# считает длительность куска равной длительности целого эпизода. Для получаса
# записи это 36 минут вместо семи: и квота, и деньги уходят впустую.
VBR_TAGS = (b"Xing", b"Info", b"VBRI")

# Фразы, которые Whisper выдумывает на музыке и тишине. Взяты из его типовых
# галлюцинаций: обучался он на субтитрах, и в пустоте дописывает их концовки.
HALLUCINATIONS = re.compile(
    r"""(
        subtitles?\s+by | subs?\s+by | amara\.org | titlovi | prevod\W*i?\W*obrada
        | thanks?\s+for\s+watching | thank\s+you\s+for\s+watching
        | hvala\s+(vam\s+)?(što|sto)\s+ste\s+gledali
        | субтитр | подписывайтесь | спасибо\s+за\s+просмотр
        | \[?\s*(music|musika|muzika|музыка|aplauz|applause)\s*\]?
    )""",
    re.IGNORECASE | re.VERBOSE,
)

# Порог «здесь речи нет». Whisper выставляет no_speech_prob близко к единице на
# музыке и шуме; всё, что выше порога, выбрасывается вместе с текстом.
NO_SPEECH = 0.5

# Ниже этой средней уверенности сегмент не текст, а догадка.
MIN_LOGPROB = -1.0


def id3_size(data: bytes) -> int:
    """Длина тега ID3v2 в начале файла — кадры начинаются после него."""
    if len(data) < 10 or data[:3] != b"ID3":
        return 0
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
    """Куски не крупнее лимита загрузки: (байты, смещение по времени).

    Возвращает пустой список, если файл разобрать не удалось. Разбор проверяется
    покрытием: сумма длин найденных кадров должна занимать почти весь файл. Без
    этой проверки на не-MP3 (или на файле с иным контейнером) разборщик находил
    несколько ложных кадров, а хвост уходил в запрос одним куском на 27 МБ —
    отсюда были и «413 Request Entity Too Large», и «could not process file».
    """
    body = len(data) - id3_size(data)
    if body <= 0:
        return [], 0.0

    frames = list(mp3_frames(data))
    if frames and any(tag in data[frames[0][0]:frames[0][0] + frames[0][1]]
                      for tag in VBR_TAGS):
        # Служебный кадр с числом кадров всего файла: звука в нём нет, а Groq по
        # нему считает длительность куска равной длительности всего эпизода.
        frames = frames[1:]
    if not frames:
        return [], 0.0

    covered = sum(size for _, size, _ in frames)
    if covered < body * 0.8:
        return [], 0.0

    chunks = []
    start_offset = frames[0][0]
    start_time = 0.0
    elapsed = 0.0
    current = 0

    for offset, size, duration in frames:
        if current + size > CHUNK_LIMIT and current > 0:
            chunks.append((data[start_offset:offset], start_time))
            start_offset, start_time, current = offset, elapsed, 0
        current += size
        elapsed += duration
    if current > 0:
        end = frames[-1][0] + frames[-1][1]
        chunks.append((data[start_offset:end], start_time))

    # Последняя защита: превышающий предел кусок в запрос не уходит.
    if any(len(chunk) > MAX_UPLOAD for chunk, _ in chunks):
        return [], 0.0
    return chunks, elapsed


def transcode_and_split(data: bytes, ffmpeg: str) -> tuple[list[tuple[bytes, float]], float]:
    """Перекодирует M4A/иной контейнер в небольшие MP3-фрагменты.

    Anchor раздаёт часть выпусков как M4A размером больше лимита Groq.
    Произвольно резать MP4-контейнер нельзя: только первый кусок содержит
    таблицу аудиосэмплов. ffmpeg создаёт самостоятельные фрагменты, после чего
    обычный MP3-разборщик вычисляет их точную длительность.
    """
    with tempfile.TemporaryDirectory(prefix="citavuk-transcript-") as directory:
        root = Path(directory)
        source = root / "source.media"
        source.write_bytes(data)
        pattern = root / "chunk-%04d.mp3"
        process = subprocess.run(
            [
                ffmpeg,
                "-hide_banner",
                "-loglevel",
                "error",
                "-i",
                str(source),
                "-map",
                "0:a:0",
                "-vn",
                "-ac",
                "1",
                "-ar",
                "16000",
                "-b:a",
                "48k",
                "-f",
                "segment",
                "-segment_time",
                "300",
                "-reset_timestamps",
                "1",
                str(pattern),
            ],
            capture_output=True,
            timeout=900,
        )
        if process.returncode != 0:
            message = process.stderr.decode("utf-8", "replace").strip()
            raise RuntimeError(f"ffmpeg не разобрал аудио: {message[-300:]}")

        result: list[tuple[bytes, float]] = []
        elapsed = 0.0
        files = sorted(root.glob("chunk-*.mp3"))
        if not files:
            raise RuntimeError("ffmpeg не создал аудиофрагменты")
        for file in files:
            parts, duration = split_audio(file.read_bytes())
            if not parts or duration <= 0:
                raise RuntimeError(f"не удалось проверить фрагмент {file.name}")
            result.extend((chunk, elapsed + offset) for chunk, offset in parts)
            elapsed += duration
        return result, elapsed


def retry_after(error: urllib.error.HTTPError, body: str) -> float:
    """Через сколько секунд повторять запрос после отказа по частоте.

    У Groq предел считается в секундах звука за час, и в сообщении он пишет
    точное время ожидания. Заголовок retry-after есть не всегда, поэтому
    разбирается и текст.
    """
    header = error.headers.get("retry-after") if error.headers else None
    if header:
        try:
            return float(header)
        except ValueError:
            pass
    match = re.search(r"try again in (?:(\d+)m)?([\d.]+)s", body)
    if match:
        minutes = float(match.group(1) or 0)
        return minutes * 60 + float(match.group(2))
    return 60.0


def post_audio(chunk: bytes, key: str) -> dict:
    boundary = "----citavuk" + hashlib.sha1(chunk[:64]).hexdigest()[:16]
    parts = []
    fields = [
        ("model", MODEL),
        ("response_format", "verbose_json"),
        # Нужны и слова, и сегменты: время берётся у слов, а отбраковка мусора
        # работает по сегментам — у слов нет ни no_speech_prob, ни уверенности.
        ("timestamp_granularities[]", "word"),
        ("timestamp_granularities[]", "segment"),
        # Нулевая температура — чтобы модель не «додумывала» на тихих участках.
        ("temperature", "0"),
    ]
    for name, value in fields:
        parts.append(
            f'--{boundary}\r\nContent-Disposition: form-data; name="{name}"'
            f"\r\n\r\n{value}\r\n".encode()
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
            # Без своего User-Agent запрос отбивает Cloudflare перед Groq:
            # «error code: 1010», подпись Python-urllib у него в чёрном списке.
            "User-Agent": USER_AGENT,
            "Accept": "application/json",
        },
    )
    with urllib.request.urlopen(request, timeout=600) as response:
        return json.loads(response.read().decode("utf-8"))


def post_with_retry(chunk: bytes, key: str) -> dict:
    for attempt in range(1, ATTEMPTS + 1):
        try:
            return post_audio(chunk, key)
        except urllib.error.HTTPError as error:
            body = error.read().decode("utf-8", "replace")
            if error.code == 429:
                wait = retry_after(error, body)
                print(f"      предел частоты, ждём {wait:.0f} с", flush=True)
                time.sleep(wait + 2)
                continue
            print(f"      попытка {attempt}: HTTP {error.code} {body[:160]}", flush=True)
            if attempt == ATTEMPTS:
                raise
            time.sleep(5 * attempt)
        except Exception as error:  # noqa: BLE001
            print(f"      попытка {attempt}: {error}", flush=True)
            if attempt == ATTEMPTS:
                raise
            time.sleep(5 * attempt)
    raise RuntimeError("не удалось получить расшифровку")


def usable(segment: dict, previous: str) -> bool:
    """Не мусор ли этот сегмент.

    Первые десять-пятнадцать секунд эпизода — музыкальная заставка, и на ней
    Whisper дописывает субтитровые концовки вроде «Subtitles by the Amara.org
    community». Отсекаем по трём признакам: сам признак «здесь нет речи»,
    низкая уверенность и повтор предыдущей строки — на музыке модель зацикливает
    одну и ту же фразу.
    """
    text = (segment.get("text") or "").strip()
    if not text:
        return False
    if float(segment.get("no_speech_prob") or 0) >= NO_SPEECH:
        return False
    if float(segment.get("avg_logprob") or 0) < MIN_LOGPROB:
        return False
    if HALLUCINATIONS.search(text):
        return False
    if text.casefold() == previous.casefold():
        return False
    return True


# Дальше этих границ реплику не растягиваем, даже если предложение не кончилось.
MAX_CUE_SECONDS = 7.0
MAX_CUE_WORDS = 14

# Пауза между словами, по которой реплика закрывается сама: столько тишины —
# это смена говорящего или новая мысль.
PAUSE = 1.2

SENTENCE_END = re.compile(r"[.!?…]$")


def bad_ranges(segments: list[dict]) -> list[tuple[float, float]]:
    """Отрезки, где Whisper сам себе не верит: музыка, шум, выдумки.

    Отбраковка остаётся сегментной, потому что признаки «здесь нет речи» и
    «уверенность низкая» есть только у сегментов. А время берётся у слов —
    поэтому плохие сегменты превращаются в отрезки времени, и слова, попавшие
    внутрь, выбрасываются.
    """
    ranges = []
    previous = ""
    for segment in segments:
        text = (segment.get("text") or "").strip()
        if not usable(segment, previous):
            try:
                ranges.append((float(segment.get("start", 0)), float(segment.get("end", 0))))
            except (TypeError, ValueError):
                pass
        elif text:
            previous = text
    return ranges


def cues_from_words(
    words: list[dict], segments: list[dict], offset: float
) -> tuple[list[dict], int]:
    """Собирает реплики из отдельных слов.

    Сегментному времени верить нельзя: в эпизоде, который начинается с
    пятнадцати секунд музыки, первый сегмент честно сообщает «start = 0.00»,
    хотя первое слово звучит на 15.38 — и подсветка уезжает вперёд на весь
    эпизод. У слов время настоящее, а музыку они видят просто как отсутствие
    слов.
    """
    skip = bad_ranges(segments)
    cues: list[dict] = []
    current: list[str] = []
    start = 0.0
    last_end = 0.0
    dropped = 0

    def flush() -> None:
        nonlocal current
        if not current:
            return
        text = " ".join(current).strip()
        if text and not HALLUCINATIONS.search(text):
            cues.append(
                {
                    "start": round(offset + start, 2),
                    "end": round(offset + last_end, 2),
                    "text": text,
                }
            )
        current = []

    for index, word in enumerate(words):
        text = str(word.get("word") or "").strip()
        try:
            word_start = float(word["start"])
            word_end = float(word["end"])
        except (KeyError, TypeError, ValueError):
            continue
        if not text or word_start < 0 or word_end <= word_start:
            dropped += 1
            continue
        if any(low <= word_start < high for low, high in skip):
            dropped += 1
            continue

        # На стыке сегментов Whisper изредка возвращает следующее слово со
        # временем раньше предыдущего. Если оставить его в текущей реплике,
        # получится end < start и караоке никогда не переключится дальше.
        if current and word_start + 0.05 < last_end:
            flush()

        if not current:
            start = word_start
        current.append(text)
        last_end = word_end

        gap = 0.0
        if index + 1 < len(words):
            try:
                gap = float(words[index + 1]["start"]) - word_end
            except (KeyError, TypeError, ValueError):
                gap = 0.0

        if (
            last_end - start >= MAX_CUE_SECONDS
            or len(current) >= MAX_CUE_WORDS
            or (SENTENCE_END.search(text) and len(current) >= 3)
            or gap >= PAUSE
        ):
            flush()

    flush()
    return cues, dropped


def normalize_cues(cues: list[dict]) -> list[dict]:
    """Делает итоговую шкалу времени пригодной для караоке.

    Текст и начала реплик приходят от Whisper. Здесь исправляются только
    технически невозможные границы: отрицательное время, end <= start и
    перекрытие с началом следующей реплики.
    """
    cleaned: list[dict] = []
    for cue in cues:
        text = str(cue.get("text") or "").strip()
        try:
            start = max(0.0, float(cue["start"]))
            end = float(cue["end"])
        except (KeyError, TypeError, ValueError):
            continue
        if not text or HALLUCINATIONS.search(text):
            continue
        cleaned.append({"start": start, "end": end, "text": text})

    cleaned.sort(key=lambda cue: (cue["start"], cue["end"]))
    coalesced: list[dict] = []
    for cue in cleaned:
        if coalesced and cue["start"] - coalesced[-1]["start"] < 0.08:
            previous = coalesced[-1]
            if cue["text"].casefold() not in previous["text"].casefold():
                previous["text"] = f"{previous['text']} {cue['text']}"
            previous["end"] = max(previous["end"], cue["end"])
            continue
        coalesced.append(cue)

    cleaned = coalesced
    for index, cue in enumerate(cleaned):
        start = cue["start"]
        if cue["end"] <= start:
            words = max(1, len(cue["text"].split()))
            cue["end"] = start + min(MAX_CUE_SECONDS, max(0.6, words * 0.38))

        if index + 1 < len(cleaned):
            following = cleaned[index + 1]["start"]
            if following > start and cue["end"] > following:
                cue["end"] = following

        cue["start"] = round(start, 2)
        cue["end"] = round(max(start + 0.05, cue["end"]), 2)

    return cleaned


def transcribe(audio_url: str, key: str, ffmpeg: str | None = None) -> dict:
    request = urllib.request.Request(audio_url, headers={"User-Agent": "Mozilla/5.0"})
    with urllib.request.urlopen(request, timeout=600) as response:
        data = response.read()

    chunks, duration = split_audio(data)
    if not chunks:
        if ffmpeg:
            print("    контейнер не MP3, перекодируем через ffmpeg", flush=True)
            chunks, duration = transcode_and_split(data, ffmpeg)
        # Разобрать по кадрам не удалось — не MP3 или иной контейнер. Целый файл
        # отправить всё же можно: его собственный заголовок описывает именно его,
        # так что длительность сервер посчитает верно.
        elif len(data) > MAX_UPLOAD:
            raise RuntimeError(
                f"файл не разбирается по кадрам и слишком велик "
                f"({len(data) // (1024 * 1024)} МБ); укажите --ffmpeg")
        else:
            print("    по кадрам не разобрать, отправляем целиком", flush=True)
            chunks, duration = [(data, 0.0)], 0.0

    cues: list[dict] = []
    dropped = 0
    timing_modes: set[str] = set()
    for index, (chunk, offset) in enumerate(chunks, 1):
        print(
            f"    кусок {index}/{len(chunks)} ({len(chunk) // 1024} КБ,"
            f" с {offset / 60:.0f} мин)",
            flush=True,
        )
        result = post_with_retry(chunk, key)
        segments = result.get("segments") or []
        words = result.get("words") or []

        if words:
            timing_modes.add("word")
            chunk_cues, skipped = cues_from_words(words, segments, offset)
            cues.extend(chunk_cues)
            dropped += skipped
            continue

        # Пословного времени не пришло — собираем из сегментов. Точность хуже,
        # особенно на первой реплике после музыки, но это лучше, чем ничего.
        timing_modes.add("segment")
        print("      пословного времени нет, берём сегменты", flush=True)
        previous = ""
        for segment in segments:
            if not usable(segment, previous):
                dropped += 1
                continue
            text = (segment.get("text") or "").strip()
            cues.append(
                {
                    "start": round(offset + float(segment.get("start", 0)), 2),
                    "end": round(offset + float(segment.get("end", 0)), 2),
                    "text": text,
                }
            )
            previous = text

    cues = normalize_cues(cues)
    if dropped:
        print(f"    выброшено слов без речи: {dropped}", flush=True)
    # Целый файл шёл одним куском — длительность считать было нечем; берём
    # конец последней реплики, этого хватает для полосы прокрутки.
    if duration <= 0 and cues:
        duration = max(cue["end"] for cue in cues)
    return {
        "duration": round(duration, 2),
        "source": "groq",
        "model": MODEL,
        "timing": "+".join(sorted(timing_modes)) or "unknown",
        "cues": cues,
    }


def episodes(feed_ids: list[str]):
    for feed_id in feed_ids:
        url = FEEDS[feed_id]
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


def normalize_catalog(out: Path, index: dict[str, str]) -> int:
    """Проверяет все опубликованные файлы и дописывает происхождение данных."""
    changed = 0
    for audio, name in index.items():
        target = out / name
        if not target.exists():
            continue
        data = json.loads(target.read_text(encoding="utf-8"))
        before = json.dumps(data, ensure_ascii=False, sort_keys=True)
        data["audio"] = data.get("audio") or audio
        data["source"] = data.get("source") or "groq"
        data["model"] = data.get("model") or MODEL
        data["timing"] = data.get("timing") or "word"
        data["cues"] = normalize_cues(data.get("cues") or [])
        if data["cues"]:
            data["duration"] = round(
                max(float(data.get("duration") or 0), data["cues"][-1]["end"]),
                2,
            )
        after = json.dumps(data, ensure_ascii=False, sort_keys=True)
        if before == after:
            continue
        target.write_text(
            json.dumps(data, ensure_ascii=False, indent=1), encoding="utf-8"
        )
        changed += 1
    return changed


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument(
        "--limit", type=int, default=10, help="сколько эпизодов взять (0 — все)"
    )
    parser.add_argument(
        "--feed",
        action="append",
        choices=sorted(FEEDS),
        help="какие ленты брать; по умолчанию учебная learn-serbian",
    )
    parser.add_argument("--out", default="public/transcripts")
    parser.add_argument(
        "--ffmpeg",
        default=os.environ.get("FFMPEG_BIN") or shutil.which("ffmpeg"),
        help="путь к ffmpeg для M4A; по умолчанию ищется в PATH/FFMPEG_BIN",
    )
    parser.add_argument("--force", action="store_true", help="перезаписать готовые")
    parser.add_argument(
        "--only",
        action="append",
        help="обработать только эпизоды, где заголовок или sha1 содержит строку",
    )
    parser.add_argument(
        "--prune",
        action="store_true",
        help="удалить транскрипты, которых нет в текущем отборе",
    )
    parser.add_argument(
        "--normalize-only",
        action="store_true",
        help="только проверить и нормализовать уже созданный каталог",
    )
    args = parser.parse_args()

    out = Path(args.out)
    out.mkdir(parents=True, exist_ok=True)

    index: dict[str, str] = {}
    index_path = out / "index.json"
    if index_path.exists() and not args.prune:
        index = json.loads(index_path.read_text(encoding="utf-8"))

    if args.normalize_only:
        normalized = normalize_catalog(out, index)
        print(f"нормализовано файлов: {normalized}")
        return 0

    key = os.environ.get("GROQ_API_KEY", "").strip()
    if not key:
        print("нет GROQ_API_KEY в окружении", file=sys.stderr)
        return 1

    items = list(episodes(args.feed or ["learn-serbian"]))
    if args.only:
        needles = [value.casefold() for value in args.only]
        items = [
            item
            for item in items
            if any(
                needle in item["title"].casefold()
                or needle
                in hashlib.sha1(item["audio"].encode("utf-8")).hexdigest()
                for needle in needles
            )
        ]
    if args.limit:
        items = items[: args.limit]
    print(f"эпизодов к обработке: {len(items)}")

    keep = set()
    for number, episode in enumerate(items, 1):
        name = hashlib.sha1(episode["audio"].encode("utf-8")).hexdigest()
        target = out / f"{name}.json"
        keep.add(target.name)
        print(f"[{number}/{len(items)}] {episode['title']}", flush=True)
        if target.exists() and not args.force:
            print("    уже есть", flush=True)
            index[episode["audio"]] = target.name
            continue
        try:
            result = transcribe(episode["audio"], key, args.ffmpeg)
        except Exception as error:  # noqa: BLE001
            print(f"    не вышло: {error}", file=sys.stderr, flush=True)
            continue
        result["title"] = episode["title"]
        result["audio"] = episode["audio"]
        target.write_text(
            json.dumps(result, ensure_ascii=False, indent=1), encoding="utf-8"
        )
        index[episode["audio"]] = target.name
        index_path.write_text(
            json.dumps(index, ensure_ascii=False, indent=1), encoding="utf-8"
        )
        print(f"    реплик: {len(result['cues'])}", flush=True)

    if args.prune:
        for path in out.glob("*.json"):
            if path.name != "index.json" and path.name not in keep:
                path.unlink()
                print(f"удалён лишний транскрипт: {path.name}")

    normalized = normalize_catalog(out, index)
    if normalized:
        print(f"нормализовано файлов: {normalized}")
    index_path.write_text(
        json.dumps(index, ensure_ascii=False, indent=1), encoding="utf-8"
    )
    print(f"готово, транскриптов в индексе: {len(index)}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
