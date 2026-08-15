#!/usr/bin/env bash
# Сборка и выкатка сайта citavuk.ru.
#
# Запускается с машины разработчика, из каталога web/:
#
#   ./deploy/deploy.sh              # собрать и выложить
#   ./deploy/deploy.sh --nginx      # плюс обновить конфигурацию nginx
#
# Сервер общий: там же ISPmanager, чужие сайты, почта и DNS. Скрипт трогает
# только /var/www/citavuk и свой отдельный файл в conf.d.

set -euo pipefail

# Адрес и ключ задаются окружением: в репозитории их быть не должно.
HOST="${CITAVUK_HOST:?укажите CITAVUK_HOST, например root@example.com}"
KEY="${CITAVUK_SSH_KEY:?укажите CITAVUK_SSH_KEY — путь к ssh-ключу}"
# Тильду в значении переменной оболочка не раскрывает — иначе ssh молча
# ищет ключ в каталоге с именем «~».
KEY="${KEY/#\~/$HOME}"
REMOTE_DIR=/var/www/citavuk
DEPLOY_ID="$(git rev-parse --short HEAD 2>/dev/null || echo dev)-$$"
ARCHIVE="/tmp/citavuk-web-${DEPLOY_ID}.tar.gz"
REMOTE_ARCHIVE="/tmp/citavuk-web-${DEPLOY_ID}.tar.gz"

trap 'rm -f "$ARCHIVE"' EXIT

ssh_run() { ssh -i "$KEY" -o BatchMode=yes "$HOST" "$@"; }

echo "==> Проверки перед выкаткой"
checks_started=$SECONDS
node scripts/prepare-course-assets.mjs
# TypeScript проверяет `npm run build` ниже. Второй одинаковый tsc здесь раньше
# добавлял время, но не добавлял проверки.
npx vitest run
echo "  проверки: $((SECONDS - checks_started)) с"

echo "==> Сборка"
build_started=$SECONDS
# Именно npm run build, а не vite напрямую: в сценарий сборки входит копирование
# worker'а PDF.js в public/. Собранный без него сайт молча теряет импорт PDF —
# ошибка вылезает только при попытке открыть документ.
npm run build
echo "  сборка: $((SECONDS - build_started)) с"

if [[ ! -f dist/index.html ]]; then
    echo "сборка не создала dist/index.html" >&2
    exit 1
fi
if [[ ! -f dist/pdf.worker.js ]]; then
    echo "в сборке нет pdf.worker.js — импорт PDF работать не будет" >&2
    exit 1
fi

echo "==> Загрузка"
upload_started=$SECONDS
# Файлы кладутся во временный каталог и переставляются одним движением: при
# копировании поверх работающего сайта посетитель успел бы получить старый
# index.html вместе с уже удалёнными бандлами и увидел бы пустую страницу.
ssh_run "rm -rf ${REMOTE_DIR}.new && mkdir -p ${REMOTE_DIR}.new"

# Один архив вместо `scp -r`: рекурсивный scp согласовывал на сервере сотни
# файлов по отдельности и на медленном соединении занимал минуты даже для 23 МБ.
# Архив сохраняет атомарную выкладку и заодно сжимает HTML, JSON и тексты.
tar -C dist -czf "$ARCHIVE" .
scp -i "$KEY" -o BatchMode=yes "$ARCHIVE" "$HOST:$REMOTE_ARCHIVE"

ssh_run "set -e
    tar -xzf $REMOTE_ARCHIVE -C ${REMOTE_DIR}.new
    rm -f $REMOTE_ARCHIVE
    # Уже открытая вкладка может запросить lazy chunk предыдущей сборки только
    # после клика по разделу. Сохраняем хешированные assets на 14 дней, чтобы
    # выкладка не превращала такой переход в пустой экран.
    if [ -d ${REMOTE_DIR}/assets ]; then
        mkdir -p ${REMOTE_DIR}.new/assets
        cp -a --update=none ${REMOTE_DIR}/assets/. ${REMOTE_DIR}.new/assets/
    fi
    find ${REMOTE_DIR}.new/assets -type f -mtime +14 -delete
    chown -R www-data:www-data ${REMOTE_DIR}.new
    find ${REMOTE_DIR}.new -type d -exec chmod 755 {} +
    find ${REMOTE_DIR}.new -type f -exec chmod 644 {} +
    rm -rf ${REMOTE_DIR}.old
    if [ -d ${REMOTE_DIR} ]; then mv ${REMOTE_DIR} ${REMOTE_DIR}.old; fi
    mv ${REMOTE_DIR}.new ${REMOTE_DIR}
    rm -rf ${REMOTE_DIR}.old"
