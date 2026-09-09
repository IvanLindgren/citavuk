#!/usr/bin/env bash
# Создаёт Ed25519-ключ для подписания desktop-обновлений.
# Private key не кладётся в репозиторий: передай путь вне рабочего дерева.
set -euo pipefail

KEY_PATH="${1:?укажите путь к новому private key}"
umask 077
if command -v openssl >/dev/null 2>&1; then
    openssl genpkey -algorithm ED25519 -out "$KEY_PATH"
    PUBLIC_KEY=$(openssl pkey -in "$KEY_PATH" -pubout -outform DER | tail -c 32 | base64 -w0)
elif command -v node >/dev/null 2>&1; then
    PUBLIC_KEY=$(node - "$KEY_PATH" <<'NODE'
const fs = require('fs');
const crypto = require('crypto');
const path = process.argv[2];
const pair = crypto.generateKeyPairSync('ed25519');
fs.writeFileSync(path, pair.privateKey.export({ format: 'pem', type: 'pkcs8' }), { mode: 0o600 });
const der = pair.publicKey.export({ format: 'der', type: 'spki' });
console.log(der.subarray(der.length - 32).toString('base64'));
NODE
)
else
    echo 'нужен openssl или node с модулем crypto' >&2
    exit 1
fi
echo "CITAVUK_UPDATE_PUBLIC_KEY=$PUBLIC_KEY"
echo "Собирай Windows/Linux с: --dart-define=CITAVUK_UPDATE_PUBLIC_KEY=$PUBLIC_KEY"
echo "Для публикации задай CITAVUK_UPDATE_SIGNING_KEY=$KEY_PATH и тот же CITAVUK_UPDATE_PUBLIC_KEY."
