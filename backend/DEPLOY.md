# Настройка Python upstream

При обновлении разбора загружай вместе с `main.py` новый runtime-модуль
`nlp_selection.py`. Он включён в `backend/Dockerfile`; обновление только одного
`main.py` без этого модуля приведёт к ошибке импорта. Проверка без моделей:
`python -m unittest discover -s backend -p 'test_nlp_selection.py'`.

Python-сервис принимает исходный IP только из заголовка Go API, защищённого
общим секретом. В Hugging Face Space открой **Settings → Variables and secrets**
и задай `CITAVUK_UPSTREAM_SECRET` тем же значением, что находится в корневом
`.env` и передаётся на VPS скриптом `server/deploy/sync-runtime-env.sh`.

Не записывай это значение в репозиторий, Dockerfile или клиентское приложение.
Без него сервис продолжит отвечать, но rate limit будет считать адрес прокси.
