#!/usr/bin/env bash
# Сборка и развёртывание сервера Citavuk на VPS.
#
# Запускается с машины разработчика, из каталога server/:
#
#   ./deploy/deploy.sh              # собрать и выкатить
#   ./deploy/deploy.sh --nginx      # плюс обновить конфигурацию nginx
#
# Сервер общий: там же работают ISPmanager, чужие сайты, почта и DNS. Скрипт
# намеренно ничего чужого не трогает — только /opt/citavuk, свой unit systemd и
# отдельный файл в conf.d.

set -euo pipefail

# Адрес и ключ задаются окружением: в репозитории их быть не должно.
HOST="${CITAVUK_HOST:?укажите CITAVUK_HOST, например root@example.com}"
KEY="${CITAVUK_SSH_KEY:?укажите CITAVUK_SSH_KEY — путь к ssh-ключу}"
# Тильду в значении переменной оболочка не раскрывает — иначе ssh молча
# ищет ключ в каталоге с именем «~».
KEY="${KEY/#\~/$HOME}"
VERSION="${CITAVUK_VERSION:-$(git rev-parse --short HEAD 2>/dev/null || echo dev)}"
REMOTE_DIR=/opt/citavuk

ssh_run() { ssh -i "$KEY" -o BatchMode=yes "$HOST" "$@"; }

# Заливка с докачкой — тот же приём, что в web/deploy/publish-apps.sh. Канал до
# сервера бьёт пакеты, ssh закрывает сессию на «message authentication code
# incorrect» (видно в auth.log, в выводе scp — только «lost connection»), и scp
# после обрыва начинает файл заново. Сжатие уменьшает шанс, но не убирает его,
# поэтому продолжаем с последнего долетевшего байта.
scp_put() {
    local src="$1" dst="$2" size got try cmd
    size=$(stat -c%s "$src")
    for try in $(seq 1 12); do
        got=$(ssh_run "stat -c%s \"$dst\" 2>/dev/null || echo 0")
        [[ "$got" == "$size" ]] && return 0
        # Пустого файла reput не понимает, начатый — продолжает с места обрыва.
        if [[ "$got" == 0 ]]; then cmd=put; else cmd=reput; fi
        [[ $try -gt 1 ]] && echo "    попытка $try: долито $got из $size"
        sftp -C -i "$KEY" -o BatchMode=yes "$HOST" >/dev/null <<<"$cmd \"$src\" \"$dst\"" || true
    done
    [[ "$(ssh_run "stat -c%s \"$dst\" 2>/dev/null || echo 0")" == "$size" ]] && return 0
    echo "  не удалось долить $dst за 12 попыток" >&2
    return 1
}

echo "==> Проверки перед выкаткой"
go vet ./...
go test ./... >/dev/null

echo "==> Сборка статического бинарника для linux/amd64"
# CGO выключен: бинарник не должен зависеть от версии glibc на сервере.
GOOS=linux GOARCH=amd64 CGO_ENABLED=0 go build \
    -trimpath \
    -ldflags "-s -w -X github.com/citavuk/server/internal/api.Version=$VERSION" \
    -o /tmp/citavukd ./cmd/citavukd
ls -lh /tmp/citavukd

echo "==> Загрузка"
# Файл кладётся рядом и переименовывается: замена работающего бинарника на
# месте оборвала бы текущие запросы на середине.
scp_put /tmp/citavukd "$REMOTE_DIR/citavukd.new"

echo "==> Перезапуск"
ssh_run "set -e
    mv $REMOTE_DIR/citavukd.new $REMOTE_DIR/citavukd
    chmod 755 $REMOTE_DIR/citavukd
    chown citavuk:citavuk $REMOTE_DIR/citavukd
    sudo -u citavuk $REMOTE_DIR/citavukd -env $REMOTE_DIR/.env -migrate-only
    systemctl restart citavuk-api
    sleep 2
    systemctl is-active citavuk-api"

if [[ "${1:-}" == "--nginx" ]]; then
    echo "==> Конфигурация nginx"
    scp_put deploy/nginx-api.conf /etc/nginx/conf.d/citavuk-api.conf
    # Шаблон намеренно не содержит путей к ещё не выпущенному сертификату.
    # На рабочем сервере Certbot дописывает TLS заново ДО reload nginx.
    # Без этого простой scp затёр бы managed-блок и api начал бы отдавать
    # сертификат соседнего vhost.
    ssh_run "certbot --nginx -d api.citavuk.ru --non-interactive --redirect
        nginx -t
        systemctl reload nginx"
fi

echo "==> Проверка работоспособности"
ssh_run "curl -sf -m 10 http://127.0.0.1:8090/health" || {
    echo "СЕРВЕР НЕ ОТВЕЧАЕТ — смотри journalctl -u citavuk-api -n 50" >&2
    exit 1
}
echo
echo "Готово. Версия: $VERSION"
