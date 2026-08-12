"""То в мире Башты, что нарисовано здесь, а не вырезано из пака.

Cozyland — уличный пак: комнаты в нём нет, а докупать ради одного интерьера
второй пак незачем. Река же в паке есть, но все её кромки диагональные: лента
из них при повторении по горизонтали давала ряд одинаковых зубцов, и берег
выглядел гребёнкой.

Поэтому и комната, и река рисуются клеточными картами в палитре пака — цвета
взяты пипеткой из ``house.webp`` и старой реки, — и рядом с вырезанными
спрайтами не выпадают из стиля.

    python tools/build_drawn_assets.py

Результат коммитится: файлов мало, и собирать их на выкатке нечем.
"""

from __future__ import annotations

from pathlib import Path

from PIL import Image

OUT = Path("web/public/img/garden/house")
WORLD_OUT = Path("web/public/img/garden/world")

# Палитра дома. Ключ — символ на карте.
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

ROOM_W, ROOM_H = 208, 144
WALL_H = 76
PANEL_H = 18  # деревянная панель по низу стены


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


def build_room() -> Image.Image:
    """Комната: обои с узором, деревянная панель, дощатый пол, окно и дверь."""
    room = blank(ROOM_W, ROOM_H)
    panel_top = WALL_H - PANEL_H

    fill(room, (0, 0, ROOM_W, panel_top), "w")
    # Обои: полоса и мелкий ромб между полосами — стена перестаёт быть заливкой.
    for x in range(0, ROOM_W, 16):
        for y in range(0, panel_top):
            dot(room, x, y, "W")
    for x in range(8, ROOM_W, 16):
        for y in range(6, panel_top - 4, 14):
            for dx, dy in ((0, -1), (-1, 0), (1, 0), (0, 1)):
                dot(room, x + dx, y + dy, "W")

    # Панель в вагонку и плинтус.
    fill(room, (0, panel_top, ROOM_W, WALL_H - 4), "f")
    for x in range(0, ROOM_W, 12):
        for y in range(panel_top, WALL_H - 4):
            dot(room, x, y, "F")
    fill(room, (0, panel_top, ROOM_W, panel_top + 2), "b")
    fill(room, (0, WALL_H - 4, ROOM_W, WALL_H), "b")

    # Пол: доски со сдвинутыми стыками, сучки и тень от стены.
    for index, y in enumerate(range(WALL_H, ROOM_H, 12)):
        fill(room, (0, y, ROOM_W, min(y + 12, ROOM_H)), "f" if index % 2 else "F")
        fill(room, (0, y, ROOM_W, min(y + 1, ROOM_H)), "s")
        for x in range((index * 37) % 46, ROOM_W, 46):
            for dy in range(1, min(12, ROOM_H - y)):
                dot(room, x, y + dy, "s")
        for x in range((index * 23 + 11) % 60, ROOM_W, 60):
            dot(room, x, y + 5, "s")
            dot(room, x + 1, y + 5, "s")
    for x in range(ROOM_W):
        dot(room, x, WALL_H, "b")
        dot(room, x, WALL_H + 1, "s")

    put(room, 16, 30, door_rows())
    put(room, 88, 16, window_rows())
    return room


def door_rows() -> list[str]:
    """Выход во двор: та же красная дверь, что снаружи, с наличником."""
    width = 30
    rows = ["k" + "o" * width + "k"]
    rows.append("k" + "y" * width + "k")
    for index in range(42):
        body = "d" * (width - 4)
        # Филёнки: две вставки потемнее, иначе дверь — красный прямоугольник.
        if 6 <= index <= 16 or 22 <= index <= 34:
            body = "D" * 3 + "d" * (width - 10) + "D" * 3
        if index in (6, 16, 22, 34):
            body = "D" * (width - 4)
        line = "k" + "o" + "O" + body + "O" + "o" + "k"
        if index == 26:
            line = line[:width - 5] + "y" + line[width - 4:]
        rows.append(line)
    rows.append("k" * (width + 2))
    return rows


