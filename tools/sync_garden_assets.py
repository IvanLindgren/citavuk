"""Зеркалит спрайты сада из веба в приложение.

Собирают их пять скриптов (`build_cozy_garden_assets.py`, `build_house_room.py`,
`build_drawn_assets.py`, `build_garden_plants.py`, `build_garden_sprites.py`), и
все пишут в `web/public/img/garden`. Приложению нужны те же файлы, но своей
копией: ассеты Flutter собираются в APK, а не читаются с сайта.

Копия делается скриптом, а не руками, потому что расходятся такие вещи молча:
на сайте подсолнух пересобран, в приложении остался прежний, и один сад
выглядит по-разному на двух экранах.

    python tools/sync_garden_assets.py
"""

from __future__ import annotations

import filecmp
import shutil
from pathlib import Path

ROOT = Path(__file__).parents[1]
SRC = ROOT / "web" / "public" / "img" / "garden"
DST = ROOT / "frontend" / "assets" / "imgs" / "garden"

# Каталоги во Flutter не рекурсивны: каждый из них отдельной строкой в pubspec.
FOLDERS = ["", "world", "house"]


def main() -> None:
    copied = 0
    for folder in FOLDERS:
        src = SRC / folder if folder else SRC
        dst = DST / folder if folder else DST
        dst.mkdir(parents=True, exist_ok=True)
        for path in sorted(src.glob("*.webp")):
            target = dst / path.name
            if target.exists() and filecmp.cmp(path, target, shallow=False):
                continue
            shutil.copy2(path, target)
            copied += 1
            print(f"обновлено: {folder + '/' if folder else ''}{path.name}")
    print(f"Готово. Файлов обновлено: {copied}")


if __name__ == "__main__":
    main()
