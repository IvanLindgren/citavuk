# Читавук — техническая документация для агентов

> «Читавук» (читать + **вук** = волк) — приложение-читалка для изучения сербского:
> читаешь текст, тапаешь по слову → перевод, разбор формы, начальная форма;
> сохраняешь слова в карточки (интервальное повторение); встроенная грамматика
> (падежи + 3 времени). Маскот — умный волк Читавук.

Этот файл — карта проекта для будущих агентов/разработчиков. Держи его в актуальном
состоянии при значимых изменениях.

---

## 1. Окружение и важнейшие правила

- **Платформа разработки сейчас — Windows.** Android-тулчейн НЕ установлен (собрать/
  протестировать Android отсюда нельзя — только Windows desktop).
- **Flutter SDK:** `C:\src\flutter` (stable 3.44.x). Если нет в PATH — вызывай по
  полному пути: `C:\src\flutter\bin\flutter.bat`, `C:\src\flutter\bin\dart.bat`.
- **Путь проекта:** `C:\Citavuk` (ASCII, вне OneDrive). ⚠️ **Не держи проект в
  OneDrive и в путях с кириллицей/пробелами** (`…\Рабочий стол\…`) — это ломает
  Windows-сборку (Gradle/CMake/LSP падают на не-ASCII путях). Старая копия в OneDrive
  устарела, игнорируй её.
- **Проверка изменений (обязательно):**
  1. `dart analyze lib` (из `frontend`) — должно быть **0 errors, 0 warnings**.
     Остаются 2 info (`avoid_print` в `document_parser.dart`) — безвредны.
  2. `flutter build windows --debug` — должен собираться.
- **После добавления/удаления пакетов всегда делай `flutter clean` + `flutter pub get`.**
  Иначе `flutter_assemble` держит устаревший `package_config`, и сборка падает с
  «Error when reading … pub cache … не удаётся найти путь». Это уже случалось
  несколько раз — `flutter clean` лечит.
- `dart analyze` корректно работает даже на проблемных путях и проверяет API
  внешних пакетов — используй его как быстрый детектор ошибок.

## 2. Структура репозитория

```
C:\Citavuk\
├─ frontend/                 # Flutter-приложение (основное)
│  ├─ lib/
│  │  ├─ main.dart           # точка входа, дашборд (библиотека, папки, напоминания)
│  │  ├─ models/
│  │  │  ├─ reader_settings.dart   # настройки чтения (шрифт/размер/фон/bionic/тема…)
│  │  │  ├─ word_analysis.dart     # типизированный результат разбора слова
│  │  │  └─ grammar.dart           # модели грамматики (факты, парадигмы)
│  │  ├─ services/
│  │  │  ├─ user_db.dart           # read-write БД: книги, словарь, карточки (SRS)
│  │  │  ├─ lexicon_db.dart        # read-only словарь из assets (формы/леммы/переводы + repair)
│  │  │  ├─ analysis_repository.dart # разбор слова: онлайн CLASSLA → офлайн лексикон + онлайн-перевод
│  │  │  ├─ grammar_engine.dart    # разбор feats/MSD, парадигмы, локализация, карточки правил
│  │  │  ├─ document_parser.dart   # парсинг PDF (syncfusion) и DOCX (archive+xml)
│  │  │  └─ notification_service.dart # ЗАГЛУШКА (см. §8)
│  │  ├─ state/app_settings.dart   # ChangeNotifier: настройки чтения + напоминания (provider)
│  │  ├─ theme/app_theme.dart      # сербская тема (палитра, шрифты, переходы)
│  │  ├─ utils/
│  │  │  ├─ tokenizer.dart         # текст → токены (кириллица+латиница)
│  │  │  └─ transliteration.dart   # сербская кириллица → латиница
│  │  ├─ widgets/
│  │  │  ├─ reader_text.dart       # рендер абзаца: TextSpan+recognizer, bionic, выравнивание
│  │  │  ├─ wolf_mascot.dart       # маскот-волк (WolfAvatar/WolfBubble + пути к артам)
│  │  │  └─ serbian_ornament.dart  # орнамент-разделитель (CustomPainter, крестик)
│  │  └─ screens/
│  │     ├─ book_reader_screen.dart  # читалка + панель настроек + окно перевода
│  │     ├─ vocabulary_screen.dart   # словарь книги
│  │     ├─ flashcards_screen.dart   # карточки SRS (цвет по сложности, подсказки)
│  │     ├─ grammar_screen.dart      # «Почему так?» (разбор + парадигмы + шпаргалка падежей)
│  │     └─ grammar_cards_screen.dart# грамматика как колода карточек
│  ├─ assets/
│  │  ├─ lexicon.db          # бандл-словарь (UD-версия, ~2.3 МБ) — НУЖЕН для работы
│  │  ├─ fonts/              # NotoSerif/NotoSans/Lora (Regular+Bold, статические)
│  │  ├─ imgs/               # арты маскота: citavuk_zdravo/povtor/ukaz/gram/rule.png
│  │  └─ test_story.docx/pdf # тестовые тексты
│  └─ pubspec.yaml
├─ backend/
│  ├─ main.py                # FastAPI: /analyze (CLASSLA + лексикон + перевод), /health
│  └─ requirements.txt
├─ build_lexicon.py          # сборка assets/lexicon.db из UD_Serbian-SET (data/ud)
├─ download_srlex.py         # (опц.) скачать SrLex и собрать БОЛЬШОЙ словарь — не для бандла
├─ database_generator.py     # старый демо-генератор словаря (исторический)
├─ data/ud/*.conllu          # трибанк UD_Serbian-SET (источник для build_lexicon.py)
├─ lexicon.db                # копия словаря для бэкенда (UD-версия, ~2.3 МБ)
└─ classla_models/           # (gitignored) модели CLASSLA, качаются автоматически
```

