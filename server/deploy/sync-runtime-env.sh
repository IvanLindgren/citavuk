#!/usr/bin/env bash
# Копирует только настройки доверенного upstream в /opt/citavuk/.env на VPS.
# Секреты БД, OAuth и почты остаются на сервере нетронутыми.
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
LOCAL_ENV="$ROOT/.env"
HOST="${CITAVUK_HOST:?укажите CITAVUK_HOST}"
KEY="${CITAVUK_SSH_KEY:?укажите CITAVUK_SSH_KEY}"
KEY="${KEY/#\~/$HOME}"

read_value() {
  sed -n "s/^$1=//p" "$LOCAL_ENV" | tail -n 1
}
SECRET="$(read_value CITAVUK_UPSTREAM_SECRET)"
ORIGINS="$(read_value CITAVUK_ALLOWED_ORIGINS)"
TRUST_PROXY="$(read_value CITAVUK_TRUST_PROXY)"
: "${SECRET:?в $LOCAL_ENV нет CITAVUK_UPSTREAM_SECRET}"
: "${ORIGINS:?в $LOCAL_ENV нет CITAVUK_ALLOWED_ORIGINS}"
: "${TRUST_PROXY:?в $LOCAL_ENV нет CITAVUK_TRUST_PROXY}"

tmp="$(mktemp)"
trap 'rm -f "$tmp"' EXIT
printf 'CITAVUK_UPSTREAM_SECRET=%s\nCITAVUK_ALLOWED_ORIGINS=%s\nCITAVUK_TRUST_PROXY=%s\n' \
  "$SECRET" "$ORIGINS" "$TRUST_PROXY" >"$tmp"

scp -i "$KEY" -o BatchMode=yes "$tmp" "$HOST:/tmp/citavuk-upstream.env"
ssh -i "$KEY" -o BatchMode=yes "$HOST" 'set -e
  target=/opt/citavuk/.env
  test -f "$target"
  tmp=$(mktemp /opt/citavuk/.env.XXXXXX)
  grep -vE "^CITAVUK_(UPSTREAM_SECRET|ALLOWED_ORIGINS|TRUST_PROXY)=" "$target" > "$tmp" || true
  cat /tmp/citavuk-upstream.env >> "$tmp"
  chown citavuk:citavuk "$tmp"
  chmod 600 "$tmp"
  mv "$tmp" "$target"
  rm -f /tmp/citavuk-upstream.env
  systemctl restart citavuk-api'

echo 'Настройки Go API обновлены. Тот же CITAVUK_UPSTREAM_SECRET задай в Secrets HF Space.'
