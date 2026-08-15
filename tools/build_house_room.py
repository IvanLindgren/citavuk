"""
Комната Читавука из пака sierrassets.

Раньше комнату рисовал build_drawn_assets.py — получалась коробка с плоской
мебелью. Здесь берутся настоящие спрайты: пол и стена собираются из тайлов 8x8,
мебель вырезана готовой.

Пак лежит в tools/assets/packs и в репозиторий не попадает: лицензия разрешает
использовать спрайты в игре, но запрещает раздавать сам пак. В сборку идут
только готовые webp из web/public/img/garden/house.

  python tools/build_house_room.py
"""

from __future__ import annotations

import io
import zipfile
from pathlib import Path

from PIL import Image

ROOT = Path(__file__).resolve().parent.parent
PACK = ROOT / 'tools' / 'assets' / 'packs' / 'sierrassets furniture pack.zip'
OUT = ROOT / 'web' / 'public' / 'img' / 'garden' / 'house'

INSIDE = 'sierrassets furniture pack'
FURNITURE = f'{INSIDE}/furniture/individual sprites/part-Slice {{}}.png'
PETS = f'{INSIDE}/pets/individual sprites/Slice {{}}.png'
TILES = f'{INSIDE}/floors and walls/floor and walls spritesheet.png'

# Комната в мировых пикселях: 28x21 тайла по 8. Стена сверху, пол снизу.
ROOM_W, ROOM_H = 224, 168
WALL_H = 56
TILE = 8

# Кухня отделена от жилой части перегородкой: пол за ней другой.
PARTITION_X = 144
PARTITION_BOTTOM = 120

# Тайл в атласе: колонка, ряд. Шаг 9 пикселей, первый ряд смещён на 1.
FLOOR_WOOD = (3, 0)
FLOOR_TILED = (3, 4)
SKIRTING = (9, 12)

# Стены в пакете бывают трёх цветов — зелёные, розовые и белые, — и все
# полосатые: у каждого тайла тёмная кромка, от которой на стене остаётся сетка.
# В сербской квартире стены просто выкрашены, поэтому они здесь заливаются
# краской, а из пакета берётся только белый плинтус.
WALL_PAINT = (0xE6, 0xE8, 0xE4, 0xFF)
WALL_CORNICE = (0xF4, 0xF6, 0xF2, 0xFF)
# Боковые стены и торец перегородки видно вскользь: они темнее лицевой.
WALL_SIDE = (0xCF, 0xD3, 0xCD, 0xFF)

# Дерево в пакете болотно-жёлтое, плитка — больничного голубого. Рисунок
# остаётся тот же, меняется только тон: светлый дуб на полу и тёплая плитка на
# кухне — то, что лежит в обычной белградской квартире.
OAK = {
    (0x8F, 0x65, 0x2B): (0xB5, 0x8B, 0x5B),
    (0xA8, 0x88, 0x38): (0xCD, 0xA6, 0x74),
    (0xD0, 0xC0, 0x88): (0xE7, 0xD3, 0xB0),
}
CERAMIC = {
    (0xDE, 0xE5, 0xE5): (0xE4, 0xE0, 0xD8),
    (0xBF, 0xCA, 0xCE): (0xD2, 0xCD, 0xC3),
    (0xAA, 0xBA, 0xBF): (0xC3, 0xBD, 0xB2),
}

# Мебель: имя файла -> номер слайса в паке.
THINGS = {
    'door': 305,
    'window': 491,
    'blackboard': 123,
    'bed': 105,
    'nightstand': 216,
    'radio': 354,
    'tvstand': 155,
    'tv': 143,
    'fireplace': 270,
    'kitchen': 489,
    # Красный холодильник рядом с красным диваном — уже не акцент, а рябь.
    'fridge': 188,
    'sofa': 265,
    'table': 16,
    'chair': 443,
    'desk': 483,
    'notebook': 481,
    # Покупное: имена совпадают с каталогом на сервере.
    'rug': 229,
    'picture': 367,
    'lamp': 402,
    'shelf': 279,
    'pot': 15,
}
PET_THINGS = {'cat': 2}


def tile(sheet: Image.Image, column: int, row: int) -> Image.Image:
    return sheet.crop((column * 9, 1 + row * 9, column * 9 + TILE, 1 + row * 9 + TILE))