echo "  упаковка и загрузка: $((SECONDS - upload_started)) с"

if [[ "${1:-}" == "--nginx" ]]; then
    echo "==> Конфигурация nginx"
    scp -i "$KEY" -o BatchMode=yes deploy/nginx-site.conf \
        "$HOST:/tmp/citavuk-site.conf"
    # Шаблон намеренно не содержит TLS: пути к сертификату дописывает certbot
    # прямо в рабочий файл. Простой scp затёр бы его блок, и сайт остался бы
    # без HTTPS — а браузеры давно ходят только на https://citavuk.ru.
    #
    # Поэтому: копия старого файла, замена, certbot заново, проверка. Если
    # nginx не принял конфигурацию, возвращается прежняя — на общей машине
    # битый конфиг положил бы заодно почту, DNS и чужие сайты.
    ssh_run "set -e
        cp -p /etc/nginx/conf.d/citavuk-site.conf /etc/nginx/conf.d/citavuk-site.conf.bak
        mv /tmp/citavuk-site.conf /etc/nginx/conf.d/citavuk-site.conf
        if ! certbot --nginx -d citavuk.ru -d www.citavuk.ru --non-interactive --redirect \
             || ! nginx -t; then
            echo 'конфигурация не принята — возвращаю прежнюю' >&2
            mv /etc/nginx/conf.d/citavuk-site.conf.bak /etc/nginx/conf.d/citavuk-site.conf
            nginx -t && systemctl reload nginx
            exit 1
        fi
        systemctl reload nginx"
fi

echo "==> Проверка"
# Проверяется не только код ответа, но и Content-Type. Битая таблица типов в
# nginx отдаёт 200 на всё, а браузер при этом скачивает страницу вместо показа —
# так уже ломался сайт после правки MIME для .mjs, и по кодам ответа это было
# незаметно.
check_type() {
    actual=$(ssh_run "curl -sI -m 15 --resolve citavuk.ru:443:127.0.0.1 https://citavuk.ru$1"         | tr -d '' | sed -n 's/^[Cc]ontent-[Tt]ype: //p' | cut -d';' -f1)
    if [[ "$actual" != "$2" ]]; then
        echo "  $1 отдаётся как '$actual', ожидалось '$2'" >&2
        return 1
    fi
    echo "  $1 -> $actual"
}

failed=0
check_type "/" "text/html" || failed=1
check_type "/materials" "text/html" || failed=1
check_type "/trainer/translation-duel" "text/html" || failed=1
# Комната матча: ссылку-приглашение открывают прямо этим адресом, и без
# SPA-фолбэка друг получил бы 404 вместо стола.
check_type "/trainer/translation-duel/ABCDEF" "text/html" || failed=1
check_type "/basta" "text/html" || failed=1
check_type "/putovanje" "text/html" || failed=1
check_type "/travel/bundle.json" "application/json" || failed=1
check_type "/reader/stress.txt" "text/plain" || failed=1
check_type "/fonts/Lora-Regular.woff2" "font/woff2" || failed=1
check_type "/img/garden/citavuk_garden.webp" "image/webp" || failed=1
check_type "/img/garden/house/room.webp" "image/webp" || failed=1
if [[ $failed -ne 0 ]]; then
    echo "ТИПЫ ОТДАЮТСЯ НЕВЕРНО — сайт будет скачиваться, а не открываться" >&2
    exit 1
fi

ssh_run "curl -sf -m 10 -H 'Host: citavuk.ru' http://127.0.0.1/ -o /dev/null" \
    && echo "сайт отвечает" \
    || echo "сайт не отвечает — проверь vhost и делегирование домена"

# Оповещение поисковиков о выкатке. Идёт ПОСЛЕ проверок: звать робота на
# страницу, которая может не открыться, — верный способ получить в индексе
# ошибку вместо страницы.
#
# Неудача оповещения выкатку не отменяет: сайт уже выложен и работает, а
# поисковики придут и сами — просто позже.
echo "==> Оповещение поисковиков (IndexNow)"
node scripts/indexnow.mjs || echo "  оповещение не прошло; выкатка в порядке, роботы придут сами"

echo "Готово за ${SECONDS} с."
