#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""Готовит ассеты приложения к использованию в вебе.

Исходники лежат во Flutter-приложении и рассчитаны на упаковку в APK, где их
размер не влияет на скорость первого показа. В вебе всё иначе: картинки маскотов
весят по 1–2,5 МБ, а шрифты в TTF — вдвое больше, чем те же шрифты в WOFF2.
Отдавать их как есть означало бы несколько секунд белого экрана на телефоне.

Что делает:
  * шрифты TTF -> WOFF2 (сжатие Brotli, поддерживается всеми браузерами);
  * картинки -> WebP в двух размерах (обычный и удвоенный для плотных экранов);
  * сохраняет прозрачность и не увеличивает изображение сверх оригинала.

Запуск из каталога web/:

    python scripts/prepare-assets.py
"""

from __future__ import annotations

import os
import subprocess
import sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
REPO = os.path.dirname(ROOT)
SRC_IMGS = os.path.join(REPO, "frontend", "assets", "imgs")
SRC_FONTS = os.path.join(REPO, "frontend", "assets", "fonts")
OUT_IMGS = os.path.join(ROOT, "public", "img")
OUT_FONTS = os.path.join(ROOT, "public", "fonts")

# Только те начертания, что реально используются. Лишние гарнитуры — это
# мегабайты, которые браузер скачает и не покажет.
FONTS = [
    "Lora-Regular.ttf",
    "Lora-Bold.ttf",
    "NotoSans-Regular.ttf",
    "NotoSans-Bold.ttf",
]

# Ширина в CSS-пикселях. Второй файл (@2x) нужен для экранов с высокой
# плотностью: на них картинка в один размер выглядит мыльной.
IMAGES = {
    "citavuk_zdravo.png": 520,
    "citavuk_gram.png": 420,
    "citavuk_rule.png": 420,
    "citavuk_povtor.png": 420,
    "citavuk_ukaz.png": 360,
    "citavuk_english.png": 360,
    "citavuk_vukotok.png": 420,
    "citavuk_roadmap.png": 420,
    "citavuk_icon.png": 256,
    "sluhao_zdravo.png": 420,
    "sluhao_slusa.png": 420,
    "sluhao_savet.png": 420,
    # Собеседники диалогов. Показываются размером 48–64 CSS-пикселя, поэтому
    # 128 хватает с запасом, а @2x закрывает плотные экраны.
    "face_teacher.png": 128,
    "face_student.png": 128,
    "face_woman.png": 128,
    "face_man.png": 128,
}


def human(size: int) -> str:
    return f"{size / 1024:.0f} КБ" if size < 1048576 else f"{size / 1048576:.1f} МБ"


def convert_fonts() -> int:
    from fontTools.ttLib import TTFont

    os.makedirs(OUT_FONTS, exist_ok=True)
    saved = 0
    for name in FONTS:
        src = os.path.join(SRC_FONTS, name)
        if not os.path.exists(src):
            print(f"  пропуск: нет {name}", file=sys.stderr)
            continue
        dst = os.path.join(OUT_FONTS, name.replace(".ttf", ".woff2"))

        font = TTFont(src)
        font.flavor = "woff2"
        font.save(dst)

        before, after = os.path.getsize(src), os.path.getsize(dst)
        saved += before - after
        print(f"  {name:24s} {human(before):>9s} -> {human(after):>9s}")
    return saved


def convert_images() -> int:
    from PIL import Image

    os.makedirs(OUT_IMGS, exist_ok=True)
    saved = 0
    for name, width in IMAGES.items():
        src = os.path.join(SRC_IMGS, name)
        if not os.path.exists(src):
            print(f"  пропуск: нет {name}", file=sys.stderr)
            continue

        before = os.path.getsize(src)
        stem = name.rsplit(".", 1)[0]
        after_total = 0

        with Image.open(src) as image:
            image = image.convert("RGBA")
            for suffix, target in ((".webp", width), ("@2x.webp", width * 2)):
                # Увеличивать изображение бессмысленно: чётче оно не станет,
                # а вес вырастет.
                w = min(target, image.width)
                h = round(image.height * w / image.width)
                resized = image.resize((w, h), Image.LANCZOS)

                dst = os.path.join(OUT_IMGS, stem + suffix)
                # method=6 — самое медленное и самое плотное сжатие. Скрипт
                # разовый, поэтому время сборки здесь значения не имеет.
                resized.save(dst, "WEBP", quality=86, method=6)
                after_total += os.path.getsize(dst)

        saved += before - after_total
        print(f"  {name:24s} {human(before):>9s} -> {human(after_total):>9s} (два размера)")
    return saved


def build_duel_atlas() -> None:
    """Атлас спрайтов дуэли — тоже производный файл в public/img.

    Собирается отдельным скриптом (там не изменение размера, а нарезка листа по
    сетке), но вызывается отсюда: иначе после «пересобрал ассеты» на бою
    пропадал бы Читавук, и заметить это можно было бы только на живом сайте.
    """
    tool = os.path.join(REPO, "tools", "build_duel_sprites.py")
    if not os.path.exists(tool):
        print("  пропуск: нет tools/build_duel_sprites.py", file=sys.stderr)
        return
    subprocess.run([sys.executable, tool], check=True)


def main() -> int:
    if not os.path.isdir(SRC_IMGS):
        print(f"не найден каталог ассетов: {SRC_IMGS}", file=sys.stderr)
        return 1

    print("Шрифты:")
    saved_fonts = convert_fonts()
    print("\nКартинки:")
    saved_images = convert_images()
    # flush: дальше пишет дочерний процесс со своим буфером, и без сброса
    # заголовок оказывался в выводе позже собственных строк скрипта.
    print("\nСпрайты дуэли:", flush=True)
    build_duel_atlas()

    print(f"\nИтого сэкономлено: {human(saved_fonts + saved_images)}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
