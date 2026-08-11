# Читавук — карта проекта для агентов

> «Читавук» (читать + **вук** = волк) — приложение-читалка для изучения сербского:
> читаешь текст, тапаешь по слову → перевод, разбор формы, начальная форма;
> сохраняешь слова в карточки (интервальное повторение); встроенная грамматика
> (падежи, времена, наклонения и грамматика фраз). Маскот — умный волк Читавук.

**Этот файл читается целиком при каждом запуске агента, поэтому в нём только то,
что нужно всегда.** Подробности разнесены по `docs/agents/` — открывай тот файл,
чью зону трогаешь, а не всё сразу. Держи документацию в актуальном состоянии при
значимых изменениях: правка ушла в свой файл, а сюда — только если поменялось
окружение, конвенция или состав разделов.

## Куда смотреть

| Файл | Когда открывать |
| --- | --- |
| [architecture.md](docs/agents/architecture.md) | правка задевает больше одного контура; как запустить локально |
| [workflow.md](docs/agents/workflow.md) | **перед любой задачей**: порядок работы и обязательные проверки по зонам |
| [server.md](docs/agents/server.md) | Go API, аккаунты, синхронизация, перевод, лимиты, Python-бэкенд |
| [web.md](docs/agents/web.md) | сайт citavuk.ru: React, роутер, IndexedDB, пререндер, SEO |
| [flutter.md](docs/agents/flutter.md) | приложение: читалка, платформенные грабли |
| [language.md](docs/agents/language.md) | морфология, лексикон, грамматический движок, ударение, «se» |
| [course.md](docs/agents/course.md) | курс, тренажёрка, типы упражнений, дуэль переводов |
| [roadmap.md](docs/agents/roadmap.md) | дорожная карта, уровень и цель пользователя, прогресс |
| [garden.md](docs/agents/garden.md) | Башта Читавука: динары, рост, соседи, лидерборд |
| [vukotok.md](docs/agents/vukotok.md) | лента: карточка, подбор, обсуждение, наполнение |
| [teacher-lessons.md](docs/agents/teacher-lessons.md) | авторские уроки, редактор теории и заданий, диалоги |
| [content.md](docs/agents/content.md) | материалы, экзамены, публичная библиотека, объявления, админка |
| [shared-formats.md](docs/agents/shared-formats.md) | **всё, что реализовано дважды и обязано совпадать** |
| [deploy.md](docs/agents/deploy.md) | выкатка сайта и сервера, грабли nginx, сборка Linux и Android |

Отдельно от карты:

- [`docs/release.md`](docs/release.md) — доступы и порядок выпуска приложений.
- [`docs/exams-and-materials.md`](docs/exams-and-materials.md) — как добавлять
  материалы, тесты и задания.
- [`docs/micro-feed.md`](docs/micro-feed.md) — полная архитектура и API ленты.
- [`server/README.md`](server/README.md), [`web/README.md`](web/README.md) —
  ручки и сборка своими словами.
- [`PROJECT_AGENT_GUIDE.md`](PROJECT_AGENT_GUIDE.md) — старый подробный
  путеводитель. Частично дублирует `docs/agents/`; при расхождении верен
  `docs/agents/`.

## Окружение и важнейшие правила

- **Платформа разработки сейчас — Windows.** Android-тулчейн установлен:
  `flutter build apk --release` собирается локально и подписывается ключом из
  `frontend/android/key.properties` (в репозиторий не входит).
- **Flutter SDK:** `C:\flutter_windows_3.44.0-stable\flutter` (stable 3.44.x).
  Если нет в PATH — вызывай по полному пути:
  `C:\flutter_windows_3.44.0-stable\flutter\bin\flutter.bat`,
  `C:\flutter_windows_3.44.0-stable\flutter\bin\dart.bat`.
- **Путь проекта:** `C:\Citavuk` (ASCII, вне OneDrive). ⚠️ **Не держи проект в
  OneDrive и в путях с кириллицей/пробелами** (`…\Рабочий стол\…`) — это ломает
  Windows-сборку (Gradle/CMake/LSP падают на не-ASCII путях). Старая копия в OneDrive
  устарела, игнорируй её.
- **Проверка изменений (обязательно):**
  1. `dart analyze lib` (из `frontend`) — должно быть **No issues found**.
  2. `flutter build windows --debug` — должен собираться.
