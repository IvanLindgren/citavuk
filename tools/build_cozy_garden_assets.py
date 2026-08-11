"""Сборка мира Башты из Cozyland Exterior Tilesets.

Лицензия пака разрешает использовать и править его в игре, но запрещает
раздавать сам пак. Поэтому архив и полные листы остаются локально, а в
``web/public/img/garden/world`` попадают только тесно обрезанные фрагменты.

    python tools/build_cozy_garden_assets.py <папка с PNG листами>

Кропы раньше брались по сетке на глаз: «табличка» оказалась блоком из девяти
табличек, «забор» — куском забора вместе с соседними тайлами, а «лавка» —
двумя досками от вывески. Здесь у каждого фрагмента подписано, что именно в нём
лежит, а сборка кончается контактным листом — глянуть, что получилось.

Растения собирает отдельный ``build_garden_plants.py``: они рисуются из
CC0-набора FlowerAssets и от этого пака не зависят.
"""

from __future__ import annotations

import argparse
from pathlib import Path

from PIL import Image, ImageDraw

TILE = 16

# Объекты мира: имя → лист и прямоугольник. Прямоугольники выверены по
# контактному листу, а не по сетке: у пака нет единого шага, и соседний тайл
# запросто оказывается куском другого предмета.
CROPS = {
    "house": ("House.png", (0, 0, 152, 160)),
    # Деревья стоят на листе вплотную: кроп по сетке прихватывал крону соседа.
    "tree": ("Trees.png", (80, 16, 144, 112)),
    "tree_small": ("Trees.png", (32, 32, 80, 100)),
    "fir": ("Trees.png", (352, 176, 400, 272)),
    "fountain": ("Fountain_Sheet.png", (0, 0, 80, 96)),
    "campfire": ("Campfire_Sheet.png", (0, 0, 64, 64)),
    # Секция забора: две стойки и перекладины между ними.
    "fence": ("Outdoor Stuff Tiles.png", (128, 120, 160, 152)),
    # Одна табличка на столбе. Раньше сюда попадал весь блок табличек разом.
    "sign": ("Outdoor Stuff Tiles.png", (336, 320, 352, 352)),
    # Прилавок с товаром — им отмечен магазин семян. Нижний в паке засыпан
    # снегом, поэтому берётся только верхний.
    "stall": ("Outdoor Stuff Tiles.png", (320, 352, 368, 368)),
    # Горшки с цветами вместо лавки: лавки в паке нет, а то, что стояло на её
    # месте, было парой досок от вывески.
    "pots": ("Outdoor Stuff Tiles.png", (64, 128, 112, 144)),
    # Утка, плывущая по воде: у неё под низом уже нарисована рябь.
    "duck": ("Outdoor Stuff Tiles.png", (590, 30, 610, 48)),
}

# Бесшовные тайлы: ими мостится земля. Каждый обязан повторяться без шва,
# поэтому берутся заведомо однородные клетки автотайла, а не куски перехода.
TILES = {
    "tile_grass": ("Grass Tiles.png", (64, 32, 80, 48)),
    "tile_soil": ("Grass Tiles.png", (64, 112, 80, 128)),
    "tile_sand": ("Grass Tiles.png", (176, 32, 192, 48)),
}

# Река собирается лентой сверху вниз и повторяется по горизонтали: вода, вода,
# песчаная кромка, берег. Верхнего берега в ленте нет намеренно — река уходит
# за край карты, а не лежит в ней озером.
#
# Кромка берётся от прямой стороны острова, а не от ромба-озера: у ромба все
# края диагональные, и повторение по горизонтали давало ряд одинаковых зубцов —
# берег выглядел пилой.
RIVER_ROWS = [
    ("Water.png", (48, 48, 64, 64)),
    ("Water.png", (48, 48, 64, 64)),
    ("Water.png", (32, 16, 48, 32)),
    ("Water.png", (32, 32, 48, 48)),
]

