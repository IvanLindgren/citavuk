# Используем легковесный образ Python
FROM python:3.10-slim

# Настройки окружения (отключаем буферизацию вывода и кэширование pip)
ENV PYTHONUNBUFFERED=1 \
    PYTHONDONTWRITEBYTECODE=1 \
    PIP_NO_CACHE_DIR=1 \
    PATH="/home/user/.local/bin:$PATH"

# Hugging Face Spaces требует запуска от непривилегированного пользователя (UID 1000)
RUN useradd -m -u 1000 user
USER user

# Рабочая директория
WORKDIR /home/user/app

# Сначала копируем только requirements.txt, чтобы закэшировать слой с зависимостями
COPY --chown=user backend/requirements.txt ./backend/requirements.txt

# Устанавливаем зависимости
RUN pip install --user --upgrade pip && \
    pip install --user -r backend/requirements.txt

# Копируем бэкенд и словарь (он нужен для работы базы)
COPY --chown=user backend/ ./backend/
COPY --chown=user lexicon.db ./

# Hugging Face Spaces по умолчанию ожидает, что приложение будет слушать порт 7860
EXPOSE 7860

# Переходим в папку бэкенда
WORKDIR /home/user/app/backend

# Запускаем сервер
CMD ["uvicorn", "main:app", "--host", "0.0.0.0", "--port", "7860"]
