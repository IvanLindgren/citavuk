FROM python:3.10-slim

ENV PYTHONUNBUFFERED=1 \
    PYTHONDONTWRITEBYTECODE=1 \
    PIP_NO_CACHE_DIR=1 \
    PATH="/home/user/.local/bin:$PATH"

# pytesseract — только Python-обёртка; сам OCR-движок должен быть в образе.
# libgomp нужен Torch/CLASSLA на базовом CPU-образе.
RUN apt-get update && \
    apt-get install -y --no-install-recommends tesseract-ocr libgomp1 && \
    rm -rf /var/lib/apt/lists/*

RUN useradd -m -u 1000 user
USER user
WORKDIR /home/user/app

COPY --chown=user requirements.txt ./
RUN pip install --user --upgrade pip && \
    pip install --user -r requirements.txt

# Все runtime-модули и данные перечислены явно: Docker не должен случайно
# захватить venv, модели CLASSLA или локальные кеши из каталога backend.
COPY --chown=user main.py redis_cache.py lexicon.db audio_lessons.json ./

EXPOSE 7860

CMD ["uvicorn", "main:app", "--host", "0.0.0.0", "--port", "7860"]
