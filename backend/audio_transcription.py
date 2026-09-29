"""Точная расшифровка пользовательского аудио.

Основной путь — быстрый ``whisper-large-v3-turbo`` у Groq. Если запрос не
прошёл или ответ выглядит сомнительно (низкий logprob, много no-speech,
галлюцинации, слишком маленькое покрытие дорожки), тот же файл отправляется
в Aiesa через OpenAI-совместимый STT Polza.ai. Исходный файл не сохраняется.

Провайдеры возвращают немного разные JSON, поэтому наружу выходит один
контракт: сербский ``srp``, реплики, говорящие и пословные таймкоды. Клиентам
не приходится знать, какой провайдер сработал.
"""

from __future__ import annotations

import hashlib
import json
import math
import os
import re
import shutil
import subprocess
import tempfile
import time
import urllib.error
import urllib.parse
import urllib.request
from pathlib import Path
from typing import Any, Iterable


GROQ_URL = "https://api.groq.com/openai/v1/audio/transcriptions"
POLZA_URL = "https://polza.ai/api/v1/audio/transcriptions"
GROQ_FAST_MODEL = "whisper-large-v3-turbo"
GROQ_QUALITY_MODEL = "whisper-large-v3"
POLZA_AIESA_MODEL = "aiesa/transcribe"
POLZA_FALLBACK_MODEL = "openai/whisper-large-v3"
MAX_AUDIO_BYTES = 48 * 1024 * 1024
# У Groq free-tier multipart-запрос ограничен 25 МБ, а у Polza на больших
# вложениях возможен 502. Держим запас под multipart-заголовки и режем только
# длинные записи; короткие файлы идут провайдеру без перекодирования.
# Polza прямо предупреждает о сбоях на вложениях около 15 МБ; берём 12 МиБ,
# чтобы запас остался и для multipart-обвязки, и для разных тарифов.
MAX_PROVIDER_UPLOAD_BYTES = 12 * 1024 * 1024
MP3_CHUNK_TARGET_BYTES = 5 * 1024 * 1024
GENERIC_CHUNK_SECONDS = 240
MAX_TRANSCRIPT_RESPONSE_BYTES = 8 * 1024 * 1024
DEFAULT_QUALITY_THRESHOLD = 0.72
DEFAULT_POLZA_TIMEOUT_SECONDS = 12 * 60
DEFAULT_POLZA_POLL_SECONDS = 12

SUPPORTED_AUDIO_MIMES = {
    "audio/aac",
    "audio/flac",
    "audio/m4a",
    "audio/mp4",
    "audio/mpeg",
    "audio/mpga",
    "audio/ogg",
    "audio/wav",
    "audio/webm",
    "audio/x-m4a",
    "audio/x-wav",
    "video/mp4",
}
SUPPORTED_AUDIO_EXTENSIONS = {
    "aac",
    "flac",
    "m4a",
    "mp3",
    "mp4",
    "mpeg",
    "mpga",
    "oga",
    "ogg",
    "wav",
    "webm",
}

SERBIAN_LANGUAGE_CODES = {"sr", "srp", "sr-latn", "sr-latn-rs", "serbian"}
SERBIAN_ONLY_CYRILLIC = set("јљњћђџЈЉЊЋЂЏ")
SERBIAN_DIACRITICS = set("čćđšžČĆĐŠŽ")
SERBIAN_COMMON_WORDS = {
    "je",
    "sam",
    "si",
    "su",
    "da",
    "ne",
    "ovo",
    "to",
    "što",
    "šta",
    "kako",
    "smo",
    "biti",
    "ima",
    "imao",
    "može",
    "zato",
    "samo",
    "već",
    "nije",
    "dobar",
    "dan",
    "zdravo",
    "hvala",
    "molim",
    "kafa",
    "kuća",
    "kuce",
    "volim",
    "želim",
    "neka",
    "sve",
    "svi",
    "oni",
    "ona",
    "on",
}

_HALLUCINATION_PATTERNS = (
    re.compile(r"subtitl|titlov|prevod\s*:|amara\.org|subscene|opensubtitles", re.I),
    re.compile(r"продолжение следует|субтитры|редактор субтитров|корректор", re.I),
    re.compile(
        r"thanks? for watching|hvala (vam )?(na )?(gledanju|pažnji)|hvala što ste gledali",
        re.I,
    ),
    re.compile(
        r"^[\s\W]*(music|музыка|muzika|aplauz|applause|smeh|laughter)[\s\W]*$",
        re.I,
    ),
)
_WORD_RE = re.compile(r"[^\W\d_]+(?:['’\-][^\W\d_]+)*|\d+", re.UNICODE)


class AudioTranscriptionError(RuntimeError):
    """Провайдер не смог распознать файл или вернул повреждённый ответ."""


class NotSerbianError(ValueError):
    def __init__(self, language_code: str, probability: float):
        super().__init__(language_code)
        self.language_code = language_code
        self.probability = probability


class _ProviderError(AudioTranscriptionError):
    def __init__(self, message: str, *, provider: str, status: int = 0):
        super().__init__(message)
        self.provider = provider
        self.status = status


def validate_audio(data: bytes, mime_type: str, filename: str) -> None:
    """Проверяет размер, расширение/MIME и сигнатуру до сетевого запроса."""

    if not data:
        raise ValueError("Аудиофайл пустой.")
    if len(data) > MAX_AUDIO_BYTES:
        raise ValueError("Аудиофайл должен быть не больше 48 МБ.")

    mime = mime_type.lower().split(";", 1)[0].strip()
    extension = filename.rsplit(".", 1)[-1].lower() if "." in filename else ""
    if mime not in SUPPORTED_AUDIO_MIMES and extension not in SUPPORTED_AUDIO_EXTENSIONS:
        raise ValueError("Поддерживаются MP3, M4A, WAV, OGG, FLAC и WebM.")

    header = data[:16]
    looks_valid = (
        header.startswith(b"ID3")
        or (len(header) >= 2 and header[0] == 0xFF and header[1] & 0xE0 == 0xE0)
        or (header.startswith(b"RIFF") and data[8:12] == b"WAVE")
        or header.startswith(b"OggS")
        or header.startswith(b"fLaC")
        or data[4:8] == b"ftyp"
        or header.startswith(b"\x1aE\xdf\xa3")
    )
    if not looks_valid:
        raise ValueError("Файл не похож на поддерживаемую аудиозапись.")


