"""Build the small Cozyland subset used by the web garden.

The Cozyland license allows using and editing the pack in a game, but forbids
redistributing the source pack. Keep the downloaded archive and source sheets
local; only the tightly cropped in-game sprites produced here belong in
``web/public/img/garden/world``.
"""

from __future__ import annotations

import argparse
from pathlib import Path

from PIL import Image


CROPS = {
    "house": ("House.png", (0, 0, 152, 160)),
    "grove": ("Trees.png", (0, 0, 144, 128)),
    "bench": ("Outdoor Stuff Tiles.png", (0, 0, 48, 32)),
    "bushes": ("Outdoor Stuff Tiles.png", (0, 208, 128, 288)),
    "fence": ("Outdoor Stuff Tiles.png", (112, 120, 192, 208)),
    "signs": ("Outdoor Stuff Tiles.png", (280, 288, 400, 384)),
    "fountain": ("Fountain_Sheet.png", (0, 0, 80, 96)),
    "campfire": ("Campfire_Sheet.png", (0, 0, 64, 64)),
}


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("source", type=Path, help="directory with Cozyland PNG sheets")
    parser.add_argument(
        "--output",
        type=Path,
        default=Path(__file__).parents[1] / "web/public/img/garden/world",
    )
    args = parser.parse_args()

    args.output.mkdir(parents=True, exist_ok=True)
    for name, (filename, box) in CROPS.items():
        source = args.source / filename
        if not source.is_file():
            raise SystemExit(f"missing source sheet: {source}")
        with Image.open(source) as image:
            sprite = image.convert("RGBA").crop(box)
            sprite.save(args.output / f"{name}.webp", "WEBP", lossless=True, method=6)
            print(f"{name}.webp: {sprite.width}x{sprite.height}")


if __name__ == "__main__":
    main()
