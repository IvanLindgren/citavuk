# Как собрать и выложить Читавук

Всё делается четырьмя скриптами. Три из них выкладывают, один собирает Linux;
остальное собирает сам Flutter.

| Что | Откуда запускать | Команда |
|---|---|---|
| Сервер | `server/` | `./deploy/deploy.sh` |
| Сайт | `web/` | `./deploy/deploy.sh` |
| Файлы приложений на сайт | `web/` | `./deploy/publish-apps.sh` |
| Сборка Linux | `frontend/` | `./deploy/linux/build.sh` |

## Что нужно один раз

Адрес сервера и ключ задаются окружением — в репозитории их нет и быть не
должно. Проще всего выставить их на всю сессию терминала:

```bash
export CITAVUK_HOST=root@85.137.89.21
export CITAVUK_SSH_KEY=~/.ssh/serbiansubtitles_vps_ed25519
```

Без них скрипты выкладки сразу останавливаются и говорят, чего не хватает.

Для подписанного Android нужны `frontend/android/app/citavuk-release.jks` и
`frontend/android/key.properties`. Оба закрыты от git. Без них сборка пройдёт,
но с отладочным ключом, и Play Console такой файл не примет.

Для Linux нужен запущенный Docker с движком Linux (на Windows — Docker Desktop).

---

## 1. Поднять версию

Правится в **двух** местах `frontend/pubspec.yaml`:

```yaml
version: 1.6.5+24        # строка 5: версия приложения и код сборки
...
inno_bundle:
  version: 1.6.5         # своя строка: установщик Windows её отсюда НЕ берёт
```

Второе легко забыть. Тогда установщик уедет со старым номером в имени файла и в
«Установке и удалении программ», а `publish-apps.sh` не найдёт файл и остановится.

Код сборки (`+24`) обязан расти при каждой загрузке в Play Console: один и тот
же код повторно принять нельзя.

Заодно правится:

- `frontend/deploy/release-notes.txt` — попадает в `latest.json`, его читает
  настольное приложение при проверке обновлений;
- `web/src/pages/Downloads.tsx` — константа `VERSION` и размеры файлов.

---

## 2. Собрать приложения

Всё из каталога `frontend/`.

```bash
flutter test                       # 236 тестов, перед сборкой обязательно
flutter analyze lib/
```

**Android — бандл для Play Console:**

```bash
flutter build appbundle --release
# → build/app/outputs/bundle/release/app-release.aab
```

**Android — APK для сайта** (в Play Console не нужен, нужен для прямой загрузки):

```bash
flutter build apk --release
# → build/app/outputs/flutter-apk/app-release.apk
```

**Windows — программа, затем установщик:**

```bash
flutter build windows --release
dart run inno_bundle:build --release
# → build/windows/x64/installer/Release/Citavuk-x86_64-<версия>-Installer.exe
```

**Windows — портативный архив.** Отдельного скрипта нет, пакуется вручную из
свежесобранного каталога. В PowerShell:

```powershell
Remove-Item -Force build\citavuk-windows.zip -ErrorAction SilentlyContinue
Compress-Archive -Path build\windows\x64\runner\Release\* `
                 -DestinationPath build\citavuk-windows.zip -CompressionLevel Optimal
```

Архив легко забыть пересобрать — тогда на сайт уедет прошлая сборка. Удаление
перед упаковкой обязательно: `Compress-Archive` дописывает в существующий файл.

**Linux — в контейнере:**

```bash
./deploy/linux/build.sh
# → build/citavuk-linux-x64.tar.gz
```

**macOS — через GitHub Actions:**

Локально на Windows или в Linux-контейнере macOS собрать нельзя: сборке нужны
Xcode и Apple SDK. Workflow `.github/workflows/build-macos.yml` запускается при
изменении `frontend/` в `main` или вручную, собирает универсальную Flutter
beta-сборку и обновляет asset `citavuk-macos.zip` в rolling prerelease
`macos-latest`. До появления Apple Developer ID архив подписан ad-hoc и не
нотарифицирован, поэтому Gatekeeper потребует запуск через «Открыть» в
контекстном меню.

Перед общим `publish-apps.sh` скачай готовый asset в ожидаемый путь:

```bash
curl -L --fail -o frontend/build/citavuk-macos.zip \
  https://github.com/IvanLindgren/citavuk/releases/download/macos-latest/citavuk-macos.zip
