"""То во дворе Башты, что нарисовано здесь, а не вырезано из пака.

Река в Cozyland есть, но все её кромки диагональные: лента из них при
повторении по горизонтали давала ряд одинаковых зубцов, и берег выглядел
гребёнкой. Утка и прилавок были вырезаны из пака с обрубленным низом.

Поэтому они рисуются клеточными картами в палитре пака — цвета взяты пипеткой
из ``house.webp`` и старой реки, — и рядом с вырезанными спрайтами не выпадают
из стиля. Комната переехала в build_house_room.py: для неё нашёлся свой пак.

    python tools/build_drawn_assets.py

Результат коммитится: файлов мало, и собирать их на выкатке нечем.
"""

from __future__ import annotations

from pathlib import Path

from PIL import Image

WORLD_OUT = Path("web/public/img/garden/world")

# Палитра. Ключ — символ на карте.
PALETTE = {
    ".": None,
    "w": (199, 220, 208),  # стена
    "W": (155, 171, 178),  # стена в тени
    "b": (122, 48, 69),    # плинтус, тёмное дерево
    "f": (171, 148, 122),  # половица
    "F": (160, 134, 112),  # половица потемнее
    "s": (105, 79, 98),    # шов и тень
    "d": (232, 59, 59),    # дверь
    "D": (174, 35, 52),    # дверь в тени
    "o": (230, 144, 78),   # рама
    "O": (203, 104, 61),   # рама в тени
    "g": (143, 248, 226),  # стекло
    "G": (57, 168, 190),   # стекло в тени
    "y": (251, 185, 84),   # латунь, свет
    "Y": (247, 150, 23),   # латунь в тени
    "k": (68, 16, 31),     # почти чёрный
    "n": (30, 188, 115),   # зелень
    "N": (35, 144, 99),    # зелень в тени
    "p": (145, 219, 105),  # светлая зелень
    "c": (154, 144, 162),  # шерсть
    "C": (100, 88, 112),   # шерсть в тени
    "l": (215, 196, 168),  # ткань занавески в тени
    "r": (174, 35, 52),    # ковёр
    "R": (232, 59, 59),    # ковёр, узор
    "u": (58, 93, 201),    # книга синяя
    "v": (251, 107, 29),   # книга оранжевая
    "e": (247, 244, 244),  # белое
}


def blank(width: int, height: int) -> Image.Image:
    return Image.new("RGBA", (width, height), (0, 0, 0, 0))


def put(image: Image.Image, x: int, y: int, rows: list[str]) -> None:
    """Рисует карту символов начиная с левого верхнего угла."""
    pixels = image.load()
    for row, line in enumerate(rows):
        for column, symbol in enumerate(line):
            color = PALETTE.get(symbol)
            if color is None:
                continue
            px, py = x + column, y + row
            if 0 <= px < image.width and 0 <= py < image.height:
                pixels[px, py] = (*color, 255)


def fill(image: Image.Image, box: tuple[int, int, int, int], symbol: str) -> None:
    color = PALETTE[symbol]
    assert color is not None
    image.paste((*color, 255), box)


def dot(image: Image.Image, x: int, y: int, symbol: str) -> None:
    color = PALETTE[symbol]
    if color is None or not (0 <= x < image.width and 0 <= y < image.height):
        return
    image.load()[x, y] = (*color, 255)


def build_duck() -> Image.Image:
    """Утка на реке.

    В паке она была вырезана вместе с куском соседнего тайла и обрублена по
    хвост, поэтому рисуется здесь: тело, шея, клюв и рябь под ватерлинией.
    """
    rows = [
        "..............kkkk....",
        ".............keeeek...",
        "............keeeeeek..",
        "............keekeeeek.",
        "............keekeeeeyy",
        "............keeeeeeyyy",
        ".........kkkkeeeeeek..",
        ".......kkeeeeeeeeek...",
        "....kkkkeeeeeeeeek....",
        "..kkeeeeeeeeeeeeeek...",
        ".keeeeeeeeeeeeeeeeek..",
        ".keeeeeeeeeeeeeeeeek..",
        "..keeeeeeeeeeeeeeek...",
        "...kkeeeeeeeeeeekk....",
        ".....kkkkkkkkkkk......",
    ]
    duck = blank(22, 18)
    put(duck, 0, 0, rows)
    # Рябь: без неё утка висит над водой, а не сидит в ней.
    for x in range(2, 20, 4):
        dot(duck, x, 15, "g")
        dot(duck, x + 1, 15, "g")
    for x in range(4, 18, 6):
        dot(duck, x, 17, "g")
    return duck


