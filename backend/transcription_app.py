"""Изолированный STT-worker: те же алгоритмы, без CLASSLA и секретов в клиенте."""
import asyncio
import hmac
import logging
import os

from fastapi import FastAPI, File, HTTPException, Request, UploadFile

try:
    from .audio_transcription import AudioTranscriptionError, MAX_AUDIO_BYTES, NotSerbianError, transcribe_audio, transcription_keys
except ImportError:
    from audio_transcription import AudioTranscriptionError, MAX_AUDIO_BYTES, NotSerbianError, transcribe_audio, transcription_keys

app = FastAPI(docs_url=None, redoc_url=None, openapi_url=None)
slots = asyncio.Semaphore(2)


@app.get("/health")
def health():
    groq, polza = transcription_keys()
    return {"status": "ok", "groq": bool(groq), "polza": bool(polza), "configured": bool(groq or polza)}


@app.post("/audio/transcribe-file")
async def transcribe(request: Request, file: UploadFile = File(...)):
    try:
        expected = os.getenv("CITAVUK_UPSTREAM_SECRET", "").strip()
        if not expected or not hmac.compare_digest(expected, request.headers.get("x-citavuk-proxy-secret", "")):
            raise HTTPException(403, "Доступ только через Читавук.")
        if slots.locked():
            raise HTTPException(429, "Расшифровка занята. Попробуй чуть позже.")
        async with slots:
            data = await file.read(MAX_AUDIO_BYTES + 1)
            if len(data) > MAX_AUDIO_BYTES:
                raise HTTPException(413, "Аудиофайл должен быть не больше 48 МБ.")
            return await asyncio.to_thread(transcribe_audio, data, file.filename or "audio", file.content_type or "application/octet-stream")
    except NotSerbianError as error:
        raise HTTPException(422, "В записи не найдена сербская речь.") from error
    except ValueError as error:
        raise HTTPException(422, str(error)) from error
    except AudioTranscriptionError as error:
        logging.warning("Transcription failed: %s", type(error).__name__)
        raise HTTPException(502, "Не удалось расшифровать запись. Попробуй ещё раз.") from error
    finally:
        await file.close()
