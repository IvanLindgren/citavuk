"""Build the small Cozyland subset used by the web garden.

The Cozyland license allows using and editing the pack in a game, but forbids
redistributing the source pack. Keep the downloaded archive and source sheets
local; only the tightly cropped in-game sprites produced here belong in
``web/public/img/garden/world``.
"""

from __future__ import annotations

import argparse
import colorsys
from pathlib import Path

from PIL import Image, ImageDraw


CROPS = {
    "house": ("House.png", (0, 0, 152, 160)),
    "grove": ("Trees.png", (0, 0, 144, 128)),
    "bench": ("Outdoor Stuff Tiles.png", (0, 0, 48, 32)),
    "fence": ("Outdoor Stuff Tiles.png", (112, 120, 192, 208)),
    "signs": ("Outdoor Stuff Tiles.png", (280, 288, 400, 384)),
    "fountain": ("Fountain_Sheet.png", (0, 0, 80, 96)),
    "campfire": ("Campfire_Sheet.png", (0, 0, 64, 64)),
}

PLANT_FLOWERS = {
    "suncokret": ((48, 48, 64, 80), -0.23, 1.1, 1.18),
    "krasuljak": ((32, 48, 48, 80), 0.0, 0.12, 1.35),
    "koleus": ((16, 48, 32, 80), 0.0, 1.05, 1.05),
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

    outdoor = args.source / "Outdoor Stuff Tiles.png"
    with Image.open(outdoor) as image:
        sheet = image.convert("RGBA")
        build_bushes(sheet, args.output)
        build_plants(sheet, args.output)


def build_bushes(sheet: Image.Image, output: Path) -> None:
    canvas = Image.new("RGBA", (88, 34), (0, 0, 0, 0))
    for box, point in (
        ((33, 226, 63, 254), (0, 5)),
        ((81, 226, 111, 254), (27, 1)),
        ((33, 258, 63, 286), (56, 5)),
    ):
        canvas.alpha_composite(trim(sheet.crop(box)), point)
    canvas = trim(canvas)
    canvas.save(output / "bushes.webp", "WEBP", lossless=True, method=6)
    print(f"bushes.webp: {canvas.width}x{canvas.height}")


def build_plants(sheet: Image.Image, output: Path) -> None:
    small_sprout = trim(sheet.crop((16, 80, 24, 88)))
    large_sprout = trim(sheet.crop((32, 80, 48, 88)))

    for species in ("suncokret", "krasuljak", "koleus", "cuvarkuca"):
        stages = [
            seed_sprite(species),
            plant_canvas(small_sprout, 1.4),
            plant_canvas(large_sprout, 1.35),
        ]
        if species == "cuvarkuca":
            stages.extend((succulent_sprite(large_sprout, 2), succulent_sprite(large_sprout, 3)))
        else:
            box, hue, saturation, value = PLANT_FLOWERS[species]
            flower = recolor(trim(sheet.crop(box)), hue, saturation, value)
            bud = trim(flower.crop((0, max(0, flower.height - 19), flower.width, flower.height)))
            stages.extend((plant_canvas(bud, 1.0), plant_canvas(flower, 1.0)))

        for stage, sprite in enumerate(stages):
            name = f"plant_{species}_{stage}.webp"
            sprite.save(output / name, "WEBP", lossless=True, method=6)
            print(f"{name}: {sprite.width}x{sprite.height}")


def seed_sprite(species: str) -> Image.Image:
    colors = {
        "suncokret": "#d6a82e",
        "krasuljak": "#ddd8c8",
        "koleus": "#8e5f93",
        "cuvarkuca": "#567963",
    }
    canvas = Image.new("RGBA", (32, 32), (0, 0, 0, 0))
    draw = ImageDraw.Draw(canvas)
    draw.rectangle((14, 25, 17, 28), fill=colors[species])
    draw.point((13, 26), fill="#4f3b2d")
    return canvas


def succulent_sprite(source: Image.Image, count: int) -> Image.Image:
    canvas = Image.new("RGBA", (32, 32), (0, 0, 0, 0))
    sprite = source.resize(
        (max(1, source.width * 2), max(1, source.height * 2)),
        Image.Resampling.NEAREST,
    )
    points = ((7, 17), (13, 13), (18, 18))
    for point in points[:count]:
        canvas.alpha_composite(sprite, point)
    return canvas


def plant_canvas(source: Image.Image, scale: float) -> Image.Image:
    canvas = Image.new("RGBA", (32, 32), (0, 0, 0, 0))
    size = (max(1, round(source.width * scale)), max(1, round(source.height * scale)))
    sprite = source.resize(size, Image.Resampling.NEAREST)
    canvas.alpha_composite(sprite, ((32 - sprite.width) // 2, 31 - sprite.height))
    return canvas


def recolor(image: Image.Image, hue_shift: float, saturation: float, value: float) -> Image.Image:
    result = image.copy()
    pixels = []
    for red, green, blue, alpha in result.getdata():
        if alpha == 0:
            pixels.append((red, green, blue, alpha))
            continue
        hue, sat, val = colorsys.rgb_to_hsv(red / 255, green / 255, blue / 255)
        red, green, blue = colorsys.hsv_to_rgb(
            (hue + hue_shift) % 1,
            min(1, sat * saturation),
            min(1, val * value),
        )
        pixels.append((round(red * 255), round(green * 255), round(blue * 255), alpha))
    result.putdata(pixels)
    return result


def trim(image: Image.Image) -> Image.Image:
    box = image.getbbox()
    return image.crop(box) if box else image


if __name__ == "__main__":
    main()
