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

import io
import json
import os
import re
import subprocess
import sys
import urllib.request

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
REPO = os.path.dirname(ROOT)
SITE = "https://citavuk.ru"
OUT = os.path.join(ROOT, "public", "sitemap.xml")
# Каталог «Слушания» живёт на сервере: эпизоды добавляются без выкладки сайта.
AUDIO_LESSONS = "https://api.citavuk.ru/audio/lessons"

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
    ("/books", "0.9", "weekly"),
    ("/public-library", "0.9", "monthly"),
    ("/materials", "0.9", "weekly"),
    ("/course", "0.8", "monthly"),
    ("/trainer", "0.8", "monthly"),
    ("/padezi", "0.8", "monthly"),
    ("/govori", "0.8", "monthly"),
    ("/trainer/translation-duel", "0.8", "monthly"),
    ("/basta", "0.8", "weekly"),
    ("/putovanje", "0.8", "weekly"),
    ("/exams", "0.8", "monthly"),
    ("/lessons", "0.8", "weekly"),
    ("/listening", "0.7", "weekly"),
    ("/audio-files", "0.7", "monthly"),
    ("/events", "0.9", "weekly"),
    ("/downloads", "0.7", "monthly"),
    ("/support", "0.7", "monthly"),
    ("/supporters", "0.5", "weekly"),
    ("/about", "0.5", "yearly"),
    ("/privacy", "0.3", "yearly"),
    ("/dialogues", "0.8", "monthly"),
    ("/dialogues/drinkit", "0.7", "monthly"),
]


def read_json(path: str):
    with io.open(path, encoding="utf-8") as handle:
        return json.load(handle)


def git_date(path: str) -> str | None:
    """Дата последнего коммита файла — честный lastmod.

    Сегодняшняя дата на каждой странице при каждой сборке хуже, чем никакой:
    Google и Яндекс быстро замечают, что lastmod врёт, и перестают его читать.
    """
    try:
        out = subprocess.run(
            ["git", "log", "-1", "--format=%cs", "--", path],
            cwd=REPO, capture_output=True, text=True, timeout=20,
        ).stdout.strip()
    except (OSError, subprocess.SubprocessError):
        return None
    return out or None


def listening_episodes() -> list[str]:
    """Эпизоды с расшифровкой: без текста страница — плеер и заголовок."""
    try:
        with urllib.request.urlopen(AUDIO_LESSONS, timeout=30) as response:
            items = json.load(response).get("items") or []
    except Exception as error:  # noqa: BLE001 — сборка не должна падать из-за API
        print(f"  каталог «Слушания» недоступен, эпизоды пропущены: {error}")
        return []
    ids = []
    for item in items:
        episode = str(item.get("id") or "")
        if not re.fullmatch(r"[A-Za-z0-9._-]+", episode):
            continue
        if not (item.get("audio_url") or item.get("external_url")) or not item.get("title"):
            continue
        if item.get("transcript_url") or item.get("cues"):
            ids.append(episode)
    return ids


def main() -> int:
    urls = [(path, priority, freq, None) for path, priority, freq in STATIC]

    catalog_path = os.path.join(ROOT, "src", "materials", "catalog.json")
    catalog = read_json(catalog_path)
    catalog_date = git_date(catalog_path)
    for subject in catalog["subjects"]:
        urls.append((f"/materials/{subject['id']}", "0.8", "monthly", catalog_date))

    # Курс лежит в ассетах приложения — один и тот же файл на оба клиента.
    bundle_path = os.path.join(
        REPO, "frontend", "assets", "course", "course_bundle.json"
    )
    lessons = 0
    if os.path.exists(bundle_path):
        bundle = read_json(bundle_path)
        bundle_date = git_date(bundle_path)
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
                    urls.append((f"/course/lesson/{lesson['id']}", "0.6", "monthly", bundle_date))
                    lessons += 1

    episodes = listening_episodes()
    for episode in episodes:
        urls.append((f"/listening/{episode}", "0.6", "yearly", None))

    out = [
        '<?xml version="1.0" encoding="UTF-8"?>',
        '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">',
    ]
    for path, priority, freq, lastmod in urls:
        out += ["  <url>", f"    <loc>{SITE}{path}</loc>"]
        if lastmod:
            out.append(f"    <lastmod>{lastmod}</lastmod>")
        out += [
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
        f"(разделов {len(STATIC)}, предметов {len(catalog['subjects'])}, уроков {lessons}, "
        f"эпизодов {len(episodes)})"
    )
    return 0


if __name__ == "__main__":
    sys.stdout.reconfigure(encoding="utf-8")
    sys.exit(main())
