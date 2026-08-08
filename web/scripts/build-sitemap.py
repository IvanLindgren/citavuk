#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""Собирает карту сайта из каталога материалов и курса.

Список страниц руками не пишется намеренно: предметы и уроки появляются и
исчезают вместе с данными, а карта, которую забыли поправить, хуже отсутствующей
— поисковик ходит по мёртвым адресам и теряет доверие к сайту.

В карту попадает только то, что видно без входа: личные разделы закрыты в
robots.txt, и дублировать их здесь было бы противоречием.

Запуск из каталога web/::

    python scripts/build-sitemap.py
"""

from __future__ import annotations

import datetime
import io
import json
import os
import sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
REPO = os.path.dirname(ROOT)
SITE = "https://citavuk.ru"
OUT = os.path.join(ROOT, "public", "sitemap.xml")

# Статические разделы: адрес, приоритет, частота обновления.
#
# Список важен не только для поисковика: по нему же идёт пререндер
# (scripts/prerender.mjs). Раздел, забытый здесь, не получает своего HTML —
# nginx отдаёт на его адресе index.html, то есть побайтовую копию главной с
# её заголовком. Так было с /lessons, /teachers, /about и /privacy: для робота
# без JS это были четыре копии одной страницы.
STATIC = [
    ("/", "1.0", "weekly"),
    ("/vukotok", "0.9", "daily"),
    ("/roadmap", "0.9", "weekly"),
    ("/roadmap", "0.9", "weekly"),
    ("/books", "0.9", "weekly"),
    ("/public-library", "0.9", "monthly"),
    ("/materials", "0.9", "weekly"),
    ("/course", "0.8", "monthly"),
    ("/trainer", "0.8", "monthly"),
    ("/lessons", "0.8", "weekly"),
    ("/listening", "0.7", "weekly"),
    ("/events", "0.9", "weekly"),
    ("/downloads", "0.7", "monthly"),
    ("/support", "0.7", "monthly"),
    ("/about", "0.5", "yearly"),
    ("/privacy", "0.3", "yearly"),
    ("/dialogues", "0.8", "monthly"),
    ("/dialogues/drinkit", "0.7", "monthly"),
]


def read_json(path: str):
    with io.open(path, encoding="utf-8") as handle:
        return json.load(handle)


def main() -> int:
    today = datetime.date.today().isoformat()
    urls = list(STATIC)

    catalog = read_json(os.path.join(ROOT, "src", "materials", "catalog.json"))
    for subject in catalog["subjects"]:
        urls.append((f"/materials/{subject['id']}", "0.8", "monthly"))

    # Курс лежит в ассетах приложения — один и тот же файл на оба клиента.
    bundle_path = os.path.join(
        REPO, "frontend", "assets", "course", "course_bundle.json"
    )
    lessons = 0
    if os.path.exists(bundle_path):
        bundle = read_json(bundle_path)
        # Уроки лежат на третьем уровне: units -> skills -> lessons.
        for unit in bundle.get("units", []):
            for skill in unit.get("skills", []):
                for lesson in skill.get("lessons", []):
                # В карту идут только уроки с теорией: у остальных без входа
                # видна одна кнопка, и предлагать такую страницу поисковику
                # значит обещать содержимое, которого там нет.
                    intro = lesson.get("intro") or {}
                    if not intro.get("text") and not intro.get("blocks"):
                        continue
                    urls.append((f"/course/lesson/{lesson['id']}", "0.6", "monthly"))
                    lessons += 1

    out = [
        '<?xml version="1.0" encoding="UTF-8"?>',
        '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">',
    ]
    for path, priority, freq in urls:
        out += [
            "  <url>",
            f"    <loc>{SITE}{path}</loc>",
            f"    <lastmod>{today}</lastmod>",
            f"    <changefreq>{freq}</changefreq>",
            f"    <priority>{priority}</priority>",
            "  </url>",
        ]
    out.append("</urlset>")

    with io.open(OUT, "w", encoding="utf-8") as handle:
        handle.write("\n".join(out) + "\n")

    print(f"Записано: {OUT}")
    print(
        f"  адресов: {len(urls)} "
        f"(разделов {len(STATIC)}, предметов {len(catalog['subjects'])}, уроков {lessons})"
    )
    return 0


if __name__ == "__main__":
    sys.stdout.reconfigure(encoding="utf-8")
    sys.exit(main())