def build_stall() -> Image.Image:
    """Прилавок с семенами: навес, стойка и товар.

    Раньше это была верхняя полоска прилавка из пака — низ обрезан, и лавка
    читалась как цветная лента на траве.
    """
    stall = blank(48, 42)
    # Навес в полоску с фестонами по краю.
    for x in range(48):
        for y in range(0, 10):
            fill(stall, (x, y, x + 1, y + 1), "d" if (x // 4) % 2 == 0 else "e")
    for x in range(48):
        if (x % 8) in (3, 4):
            fill(stall, (x, 10, x + 1, 12), "d" if (x // 4) % 2 == 0 else "e")
    fill(stall, (0, 0, 48, 2), "b")

    # Стойки и столешница.
    fill(stall, (1, 10, 5, 40), "F")
    fill(stall, (43, 10, 47, 40), "F")
    fill(stall, (0, 22, 48, 26), "f")
    fill(stall, (0, 22, 48, 23), "y")
    fill(stall, (4, 26, 44, 38), "F")
    for x in range(6, 44, 8):
        fill(stall, (x, 26, x + 1, 38), "s")
    fill(stall, (0, 38, 48, 40), "b")
    fill(stall, (0, 40, 48, 41), "s")

    # Товар на прилавке: мешочки семян и цветок в горшке.
    for index, x in enumerate((8, 18, 28)):
        colour = ("v", "u", "y")[index]
        fill(stall, (x, 16, x + 7, 22), colour)
        fill(stall, (x, 16, x + 7, 17), "b")
        fill(stall, (x + 2, 13, x + 5, 16), "F")
    fill(stall, (37, 17, 43, 22), "O")
    fill(stall, (38, 12, 42, 17), "n")
    fill(stall, (39, 10, 41, 13), "R")
    return stall


RIVER_W, RIVER_H = 64, 64

WATER = {
    "deep": (11, 138, 143),
    "mid": (14, 175, 155),
    "shallow": (48, 225, 185),
    "foam": (143, 248, 226),
    "wet": (255, 240, 199),
    "sand": (251, 185, 84),
    "sandy": (230, 144, 78),
    "edge": (22, 90, 76),
    "grass": (30, 188, 115),
    "light": (145, 219, 105),
}


def wave(x: int, base: float, first: float, second: float, shift: float) -> int:
    """Кромка по синусу с периодом в целую ленту: шва при повторении не видно."""
    from math import pi, sin

    value = base + first * sin(2 * pi * x / RIVER_W) + second * sin(4 * pi * x / RIVER_W + shift)
    return int(round(value))


def build_river() -> Image.Image:
    """Река сверху карты: глубина, отмель, песок и трава.

    Лента шириной в четыре тайла, а не в один: на одном тайле любая кромка
    повторяется каждые шестнадцать пикселей и читается как зубья пилы.
    """
    from math import pi, sin

    image = Image.new("RGBA", (RIVER_W, RIVER_H), (0, 0, 0, 0))
    pixels = image.load()
    for x in range(RIVER_W):
        water_edge = wave(x, 42, 2.2, 1.1, 0.9)
        grass_edge = wave(x, 57, 1.6, 0.8, 2.4)
        # Границы глубин тоже волнистые: прямая линия поперёк реки читается как
        # шов между двумя заливками.
        deep_edge = wave(x, 13, 2.4, 1.0, 0.4)
        mid_edge = wave(x, 27, 2.6, 1.3, 2.1)
        for y in range(RIVER_H):
            if y < deep_edge:
                color = WATER["deep"]
            elif y < mid_edge:
                color = WATER["mid"]
            elif y < water_edge:
                color = WATER["shallow"]
            elif y < water_edge + 2:
                color = WATER["foam"]
            elif y < water_edge + 5:
                color = WATER["wet"]
            elif y < grass_edge:
                color = WATER["sand"]
            elif y < grass_edge + 1:
                color = WATER["edge"]
            else:
                color = WATER["grass"]
            pixels[x, y] = (*color, 255)

        # Блики на воде и песчинки: без них вода и берег — две заливки. Блик
        # лежит горизонтально и коротко — вертикальная рябь выглядит дождём.
        if x % 16 in (4, 5, 6):
            pixels[x, 19 + (x // 16) % 3] = (*WATER["foam"], 255)
        if x % 21 in (7, 8):
            pixels[x, 33 + (x // 21) % 2] = (*WATER["foam"], 255)
        if x % 7 == 3:
            pixels[x, min(RIVER_H - 1, grass_edge - 2)] = (*WATER["sandy"], 255)
        if x % 9 == 4 and grass_edge + 3 < RIVER_H:
            pixels[x, grass_edge + 3] = (*WATER["light"], 255)
    return image


WORLD_PIECES = {
    "river": build_river,
    "duck": build_duck,
    "stall": build_stall,
}

def main() -> None:
    WORLD_OUT.mkdir(parents=True, exist_ok=True)
    for name, builder in WORLD_PIECES.items():
        image = builder()
        image.save(WORLD_OUT / f"{name}.webp", lossless=True, quality=100, method=6)
        print(f"мир/{name:9} {image.width:3}x{image.height:3}")


if __name__ == "__main__":
    main()