def fill(canvas: Image.Image, piece: Image.Image, box: tuple[int, int, int, int]) -> None:
    x0, y0, x1, y1 = box
    for y in range(y0, y1, TILE):
        for x in range(x0, x1, TILE):
            canvas.alpha_composite(piece, (x, y))


def build_room(pack: zipfile.ZipFile) -> Image.Image:
    sheet = load(pack, TILES)
    room = Image.new('RGBA', (ROOM_W, ROOM_H), (0, 0, 0, 0))

    # Пол: жилая часть в паркет, кухня в плитку.
    fill(room, recolour(tile(sheet, *FLOOR_WOOD), OAK), (0, WALL_H, PARTITION_X, ROOM_H))
    fill(room, recolour(tile(sheet, *FLOOR_TILED), CERAMIC), (PARTITION_X, WALL_H, ROOM_W, ROOM_H))

    # Стена: краска, светлая кромка под потолком, белый плинтус у пола.
    paint(room, (0, 0, ROOM_W, WALL_H), WALL_PAINT)
    paint(room, (0, 0, ROOM_W, 2), WALL_CORNICE)
    fill(room, tile(sheet, *SKIRTING), (0, WALL_H - TILE, ROOM_W, WALL_H))

    # Боковые стены: без них пол утекает за край и комната перестаёт быть комнатой.
    paint(room, (0, WALL_H, TILE, ROOM_H), WALL_SIDE)
    paint(room, (ROOM_W - TILE, WALL_H, ROOM_W, ROOM_H), WALL_SIDE)

    # Перегородка: кухня — отдельная комната, а не угол общей. Торец светлее
    # боковин — на него падает свет из комнаты.
    paint(room, (PARTITION_X, WALL_H, PARTITION_X + TILE, PARTITION_BOTTOM), WALL_SIDE)
    paint(room, (PARTITION_X, PARTITION_BOTTOM - 2, PARTITION_X + TILE, PARTITION_BOTTOM), WALL_CORNICE)

    shade(room)
    return room


def paint(canvas: Image.Image, box: tuple[int, int, int, int], colour: tuple[int, int, int, int]) -> None:
    canvas.paste(colour, box)


def recolour(piece: Image.Image, palette: dict) -> Image.Image:
    out = piece.copy()
    pixels = out.load()
    for y in range(out.height):
        for x in range(out.width):
            r, g, b, a = pixels[x, y]
            swap = palette.get((r, g, b))
            if swap:
                pixels[x, y] = (*swap, a)
    return out


def shade(room: Image.Image) -> None:
    """Тень под стеной: без неё пол и обои сливаются в одну плоскость."""
    pixels = room.load()

    def darken(x: int, y: int, weight: float) -> None:
        r, g, b, a = pixels[x, y]
        if a:
            pixels[x, y] = (int(r * weight), int(g * weight), int(b * weight), a)

    for y in range(WALL_H, WALL_H + 3):
        for x in range(ROOM_W):
            darken(x, y, 0.82 + 0.06 * (y - WALL_H))
    for y in range(WALL_H, ROOM_H):
        for x in range(TILE, TILE + 3):
            darken(x, y, 0.88)
        for x in range(PARTITION_X + TILE, PARTITION_X + TILE + 3):
            if y < PARTITION_BOTTOM:
                darken(x, y, 0.88)


def load(pack: zipfile.ZipFile, name: str) -> Image.Image:
    with pack.open(name) as handle:
        return Image.open(io.BytesIO(handle.read())).convert('RGBA')


def trim(image: Image.Image) -> Image.Image:
    box = image.getbbox()
    return image.crop(box) if box else image


def save(image: Image.Image, name: str) -> None:
    path = OUT / f'{name}.webp'
    image.save(path, 'WEBP', lossless=True, method=6)
    print(f'{path.relative_to(ROOT)} {image.width}x{image.height} {path.stat().st_size} б')


def main() -> None:
    if not PACK.exists():
        raise SystemExit(f'нет пака: {PACK}')
    OUT.mkdir(parents=True, exist_ok=True)
    with zipfile.ZipFile(PACK) as pack:
        save(build_room(pack), 'room')
        for name, slice_id in THINGS.items():
            save(trim(load(pack, FURNITURE.format(slice_id))), name)
        for name, slice_id in PET_THINGS.items():
            save(trim(load(pack, PETS.format(slice_id))), name)


if __name__ == '__main__':
    main()