## 3. Как запустить

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

## 4. Архитектура разбора слова (ключевое)

`AnalysisRepository.analyzeToken()` (`analysis_repository.dart`):
1. **Авто-починка** «битых» букв: `LexiconDb.repair()` — если в слове есть «закорючка»
   (символ не из `[a-zšđžčć]`), подставляет диакритики и ищет существующую форму.
2. **Онлайн (если поднят бэкенд):** POST `/analyze` → CLASSLA даёт лемму, UPOS, feats,
   формы, перевод (с контекстным снятием омонимии).
3. **Офлайн/без сервера:** `LexiconDb.lookupForm()` → лемма/UPOS/feats из словаря;
   служебные слова приоритетнее знаменательных (`_best`, чтобы «da» не спрягалось как
   глагол); перевод — локальный словарь → прямой онлайн sr→ru (Google web endpoint).
Результат — типизированный `WordAnalysis` (surface/lemma/upos/feats/forms/translation).

## 5. Данные и словарь

- **`lexicon.db`** (read-only, бандл) — таблицы:
  - `lexicon(form, lemma, upos, feats, msd)` — `feats` это строка признаков UD
    (`Case=Nom|Gender=Masc|Number=Sing`), `msd` — XPOS (MULTEXT-East, напр. `Ncfsn`).
  - `dictionary(word, translation)` — небольшой sr→ru словарь.
  - Собирается `build_lexicon.py` из `data/ud/*.conllu` (UD_Serbian-SET, CC BY-SA):
    ~21 600 форм, ~9 150 лемм. Это компактная версия — её и бандлим.
- **`user.db`** (read-write, в documents dir) — отделён от словаря, чтобы обновление
  словаря не затирало данные. Таблицы: `books(…, folder)`, `vocabulary`,
  `reviews(vocab_id, ease, interval, reps, due_at, last_reviewed)` (SM-2 lite).
- **SrLex (опц., НЕ бандлится):** `download_srlex.py` качает SrLex (~1.2 ГБ) и строит
  словарь ~900 МБ (`lexicon_srlex.db`). Для мобильного бандла это нереально — годится
  только для серверного использования. Большие файлы в `.gitignore`.
