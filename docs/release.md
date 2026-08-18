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

Ключ выгрузки один — отпечаток
`SHA1: 8D:0E:21:B5:7E:46:5A:8A:C8:3C:FD:11:ED:C1:2C:48:14:DE:D5:ED`. Сборка в
GitHub Actions берёт свою копию из секрета `RELEASE_KEYSTORE_BASE64`, и это
отдельный экземпляр: локальный ключ можно перевыпустить, а секрет останется
старым. Так и вышло — секрет от 3 июня, а ключ, зарегистрированный в Play, от
5 июня; полгода бандлы уезжали с чужой подписью. Теперь шаг «Verify release
signing certificate» сверяет отпечаток и валит сборку при расхождении.

Обновить секрет после смены ключа:

```bash
base64 -w 0 frontend/android/app/citavuk-release.jks | gh secret set RELEASE_KEYSTORE_BASE64
```

**`MAPTILER_KEY` тоже нужен секретом.** На него ссылались все облачные сборки, а
самого секрета в репозитории не было — подстановка давала пустую строку, и
Путешествие уезжало списком мест вместо карты. Молча: сборка проходит, ошибок
нет, видно только на живом экране. Теперь сборка останавливается, если секрета
нет, и отдельно проверяет, что ключ действительно попал в снапшот, — по тому же
поиску строки внутри `app.so`, что описан ниже.

```bash
gh secret set MAPTILER_KEY
```

От той же подписи зависит вход через Google: на Android работает нативный SDK,
и он требует OAuth-клиента типа Android с парой «пакет + SHA1». Клиентов нужно
два — на отпечаток ключа выгрузки (для APK с сайта) и на отпечаток ключа
подписи Google Play, потому что Play пересобирает подпись своим ключом:

    citavuk_android      8D:0E:21:B5:7E:46:5A:8A:C8:3C:FD:11:ED:C1:2C:48:14:DE:D5:ED
    citavuk_googleplay   A1:06:7A:95:55:18:AC:37:1C:6C:AF:59:89:66:A7:27:63:6E:F1:00

Второй отпечаток брать **только** из архива «Скачать сертификаты», из файла
`deployment_cert.der`. Страница «Подписи приложений» показывает под заголовком
«Ключ подписи приложения» две колонки — «Классический ключ» и «Постквантовый»,
— и это не варианты ключа развёртывания, а две половины гибридной пары из беты
защиты от квантовых атак (`hybrid_classical_cert.der` и `hybrid_pqc_cert.der`).
Сам ключ развёртывания на странице не показан вовсе. Взятый оттуда «классический»
отпечаток выглядит правильным и молча ломает вход у всех, кто ставил из Play;
единственный признак — «not applicable to verify ownership» у OAuth-клиента.

Проверить, чем реально подписана раздаваемая сборка: Play Console → Обозреватель
наборов → Downloads → Signed, universal APK, затем

    apksigner verify --print-certs --min-sdk-version 24 --max-sdk-version 34 файл.apk

Ограничение версий обязательно: без него apksigner упирается в постквантовый
блок подписи и отказывается разбирать файл целиком.

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

**Ключ карты.** Путешествие рисует тайлы MapTiler, а ключ в репозиторий не
входит — он передаётся сборке:

```bash
--dart-define=MAPTILER_KEY=<ключ>
```

Флаг добавляется к каждой команде сборки ниже. Без него приложение собирается и
работает, но Путешествие показывает список мест вместо карты, поэтому в
выпускных сборках он обязателен. Ключ лежит там же, где остальные доступы, —
в разделе «Что нужно один раз».

Смена `--dart-define` не считается изменением исходников: Flutter берёт готовое
ядро из кеша, и ключ в сборку не попадает. Если прошлая сборка была без ключа —
`rm -rf .dart_tool/flutter_build` перед командой.

Проверить готовый файл можно поиском ключа внутри снапшота — он лежит там
отдельной строкой: `data/app.so` у Windows, `libapp.so` внутри APK и
`citavuk-linux-x64.tar.gz`. Нашлась только строка `api.maptiler...?key=` без
ключа за ней — значит define потерялся.

