#!/usr/bin/env bash
# ./install.sh [--uninstall]

set -euo pipefail

SOURCE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PREFIX="${CITAVUK_PREFIX:-$HOME/.local/share/citavuk}"
DESKTOP_DIR="$HOME/.local/share/applications"
DESKTOP_FILE="$DESKTOP_DIR/citavuk.desktop"
BIN_LINK="$HOME/.local/bin/citavuk"

if [[ "${1:-}" == "--uninstall" ]]; then
    rm -rf "$PREFIX"
    rm -f "$DESKTOP_FILE" "$BIN_LINK"
    command -v update-desktop-database >/dev/null 2>&1 &&
        update-desktop-database "$DESKTOP_DIR" 2>/dev/null || true
    echo "Читавук удалён."
    exit 0
fi

if [[ ! -x "$SOURCE/srbski_read" ]]; then
    echo "рядом со скриптом нет srbski_read — распакуйте архив целиком" >&2
    exit 1
fi

echo "==> Копирование в $PREFIX"
rm -rf "$PREFIX"
mkdir -p "$PREFIX"
cp -r "$SOURCE"/. "$PREFIX"/
chmod +x "$PREFIX/srbski_read"

echo "==> Ярлык"
mkdir -p "$DESKTOP_DIR"
sed "s|@PREFIX@|$PREFIX|g" "$SOURCE/citavuk.desktop" > "$DESKTOP_FILE"
chmod 644 "$DESKTOP_FILE"
command -v update-desktop-database >/dev/null 2>&1 &&
    update-desktop-database "$DESKTOP_DIR" 2>/dev/null || true

mkdir -p "$(dirname "$BIN_LINK")"
ln -sf "$PREFIX/srbski_read" "$BIN_LINK"

echo
echo "Готово. Запуск из меню приложений или командой:"
echo "  $BIN_LINK"
if [[ ":$PATH:" != *":$(dirname "$BIN_LINK"):"* ]]; then
    echo
    echo "Каталог $(dirname "$BIN_LINK") не в PATH — добавьте его, чтобы"
    echo "команда citavuk работала без полного пути."
fi
