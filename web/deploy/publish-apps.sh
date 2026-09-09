#!/usr/bin/env bash
# Выкладывает собранные приложения на citavuk.ru/files/.
#
# Запускается с машины разработчика, из каталога web/:
#
#   ./deploy/publish-apps.sh
#
# Отдельно от deploy.sh намеренно. Выкатка сайта подменяет /var/www/citavuk
# целиком, поэтому сборки лежат рядом, в /var/www/citavuk-files, и переживают
# любое число выкаток страницы «Скачать».
#
# Файлы берутся из обычных каталогов сборки Flutter — отдельного шага сборки
# здесь нет: собирать релиз надо осознанно, а не как побочный эффект выкладки.

set -euo pipefail

# Адрес и ключ задаются окружением: в репозитории их быть не должно.
HOST="${CITAVUK_HOST:?укажите CITAVUK_HOST, например root@example.com}"
KEY="${CITAVUK_SSH_KEY:?укажите CITAVUK_SSH_KEY — путь к ssh-ключу}"
# Тильду в значении переменной оболочка не раскрывает — иначе ssh молча
# ищет ключ в каталоге с именем «~».
KEY="${KEY/#\~/$HOME}"
SIGNING_KEY="${CITAVUK_UPDATE_SIGNING_KEY:?укажите CITAVUK_UPDATE_SIGNING_KEY — Ed25519 private key обновлений}"
SIGNING_KEY="${SIGNING_KEY/#\~/$HOME}"
public_key() {
    if command -v openssl >/dev/null 2>&1; then
        openssl pkey -in "$SIGNING_KEY" -pubout -outform DER | tail -c 32 | base64 -w0
    elif command -v node >/dev/null 2>&1; then
        node - "$SIGNING_KEY" <<'NODE'
const fs = require('fs'), crypto = require('crypto');
const key = crypto.createPrivateKey(fs.readFileSync(process.argv[2]));
const der = crypto.createPublicKey(key).export({ format: 'der', type: 'spki' });
console.log(der.subarray(der.length - 32).toString('base64'));
NODE
    else
        echo 'нужен openssl или node для подписи обновления' >&2
        exit 1
    fi
}
sign_manifest() {
    if command -v openssl >/dev/null 2>&1; then
        openssl pkeyutl -sign -rawin -inkey "$SIGNING_KEY" -in "$1" -out "$2"
    else
        node - "$SIGNING_KEY" "$1" "$2" <<'NODE'
const fs = require('fs'), crypto = require('crypto');
const key = crypto.createPrivateKey(fs.readFileSync(process.argv[2]));
fs.writeFileSync(process.argv[4], crypto.sign(null, fs.readFileSync(process.argv[3]), key));
NODE
    fi
}
PUBLIC_KEY=$(public_key)
: "${CITAVUK_UPDATE_PUBLIC_KEY:?укажите public key, с которым собирали desktop-приложение}"
if [[ "$CITAVUK_UPDATE_PUBLIC_KEY" != "$PUBLIC_KEY" ]]; then
    echo "CITAVUK_UPDATE_PUBLIC_KEY не соответствует private key обновлений" >&2
    exit 1
fi
REMOTE_DIR=/var/www/citavuk-files
FRONTEND="$(cd "$(dirname "${BASH_SOURCE[0]}")/../../frontend" && pwd)"

ssh_run() { ssh -i "$KEY" -o BatchMode=yes "$HOST" "$@"; }

