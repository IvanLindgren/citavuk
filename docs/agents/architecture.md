# Архитектура и запуск

Что из чего состоит, куда какие запросы идут и кто чем владеет.
Читать перед правкой, задевающей больше одного контура.

## Как запустить

**Приложение (Windows):**
```
cd C:\Citavuk\frontend
C:\src\flutter\bin\flutter run -d windows
```
**Бэкенд (опционально — для точного контекстного разбора через CLASSLA):**
```
cd C:\Citavuk\backend
pip install -r requirements.txt        # один раз; тянет torch+classla (тяжело)
python main.py                          # uvicorn на 0.0.0.0:8000
```
Приложение работает и БЕЗ бэкенда: морфология берётся из бандл-лексикона, перевод —
прямым онлайн-запросом (нужен только интернет). Бэкенд используется, если запущен
(адреса: `127.0.0.1:8000` на десктопе, `10.0.2.2:8000` на Android-эмуляторе).

## Четыре контура

Citavuk — монорепозиторий, но не монолит. В production одновременно работают
четыре контура, а общие форматы и данные связывают их между собой.

| Контур | Код | Состояние | Ответственность |
|---|---|---|---|
| Flutter | `frontend/` | SQLite `user.db`, SharedPreferences, bundled assets | Android, Windows, Linux и macOS: библиотека, читалка, курс, офлайн-режим |
| React | `web/` | IndexedDB, localStorage, static assets | Сайт `citavuk.ru`: браузерная читалка, курс, события, импорт и публичные разделы |
| Go API | `server/` | PostgreSQL, необязательный Redis/Valkey | Аккаунты, сессии, синхронизация, перевод, прогресс, общий rate limit и reverse proxy |
| Python NLP | `backend/` | CLASSLA, SQLite/Redis-кеши | Морфология, новости, извлечение документов, TTS и оставшиеся тяжёлые ручки |

### Границы и адреса

- Пользовательские клиенты ходят в `https://api.citavuk.ru`. Go обслуживает
  собственные `/v1/*` и часть `/audio/*`, а неизвестные старые пути проксирует в
  Python upstream. Не вшивать адрес Hugging Face в новый клиентский код.
- React-сайт и его статические файлы отдаёт nginx из `/var/www/citavuk`.
  Go-сервис запущен отдельно из `/opt/citavuk`; релизные архивы приложений лежат
  в `/var/www/citavuk-files`.
- PostgreSQL — источник истины для аккаунтов и синхронизации. Redis ускоряет
  rate limit и кеши, но не должен быть точкой отказа. Локальные базы клиентов
  обязательны: чтение, курс и уже загруженные данные должны открываться офлайн.

### Основные потоки данных

**Вход и сессия**

```text
Flutter AuthService / React AuthProvider
  -> Go /v1/auth/*
  -> PostgreSQL (users, sessions, одноразовые hashed-токены)
  -> Resend или OAuth-провайдер при необходимости
  -> bearer token в локальном хранилище клиента
```

Клиент восстанавливает локальную сессию без сетевого запроса. `401` при первом
защищённом запросе инвалидирует её. Нельзя переносить session token в URL,
логи, аналитику или синхронизируемый документ.

**Синхронизация пользовательских данных**

```text
SQLite user.db / IndexedDB
  -> POST /v1/sync/push (только dirty-записи и tombstones)
  -> GET /v1/sync/changes?since=cursor
  -> локальное слияние по updated_at
  -> загрузка текста выбранной книги по contentSha
```

Текст не входит в общий список изменений. Его sha256 одинаково считают Go,
Dart и TypeScript по длине UTF-8 каждого абзаца и самим байтам. Любое изменение
этого формата является изменением протокола и требует парных тестов во всех
трёх реализациях.

**Разбор слова и перевод**

```text
Reader / WordReader
  -> UTF-16 offset переводится в UTF-8 byte offset
  -> Go /v1/analyze или /v1/translate/context
  -> личный rate-limit user:<uuid> (для гостя ip:<address>)
  -> кеш PostgreSQL/Redis
  -> Python CLASSLA или DeepL/fallback
  -> WordAnalysis / TranslationResult
  -> локальный словарь как офлайн-fallback во Flutter
```

Не отправлять отдельное сербское слово в DeepL без контекста. Для слова в
предложении используется `<w>` и байтовые смещения; для голого слова — запасной
провайдер. Изменение смещений проверяется кириллическими примерами.

**Курс, диалоги и события**

```text
course_content/*.json
  -> tools/course_build (нормализация и строгая валидация)
  -> frontend/assets/course/course_bundle.json
  -> Flutter bundle + web/scripts/prepare-course-assets.mjs
  -> локальный прогресс
  -> /v1/course/progress/{courseId} после входа
```

Сервер хранит JSON-документ прогресса и не знает все клиентские поля. Поэтому
новое поле должно переживать чтение старым клиентом, а слияние обязано сохранять
неизвестные или параллельно изменённые части. Событие «Одиссея» использует тот
же транспорт с отдельным id `event-odyssey-2026`, но собственную локальную
схему и доступ только для аккаунта.

**Публичный контент и статические ассеты**

- Генераторы (`tools/build_public_library.py`, `web/scripts/build-materials.py`,
  `web/scripts/prepare-odyssey-event.py`) отвечают за воспроизводимость,
  лицензии, метаданные и проверку источников. Не править их результат вручную,
  если рядом есть исходник или генератор.
- Каталоги содержат только метаданные. Книги, PDF, транскрипты и песни грузятся
  после выбора, чтобы стартовая страница не вытаскивала весь корпус в память.
- Vite lazy chunks, PDF worker и хешированные assets являются частью контракта
  деплоя. Старые chunks сохраняются 14 дней для вкладок, открытых до релиза.

### Владение контрактами

| Изменение | Главные места | Что проверить вместе |
|---|---|---|
| Новый React-маршрут | `web/src/App.tsx`, `web/src/pages/`, `Header.tsx` | lazy import, mobile menu, sitemap, guest/auth state |
| Новый Go endpoint | `server/internal/api/`, `server/internal/store/` | auth middleware, rate limit, лимиты payload, тесты и README |
| Схема PostgreSQL | `server/internal/store/migrations/` | новая миграция, старые данные, rollback-поведение приложения |
| Схема IndexedDB | `web/src/lib/db.ts` | версия БД, upgrade cursor, старые записи без новых индексов |
| Схема Flutter SQLite | `frontend/lib/services/user_db.dart` | version, `onUpgrade`, миграционный тест, web/native |
| Sync-поле | Go store/API + Dart + TypeScript | tombstone, dirty ack, `updated_at`, парные contract-тесты |
| Настройки читалки | Dart `ReaderSettings` + web `readerSettings.ts` | sanitize, старый localStorage, обе читалки и контраст |
| Новый тип упражнения | Go course builder + Dart + TypeScript | модель, валидатор, renderer, evaluator, общий bundle |
| Аудиоурок | Go podcast API + `web/public/transcripts/` | реальный transcript, Range/proxy, отсутствие transcript |
| Генерируемый контент | соответствующий script + output | источник, лицензия, детерминизм, размер production bundle |

---

[← Карта документации](../../AGENTS.md)