def _safe_filename(filename: str, fallback: str = "audio.mp3") -> str:
    clean = re.sub(r"[\r\n\\/\x00-\x1f]+", "_", filename or "")
    clean = re.sub(r"[^A-Za-z0-9._-]+", "_", clean).strip("._")
    return clean[:120] or fallback


def _multipart(
    data: bytes,
    filename: str,
    mime_type: str,
    fields: Iterable[tuple[str, str]],
) -> tuple[bytes, str]:
    """Собирает multipart без стороннего HTTP-пакета."""

    boundary = "----citavuk-audio-" + hashlib.sha256(data[:256]).hexdigest()[:20]
    parts: list[bytes] = []
    for name, value in fields:
        safe_name = re.sub(r"[^A-Za-z0-9_.\[\]-]", "_", name)
        parts.append(
            (
                f"--{boundary}\r\n"
                f'Content-Disposition: form-data; name="{safe_name}"\r\n\r\n'
                f"{value}\r\n"
            ).encode("utf-8")
        )
    parts.append(
        (
            f"--{boundary}\r\n"
            f'Content-Disposition: form-data; name="file"; filename="{_safe_filename(filename)}"\r\n'
            f"Content-Type: {mime_type or 'application/octet-stream'}\r\n\r\n"
        ).encode("utf-8")
    )
    parts.extend((data, f"\r\n--{boundary}--\r\n".encode("ascii")))
    return b"".join(parts), boundary


_MP3_BITRATES_V1_L3 = [0, 32, 40, 48, 56, 64, 80, 96, 112, 128, 160, 192, 224, 256, 320, 0]
_MP3_BITRATES_V2_L3 = [0, 8, 16, 24, 32, 40, 48, 56, 64, 80, 96, 112, 128, 144, 160, 0]
_MP3_RATES = {0: [44100, 48000, 32000], 2: [22050, 24000, 16000], 3: [11025, 12000, 8000]}
_MP3_VBR_TAGS = (b"Xing", b"Info", b"VBRI")


def _id3_size(data: bytes) -> int:
    """Возвращает смещение первого MP3-кадра после ID3v2."""

    if len(data) < 10 or data[:3] != b"ID3":
        return 0
    size = 0
    for byte in data[6:10]:
        size = (size << 7) | (byte & 0x7F)
    return min(len(data), size + 10)


