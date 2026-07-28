#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""Забирает значки сайтов-источников для раздела «Что читать».

Зачем складывать их к себе
--------------------------
Показать ``https://politika.rs/favicon.ico`` прямо в теге ``img`` проще всего,
но тогда при каждом открытии страницы браузер посетителя стучится на десяток
чужих серверов. Это и задержка, и передача им сведений о том, кто к нам зашёл,
и битая картинка в тот день, когда чужой сайт переедет. Значки забираются один
раз при подготовке и лежат рядом с остальными картинками.

Значок сайта рядом со ссылкой на этот же сайт — обычная практика, так делают
поисковики и читалки лент.

Запуск из каталога web/::

    python scripts/fetch-source-icons.py
"""

from __future__ import annotations

import io
import os
import re
import ssl
import sys
import urllib.error
import urllib.parse
import urllib.request

from PIL import Image

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT_DIR = os.path.join(ROOT, "public", "img", "sources")

# Размер под вывод: значок показывается в кружке 44 пикселя, двойная плотность
# закрывает экраны с высоким разрешением.
SIZE = 96

USER_AGENT = (
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 "
    "(KHTML, like Gecko) Chrome/126 Safari/537.36"
)

# Часть сайтов держит устаревшие настройки TLS. Проверку ослабляем: скрипт
# только читает публичные картинки и ничего не отправляет.
_TLS = ssl.create_default_context()
_TLS.check_hostname = False
_TLS.verify_mode = ssl.CERT_NONE

HOSTS = [
    "politika.rs",
    "rts.rs",
    "n1info.rs",
    "blic.rs",
    "danas.rs",
    "vreme.com",
    "sr.wikisource.org",
    "rastko.rs",
    "digitalna.nb.rs",
    "gutenberg.org",
    "sr.wikipedia.org",
    "sr.wikibooks.org",
    "slobodnaevropa.org",
]


def fetch(url: str, limit: int = 4_000_000) -> bytes:
    request = urllib.request.Request(url, headers={"User-Agent": USER_AGENT})
    with urllib.request.urlopen(request, timeout=30, context=_TLS) as response:
        return response.read(limit)


def icon_candidates(host: str) -> list[str]:
    """Адреса, по которым может лежать значок, от лучшего к худшему."""
    base = f"https://{host}/"
    found: list[str] = []

    try:
        request = urllib.request.Request(base, headers={"User-Agent": USER_AGENT})
        with urllib.request.urlopen(request, timeout=30, context=_TLS) as response:
            final = response.geturl()
            html = response.read(600_000).decode("utf-8", errors="replace")
    except (urllib.error.URLError, OSError, ValueError):
        return [urllib.parse.urljoin(base, "/favicon.ico")]

    # Крупные значки идут первыми: из большого можно уменьшить без потерь, из
    # шестнадцати пикселей приличных сорока восьми уже не сделать.
    for pattern in (
        r'<link[^>]+rel=["\'][^"\']*apple-touch-icon[^"\']*["\'][^>]*>',
        r'<link[^>]+rel=["\'][^"\']*icon[^"\']*["\'][^>]*>',
    ):
        for tag in re.findall(pattern, html, flags=re.IGNORECASE):
            href = re.search(r'href=["\']([^"\']+)["\']', tag, flags=re.IGNORECASE)
            if not href:
                continue
            url = urllib.parse.urljoin(final, href.group(1))
            if url not in found and not url.startswith("data:"):
                found.append(url)

    found.append(urllib.parse.urljoin(final, "/favicon.ico"))
    return found


def save(host: str) -> str | None:
    for url in icon_candidates(host):
        try:
            raw = fetch(url)
            image = Image.open(io.BytesIO(raw))
            # У .ico внутри бывает несколько размеров; берём самый крупный.
            if getattr(image, "n_frames", 1) > 1 and image.format == "ICO":
                image = Image.open(io.BytesIO(raw))
                largest = max(image.ico.sizes())
                image = image.ico.getimage(largest)
            image = image.convert("RGBA")
            if min(image.size) < 16:
                continue
            image.thumbnail((SIZE, SIZE), Image.LANCZOS)

            # Квадратная подложка: у части сайтов значок вытянутый, и без
            # выравнивания карточки поедут по высоте.
            canvas = Image.new("RGBA", (SIZE, SIZE), (0, 0, 0, 0))
            canvas.paste(
                image,
                ((SIZE - image.width) // 2, (SIZE - image.height) // 2),
                image,
            )

            path = os.path.join(OUT_DIR, f"{host}.png")
            canvas.save(path, optimize=True)
            return f"{os.path.getsize(path)} байт, из {url}"
        except Exception:  # noqa: BLE001 — перебираем варианты, причина не важна
            continue
    return None


def main() -> int:
    os.makedirs(OUT_DIR, exist_ok=True)
    missing = []
    for host in HOSTS:
        result = save(host)
        if result:
            print(f"  {host:<24} {result}")
        else:
            missing.append(host)
            print(f"  {host:<24} значок не найден", file=sys.stderr)

    print(f"\nЗаписано в {OUT_DIR}")
    if missing:
        # Не ошибка сборки: у источника без значка страница просто покажет
        # запасной кружок с буквой.
        print(f"Без значка остались: {', '.join(missing)}")
    return 0


if __name__ == "__main__":
    sys.stdout.reconfigure(encoding="utf-8")
    sys.exit(main())
