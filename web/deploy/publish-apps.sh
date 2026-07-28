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
REMOTE_DIR=/var/www/citavuk-files
FRONTEND="$(cd "$(dirname "${BASH_SOURCE[0]}")/../../frontend" && pwd)"

ssh_run() { ssh -i "$KEY" -o BatchMode=yes "$HOST" "$@"; }

# Локальный путь -> имя на сайте. Имена постоянные: ссылки со страницы
# «Скачать» не должны меняться при каждом выпуске.
VERSION=$(sed -n 's/^version: *\([0-9.]*\).*/\1/p' "$FRONTEND/pubspec.yaml")
FILES=(
    "$FRONTEND/build/app/outputs/flutter-apk/app-release.apk|citavuk.apk|flutter build apk --release"
    "$FRONTEND/build/windows/x64/installer/Release/Citavuk-x86_64-$VERSION-Installer.exe|citavuk-setup.exe|dart run inno_bundle:build --release"
    "$FRONTEND/build/citavuk-windows.zip|citavuk-windows.zip|упакуй build/windows/x64/runner/Release в zip"
    "$FRONTEND/build/citavuk-linux-x64.tar.gz|citavuk-linux-x64.tar.gz|./deploy/linux/build.sh"
)

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
    scp -i "$KEY" -o BatchMode=yes "$path" "$HOST:$REMOTE_DIR/$name.new"
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

echo "==> Манифест обновлений latest.json"
cat >/tmp/citavuk-latest.json <<JSON
{
  "version": "$VERSION",
  "notes": "$NOTES",
  "windows": {
    "url": "https://citavuk.ru/files/citavuk-setup.exe",
    "size": $WIN_SIZE
  },
  "linux": {
    "url": "https://citavuk.ru/files/citavuk-linux-x64.tar.gz",
    "size": $LINUX_SIZE
  }
}
JSON
scp -i "$KEY" -o BatchMode=yes /tmp/citavuk-latest.json "$HOST:$REMOTE_DIR/latest.json"
ssh_run "chown www-data:www-data $REMOTE_DIR/latest.json && chmod 644 $REMOTE_DIR/latest.json"

echo
echo "Размеры и хеши (для страницы «Скачать»):"
ssh_run "cd $REMOTE_DIR && ls -l && sha256sum *"

echo "Готово."
