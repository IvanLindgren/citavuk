"""Естественная озвучка коротких учебных реплик.

Высококачественный провайдер включается только серверными переменными. Если он
не настроен, остаются нейроголоса Microsoft; роботизированный gTTS разрешается
лишь явным аварийным флагом.
"""

from __future__ import annotations

import json
import os
import re
import unicodedata
import urllib.request


_SPACE = re.compile(r"\s+")
_CYRILLIC = re.compile(r"[А-Яа-яЉЊЂЋЏљњђћџ]")
_LATIN = 'abcčćdđefghijklmnoprsštuvzž'
_SERBIAN = 'абцчћдђефгхијклмнопрсштувзж'
_LETTERS = str.maketrans(_LATIN + _LATIN.upper(), _SERBIAN + _SERBIAN.upper())


def serbian_speech_text(text: str) -> str:
    """Кириллица только для синтеза; исходный текст пользователя не меняется."""
    text = unicodedata.normalize('NFC', text)
    def word(match):
        value = match.group(0)
        low = value.lower()
        result = []
        i = 0
        while i < len(value):
            pair = low[i:i + 2]
            # В этих основах соседние буквы не образуют сербский диграф.
            separate = ((pair == 'nj' and (low.startswith(('injek', 'konjug', 'konjunk'))))
                        or (pair == 'dž' and i == 2 and low.startswith('nadživ')))
            if pair in ('lj', 'nj', 'dž') and not separate:
                letter = {'lj': 'љ', 'nj': 'њ', 'dž': 'џ'}[pair]
                result.append(letter.upper() if value[i].isupper() else letter)
                i += 2
            else:
                result.append(value[i].translate(_LETTERS))
                i += 1
        return ''.join(result)
    return re.sub(r'[^\W\d_]+', word, text)
_ABBREVIATIONS = {
    "npr.": "na primer",
    "itd.": "i tako dalje",
    "tj.": "to jest",
    "dr.": "doktor",
    "gđa.": "gospođa",
    "gđica.": "gospođica",
}
_ONES = ("nula", "jedan", "dva", "tri", "četiri", "pet", "šest", "sedam", "osam", "devet")
_TEENS = ("deset", "jedanaest", "dvanaest", "trinaest", "četrnaest", "petnaest", "šesnaest", "sedamnaest", "osamnaest", "devetnaest")
_TENS = ("", "", "dvadeset", "trideset", "četrdeset", "pedeset", "šezdeset", "sedamdeset", "osamdeset", "devedeset")
_HUNDREDS = ("", "sto", "dvesta", "trista", "četiristo", "petsto", "šeststo", "sedamsto", "osamsto", "devetsto")


def _number(value: int) -> str:
    if value < 10:
        return _ONES[value]
    if value < 20:
        return _TEENS[value - 10]
    if value < 100:
        return " ".join(part for part in (_TENS[value // 10], _ONES[value % 10] if value % 10 else "") if part)
    if value < 1000:
        return " ".join(part for part in (_HUNDREDS[value // 100], _number(value % 100) if value % 100 else "") if part)
    return str(value)


def normalize(text: str, lang: str) -> str:
    text = text.replace("—", ", ").replace("–", ", ").replace("…", ". ")
    text = text.replace("“", "").replace("”", "").replace("„", "").replace("’", "'")
    if lang == "sr":
        for short, spoken in _ABBREVIATIONS.items():
            text = re.sub(rf"(?i)(?<!\w){re.escape(short)}", spoken, text)
        text = re.sub(r"(?<![\w.,])\d{1,3}(?![\w.,])", lambda match: _number(int(match.group(0))), text)
    return _SPACE.sub(" ", text).strip()


def provider_id(lang: str, voice: str, text: str) -> str:
    """Выбирает платный голос только для настроенного сербского TTS."""
    if (lang == "sr" and os.getenv("ELEVENLABS_API_KEY") and
            os.getenv(f"ELEVENLABS_SERBIAN_{voice.upper()}_VOICE_ID")):
        return "elevenlabs-v4"
    script = "cyr" if _CYRILLIC.search(text) else "latn"
    return f"edge-v4-{script}"


def _elevenlabs(text: str, voice: str) -> bytes:
    voice_id = os.environ[f"ELEVENLABS_SERBIAN_{voice.upper()}_VOICE_ID"]
    model = os.getenv("ELEVENLABS_TTS_MODEL", "eleven_v3")
    payload = json.dumps({
        "text": text,
        "model_id": model,
        "language_code": "sr",
        "voice_settings": {
            "stability": 0.46,
            "similarity_boost": 0.78,
            "style": 0.12,
            "use_speaker_boost": True,
        },
    }).encode("utf-8")
    request = urllib.request.Request(
        f"https://api.elevenlabs.io/v1/text-to-speech/{voice_id}?output_format=mp3_44100_96",
        data=payload,
        method="POST",
        headers={
            "Content-Type": "application/json",
            "Accept": "audio/mpeg",
            "xi-api-key": os.environ["ELEVENLABS_API_KEY"],
        },
    )
    with urllib.request.urlopen(request, timeout=35) as response:
        data = response.read(4 * 1024 * 1024)
    if not data:
        raise RuntimeError("ElevenLabs returned no audio")
    return data


def synthesize_studio(text: str, voice: str = "sophie") -> bytes:
    """Платная студийная озвучка для заранее выбранного контента."""
    if voice not in {"sophie", "nicholas"}:
        raise ValueError("unsupported studio voice")
    if not os.getenv("ELEVENLABS_API_KEY"):
        raise RuntimeError("ELEVENLABS_API_KEY is not configured")
    if not os.getenv(f"ELEVENLABS_SERBIAN_{voice.upper()}_VOICE_ID"):
        raise RuntimeError(f"Serbian {voice} voice id is not configured")
    return _elevenlabs(normalize(text, "sr"), voice)


def _edge(text: str, lang: str, selected: str) -> bytes:
    import edge_tts

    name = "SophieNeural" if selected == "sophie" else "NicholasNeural"
    if lang == "sr":
        # Каталог Edge предоставляет sr-RS, но не Azure sr-Latn-RS.
        # Не отправляем латиницу кириллическому голосу без преобразования.
        text = serbian_speech_text(text)
        voices = [f"Microsoft Server Speech Text to Speech Voice (sr-RS, {name})"]
    elif lang == "ru":
        voices = ["ru-RU-SvetlanaNeural"]
    else:
        voices = ["en-US-JennyNeural"]
    last_error: Exception | None = None
    for candidate in voices:
        try:
            chunks = [message["data"] for message in edge_tts.Communicate(
                text, candidate, rate="-2%", pitch="+0Hz").stream_sync()
                if message["type"] == "audio"]
            data = b"".join(chunks)
            if data:
                return data
        except Exception as error:  # пробуем совместимый alias голоса
            last_error = error
    raise RuntimeError("neural TTS returned no audio") from last_error


def synthesize(text: str, lang: str, voice: str) -> tuple[bytes, str]:
    if provider_id(lang, voice, text).startswith("elevenlabs"):
        try:
            return _elevenlabs(text, voice), "elevenlabs"
        except Exception:
            # Квота закончилась или провайдер недоступен: пользователь всё
            # равно получает бесплатный Edge Neural.
            pass
    try:
        return _edge(text, lang, voice), "edge"
    except Exception:
        if os.getenv("CITAVUK_TTS_ALLOW_ROBOTIC_FALLBACK") != "1":
            raise
        from io import BytesIO
        from gtts import gTTS
        buffer = BytesIO()
        gTTS(text=text, lang=lang).write_to_fp(buffer)
        return buffer.getvalue(), "gtts"
