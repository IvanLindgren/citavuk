#!/usr/bin/env bash
# Собирает приложение под Linux в контейнере.
#
# Запускается с машины разработчика, из каталога frontend/:
#
#   ./deploy/linux/build.sh
#
# Результат — build/citavuk-linux-x64.tar.gz, рядом с остальными сборками:
# publish-apps.sh берёт файлы именно оттуда.
#
# Нужен запущенный Docker с Linux-движком. На Windows это Docker Desktop; WSL без
# него не годится — Flutter под Linux требует пакетов, которые ставятся из-под
# root, а в чужом окружении разработчика это лишнее вмешательство.

set -euo pipefail

HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
FRONTEND="$(cd "$HERE/../.." && pwd)"
OUT="$FRONTEND/build"

if ! docker version --format '{{.Server.Os}}' 2>/dev/null | grep -q linux; then
    echo "нужен запущенный Docker с движком Linux" >&2
    echo "  на Windows: запустите Docker Desktop и повторите" >&2
    exit 1
fi

# Версия Flutter берётся из локальной установки: собирать релиз другой версией,
# чем та, которой проверялись тесты, — верный способ получить расхождение,
# которое найдётся только у пользователя.
VERSION="$(flutter --version 2>/dev/null | sed -n 's/^Flutter \([0-9.]*\).*/\1/p' | head -1)"
VERSION="${VERSION:-3.44.0}"
echo "==> Flutter $VERSION"

# Ключ карты берётся из окружения или из корневого .env — в репозитории его нет.
# Без ключа сборка проходит, но Путешествие показывает список мест вместо карты.
if [[ -z "${MAPTILER_KEY:-}" && -f "$FRONTEND/../.env" ]]; then
    MAPTILER_KEY="$(sed -n 's/^MAPTILER_KEY=//p' "$FRONTEND/../.env" | tr -d '"'"'"' \r')"
fi
if [[ -z "${MAPTILER_KEY:-}" ]]; then
    echo "==> без MAPTILER_KEY: карта Путешествия будет списком мест" >&2
fi

mkdir -p "$OUT"
DOCKER_BUILDKIT=1 docker build \
    --file "$HERE/Dockerfile" \
    --build-arg "FLUTTER_VERSION=$VERSION" \
    --build-arg "MAPTILER_KEY=${MAPTILER_KEY:-}" \
    --target artifact \
    --output "type=local,dest=$OUT" \
    "$FRONTEND"

ARCHIVE="$OUT/citavuk-linux-x64.tar.gz"
if [[ ! -f "$ARCHIVE" ]]; then
    echo "сборка не создала $ARCHIVE" >&2
    exit 1
fi

echo
echo "Готово: $ARCHIVE"
ls -lh "$ARCHIVE"