# Цветочки в траве: три клетки автотайла, каждая со своим цветом.
FLOWERS = [
    ("Outdoor Stuff Tiles.png", (16, 48, 32, 64)),
    ("Outdoor Stuff Tiles.png", (32, 48, 48, 64)),
    ("Outdoor Stuff Tiles.png", (48, 48, 64, 64)),
]

# Ягодные кусты — покупное украшение. Собираются из трёх кустов в один
# кластер: одиночный куст на карте теряется.
BUSHES = [
    ((33, 226, 63, 254), (0, 5)),
    ((81, 226, 111, 254), (27, 1)),
    ((33, 258, 63, 286), (56, 5)),
]


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("source", type=Path, help="папка с PNG листами Cozyland")
    parser.add_argument(
        "--output",
        type=Path,
        default=Path(__file__).parents[1] / "web/public/img/garden/world",
    )
    parser.add_argument("--sheet", type=Path, help="куда положить контактный лист")
    args = parser.parse_args()
    args.output.mkdir(parents=True, exist_ok=True)

    built: dict[str, Image.Image] = {}
    for name, (filename, box) in {**CROPS, **TILES}.items():
        sprite = sheet(args.source, filename).crop(box)
        if name in CROPS:
            sprite = trim(sprite)
        built[name] = save(args.output, name, sprite)

    built["river"] = save(args.output, "river", build_river(args.source))
    built["flowers"] = save(args.output, "flowers", build_flowers(args.source))
    built["bushes"] = save(args.output, "bushes", build_bushes(args.source))

    if args.sheet:
        contact(built).save(args.sheet)
        print(f"контактный лист: {args.sheet}")


def sheet(source: Path, filename: str) -> Image.Image:
    path = source / filename
    if not path.is_file():
        raise SystemExit(f"нет листа: {path}")
    with Image.open(path) as image:
        return image.convert("RGBA")


def save(output: Path, name: str, sprite: Image.Image) -> Image.Image:
    sprite.save(output / f"{name}.webp", "WEBP", lossless=True, method=6)
    print(f"{name}.webp: {sprite.width}x{sprite.height}")
    return sprite


def build_river(source: Path) -> Image.Image:
    canvas = Image.new("RGBA", (TILE, TILE * len(RIVER_ROWS)), (0, 0, 0, 0))
    for index, (filename, box) in enumerate(RIVER_ROWS):
        canvas.alpha_composite(sheet(source, filename).crop(box), (0, index * TILE))
    return canvas


def build_flowers(source: Path) -> Image.Image:
    canvas = Image.new("RGBA", (TILE * len(FLOWERS), TILE), (0, 0, 0, 0))
    for index, (filename, box) in enumerate(FLOWERS):
        canvas.alpha_composite(sheet(source, filename).crop(box), (index * TILE, 0))
    return canvas


def build_bushes(source: Path) -> Image.Image:
    outdoor = sheet(source, "Outdoor Stuff Tiles.png")
    canvas = Image.new("RGBA", (88, 34), (0, 0, 0, 0))
    for box, point in BUSHES:
        canvas.alpha_composite(trim(outdoor.crop(box)), point)
    return trim(canvas)


def trim(image: Image.Image) -> Image.Image:
    box = image.getbbox()
    return image.crop(box) if box else image


def contact(built: dict[str, Image.Image], scale: int = 3) -> Image.Image:
    """Контактный лист: единственный способ заметить кривой кроп до выкатки."""
    columns = 5
    cell = max(max(item.width, item.height) for item in built.values()) * scale + 24
    rows = (len(built) + columns - 1) // columns
    canvas = Image.new("RGB", (columns * cell, rows * cell), (46, 46, 58))
    draw = ImageDraw.Draw(canvas)
    for index, (name, sprite) in enumerate(sorted(built.items())):
        big = sprite.resize((sprite.width * scale, sprite.height * scale), Image.Resampling.NEAREST)
        left = (index % columns) * cell
        top = (index // columns) * cell
        canvas.paste(big, (left + 8, top + 20), big)
        draw.text((left + 6, top + 5), name, fill=(255, 220, 140))
    return canvas


if __name__ == "__main__":
    main()