def window_rows() -> list[str]:
    """Окно во двор: небо с облаком, дерево и трава — дом стоит в саду."""
    width, height = 40, 34
    glass_top, glass_bottom = 3, height - 4
    rows = []
    for y in range(height):
        line = []
        for x in range(width):
            if y < 2 or y >= height - 3 or x < 3 or x >= width - 3:
                line.append("o")
            elif y == 2 or y == height - 4 or x == 3 or x == width - 4:
                line.append("O")
            elif y > height - 13:
                line.append("n")
            else:
                line.append("g")
            # Облако в небе и трава пятнами: ровная заливка выглядит бумагой.
            if 22 <= x <= 31 and 6 <= y <= 9 and glass_top < y < glass_bottom:
                line[-1] = "e" if 23 <= x <= 30 or y >= 7 else "g"
            if y > height - 13 and (x * 5 + y * 3) % 17 == 0:
                line[-1] = "p"
            # Дерево: крона овалом и ствол.
            if 8 <= x <= 17 and height - 24 <= y <= height - 14:
                cx, cy = 12.5, height - 19
                if ((x - cx) / 5.2) ** 2 + ((y - cy) / 5.0) ** 2 <= 1:
                    line[-1] = "N" if (x + y) % 4 == 0 else "n"
            if 11 <= x <= 13 and height - 14 < y <= height - 10:
                line[-1] = "b"
        rows.append("".join(line))

    # Переплёт: крест по середине стекла.
    for y in range(glass_top + 1, glass_bottom):
        chars = list(rows[y])
        chars[width // 2 - 1] = chars[width // 2] = "o"
        rows[y] = "".join(chars)
    middle = (glass_top + glass_bottom) // 2
    rows[middle] = rows[middle][:4] + "o" * (width - 8) + rows[middle][width - 4:]

    # Занавески и подоконник.
    for y in range(glass_top + 1, glass_bottom):
        chars = list(rows[y])
        for x in (4, 5, 6, width - 7, width - 6, width - 5):
            chars[x] = "e" if x in (5, width - 6) else "l"
        rows[y] = "".join(chars)
    rows.append("y" * width)
    rows.append("Y" * width)
    rows.append("." + "k" * (width - 2) + ".")
    return rows


def build_radio() -> Image.Image:
    rows = [
        "..OOOOOOOOOOOOOOOO..",
        ".OFFFFFFFFFFFFFFFFO.",
        ".OFggggggggFFFFFFFO.",
        ".OFgGGGGGgFFyyyyFFO.",
        ".OFgggggggFFyYYyFFO.",
        ".OFFFFFFFFFFFFFFFFO.",
        ".OFkkkkkkkFFkkkkFFO.",
        ".OFkeeeeekFFkyykFFO.",
        ".OFkeeeeekFFkkkkFFO.",
        ".OFkkkkkkkFFFFFFFFO.",
        ".OFFFFFFFFFFFFFFFFO.",
        "..OOOOOOOOOOOOOOOO..",
        "...O..........O.....",
        "...k..........k.....",
    ]
    image = blank(20, 14)
    put(image, 0, 0, rows)
    return image.resize((28, 20), Image.NEAREST)


def build_desk() -> Image.Image:
    """Письменный стол: на нём лежит тетрадь со словами."""
    desk = blank(46, 28)
    fill(desk, (0, 0, 46, 2), "b")        # кромка столешницы
    fill(desk, (0, 2, 46, 8), "f")        # столешница
    fill(desk, (0, 8, 46, 10), "F")
    fill(desk, (2, 10, 22, 24), "F")      # тумба с ящиками
    fill(desk, (2, 10, 22, 11), "s")
    fill(desk, (2, 17, 22, 18), "s")
    for y in (13, 20):
        fill(desk, (9, y, 15, y + 2), "y")
    fill(desk, (38, 10, 44, 26), "F")     # ножка
    fill(desk, (2, 24, 22, 26), "b")
    fill(desk, (38, 26, 44, 28), "b")
    fill(desk, (0, 26, 46, 27), "s")      # тень на полу
    return desk


def build_nightstand() -> Image.Image:
    """Тумба, на которой стоит приёмник."""
    stand = blank(30, 24)
    fill(stand, (0, 0, 30, 2), "b")
    fill(stand, (0, 2, 30, 6), "f")
    fill(stand, (2, 6, 28, 20), "F")
    fill(stand, (5, 9, 25, 17), "f")      # дверца
    fill(stand, (14, 12, 16, 14), "y")    # ручка
    fill(stand, (2, 20, 6, 24), "b")
    fill(stand, (24, 20, 28, 24), "b")
    fill(stand, (0, 22, 30, 23), "s")
    return stand


def build_stool() -> Image.Image:
    stool = blank(16, 18)
    fill(stool, (0, 0, 16, 2), "b")
    fill(stool, (0, 2, 16, 6), "f")
    fill(stool, (2, 6, 5, 17), "F")
    fill(stool, (11, 6, 14, 17), "F")
    fill(stool, (5, 9, 11, 11), "F")
    fill(stool, (0, 17, 16, 18), "s")
    return stool


def build_notebook() -> Image.Image:
    """Тетрадь со словами: та самая, куда переезжает всё выученное."""
    rows = [
        "..kkkkkkkkkkkkkk..",
        ".kbbbbbbbbbbbbbbk.",
        "kbeeeeeeeeeeeeeebk",
        "kbekkkkkkeeeeeeebk",
        "kbeeeeeeeeeeeeeebk",
        "kbekkkkkkkkkeeeebk",
        "kbeeeeeeeeeeeeeebk",
        "kbekkkkkkkeeeeeebk",
        "kbeeeeeeeeeeeeeebk",
        ".kbbbbbbbbbbbbbbk.",
        "..kkkkkkkkkkkkkk..",
    ]
    book = blank(18, 11)
    put(book, 0, 0, rows)
    # Закладка: без неё тетрадь читается как белый прямоугольник.
    fill(book, (13, 0, 15, 8), "d")
    return book


def build_rug() -> Image.Image:
    rows = [
        "........rrrrrrrrrrrrrrrrrrrr........",
        "....rrrrrRRRRRRRRRRRRRRRRRRrrrrr....",
        "..rrrRRRRrrrrrrrrrrrrrrrrrrRRRRrrr..",
        ".rrRRRrrrrryyyyyyyyyyyyrrrrrrrRRRrr.",
        "rrRRrrrryyyyyyyyyyyyyyyyyyrrrrrRRRrr",
        "rrRRrrrryyyyyyyyyyyyyyyyyyrrrrrRRRrr",
        ".rrRRRrrrrryyyyyyyyyyyyrrrrrrrRRRrr.",
        "..rrrRRRRrrrrrrrrrrrrrrrrrrRRRRrrr..",
        "....rrrrrRRRRRRRRRRRRRRRRRRrrrrr....",
        "........rrrrrrrrrrrrrrrrrrrr........",
    ]
    image = blank(36, 10)
    put(image, 0, 0, rows)
    return image.resize((72, 20), Image.NEAREST)


def build_picture() -> Image.Image:
    rows = [
        "yyyyyyyyyyyyyyyyyyyyyy",
        "yYYYYYYYYYYYYYYYYYYYYy",
        "yYggggggggggggggggggYy",
        "yYgggggggyyyyggggggeYy",
        "yYggggggyyyyyygggggeeY",
        "yYgggggyyykkyyyggggeeYy",
        "yYgggggyyyyyyyggggggYy",
        "yYgggggggnnngggggggGYy",
        "yYgggggggnnnggggggGGYy",
        "yYpppppppnnnpppppppGYy",
        "yYNNNNNNNNNNNNNNNNNNYy",
        "yYYYYYYYYYYYYYYYYYYYYy",
        "yyyyyyyyyyyyyyyyyyyyyy",
    ]
    image = blank(22, 13)
    put(image, 0, 0, rows)
    return image.resize((26, 16), Image.NEAREST)


def build_lamp() -> Image.Image:
    rows = [
        "...yyyyyy...",
        "..yyyyyyyy..",
        ".yyyyyyyyyy.",
        "YYYYYYYYYYYY",
        "YYYYYYYYYYYY",
        ".....ss.....",
        ".....ss.....",
        ".....ss.....",
        ".....ss.....",
        ".....ss.....",
        ".....ss.....",
        ".....ss.....",
        ".....ss.....",
        ".....ss.....",
        ".....ss.....",
        "....bbbb....",
        "...bbbbbb...",
        "..bbbbbbbb..",
    ]
    image = blank(12, 18)
    put(image, 0, 0, rows)
    return image.resize((14, 30), Image.NEAREST)


def build_shelf() -> Image.Image:
    rows = [
        "..............................",
        "..uu..vv..uu..dd..nn..vv..uu..",
        "..uu..vv..uu..dd..nn..vv..uu..",
        "..uu..vv..uu..dd..nn..vv..uu..",
        "..uu..vv..uu..dd..nn..vv..uu..",
        "..uu..vv..uu..dd..nn..vv..uu..",
        "bbbbbbbbbbbbbbbbbbbbbbbbbbbbbb",
        "ssssssssssssssssssssssssssssss",
    ]
    image = blank(30, 8)
    put(image, 0, 0, rows)
    return image.resize((34, 14), Image.NEAREST)


def build_pot() -> Image.Image:
    rows = [
        "....nn....",
        "...nnnn...",
        "..nnppnn..",
        ".nnnppnnn.",
        "..nnppnn..",
        "...nppn...",
        "....pp....",
        "....pp....",
        ".OOOOOOOO.",
        ".OOOOOOOO.",
        "..oooooo..",
        "..oooooo..",
        "...OOOO...",
    ]
    image = blank(10, 13)
    put(image, 0, 0, rows)
    return image.resize((14, 20), Image.NEAREST)


def build_cat() -> Image.Image:
    rows = [
        "..cc........cc..",
        ".cccc......cccc.",
        ".cccccccccccccc.",
        "cccCCcccccCCcccc",
        "cccccccccccccccc",
        ".cccccccccccccc.",
        "..CCCCCCCCCCCC..",
        "...cc......cc...",
    ]
    image = blank(16, 8)
    put(image, 0, 0, rows)
    return image.resize((18, 11), Image.NEAREST)


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

PIECES = {
    "room": build_room,
    "desk": build_desk,
    "nightstand": build_nightstand,
    "stool": build_stool,
    "notebook": build_notebook,
    "radio": build_radio,
    "rug": build_rug,
    "picture": build_picture,
    "lamp": build_lamp,
    "shelf": build_shelf,
    "pot": build_pot,
    "cat": build_cat,
}


def main() -> None:
    OUT.mkdir(parents=True, exist_ok=True)
    WORLD_OUT.mkdir(parents=True, exist_ok=True)
    for name, builder in PIECES.items():
        image = builder()
        image.save(OUT / f"{name}.webp", lossless=True, quality=100, method=6)
        print(f"дом/{name:8} {image.width:3}x{image.height:3}")

    for name, builder in WORLD_PIECES.items():
        image = builder()
        image.save(WORLD_OUT / f"{name}.webp", lossless=True, quality=100, method=6)
        print(f"мир/{name:9} {image.width:3}x{image.height:3}")


if __name__ == "__main__":
    main()