def _mp3_frames(data: bytes) -> Iterable[tuple[int, int, float]]:
    """Ищет границы Layer III кадров без декодирования аудио."""

    position = _id3_size(data)
    while position + 4 <= len(data):
        if data[position] != 0xFF or data[position + 1] & 0xE0 != 0xE0:
            position += 1
            continue
        header = data[position + 1]
        version = (header >> 3) & 0x03
        layer = (header >> 1) & 0x03
        if layer != 0x01 or version == 0x01:
            position += 1
            continue
        flags = data[position + 2]
        bitrate_index = (flags >> 4) & 0x0F
        rate_index = (flags >> 2) & 0x03
        padding = (flags >> 1) & 0x01
        if bitrate_index in (0, 15) or rate_index == 3:
            position += 1
            continue
        mpeg1 = version == 0x03
        bitrates = _MP3_BITRATES_V1_L3 if mpeg1 else _MP3_BITRATES_V2_L3
        bitrate = bitrates[bitrate_index] * 1000
        rate_group = 0 if mpeg1 else (2 if version == 0x02 else 3)
        rate = _MP3_RATES[rate_group][rate_index]
        samples = 1152 if mpeg1 else 576
        frame_size = (samples // 8 * bitrate) // rate + padding
        if frame_size <= 4 or position + frame_size > len(data):
            break
        yield position, frame_size, samples / rate
        position += frame_size


def _split_mp3(data: bytes) -> list[tuple[bytes, float]]:
    """Режет MP3 по кадрам, не ломая контейнер и шкалу времени."""

    body_start = _id3_size(data)
    body_size = len(data) - body_start
    if body_size <= 0:
        return []
    frames = list(_mp3_frames(data))
    skipped_vbr_header = False
    if frames and any(
        tag in data[frames[0][0] : frames[0][0] + frames[0][1]]
        for tag in _MP3_VBR_TAGS
    ):
        # Xing/Info/VBRI — служебный кадр с длительностью целого файла, а не
        # речь. Если отдать его в отдельный запрос, провайдер ошибочно
        # растянет таймкоды первого куска на весь исходник.
        frames = frames[1:]
        skipped_vbr_header = True
    if not frames:
        return []
    covered = sum(size for _, size, _ in frames)
    if covered < body_size * 0.8:
        return []

    chunks: list[tuple[bytes, float]] = []
    # Сохраняем ID3 только когда он не соседствует с пропущенным VBR-кадром:
    # иначе в первый запрос снова попадает служебная длительность всего файла.
    first_offset = 0 if body_start and not skipped_vbr_header else frames[0][0]
    chunk_start = first_offset
    chunk_time = 0.0
    chunk_size = 0
    elapsed = 0.0
    for offset, size, frame_duration in frames:
        if chunk_size + size > MP3_CHUNK_TARGET_BYTES and chunk_size:
            chunks.append((data[chunk_start:offset], chunk_time))
            chunk_start = offset
            chunk_time = elapsed
            chunk_size = 0
        chunk_size += size
        elapsed += frame_duration
    if chunk_size:
        end = frames[-1][0] + frames[-1][1]
        chunks.append((data[chunk_start:end], chunk_time))
    if any(len(chunk) > MAX_PROVIDER_UPLOAD_BYTES for chunk, _ in chunks):
        return []
    return chunks


def _ffmpeg_chunks(data: bytes, filename: str) -> list[tuple[bytes, float, str, str]]:
    """Перекодирует большой контейнер в небольшие моно OGG-фрагменты.

    FFmpeg ставится в production-образ. Локально его отсутствие не скрывает
    проблему: вызывающий код вернёт понятную ошибку и предложит уменьшить файл.
    """

    executable = os.getenv("FFMPEG_BIN", "").strip() or shutil.which("ffmpeg")
    if not executable:
        raise AudioTranscriptionError(
            "Большой аудиофайл нельзя безопасно разбить: на сервере не найден ffmpeg."
        )
    try:
        with tempfile.TemporaryDirectory(prefix="citavuk-audio-") as directory:
            root = Path(directory)
            source = root / _safe_filename(filename, "source.audio")
            pattern = root / "chunk-%04d.ogg"
            source.write_bytes(data)
            process = subprocess.run(
                [
                    executable,
                    "-hide_banner",
                    "-loglevel",
                    "error",
                    "-y",
                    "-i",
                    str(source),
                    "-map",
                    "0:a:0",
                    "-vn",
                    "-ac",
                    "1",
                    "-ar",
                    "16000",
                    "-f",
                    "segment",
                    "-segment_time",
                    str(GENERIC_CHUNK_SECONDS),
                    "-reset_timestamps",
                    "1",
                    "-c:a",
                    "libopus",
                    "-b:a",
                    "32k",
                    str(pattern),
                ],
                capture_output=True,
                timeout=15 * 60,
                check=False,
            )
            if process.returncode != 0:
                details = process.stderr.decode("utf-8", "replace").strip()
                raise AudioTranscriptionError(
                    f"ffmpeg не разобрал аудио: {details[-300:]}"
                )
            files = sorted(root.glob("chunk-*.ogg"))
            if not files:
                raise AudioTranscriptionError("ffmpeg не создал аудиофрагменты.")
            chunks: list[tuple[bytes, float, str, str]] = []
            for index, path in enumerate(files):
                chunk = path.read_bytes()
                if not chunk or len(chunk) > MAX_PROVIDER_UPLOAD_BYTES:
                    raise AudioTranscriptionError(
                        "ffmpeg создал слишком большой фрагмент аудио."
                    )
                chunks.append(
                    (
                        chunk,
                        float(index * GENERIC_CHUNK_SECONDS),
                        "audio/ogg",
                        f"speech-{index + 1}-of-{len(files)}.ogg",
                    )
                )
            return chunks
    except subprocess.TimeoutExpired as error:
        raise AudioTranscriptionError("ffmpeg слишком долго обрабатывает аудио.") from error
    except OSError as error:
        raise AudioTranscriptionError("Не удалось запустить ffmpeg на сервере.") from error


def _provider_chunks(
    data: bytes,
    filename: str,
    mime_type: str,
) -> list[tuple[bytes, float, str, str]]:
    """Готовит части, каждая из которых укладывается в лимит STT API."""

    if len(data) <= MAX_PROVIDER_UPLOAD_BYTES:
        return [(data, 0.0, mime_type, filename)]
    extension = filename.rsplit(".", 1)[-1].lower() if "." in filename else ""
    if extension in {"mp3", "mpeg", "mpga"} or mime_type.lower().split(";", 1)[0] in {
        "audio/mpeg",
        "audio/mpga",
    }:
        mp3_chunks = _split_mp3(data)
        if mp3_chunks:
            return [
                (chunk, offset, "audio/mpeg", f"speech-{index + 1}-of-{len(mp3_chunks)}.mp3")
                for index, (chunk, offset) in enumerate(mp3_chunks)
            ]
    return _ffmpeg_chunks(data, filename)


def _number(value: Any) -> float | None:
    try:
        result = float(value)
    except (TypeError, ValueError):
        return None
    return result if math.isfinite(result) and result >= 0 else None


def _metric_number(value: Any) -> float | None:
    """Число для метрик Whisper, где logprob закономерно отрицателен."""

    try:
        result = float(value)
    except (TypeError, ValueError):
        return None
    return result if math.isfinite(result) else None


def _speaker_label(raw: Any) -> str:
    value = str(raw or "speaker_0").strip()
    return value if re.fullmatch(r"[A-Za-z0-9_-]{1,40}", value) else "speaker_0"


def _clean_text(value: Any, limit: int = 3000) -> str:
    return re.sub(r"\s+", " ", str(value or "")).strip()[:limit]


def _normalise_language(value: Any) -> str:
    language = str(value or "").strip().lower().replace("_", "-")
    if language in SERBIAN_LANGUAGE_CODES or language.startswith("serb"):
        return "srp"
    return language


def _looks_serbian_text(text: str) -> bool:
    value = _clean_text(text, 12000)
    if not value:
        return False
    if any(char in value for char in SERBIAN_ONLY_CYRILLIC | SERBIAN_DIACRITICS):
        return True
    words = {word.lower() for word in _WORD_RE.findall(value)}
    return len(words & SERBIAN_COMMON_WORDS) >= 2


def _is_word_text(text: str) -> bool:
    return bool(_WORD_RE.search(text))


def _approximate_words(
    text: str,
    start: float,
    end: float,
    speaker: str,
) -> list[dict[str, Any]]:
    """Запасная раскладка, если Aiesa вернула только segment timestamps."""

    tokens = _WORD_RE.findall(text)
    if not tokens:
        return []
    duration = max(0.05, end - start)
    step = duration / len(tokens)
    return [
        {
            "text": token,
            "start": round(start + index * step, 3),
            "end": round(start + (index + 1) * step, 3),
            "speaker": speaker,
        }
        for index, token in enumerate(tokens)
    ]


def _word_entries(payload: dict[str, Any]) -> list[dict[str, Any]]:
    result: list[dict[str, Any]] = []
    raw_words = payload.get("words")
    if not isinstance(raw_words, list):
        raw_words = []
    for raw in raw_words:
        if not isinstance(raw, dict):
            continue
        kind = str(raw.get("type") or "word").lower()
        if kind in {"spacing", "punctuation", "audio_event"}:
            continue
        text = _clean_text(raw.get("word", raw.get("text", "")), 240)
        start = _number(raw.get("start"))
        end = _number(raw.get("end"))
        if not text or not _is_word_text(text) or start is None or end is None or end <= start:
            continue
        result.append(
            {
                "text": text,
                "start": round(start, 3),
                "end": round(end, 3),
                "speaker": _speaker_label(
                    raw.get("speaker_id", raw.get("speaker", raw.get("speaker_label")))
                ),
            }
        )

    # Некоторые diarized_json-ответы хранят words внутри реплик, а не наверху.
    if result:
        return result
    raw_segments = payload.get("segments")
    for segment in raw_segments if isinstance(raw_segments, list) else []:
        if not isinstance(segment, dict) or not isinstance(segment.get("words"), list):
            continue
        for raw in segment["words"]:
            if not isinstance(raw, dict):
                continue
            text = _clean_text(raw.get("word", raw.get("text", "")), 240)
            start = _number(raw.get("start"))
            end = _number(raw.get("end"))
            if not text or not _is_word_text(text) or start is None or end is None or end <= start:
                continue
            result.append(
                {
                    "text": text,
                    "start": round(start, 3),
                    "end": round(end, 3),
                    "speaker": _speaker_label(
                        raw.get("speaker_id", raw.get("speaker", segment.get("speaker")))
                    ),
                }
            )
    return result


def _group_words(words: list[dict[str, Any]]) -> list[dict[str, Any]]:
    """Группирует слова в реплики по говорящему и паузам."""

    result: list[dict[str, Any]] = []
    current: list[dict[str, Any]] = []
    current_speaker = "speaker_0"
    for word in sorted(words, key=lambda item: item["start"]):
        speaker = word["speaker"]
        should_break = bool(current) and (
            speaker != current_speaker
            or word["start"] - current[-1]["end"] >= 1.2
            or word["start"] - current[0]["start"] >= 14.0
        )
        if should_break:
            result.append(_segment_from_words(current, current_speaker))
            current = []
        if not current:
            current_speaker = speaker
        current.append(word)
    if current:
        result.append(_segment_from_words(current, current_speaker))
    return result


def _segment_from_words(words: list[dict[str, Any]], speaker: str) -> dict[str, Any]:
    return {
        "speaker": speaker,
        "start": round(words[0]["start"], 3),
        "end": round(max(words[-1]["end"], words[0]["start"] + 0.05), 3),
        "text": " ".join(word["text"] for word in words).strip(),
        "words": [
            {"text": word["text"], "start": word["start"], "end": word["end"]}
            for word in words
        ],
    }


def _raw_segments(payload: dict[str, Any], words: list[dict[str, Any]]) -> list[dict[str, Any]]:
    raw_segments = payload.get("segments")
    if not isinstance(raw_segments, list):
        raw_segments = payload.get("utterances") or payload.get("results")
    segments: list[dict[str, Any]] = []
    if isinstance(raw_segments, list):
        for raw in raw_segments:
            if not isinstance(raw, dict):
                continue
            text = _clean_text(raw.get("text"))
            start = _number(raw.get("start"))
            end = _number(raw.get("end"))
            if not text and isinstance(raw.get("words"), list):
                text = " ".join(
                    _clean_text(item.get("word", item.get("text", "")), 240)
                    for item in raw["words"]
                    if isinstance(item, dict)
                ).strip()
            if not text or start is None or end is None or end <= start:
                continue
            segments.append(
                {
                    "speaker": _speaker_label(
                        raw.get("speaker_id", raw.get("speaker", raw.get("speaker_label")))
                    ),
                    "start": round(start, 3),
                    "end": round(end, 3),
                    "text": text,
                    "raw": raw,
                }
            )
    if segments:
        return segments
    return _group_words(words)


def _normalise_provider_response(
    payload: dict[str, Any],
    *,
    provider: str,
    model: str,
) -> dict[str, Any]:
    """Приводит Groq/Polza/Aiesa JSON к общему клиентскому контракту."""

    if not isinstance(payload, dict):
        raise AudioTranscriptionError("Сервис распознавания вернул неверный ответ.")
    language = _normalise_language(
        payload.get("language_code", payload.get("language", payload.get("detected_language")))
    )
    words = _word_entries(payload)
    segments = _raw_segments(payload, words)
    # Не отдаём клиенту отдельные галлюцинации посреди нормальной записи.
    # Если подозрительными оказались все сегменты, оставляем их для общего
    # quality-gate: это даёт оркестратору шанс отправить файл на резервную
    # модель, а не превратить ответ провайдера в «пустой» без объяснения.
    usable_segments = [
        segment for segment in segments if _is_confident_segment(segment)
    ]
    if usable_segments and len(usable_segments) < len(segments):
        segments = usable_segments
    if not segments:
        text = _clean_text(payload.get("text"), 12000)
        duration = _number(payload.get("duration")) or max(0.5, len(text) / 12)
        if text and _looks_serbian_text(text):
            segments = [{
                "speaker": "speaker_0",
                "start": 0.0,
                "end": round(duration, 3),
                "text": text,
                "raw": {},
            }]
    if not segments:
        raise AudioTranscriptionError("Сервис не вернул разборчивую речь с таймкодами.")

    used_word_indexes: set[int] = set()
    canonical_segments: list[dict[str, Any]] = []
    for segment in segments:
        speaker = _speaker_label(segment.get("speaker"))
        segment_words: list[dict[str, Any]] = []
        for index, word in enumerate(words):
            if index in used_word_indexes:
                continue
            if word["end"] > segment["start"] - 0.2 and word["start"] < segment["end"] + 0.2:
                segment_words.append(word)
                used_word_indexes.add(index)
        if not segment_words:
            raw = segment.get("raw") or {}
            nested = raw.get("words") if isinstance(raw, dict) else None
            if isinstance(nested, list):
                nested_words = _word_entries({"words": nested})
                segment_words = [
                    {**word, "speaker": speaker}
                    for word in nested_words
                    if word["end"] > segment["start"] - 0.2
                    and word["start"] < segment["end"] + 0.2
                ]
        segment_words.sort(key=lambda item: item["start"])
        if not segment_words:
            segment_words = _approximate_words(
                segment["text"], segment["start"], segment["end"], speaker
            )
        text = _clean_text(segment.get("text")) or " ".join(
            word["text"] for word in segment_words
        )
        if not text or not segment_words:
            continue
        canonical = {
            "speaker": speaker,
            "start": round(max(0.0, segment["start"]), 3),
            "end": round(max(segment["end"], segment["start"] + 0.05), 3),
            "text": text,
            "words": [
                {
                    "text": word["text"],
                    "start": round(max(0.0, word["start"]), 3),
                    "end": round(max(word["end"], word["start"] + 0.01), 3),
                }
                for word in segment_words
            ],
        }
        raw_segment = segment.get("raw")
        if isinstance(raw_segment, dict):
            for key in ("avg_logprob", "no_speech_prob", "compression_ratio"):
                if key in raw_segment:
                    canonical[key] = raw_segment[key]
        canonical_segments.append(canonical)
    canonical_segments.sort(key=lambda item: item["start"])
    if not canonical_segments:
        raise AudioTranscriptionError("Сервис не вернул слова с валидными таймкодами.")

    joined_text = " ".join(segment["text"] for segment in canonical_segments).strip()
    probability = _number(
        payload.get(
            "language_probability",
            payload.get("language_confidence", payload.get("confidence")),
        )
    )
    if probability is None:
        probability = 0.86 if language == "srp" or _looks_serbian_text(joined_text) else 0.2
    if not language and _looks_serbian_text(joined_text):
        language = "srp"
    duration = _number(payload.get("duration")) or max(
        segment["end"] for segment in canonical_segments
    )
    speakers: list[str] = []
    for segment in canonical_segments:
        if segment["speaker"] not in speakers:
            speakers.append(segment["speaker"])
    result = {
        "language_code": language or "unknown",
        "language_probability": round(probability, 4),
        "duration": round(max(duration, canonical_segments[-1]["end"]), 3),
        "speakers": speakers,
        "segments": canonical_segments,
        "provider": provider,
        "model": model,
        "text": joined_text,
    }
    quality_score, quality_reasons = transcription_quality(result)
    result["quality_score"] = quality_score
    result["quality_reasons"] = quality_reasons
    return result


def normalise_provider_response(
    payload: dict[str, Any],
    *,
    provider: str = "unknown",
    model: str = "unknown",
) -> dict[str, Any]:
    """Публичная обёртка для контрактных тестов и операторских скриптов."""

    return _normalise_provider_response(payload, provider=provider, model=model)


def normalise_scribe_response(payload: dict[str, Any]) -> dict[str, Any]:
    """Совместимость со старым Scribe-контрактом и существующими тестами."""

    language_code = _normalise_language(payload.get("language_code"))
    probability = _number(payload.get("language_probability")) or 0.0
    if language_code != "srp" or probability < 0.35:
        raise NotSerbianError(language_code or "unknown", probability)
    raw_words = payload.get("words")
    if not isinstance(raw_words, list):
        raise AudioTranscriptionError("Сервис не вернул таймкоды слов.")
    words = []
    for entry in raw_words:
        if not isinstance(entry, dict) or str(entry.get("type") or "word") != "word":
            continue
        text = _clean_text(entry.get("text"), 240)
        start = _number(entry.get("start"))
        end = _number(entry.get("end"))
        if text and start is not None and end is not None and end > start:
            words.append({
                "text": text,
                "start": start,
                "end": end,
                "speaker": _speaker_label(entry.get("speaker_id")),
            })
    segments = _group_words(words)
    if not segments:
        raise AudioTranscriptionError("В записи не удалось найти разборчивую речь.")
    speakers: list[str] = []
    for segment in segments:
        if segment["speaker"] not in speakers:
            speakers.append(segment["speaker"])
    return {
        "language_code": "srp",
        "language_probability": round(probability, 4),
        "duration": round(max(segment["end"] for segment in segments), 3),
        "speakers": speakers,
        "segments": segments,
    }


def is_likely_hallucination(text: Any) -> bool:
    value = _clean_text(text, 4000)
    if not value:
        return True
    if any(pattern.search(value) for pattern in _HALLUCINATION_PATTERNS):
        return True
    words = [word.lower() for word in _WORD_RE.findall(value)]
    if len(words) >= 6 and len(set(words)) <= 2:
        return True
    return False


def _is_confident_segment(segment: dict[str, Any]) -> bool:
    """Отбрасывает шумовые/субтитровые галлюцинации Whisper."""

    if not isinstance(segment, dict):
        return False
    text = _clean_text(segment.get("text"), 4000)
    if not text or is_likely_hallucination(text):
        return False
    no_speech = _number(segment.get("no_speech_prob"))
    if no_speech is not None and no_speech >= 0.6:
        return False
    logprob = _metric_number(segment.get("avg_logprob"))
    if logprob is not None and logprob < -1.0:
        return False
    compression = _number(segment.get("compression_ratio"))
    if compression is not None and compression > 2.4:
        return False
    return True


def transcription_quality(payload: dict[str, Any]) -> tuple[float, list[str]]:
    """Возвращает score 0..1 и объяснение для логов/диагностики."""

    segments = payload.get("segments") if isinstance(payload, dict) else None
    if not isinstance(segments, list) or not segments:
        return 0.0, ["нет сегментов"]
    text = " ".join(_clean_text(segment.get("text")) for segment in segments)
    duration = _number(payload.get("duration")) or max(
        _number(segment.get("end")) or 0 for segment in segments
    )
    covered = sum(
        max(0.0, (_number(segment.get("end")) or 0) - (_number(segment.get("start")) or 0))
        for segment in segments
    )
    score = 0.9
    reasons: list[str] = []
    metrics = [
        _metric_number(segment.get("avg_logprob"))
        for segment in segments
        if isinstance(segment, dict)
    ]
    metrics = [value for value in metrics if value is not None]
    if metrics:
        average_logprob = sum(metrics) / len(metrics)
        if average_logprob < -1.0:
            score -= 0.24
            reasons.append("низкая уверенность слов")
        elif average_logprob < -0.65:
            score -= 0.12
            reasons.append("пониженная уверенность слов")
    no_speech = [
        _number(segment.get("no_speech_prob"))
        for segment in segments
        if isinstance(segment, dict)
    ]
    no_speech = [value for value in no_speech if value is not None]
    if no_speech and sum(no_speech) / len(no_speech) > 0.45:
        score -= 0.2
        reasons.append("много участков без речи")
    compression = [
        _number(segment.get("compression_ratio"))
        for segment in segments
        if isinstance(segment, dict)
    ]
    compression = [value for value in compression if value is not None]
    if compression and sum(compression) / len(compression) > 2.4:
        score -= 0.2
        reasons.append("подозрение на повтор/галлюцинацию")
    if is_likely_hallucination(text):
        score -= 0.35
        reasons.append("похож на галлюцинацию распознавателя")
    if duration > 12 and covered / duration < 0.08:
        score -= 0.2
        reasons.append("слишком мало дорожки покрыто текстом")
    if duration > 3 and len(_WORD_RE.findall(text)) < 2:
        score -= 0.2
        reasons.append("слишком короткий результат")
    probability = _number(payload.get("language_probability"))
    if probability is not None and probability < 0.6:
        score -= 0.2
        reasons.append("неуверенное определение языка")
    return round(max(0.0, min(1.0, score)), 4), reasons


def _provider_json(
    url: str,
    body: bytes,
    boundary: str,
    *,
    provider: str,
    api_key: str,
    timeout: float,
) -> dict[str, Any]:
    request = urllib.request.Request(
        url,
        data=body,
        headers={
            "Authorization": f"Bearer {api_key.strip()}",
            "Content-Type": f"multipart/form-data; boundary={boundary}",
            "Accept": "application/json",
            "User-Agent": "Citavuk audio transcriber/2.0",
        },
    )
    try:
        with urllib.request.urlopen(request, timeout=timeout) as response:
            raw = response.read(MAX_TRANSCRIPT_RESPONSE_BYTES + 1)
    except urllib.error.HTTPError as error:
        error_body = error.read().decode("utf-8", "replace")[:500]
        raise _ProviderError(
            f"{provider} отклонил расшифровку ({error.code}): {error_body}",
            provider=provider,
            status=error.code,
        ) from error
    except (urllib.error.URLError, TimeoutError, OSError) as error:
        raise _ProviderError(f"{provider} временно недоступен.", provider=provider) from error
    if len(raw) > MAX_TRANSCRIPT_RESPONSE_BYTES:
        raise _ProviderError(
            f"{provider} вернул слишком большой ответ.", provider=provider, status=502
        )
    try:
        payload = json.loads(raw.decode("utf-8"))
    except (UnicodeDecodeError, json.JSONDecodeError) as error:
        raise _ProviderError(
            f"{provider} вернул повреждённый ответ.", provider=provider, status=502
        ) from error
    if not isinstance(payload, dict):
        raise _ProviderError(f"{provider} вернул неверный ответ.", provider=provider, status=502)
    return payload


def _groq_fields(model: str) -> list[tuple[str, str]]:
    return [
        ("model", model),
        # Здесь речь всегда учебная сербская. Передача ISO-кода помогает
        # Whisper выбрать правильную фонетику и снижает путаницу с русским.
        ("language", "sr"),
        ("response_format", "verbose_json"),
        ("temperature", "0"),
        ("timestamp_granularities[]", "segment"),
        ("timestamp_granularities[]", "word"),
        (
            "prompt",
            "Serbian speech. Preserve Serbian Latin and Cyrillic, including č ć đ š ž and ј љ њ ћ ђ џ. "
            "Do not translate, paraphrase, invent subtitles, or add text during silence.",
        ),
    ]


def request_groq_transcription(
    data: bytes,
    filename: str,
    mime_type: str,
    api_key: str,
    *,
    model: str = GROQ_FAST_MODEL,
) -> dict[str, Any]:
    body, boundary = _multipart(data, filename, mime_type, _groq_fields(model))
    payload = _provider_json(
        GROQ_URL,
        body,
        boundary,
        provider="Groq",
        api_key=api_key,
        timeout=4 * 60,
    )
    payload.setdefault("model", model)
    return payload


def _polza_fields(model: str) -> list[tuple[str, str]]:
    return [
        ("model", model),
        # Локальная аудиотека принимает только сербскую речь. Явная подсказка
        # заметно уменьшает подмену č/ć/đ и переключение на русский/английский
        # в коротких фрагментах.
        ("language", "sr"),
        ("response_format", "diarized_json" if model.startswith("aiesa/") else "verbose_json"),
        ("temperature", "0"),
        ("timestamp_granularities[0]", "word"),
        ("timestamp_granularities[1]", "segment"),
        ("chunking_strategy", "auto"),
        ("stream", "false"),
        (
            "prompt",
            "Serbian speech. Preserve Serbian Latin and Cyrillic, including č ć đ š ž and ј љ њ ћ ђ џ. "
            "Do not translate, paraphrase, invent subtitles, or add text during silence.",
        ),
    ]


def _polza_error_message(payload: dict[str, Any], fallback: str) -> str:
    error = payload.get("error")
    if isinstance(error, dict):
        return str(error.get("message") or fallback)
    return str(payload.get("message") or payload.get("detail") or fallback)


def _unwrap_transcription_payload(payload: dict[str, Any]) -> dict[str, Any]:
    """У разных режимов Polza результат лежит в data/result; сводим его."""

    for key in ("data", "result", "transcription"):
        nested = payload.get(key)
        if isinstance(nested, dict) and (
            isinstance(nested.get("segments"), list) or nested.get("text")
        ):
            return {**payload, **nested}
    return payload


def request_polza_transcription(
    data: bytes,
    filename: str,
    mime_type: str,
    api_key: str,
    *,
    model: str = POLZA_AIESA_MODEL,
) -> dict[str, Any]:
    body, boundary = _multipart(data, filename, mime_type, _polza_fields(model))
    payload = _provider_json(
        POLZA_URL,
        body,
        boundary,
        provider="Aiesa через Polza.ai",
        api_key=api_key,
        timeout=4 * 60,
    )
    payload = _unwrap_transcription_payload(payload)
    if isinstance(payload.get("segments"), list) or payload.get("text"):
        payload.setdefault("model", model)
        return payload

    # Очередь Aiesa может вернуть id вместо результата. Документация Polza
    # также допускает асинхронный ответ, поэтому не считаем такой ответ пустым.
    job_id = str(payload.get("id") or payload.get("task_id") or "").strip()
    if not job_id:
        raise _ProviderError(
            _polza_error_message(payload, "Aiesa не вернула результат распознавания."),
            provider="polza",
            status=502,
        )
    try:
        timeout_seconds = max(
            60,
            min(
                30 * 60,
                float(
                    os.getenv(
                        "POLZA_AUDIO_TRANSCRIPTION_TIMEOUT_SECONDS",
                        str(DEFAULT_POLZA_TIMEOUT_SECONDS),
                    )
                ),
            ),
        )
    except ValueError:
        timeout_seconds = DEFAULT_POLZA_TIMEOUT_SECONDS
    try:
        poll_seconds = max(
            2,
            min(
                60,
                float(
                    os.getenv(
                        "POLZA_AUDIO_TRANSCRIPTION_POLL_SECONDS",
                        str(DEFAULT_POLZA_POLL_SECONDS),
                    )
                ),
            ),
        )
    except ValueError:
        poll_seconds = DEFAULT_POLZA_POLL_SECONDS
    deadline = time.monotonic() + timeout_seconds
    status_url = f"{POLZA_URL}/{urllib.parse.quote(job_id, safe='')}"
    while time.monotonic() < deadline:
        time.sleep(poll_seconds)
        request = urllib.request.Request(
            status_url,
            headers={
                "Authorization": f"Bearer {api_key.strip()}",
                "Accept": "application/json",
                "User-Agent": "Citavuk audio transcriber/2.0",
            },
        )
        try:
            with urllib.request.urlopen(request, timeout=45) as response:
                status_payload = json.loads(
                    response.read(MAX_TRANSCRIPT_RESPONSE_BYTES).decode("utf-8")
                )
        except (urllib.error.HTTPError, urllib.error.URLError, TimeoutError, OSError, ValueError) as error:
            raise _ProviderError(
                "Aiesa не смогла вернуть состояние задачи.", provider="polza", status=502
            ) from error
        if not isinstance(status_payload, dict):
            continue
        status = str(status_payload.get("status") or status_payload.get("state") or "").lower()
        if status in {"completed", "complete", "done", "success", "succeeded"}:
            status_payload = _unwrap_transcription_payload(status_payload)
            status_payload.setdefault("model", model)
            return status_payload
        if status in {"failed", "failure", "error", "cancelled", "canceled"}:
            raise _ProviderError(
                _polza_error_message(status_payload, "Aiesa не смогла распознать аудиодорожку."),
                provider="polza",
                status=502,
            )
    raise _ProviderError(
        "Aiesa слишком долго обрабатывает аудио. Попробуйте ещё раз позднее.",
        provider="polza",
        status=504,
    )


def _offset_candidate(candidate: dict[str, Any], offset: float) -> dict[str, Any]:
    """Переносит таймкоды относительного фрагмента в шкалу исходного файла."""

    if not offset:
        return candidate
    result = dict(candidate)
    shifted_segments: list[dict[str, Any]] = []
    for segment in candidate.get("segments", []):
        if not isinstance(segment, dict):
            continue
        shifted = dict(segment)
        shifted["start"] = round(max(0.0, float(segment.get("start", 0)) + offset), 3)
        shifted["end"] = round(max(shifted["start"] + 0.01, float(segment.get("end", 0)) + offset), 3)
        shifted["words"] = [
            {
                **word,
                "start": round(max(0.0, float(word.get("start", 0)) + offset), 3),
                "end": round(max(0.01, float(word.get("end", 0)) + offset), 3),
            }
            for word in segment.get("words", [])
            if isinstance(word, dict)
        ]
        shifted_segments.append(shifted)
    result["segments"] = shifted_segments
    result["duration"] = round(max(float(candidate.get("duration", 0)) + offset, offset), 3)
    return result


def _merge_chunk_candidates(
    candidates: list[tuple[dict[str, Any], float]],
    *,
    provider: str,
    model: str,
) -> dict[str, Any]:
    """Объединяет независимые ответы, сохраняя слова и метрики качества."""

    if not candidates:
        raise AudioTranscriptionError("Провайдер не вернул ни одного фрагмента речи.")
    if len(candidates) == 1 and candidates[0][1] == 0:
        return candidates[0][0]

    shifted = [(_offset_candidate(candidate, offset), offset) for candidate, offset in candidates]
    segments = [
        segment
        for candidate, _ in shifted
        for segment in candidate.get("segments", [])
        if isinstance(segment, dict)
    ]
    segments.sort(key=lambda item: (float(item.get("start", 0)), float(item.get("end", 0))))
    languages = [str(candidate.get("language_code") or "unknown") for candidate, _ in shifted]
    distinct_languages = {
        value for value in languages if value not in {"", "unknown"}
    }
    if not distinct_languages:
        language = "srp" if _looks_serbian_text(" ".join(
            _clean_text(segment.get("text"))
            for segment in segments
        )) else "unknown"
    elif distinct_languages == {"srp"}:
        language = "srp"
    elif "srp" in distinct_languages:
        # Один фрагмент другого языка нельзя молча выдать как сербский:
        # клиент тогда сохранит смешанную запись и словарь будет разбирать
        # чужие слова. Оркестратор отправит её на независимый fallback.
        language = "mixed"
    else:
        language = next(iter(distinct_languages))
    probabilities = [
        _number(candidate.get("language_probability"))
        for candidate, _ in shifted
    ]
    probabilities = [value for value in probabilities if value is not None]
    speakers: list[str] = []
    for segment in segments:
        speaker = _speaker_label(segment.get("speaker"))
        if speaker not in speakers:
            speakers.append(speaker)
    duration = max(
        [
            float(candidate.get("duration", 0))
            for candidate, _ in shifted
        ]
        + [float(segment.get("end", 0)) for segment in segments]
    )
    result = {
        "language_code": language,
        "language_probability": round(sum(probabilities) / len(probabilities), 4)
        if probabilities
        else 0.0,
        "duration": round(max(0.0, duration), 3),
        "speakers": speakers,
        "segments": segments,
        "provider": provider,
        "model": model,
        "text": " ".join(
            _clean_text(segment.get("text")) for segment in segments
        ).strip(),
        "chunks": len(shifted),
    }
    quality_score, quality_reasons = transcription_quality(result)
    result["quality_score"] = quality_score
    result["quality_reasons"] = quality_reasons
    return result


def _request_chunked_candidate(
    chunks: list[tuple[bytes, float, str, str]],
    *,
    provider: str,
    model: str,
    request: Any,
) -> dict[str, Any]:
    """Запрашивает каждый фрагмент и возвращает единый нормализованный ответ."""

    candidates: list[tuple[dict[str, Any], float]] = []
    for chunk, offset, chunk_mime, chunk_filename in chunks:
        payload = request(chunk, chunk_filename, chunk_mime)
        candidate = _normalise_provider_response(
            payload,
            provider=provider,
            model=str(payload.get("model") or model)
            if isinstance(payload, dict)
            else model,
        )
        candidates.append((candidate, offset))
    return _merge_chunk_candidates(candidates, provider=provider, model=model)


def _request_groq_candidate(
    chunks: list[tuple[bytes, float, str, str]],
    api_key: str,
    model: str,
) -> dict[str, Any]:
    return _request_chunked_candidate(
        chunks,
        provider="groq",
        model=model,
        request=lambda chunk, filename, mime: request_groq_transcription(
            chunk, filename, mime, api_key, model=model
        ),
    )


def _request_polza_candidate(
    chunks: list[tuple[bytes, float, str, str]],
    api_key: str,
    model: str,
) -> dict[str, Any]:
    return _request_chunked_candidate(
        chunks,
        provider="polza",
        model=model,
        request=lambda chunk, filename, mime: request_polza_transcription(
            chunk, filename, mime, api_key, model=model
        ),
    )


def _quality_threshold() -> float:
    try:
        value = float(os.getenv("AUDIO_TRANSCRIPTION_QUALITY_THRESHOLD", str(DEFAULT_QUALITY_THRESHOLD)))
    except ValueError:
        value = DEFAULT_QUALITY_THRESHOLD
    return max(0.4, min(0.95, value))


def _finalise_candidate(
    candidate: dict[str, Any],
    *,
    fallback_used: bool,
    fallback_reason: str = "",
) -> dict[str, Any]:
    result = dict(candidate)
    result["language_code"] = "srp"
    result["fallback_used"] = fallback_used
    if fallback_reason:
        result["fallback_reason"] = fallback_reason
    return result


def transcribe_audio(
    data: bytes,
    filename: str,
    mime_type: str,
    api_key: str | None = None,
    *,
    groq_api_key: str | None = None,
    polza_api_key: str | None = None,
) -> dict[str, Any]:
    """Распознаёт аудио через Groq Fast и при необходимости Aiesa/Polza."""

    validate_audio(data, mime_type, filename)
    groq_key = (groq_api_key if groq_api_key is not None else api_key) or os.getenv(
        "GROQ_AUDIO_TRANSCRIPTION_KEY", os.getenv("GROQ_API_KEY", "")
    )
    polza_key = polza_api_key or os.getenv(
        "POLZA_AUDIO_TRANSCRIPTION_KEY", os.getenv("POLZA_AI_KEY", "")
    )
    groq_key = groq_key.strip()
    polza_key = polza_key.strip()
    if not groq_key and not polza_key:
        raise AudioTranscriptionError(
            "Не настроен ни Groq Fast, ни Aiesa через Polza.ai для расшифровки."
        )
    chunks = _provider_chunks(data, filename, mime_type)

    threshold = _quality_threshold()
    best: dict[str, Any] | None = None
    best_score = -1.0
    errors: list[Exception] = []

    if groq_key:
        try:
            fast_model = os.getenv("GROQ_AUDIO_TRANSCRIPTION_MODEL", GROQ_FAST_MODEL)
            candidate = _request_groq_candidate(chunks, groq_key, fast_model)
            if candidate["language_code"] == "srp":
                best = candidate
                best_score = float(candidate["quality_score"])
                if best_score >= threshold:
                    return _finalise_candidate(candidate, fallback_used=False)
                # Если Polza не настроена, всё равно используем более точный
                # Whisper вместо возврата заведомо слабого Fast-результата.
                if not polza_key and fast_model != GROQ_QUALITY_MODEL:
                    try:
                        quality_candidate = _request_groq_candidate(
                            chunks, groq_key, GROQ_QUALITY_MODEL
                        )
                        if (
                            quality_candidate["language_code"] == "srp"
                            and float(quality_candidate["quality_score"]) > best_score
                        ):
                            best = quality_candidate
                            best_score = float(quality_candidate["quality_score"])
                        if best_score >= threshold:
                            return _finalise_candidate(best, fallback_used=False)
                    except (AudioTranscriptionError, ValueError) as error:
                        errors.append(error)
            else:
                errors.append(
                    NotSerbianError(candidate["language_code"], candidate["language_probability"])
                )
        except (AudioTranscriptionError, ValueError) as error:
            errors.append(error)

    if polza_key:
        polza_model = os.getenv(
            "POLZA_AUDIO_TRANSCRIPTION_MODEL", POLZA_AIESA_MODEL
        ).strip() or POLZA_AIESA_MODEL
        needs_model_fallback = False
        try:
            candidate = _request_polza_candidate(chunks, polza_key, polza_model)
            score = float(candidate["quality_score"])
            if candidate["language_code"] == "srp" and score > best_score:
                best = candidate
                best_score = score
            if candidate["language_code"] != "srp":
                needs_model_fallback = True
                errors.append(
                    NotSerbianError(
                        candidate["language_code"],
                        candidate["language_probability"],
                    )
                )
            elif score < threshold:
                needs_model_fallback = True
                errors.append(
                    AudioTranscriptionError(
                        "Aiesa вернула результат ниже порога качества."
                    )
                )
        except (AudioTranscriptionError, ValueError) as error:
            errors.append(error)
            needs_model_fallback = True

        # Даже корректный HTTP-ответ Aiesa может быть мусорным (музыка,
        # другой язык, пропущенная первая фраза). В таком случае нужен второй
        # независимый проход через Whisper, а не возврат сомнительного текста.
        fallback_model = os.getenv(
            "POLZA_AUDIO_FALLBACK_MODEL", POLZA_FALLBACK_MODEL
        ).strip()
        if needs_model_fallback and fallback_model and fallback_model != polza_model:
            try:
                fallback_candidate = _request_polza_candidate(
                    chunks, polza_key, fallback_model
                )
                score = float(fallback_candidate["quality_score"])
                if fallback_candidate["language_code"] == "srp" and score > best_score:
                    best = fallback_candidate
                    best_score = score
                elif fallback_candidate["language_code"] != "srp":
                    errors.append(
                        NotSerbianError(
                            fallback_candidate["language_code"],
                            fallback_candidate["language_probability"],
                        )
                    )
            except (AudioTranscriptionError, ValueError) as fallback_error:
                errors.append(fallback_error)

    if best is not None and best.get("language_code") == "srp":
        if best_score < threshold:
            raise AudioTranscriptionError(
                "Расшифровка не прошла проверку качества. Попробуйте запись с более чистым звуком."
            )
        reason = "; ".join(
            str(error)
            for error in errors
            if not isinstance(error, NotSerbianError)
        )
        return _finalise_candidate(
            best,
            fallback_used=best.get("provider") != "groq",
            fallback_reason=reason or "Groq Fast дал результат ниже порога качества.",
        )

    not_serbian = next((error for error in errors if isinstance(error, NotSerbianError)), None)
    if not_serbian is not None and all(isinstance(error, NotSerbianError) for error in errors):
        raise not_serbian
    if errors:
        raise AudioTranscriptionError(
            "Не удалось расшифровать запись через Groq Fast и Aiesa/Polza."
        ) from errors[-1]
    raise AudioTranscriptionError("Сервис расшифровки не вернул результат.")
