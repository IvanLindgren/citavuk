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

Для desktop-обновлений один раз создай Ed25519-ключ **вне репозитория**:

```bash
./tools/generate_update_signing_key.sh ~/.config/citavuk/update-signing.pem
```

Сохрани напечатанный `CITAVUK_UPDATE_PUBLIC_KEY` в корневом `.env` и в GitHub
Secrets под тем же именем. Перед публикацией задай `CITAVUK_UPDATE_SIGNING_KEY`
с путём к private key; `publish-apps.sh` сверит пару и подпишет `latest.json`.
Без подписи новые desktop-сборки намеренно не предлагают автоматическое
обновление.

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
flutter build windows --release --dart-define=MAPTILER_KEY=<ключ> --dart-define=CITAVUK_UPDATE_PUBLIC_KEY=<public-key>
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

Две публичные настройки скрипт достаёт сам — ключ карты и `client_id` Google —
из окружения, `web/.env.local` или корневого `.env`. Без любой из них он не
собирает: без ключа карты Путешествие превращается в список мест, без client_id
пропадает вход через Google.

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

## 5. App Store: скриншоты

Публикации в App Store ещё не было. Поля карточки, ответы анкеты
конфиденциальности и то, что закрыть до отправки (вход через Apple, жалобы
на комментарии, политика), — в `release/appstore/app-store-connect.html`.

Кадры снимает сам Flutter: `integration_test/layer_tour_test.dart` проходит
`store_tour.dart` (читалка с карточкой слова, курс, Вукоток, карта, слушание,
библиотека) и рисует слой сцены в PNG. Снимок simctl между шагами не
обновлялся, поэтому так. Запуск — в облаке:

```bash
gh workflow run build-ios.yml --ref <ветка> -f screenshots=true
```

Job `build` снимает iPhone 6,9″ (1320×2868) и iPad 13″ (2064×2752) в
симуляторах, `mac-screenshots` — Mac 2880×1800 на macos-14. Кадры забираются
из папки приложения, пока тест ещё идёт: `flutter test` удаляет приложение
сразу после прогона. Артефакты — `ios-screenshots` и `mac-screenshots`.

Промо-кадры (подпись, орнамент, рамка, статус-бар 9:41) собирает
`node tools/appstore_shots/compose.mjs <ios-screenshots> <mac-screenshots> release/appstore`
— Puppeteer и шрифты берутся из `web/`, нужен `npm ci` в `web/`. Подписи — в
`CAPTIONS` того же файла.

Сборка для Mac App Store — с `--dart-define=CITAVUK_DISTRIBUTION=appstore`:
в ней скрыты ссылки на оплату поддержки (правило 3.1.1) и вход через Google и
Яндекс (правило 4.8: сторонний вход требует равноценного входа Apple), как на
iPhone.

## 6. App Store: вход через Apple, подпись, TestFlight

Свой Mac и iPhone не нужны: подписывает и загружает облачная сборка, вход через
Apple проверяется на сайте из любого браузера.

**В developer.apple.com** (аккаунт программы разработчиков, роль Admin):

1. Identifiers → App ID `com.srbskiread.srbskiRead`, возможность
   **Sign In with Apple** включена.
2. Identifiers → Services ID (например `ru.citavuk.signin`) → Sign In with
   Apple → Configure: домены `citavuk.ru`, `api.citavuk.ru`; Return URL
   `https://api.citavuk.ru/v1/auth/apple/callback`.
3. Keys → новый ключ с Sign In with Apple → файл `.p8` и Key ID. Скачать его
   можно один раз.
4. Sign in with Apple for Email Communication: домен и адрес отправителя писем
   (`CITAVUK_EMAIL_FROM`), иначе письма на подменные адреса Apple не доходят.
5. App Store Connect → Users and Access → Integrations → App Store Connect API →
   ключ с ролью **Admin**: Issuer ID, Key ID, файл `.p8`. Admin нужен для
   облачного сертификата распространения.
6. App Store Connect → новое приложение с этим bundle id. Поля карточки —
   `release/appstore/app-store-connect.html`.

**Ключи** вводит владелец сам, в чат и в репозиторий они не попадают:

- GitHub → Settings → Secrets and variables → Actions: `APPLE_TEAM_ID`,
  `ASC_KEY_ID`, `ASC_ISSUER_ID`, `ASC_KEY_P8` (содержимое файла целиком);
- `.env` сервера: `APPLE_TEAM_ID`, `APPLE_SIGNIN_KEY_ID`,
  `APPLE_SIGNIN_KEY_FILE` (путь к `.p8` на сервере), `APPLE_SERVICES_ID`, затем
  перезапуск `citavuk-api`. После этого кнопка «Войти с Apple» появляется на
  сайте и в приложении.

**Сборка:**

```bash
gh workflow run build-ios.yml --ref main -f testflight=true
```

Задание `testflight` собирает архив с автоматической подписью по ключу API,
проверяет, что в нём есть разрешение Sign in with Apple, сохраняет подписанный
`.ipa` артефактом `citavuk-ios-appstore` и загружает сборку в App Store Connect.
Через 10–30 минут она появляется в TestFlight. Номер сборки берётся из
`pubspec.yaml` (`+62`) и должен расти с каждой загрузкой.

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

## Выпуск 1.23.0 (3 октября 2026)

Сервер и сайт выложены напрямую до запуска облачных сборок. Сервер применил
0059, добавлены жалобы на перевод, PDF-иллюстрации и загрузка картинки книги.
Настройки бота жалоб и iOS OAuth обновлены выборочно в защищённом `.env` VPS,
прочие значения сохранены. Личный чат бота доступен после `/start`; тестовое
сообщение доставлено. На главной удалён дублирующий блок поддержки, согласованные
абзацы перенесены к звездопаду, условие 200 рублей заменено на постоянные бонусы.
Живой интерфейс проверен на 1440/1024/768/390 px.