- **После добавления/удаления пакетов всегда делай `flutter clean` + `flutter pub get`.**
  Иначе `flutter_assemble` держит устаревший `package_config`, и сборка падает с
  «Error when reading … pub cache … не удаётся найти путь». Это уже случалось
  несколько раз — `flutter clean` лечит.
- `dart analyze` корректно работает даже на проблемных путях и проверяет API
  внешних пакетов — используй его как быстрый детектор ошибок.

Полная таблица проверок по зонам (React, Go, Python, Flutter, контент курса) —
в [workflow.md](docs/agents/workflow.md).

## Структура репозитория

```
C:\Citavuk\
├─ frontend/          Flutter: Android, Windows, Linux, macOS
│  ├─ lib/            models · services · state · theme · utils · widgets · screens
│  │  └─ course/      курс и тренажёрка: models · services · state · widgets · screens
│  ├─ assets/         lexicon.db, шрифты, арты маскота, курс, палас, материалы
│  ├─ deploy/linux/   сборка Linux в контейнере
│  └─ test/           flutter test
├─ web/               React + Vite: сайт citavuk.ru
│  ├─ src/            pages · components · lib · api · course · materials · exams
│  ├─ scripts/        генераторы: ассеты, карта сайта, пререндер, материалы
│  ├─ public/         статика, транскрипты, звуки, публичная библиотека
│  └─ deploy/         deploy.sh, publish-apps.sh, nginx-site.conf
├─ server/            Go API: аккаунты, синхронизация, перевод, лента, курс
│  ├─ internal/       api · store (+migrations) · grammar · english · feed · roadmap
│  ├─ cmd/            feedfill и прочие команды оператора
│  └─ deploy/         deploy.sh
├─ backend/           Python FastAPI: CLASSLA, TTS, извлечение документов
├─ tools/             генераторы и сборщики (Python + Go)
│  ├─ course_build/   валидация course_content и сборка bundle
│  ├─ sprite_build/   атласы спрайтов; sound_build/ — звуки
│  └─ data/           TSV дорожной карты и тренажёрки
├─ course_content/    исходный контент курса (JSON, правится руками)
├─ animations/        исходные PNG-кадры (в приложение не входят)
├─ data/ud/           трибанк UD_Serbian-SET — источник для build_lexicon.py
├─ docs/              документация: agents/, release, micro-feed, приватность
├─ release/, screens/ артефакты магазинов и скриншоты
└─ build_lexicon.py, download_srlex.py, …   корневые скрипты словаря
```

## Конвенции

- Комментарии и UI-тексты — на русском (целевой пользователь — русскоязычный).
- **К пользователю обращаемся на «ты».** Раньше разделы расходились: маскот,
  курс и Вукоток говорили на «ты», а аккаунт, читалка и дуэль переводов — на
  «вы», иногда в соседних строках одного экрана. Исключения — юридические
  тексты (`privacy_screen.dart`) и авторская речь в «О проекте»: там «вы»
  уместно и остаётся.
- Сербский в интерфейсе только как языковой материал. `ускоро ће бити` вместо
  «скоро будет» новичок уровня A1 не прочитает — это и есть его целевая
  аудитория.
- **Внутренней кухни в интерфейсе не бывает.** Названия типов заданий, состояние
  движков, «готовится», «скоро», «не делаем» — всё это остаётся в документации.
  Раздел выкатывается тогда, когда в нём есть что делать.
- Слои разделены: БД (`*_db.dart`), сетевой/NLP (`analysis_repository`), модели,
  экраны, виджеты. Не возвращай god-объект.
- После правок: `dart analyze lib` (0 ошибок) + `flutter build windows --debug`.

## Что ещё не сделано

- Реальные уведомления интервального повторения на Android: плагин выключен
  из-за конфликта с Windows-сборкой (см. [flutter.md](docs/agents/flutter.md)),
  UI с колокольчиком и временем готов.
- Грамматика-карточки не подключены к SRS — сейчас это колода без расписания.
- Итоговая контрольная курса: `blueprint` пуст, карточки на карте нет.
- `image_description`: режимы `choose` и `free` работают, `build`/`fill` требуют
  расширения схемы.