# Заливка с докачкой. Простой scp на этих файлах рвётся посередине:
# «message authentication code incorrect» — канал бьёт пакеты, и ssh закрывает
# сессию. scp после обрыва начинает с нуля и упирается в то же место, а sftp
# умеет reput — продолжает с последнего долетевшего байта.
put_file() {
    local src="$1" dst="$2" size got try cmd
    size=$(stat -c%s "$src")
    for try in $(seq 1 12); do
        got=$(ssh_run "stat -c%s \"$dst\" 2>/dev/null || echo 0")
        [[ "$got" == "$size" ]] && return 0
        # Старый .new мог быть больше текущего артефакта после прерванной
        # публикации; reput его не усечёт, поэтому сбрасываем такой файл.
        if (( got > size )); then
            ssh_run "rm -f \"$dst\""
            got=0
        fi
        # Пустого файла reput не понимает, начатый — продолжает с места обрыва.
        if [[ "$got" == 0 ]]; then cmd=put; else cmd=reput; fi
        [[ $try -gt 1 ]] && echo "    попытка $try: долито $got из $size"
        sftp -i "$KEY" -o BatchMode=yes "$HOST" >/dev/null <<<"$cmd \"$src\" \"$dst\"" || true
    done
    [[ "$(ssh_run "stat -c%s \"$dst\" 2>/dev/null || echo 0")" == "$size" ]] && return 0
    echo "  не удалось долить $dst за 12 попыток" >&2
    return 1
}

# Локальный путь -> имя на сайте. Имена постоянные: ссылки со страницы
# «Скачать» не должны меняться при каждом выпуске.
VERSION=$(sed -n 's/^version: *\([0-9.]*\).*/\1/p' "$FRONTEND/pubspec.yaml")
FILES=(
    "$FRONTEND/build/app/outputs/flutter-apk/app-release.apk|citavuk.apk|flutter build apk --release"
    "$FRONTEND/build/app/outputs/bundle/release/app-release.aab|citavuk-google-play.aab|flutter build appbundle --release"
    "$FRONTEND/build/windows/x64/installer/Release/Citavuk-x86_64-$VERSION-Installer.exe|citavuk-setup.exe|dart run inno_bundle:build --release"
    "$FRONTEND/build/citavuk-windows.zip|citavuk-windows.zip|упакуй build/windows/x64/runner/Release в zip"
    "$FRONTEND/build/citavuk-linux-x64.tar.gz|citavuk-linux-x64.tar.gz|./deploy/linux/build.sh"
)
MACOS_PATH="$FRONTEND/build/citavuk-macos.zip"
if [[ -f "$MACOS_PATH" ]]; then
    FILES+=("$MACOS_PATH|citavuk-macos.zip|скачай asset из GitHub prerelease macos-latest")
else
    echo "macOS zip не найден — публикую частичный релиз без macOS"
fi

for entry in "${FILES[@]}"; do
    IFS='|' read -r path _ hint <<<"$entry"
    if [[ ! -f "$path" ]]; then
        echo "нет $path" >&2
        echo "  собери: $hint" >&2
        exit 1
    fi
done

echo "==> Подготовка каталога"
ssh_run "mkdir -p $REMOTE_DIR"

echo "==> Загрузка (версия $VERSION)"
for entry in "${FILES[@]}"; do
    IFS='|' read -r path name _ <<<"$entry"
    echo "  $name"
    put_file "$path" "$REMOTE_DIR/$name.new"
done

# Переименование поверх — единственный способ не отдать посетителю файл,
# скачанный наполовину: пока идёт copy, ссылка ведёт на прежнюю версию.
ssh_run "set -e
    cd $REMOTE_DIR
    for f in *.new; do mv \"\$f\" \"\${f%.new}\"; done
    chown -R www-data:www-data $REMOTE_DIR
    chmod 755 $REMOTE_DIR
    chmod 644 $REMOTE_DIR/*"

echo "==> Проверка"
for entry in "${FILES[@]}"; do
    IFS='|' read -r _ name _ <<<"$entry"
    # Код и размер берутся у самого curl, а не выкусываются из заголовков:
    # разбор строки состояния регулярным выражением уже давал ложную тревогу —
    # «HTTP/1.1 200 OK» не совпадал с шаблоном из-за хвостового «OK».
    read -r code length <<<"$(ssh_run \
        "curl -sI -m 20 --resolve citavuk.ru:443:127.0.0.1 https://citavuk.ru/files/$name \
         -o /dev/null -w '%{http_code} %{header_json}'" \
        | sed -n 's/.*\"content-length\":\[\"\([0-9]*\)\".*/\1/p; s/^\([0-9]\{3\}\) .*/\1/p' | tr '\n' ' ')"
    echo "  /files/$name -> $code, ${length:-?} байт"
    if [[ "$code" != 200 ]]; then
        echo "  файл не отдаётся" >&2
        exit 1
    fi
done

# Манифест автообновления для настольных сборок. Читается приложением
# (UpdateService); Android и веб обновляются иначе и здесь не участвуют.
NOTES_FILE="$FRONTEND/deploy/release-notes.txt"
NOTES=""
if [[ -f "$NOTES_FILE" ]]; then
    NOTES=$(python -c "import json,sys;print(json.dumps(open(sys.argv[1],encoding='utf-8').read().strip())[1:-1])" "$NOTES_FILE")
fi
WIN_SIZE=$(stat -c%s "$FRONTEND/build/windows/x64/installer/Release/Citavuk-x86_64-$VERSION-Installer.exe")
LINUX_SIZE=$(stat -c%s "$FRONTEND/build/citavuk-linux-x64.tar.gz")
WIN_SHA=$(sha256sum "$FRONTEND/build/windows/x64/installer/Release/Citavuk-x86_64-$VERSION-Installer.exe" | awk '{print $1}')
LINUX_SHA=$(sha256sum "$FRONTEND/build/citavuk-linux-x64.tar.gz" | awk '{print $1}')

# Версия каждой сборки берётся у неё самой, а не у pubspec. Собираются они
# вразнобой: Windows — здесь, Linux — в контейнере, macOS — на серверах GitHub
# по кнопке. Общий номер обещал бы обновление тем, чей архив не пересобирали:
# оно скачалось бы, установилось, версию не изменило — и предложилось снова.
LINUX_VERSION=$(tar -xzOf "$FRONTEND/build/citavuk-linux-x64.tar.gz" \
    --wildcards '*/data/flutter_assets/version.json' 2>/dev/null |
    sed -n 's/.*"version":"\([^"]*\)".*/\1/p' | head -1)
: "${LINUX_VERSION:?не удалось прочитать версию из citavuk-linux-x64.tar.gz}"
MACOS_BLOCK=""
if [[ -f "$MACOS_PATH" ]]; then
    MACOS_SIZE=$(stat -c%s "$MACOS_PATH")
    MACOS_SHA=$(sha256sum "$MACOS_PATH" | awk '{print $1}')
    MACOS_VERSION=$(unzip -p "$MACOS_PATH" \
        'Citavuk.app/Contents/Info.plist' 2>/dev/null |
        sed -n '/CFBundleShortVersionString/{n;s/.*<string>\(.*\)<\/string>.*/\1/p;}' | head -1)
    : "${MACOS_VERSION:?не удалось прочитать версию из citavuk-macos.zip}"
    MACOS_BLOCK=$(cat <<JSON
  ,"macos": {
    "version": "$MACOS_VERSION",
    "url": "https://citavuk.ru/files/citavuk-macos.zip",
    "size": $MACOS_SIZE,
    "sha256": "$MACOS_SHA"
  }
JSON
)
    echo "==> Версии сборок: windows $VERSION, linux $LINUX_VERSION, macos $MACOS_VERSION"
else
    echo "==> Версии сборок: windows $VERSION, linux $LINUX_VERSION"
fi

echo "==> Манифест обновлений latest.json"
cat >/tmp/citavuk-latest.json <<JSON
{
  "version": "$VERSION",
  "notes": "$NOTES",
  "windows": {
    "version": "$VERSION",
    "url": "https://citavuk.ru/files/citavuk-setup.exe",
    "size": $WIN_SIZE,
    "sha256": "$WIN_SHA"
  },
  "linux": {
    "version": "$LINUX_VERSION",
    "url": "https://citavuk.ru/files/citavuk-linux-x64.tar.gz",
    "size": $LINUX_SIZE,
    "sha256": "$LINUX_SHA"
  }${MACOS_BLOCK}
}
JSON
sign_manifest /tmp/citavuk-latest.json /tmp/citavuk-latest.json.sig
put_file /tmp/citavuk-latest.json "$REMOTE_DIR/latest.json.new"
put_file /tmp/citavuk-latest.json.sig "$REMOTE_DIR/latest.json.sig.new"
ssh_run "set -e
    cd $REMOTE_DIR
    mv latest.json.sig.new latest.json.sig
    mv latest.json.new latest.json
    chown www-data:www-data latest.json latest.json.sig
    chmod 644 latest.json latest.json.sig"

echo
echo "Размеры и хеши (для страницы «Скачать»):"
ssh_run "cd $REMOTE_DIR && ls -l && sha256sum *"

echo "Готово."