```

---

## 3. Выложить

Порядок важен: сервер, потом сайт. Если новая страница обращается к новому
обработчику, а сервер ещё старый, посетитель увидит ошибку.

**Сервер** (из `server/`):

```bash
./deploy/deploy.sh
```

Сам прогоняет `go vet` и `go test ./...`, собирает статический бинарник под
linux/amd64, кладёт его рядом и переименовывает поверх (замена работающего
файла на месте оборвала бы текущие запросы), применяет миграции отдельным
запуском и перезапускает `citavuk-api`. В конце показывает `/v1/health`.

`./deploy/deploy.sh --nginx` — плюс обновить конфиг nginx и сертификат.
Нужно только когда менялся сам конфиг.

**Сайт** (из `web/`):

```bash
./deploy/deploy.sh
```

Сам собирает курс, прогоняет `tsc` и `vitest`, делает `npm run build`,
заливает `dist` во временный каталог и переключает его на рабочий одним
переименованием — сайт не бывает наполовину обновлённым. В конце проверяет,
что страницы отдаются с верным типом.

**Файлы приложений** (из `web/`):

```bash
./deploy/publish-apps.sh
```

Отдельно от выкладки сайта намеренно: сайт подменяет `/var/www/citavuk`
целиком, а сборки лежат рядом, в `/var/www/citavuk-files`, и переживают любое
число выкладок страницы «Скачать».

Скрипт требует **все пять** файлов разом и останавливается, если какого-то
нет, подсказывая нужную команду:

| Файл | Имя на сайте |
|---|---|
| `build/app/outputs/flutter-apk/app-release.apk` | `citavuk.apk` |
| `build/windows/x64/installer/Release/Citavuk-x86_64-<версия>-Installer.exe` | `citavuk-setup.exe` |
| `build/citavuk-windows.zip` | `citavuk-windows.zip` |
| `build/citavuk-linux-x64.tar.gz` | `citavuk-linux-x64.tar.gz` |
| `build/citavuk-macos.zip` | `citavuk-macos.zip` |

Имена на сайте постоянные — ссылки со страницы «Скачать» не меняются от выпуска
к выпуску. Заодно собирается `latest.json` с версией из `pubspec.yaml` и текстом
из `frontend/deploy/release-notes.txt`; по нему настольное приложение узнаёт об
обновлении. В конце скрипт печатает размеры и хеши — по ним удобно проверить,
что на сайт уехало именно то, что собрано.

---

## 4. Google Play

Загружается только `app-release.aab`, вручную через Play Console. APK туда не
нужен.

Готовые материалы карточки лежат в `release/play/`: скриншоты, обложка,
примечания к выпуску. Пересобираются скриптом `python tools/make_store_assets.py`.

---

## Короткая версия — полный выпуск

```bash
# 1. Версия в pubspec.yaml (оба места) и release-notes.txt

cd frontend
flutter test
flutter build appbundle --release
flutter build apk --release
flutter build windows --release
dart run inno_bundle:build --release
# упаковать build/windows/x64/runner/Release в build/citavuk-windows.zip
./deploy/linux/build.sh

export CITAVUK_HOST=root@85.137.89.21
export CITAVUK_SSH_KEY=~/.ssh/serbiansubtitles_vps_ed25519

cd ../server && ./deploy/deploy.sh
cd ../web && ./deploy/deploy.sh && ./deploy/publish-apps.sh
```

Дальше — загрузить `frontend/build/app/outputs/bundle/release/app-release.aab`
в Play Console.

---

## Что ещё собирается скриптами

Эти вещи меняются редко и в обычный выпуск не входят:

```bash
python web/scripts/build-materials.py        # каталог материалов для сайта и приложения
GROQ_API_KEY=... python web/scripts/transcribe-podcasts.py   # расшифровки подкастов
python tools/make_store_assets.py            # скриншоты и обложка для Play
python tools/make_favicons.py                # значки сайта
python tools/lexicon_export.py               # словарь для сервера из assets/lexicon.db
```

Расшифровки подкастов после пересборки нужно выложить обычной выкладкой сайта:
они лежат в `web/public/transcripts/` и уезжают вместе с `dist`.