**Версия у каждой платформы своя.** `publish-apps.sh` пишет в `latest.json` не
один номер на всех, а номер каждой сборки, вычитанный из неё самой: Windows — из
`pubspec.yaml` (по нему же назван установщик), Linux — из `version.json` внутри
архива, macOS — из `Info.plist` в бандле. Собираются они вразнобой, и общий
номер обещал бы обновление тому, чей архив не пересобирали: оно скачалось бы,
установилось, версию не изменило — и предложилось снова, и так без конца.
Поэтому выпустить одну платформу, не трогая остальные, — законный ход.

**Android — бандл для Play Console:**

```bash
flutter build appbundle --release --dart-define=MAPTILER_KEY=<ключ>
# → build/app/outputs/bundle/release/app-release.aab
```

**Android — APK для сайта** (в Play Console не нужен, нужен для прямой загрузки):

```bash
flutter build apk --release --dart-define=MAPTILER_KEY=<ключ>
# → build/app/outputs/flutter-apk/app-release.apk
```

**Windows — программа, затем установщик:**

```bash
flutter build windows --release --dart-define=MAPTILER_KEY=<ключ>
dart run inno_bundle:build --release --no-app
# → build/windows/x64/installer/Release/Citavuk-x86_64-<версия>-Installer.exe
```

`--no-app` обязателен. Без него `inno_bundle` пересобирает программу сам —
своей командой, без `--dart-define`, — и молча затирает сборку с ключом: карта
в установщике пропадает, хотя `flutter build` строкой выше отработал с ключом.

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

Ключ карты скрипт берёт сам: из `MAPTILER_KEY` в окружении или из корневого
`.env`. Без него сборка проходит и предупреждает об этом строкой в выводе.

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

### Чем облачная сборка отличается от местной

Она проверяет то, что здесь описано словами, а забывается делом. Всё, что ниже,
валит сборку, а не выпускает молча испорченный файл:

- **Номера версий в `pubspec.yaml` совпадают** — оба места, `version` и
  `inno_bundle.version`.
- **Ключ карты есть и дошёл до снапшота.** Проверяется поиском строки внутри
  собранного файла — тем же способом, что описан выше. У Windows проверка идёт
  **после** `inno_bundle`: затирает сборку именно он.
- **`flutter analyze` и `flutter test`** — один раз на все платформы, до сборок.
  Раньше облачная сборка не запускала тестов вовсе.

Локальная сборка ничего из этого не проверяет: там порядок держится на
внимательности.

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
к выпуску. Заодно собирается `latest.json` с текстом из
`frontend/deploy/release-notes.txt` и с версией **у каждой платформы своей**
(см. «Версия у каждой платформы своя» выше); по нему настольное приложение
узнаёт об обновлении. В конце скрипт печатает размеры и хеши — по ним удобно проверить,
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
export MAP=--dart-define=MAPTILER_KEY=<ключ>
flutter build appbundle --release $MAP
flutter build apk --release $MAP
flutter build windows --release $MAP
dart run inno_bundle:build --release --no-app
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
# Частотные данные и расширенный словарь форм из srLex (ReLDI, CC BY-SA 4.0).
# Скачивается один раз, ~57 МБ; ссылка в шапке скриптов.
python tools/build_frequency.py srLex_v1.3.gz   # редкость слов: уровень книги
python tools/build_forms.py     srLex_v1.3.gz   # разборы форм: разбор фразы

python web/scripts/build-materials.py        # каталог материалов для сайта и приложения
GROQ_API_KEY=... python web/scripts/transcribe-podcasts.py   # расшифровки подкастов
python tools/make_store_assets.py            # скриншоты и обложка для Play
python tools/make_favicons.py                # значки сайта
python tools/lexicon_export.py               # словарь для сервера из assets/lexicon.db
```

Расшифровки подкастов после пересборки нужно выложить обычной выкладкой сайта:
они лежат в `web/public/transcripts/` и уезжают вместе с `dist`.

Данные srLex лежат в `server/internal/lexicon/data/` и встроены в бинарник
(≈4,4 МБ на три файла). Сам srLex туда не кладётся: 6,9 млн словоформ с разбором
заняли бы в памяти больше гигабайта, а сервер стоит на общей машине. Берутся
двенадцать тысяч самых частых лемм — это уже далеко за пределами того, что
встречается в книге, которую кто-то станет читать по-сербски.