- **Версия бандл-словаря:** при изменении `assets/lexicon.db` подними `_version` в
  `lexicon_db.dart`, чтобы перезалить копию из ассетов в кэш на устройстве.

## 6. Грамматический движок (`grammar_engine.dart`)

- `describe(upos, feats)` → объяснение «Почему так?» с русскими названиями
  (падеж + латинское имя: «Родительный (genitiv)»; местный = «Предложный/Местный»).
- `buildParadigms(...)` → склонение (7 падежей × число) для сущ./прил.,
  спряжение в **3 временах** (prezent/perfekat/futur) для глаголов. Точные формы — из
  лексикона; недостающие достраиваются правилами и помечаются `≈`.
- `humanFacts`, `posShort/posFull`, `formKeyRu`, `casesReference`, `ruleCards` —
  локализация и контент карточек правил.
- 7 сербских падежей; порядок: Nom, Gen, Dat, Acc, Voc, Ins, Loc.

## 7. Чтение (читалка)

- `reader_text.dart`: слова — `TextSpan` + `TapGestureRecognizer` (НЕ `WidgetSpan` —
  тот ломал верстку и «склеивал» слова). Поддержка bionic (жирная основа слова),
  выравнивания по ширине, красной строки.
- Шрифты **статические** (NotoSerif/NotoSans/Lora). ⚠️ Вариативные шрифты на Windows
  у Flutter глючат (часть глифов → пустые квадраты), поэтому используем статические
  инстансы (сгенерированы из вариативных).
- Настройки чтения (`ReaderSettings`) сохраняются в SharedPreferences; фон — любой цвет
  (пресеты + ползунок оттенка), цвет текста авто-контраст по яркости фона.
- Перелистывание: свайп мышью (кастомный `ScrollBehavior`), стрелки-кнопки, клавиши ←/→.
- `ukaz`-лапка показывает место, где остановился (страница из `last_para`).

## 8. Известные проблемы и решения

- **Уведомления — ЗАГЛУШКА.** `flutter_local_notifications` тянет транзитивно
  `path_provider_android` 2.3.x → `jni`/`jni_flutter`, а `jni` имеет Windows-плагин,
  который **не собирается** и рушит десктоп-сборку. Поэтому:
  - в `pubspec.yaml` стоит `dependency_overrides: path_provider_android: '>=2.2.0 <2.3.0'`
    (без `jni`);
  - пакет уведомлений убран, `notification_service.dart` — no-op заглушка (тот же API).
  - **TODO:** вернуть реальные уведомления для мобильной сборки (Android), где
    Windows-конфликта нет; UI (колокольчик + время) уже готов.
- **OneDrive/кириллица в пути** ломают сборку — держать проект в `C:\Citavuk`.
- **`flutter clean`** после изменения зависимостей — обязателен.
- На Windows перевод фраз и слов работает онлайн напрямую; локальный CLASSLA-сервер
  опционален.

## 9. Бэкенд (`backend/main.py`)

FastAPI, `lifespan` загружает CLASSLA (`classla.Pipeline('sr')`). Эндпоинт `/analyze`
синхронный (FastAPI крутит в threadpool, чтобы блокирующий перевод не вешал loop).
CORS открыт (нужно для Flutter web/desktop). Лексикон-фолбэк читает `../lexicon.db`
(колонки `upos`/`feats`). Перевод: словарь → `deep_translator` (Google).

## 10. Дорожная карта / TODO

- Реальные уведомления интервального повторения на Android (плагин назад + Android-тест).
- Озвучка слов (TTS).
- Расширение sr→ru словаря (Wiktionary).
- SrLex как серверный словарь (не бандлить).
- Грамматика-карточки → подключить к SRS (сейчас просто колода без расписания).

## 11. Конвенции

- Комментарии и UI-тексты — на русском (целевой пользователь — русскоязычный).
- Слои разделены: БД (`*_db.dart`), сетевой/NLP (`analysis_repository`), модели,
  экраны, виджеты. Не возвращай god-объект.
- После правок: `dart analyze lib` (0 ошибок) + `flutter build windows --debug`.