Сборки GitHub Actions:

- Android APK `direct`, AAB `play`, Windows installer/portable — 37099588511,
  исходники ca9d335, все проверки и сборки зелёные.
- iOS — 37099590620, ca9d335: `.ipa` без подписи и `.xcarchive.zip`, реальный
  `GIDClientID` и ключ карты проверены внутри приложения. Для установки и App Store
  требуется отдельная подпись Apple, публикация в магазин не выполнялась.
- macOS — 37100276027, 9577865: универсальный x64/arm64 ZIP, ad-hoc подпись,
  без нотарификации. Ключ карты проверен в App.framework.
- Project CI 37100275229, 9577865 — зелёный. Исправлена нестабильность widget-теста
  озвучки: настоящий SQLite выполняется без отдельного изолята при виртуальных
  часах теста. Код приложения не менялся между ca9d335 и 9577865.

Номер приложения 1.23.0+61. Android-подпись SHA1 соответствует ключу выгрузки
`8D:0E:21:B5:7E:46:5A:8A:C8:3C:FD:11:ED:C1:2C:48:14:DE:D5:ED`. Сверены текущая
HTML-сцена, обязательные публичные параметры и нативные номера версий пакетов.
Локально: 913 web-тестов, 621 Flutter-тест, анализ без замечаний, Windows debug,
полный Go test/vet/build на отдельной БД. Gitleaks не обнаружил секретов.
Файлы сохранены в `release/github/1.23.0`; общий ZIP содержит семь пакетов.
Архив опубликован как `/files/citavuk-1.23.0-all-apps.zip` (489920179 байт),
SHA-256 локального и серверного файла совпали:
`c577eb08f734931c64775bc50c6eb58494bcf2a074ecb2ca4c3f692a53e434f7`.
Linux не пересобирался, Google Play/TestFlight не публиковались.

## Выпуск 1.22.5 (2 октября 2026)

Опубликованы изменения из `main` с автоматом тем и Читавуком-фокусником
(41bf11e), релизная версия — 1.22.5+60 (8fda759). Дизайн не изменялся при
выпуске; пересборка `build-slot-embed.mjs` подтвердила совпадение HTML в Git.

- Сайт выложен напрямую проверенной production-сборкой
  (`deploy.sh --publish-built`), API не менялся и не перезапускался.
- Android: подписанные APK `direct` и AAB `play`; APK доступен также под
  неизменяемой ссылкой `/files/citavuk-1.22.5.apk`. AAB для Play Console
  опубликован как `/files/citavuk-google-play.aab`, в магазин загружается вручную.
- Windows: установщик и портативный ZIP; Linux: архив на Ubuntu 22.04.
  Desktop-манифест обновлений подписан Ed25519.
- macOS не выпущен: workflow 36962480151 собрал приложение, но проверка
  присутствия ключа карты в сборке не прошла. Прежний архив не заменён.

Проверки: 904 web-теста, 609 Flutter-тестов, анализ без замечаний,
Windows debug/release, Project CI 36962303698 зелёный. Первый прогон CI
упал при завершении тестовой БД читалки; повтор прошёл без изменения тестов.
Production-сцена проверена на 1366/390/360 px, включая рычаг, reduced motion
и закрытый доступ обычного аккаунта. HTML автомата в APK/AAB/Windows/Linux
сверен с исходным ассетом, публичные настройки desktop-сборок проверены.
Перед переключением файлы загружены во временные `.new` и проверены по SHA-256.
Резервная копия сайта, APK и манифеста находится на VPS в
`/opt/citavuk/backups/slot-20261002-8fda759`.

## Выпуск 1.22.2 (30 сентября 2026)

Сайт и приложения опубликованы вручную, без CI/CD по запросу владельца.
Изменения: рулетка тем Three.js, входы друзей в Тренажёрке, упрощённые подписи
и типографика, сброс игр и отдельная история ответов при смене аккаунта.
Текст «Места дня» заменён на согласованную формулировку с «по МСК».

- Windows: установщик и portable zip, 1.22.2+57.
- Linux: 1.22.2+57; на этой платформе рулетка использует нативный 2D fallback.
- Android: APK `direct` и AAB `play`, 1.22.2+57; ключ выгрузки SHA1
  `8D:0E:21:B5:7E:46:5A:8A:C8:3C:FD:11:ED:C1:2C:48:14:DE:D5:ED` проверен.
  AAB лежит на сайте как `/files/citavuk-google-play.aab`; загрузка в Play Console
  остаётся отдельным ручным шагом, не является частью публикации на сайт.
- macOS не пересобирался, манифест честно сохраняет 1.18.0.

Проверки: 858 тестов web, 597 Flutter, `dart analyze lib` — без замечаний,
Windows debug/release, полный Go `test/vet/build` с локальной тестовой БД.
Рулетка проверена в production-сборке на 1366/390/360 px, с reduced motion
и потерей WebGL-контекста: ответ не стирается. `check-public-release.mjs`
проверил главную, игры, Тренажёрку, курс и загрузки на живом сайте без аккаунта
и без POST-запросов. Права друзей и обычных аккаунтов проверены фикстурами.

Даты публичного открытия сохранены: Падежи — 12 октября, Говори/Пиши —
13 октября 2026 по МСК. Серверный код в этом выпуске не менялся и не
перезапускался (health version `411e908`).
