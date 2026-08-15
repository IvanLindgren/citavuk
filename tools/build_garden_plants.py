"""Пиксельные стадии растений Башты Читавука из набора FlowerAssets (CC0).

Стадий в наборе нет: на вид приходится один рисунок цветка, отдельно головка и
отдельно семя. Раньше веб-сад собирал стадии из одного и того же ростка
Cozyland — стадии 1 и 2 отличались масштабом на пять процентов, и рост не
читался. Здесь стадии собираются из частей самого набора:

    семе      Seed.png
    клица     нижняя часть стебля с первым листом
    стабљика  стебель до половины
    пупољак   стебель почти во весь рост и сжатая головка
    цвет      Flower.png целиком

Всё пикселизуется в один масштаб на вид, поэтому рост виден по высоте, а не по
подмене картинки. Цвета сводятся к небольшой палитре: сглаженные полутона
исходника в пиксельном мире выглядят грязью.

    python tools/build_garden_plants.py

Кадр 24×32, растение стоит на нижней границе: грядка обрезает картинку снизу.
"""

from __future__ import annotations

import argparse
from pathlib import Path

from PIL import Image

WIDTH, HEIGHT = 24, 32
ALPHA_CUTOFF = 130

# Насколько тёмным должен быть цвет, чтобы считаться контуром, а не краской.
OUTLINE_LEVEL = 150

# Сколько красок остаётся от рисунка. Пиксельность даёт не только размер, но и
# резко ограниченная палитра: в исходнике сотни полутонов сглаживания.
#
# Цвета берутся из самого рисунка, а не из палитры Cozyland. Попытка свести
# растения к краскам пака кончилась бирюзовым подсолнухом: трава там изумрудная
# (1ebc73), и жёлто-зелёный лист уходил именно в неё.
SPECIES_COLORS = 12

# Вид → файлы набора и высоты стадий в пикселях кадра. Высоты подобраны так,
# чтобы соседние стадии отличались заметно: разница в пару пикселей на экране
# не читается вовсе.
SPECIES = {
    "suncokret": {
        "flower": "SunflowerFlower.png",
        "head": "SunflowerFlowerHead.png",
        "seed": "SunflowerSeed.png",
        "heights": (7, 12, 19, 26, 31),
    },
    "krasuljak": {
        "flower": "DaisyFlower.png",
        "head": "DaisyFlowerHead.png",
        "seed": "DaisySeed.png",
        "heights": (7, 11, 17, 24, 29),
    },
    "koleus": {
        "flower": "ColeusFlower.png",
        "head": "ColeusFlowerHead.png",
        "seed": "ColeusSeed.png",
        "heights": (7, 11, 16, 22, 27),
    },
    # Молодило не тянется вверх: это розетка листьев у самой земли, поэтому
    # головки у него нет и стадии различаются размером розетки.
    "cuvarkuca": {
        "flower": "SucculentFlower.png",
        "head": None,
        "seed": "SucculentSeed.png",
        "heights": (7, 10, 14, 18, 22),
    },
}


def load(source: Path, name: str) -> Image.Image:
    path = source / name
    if not path.is_file():
        raise SystemExit(f"нет файла набора: {path}")
    with Image.open(path) as image:
        return trim(image.convert("RGBA"))


def trim(image: Image.Image) -> Image.Image:
    box = image.getbbox()
    return image.crop(box) if box else image


def pixelize(image: Image.Image, height: int, palette: Image.Image) -> Image.Image:
    """Уменьшает рисунок до высоты в пикселях кадра и сводит его к палитре.

    Альфа режется порогом, а не сглаживается: полупрозрачная кайма превращает
    пиксельный контур в размытое пятно, особенно поверх грядки.
    """
    scale = height / image.height
    width = max(1, round(image.width * scale))
    small = shrink(image, width, height)

    alpha = small.getchannel("A").point(lambda value: 255 if value >= ALPHA_CUTOFF else 0)
    flat = small.convert("RGB").quantize(
        palette=palette, dither=Image.Dither.NONE
    ).convert("RGB")
    flat.putalpha(alpha)
    return trim(despeckle(flat))


def despeckle(image: Image.Image) -> Image.Image:
    """Убирает одинокие тёмные точки внутри рисунка.

    Остатки жирного контура выигрывают голосование в случайных блоках и
    рассыпаются по лепесткам чёрной крупой. Контур на границе силуэта при этом
    остаётся: у него тёмные соседи есть.
    """
    pixels = image.load()
    result = image.copy()
    target = result.load()
    for y in range(image.height):
        for x in range(image.width):
            red, green, blue, alpha = pixels[x, y]
            if alpha == 0 or red + green + blue > OUTLINE_LEVEL:
                continue
            neighbours: dict[tuple[int, int, int], int] = {}
            dark = 0
            for offset_y in (-1, 0, 1):
                for offset_x in (-1, 0, 1):
                    near_x, near_y = x + offset_x, y + offset_y
                    if not (0 <= near_x < image.width and 0 <= near_y < image.height):
                        continue
                    pixel = pixels[near_x, near_y]
                    if pixel[3] == 0:
                        continue
                    if sum(pixel[:3]) <= OUTLINE_LEVEL:
                        dark += 1
                    else:
                        neighbours[pixel[:3]] = neighbours.get(pixel[:3], 0) + 1
            if dark <= 2 and neighbours:
                target[x, y] = (*max(neighbours.items(), key=lambda item: item[1])[0], 255)
    return result


def shrink(image: Image.Image, width: int, height: int) -> Image.Image:
    """Уменьшение по самому частому цвету блока, а не по среднему.

    Усреднение здесь не работает: контур в исходнике толстый, и при сжатии в
    тридцать раз каждый выходной пиксель получает изрядную долю чёрного.
    Жёлтые лепестки подсолнуха от этого выходили тускло-коричневыми, а зелёный
    стебель — серым. Самый частый цвет сохраняет и краску, и контур там, где
    контур действительно занимает пиксель целиком.
    """
    source = image.load()
    canvas = Image.new("RGBA", (width, height), (0, 0, 0, 0))
    for y in range(height):
        top = y * image.height // height
        bottom_edge = max(top + 1, (y + 1) * image.height // height)
        for x in range(width):
            left = x * image.width // width
            right = max(left + 1, (x + 1) * image.width // width)
            counts: dict[tuple[int, int, int], int] = {}
            opaque = 0
            for sample_y in range(top, bottom_edge):
                for sample_x in range(left, right):
                    pixel = source[sample_x, sample_y]
                    if pixel[3] < ALPHA_CUTOFF:
                        continue
                    opaque += 1
                    colour = pixel[:3]
                    counts[colour] = counts.get(colour, 0) + 1
            area = (bottom_edge - top) * (right - left)
            # Блок, закрашенный меньше чем на треть, — это край рисунка, а не
            # его часть: иначе вокруг цветка нарастает бахрома в один пиксель.
            if opaque * 3 < area:
                continue
            canvas.putpixel((x, y), (*vote(counts, opaque), 255))
    return canvas


def vote(counts: dict[tuple[int, int, int], int], opaque: int) -> tuple[int, int, int]:
    """Выбирает цвет пикселя из красок блока.

    Простое большинство отдаёт весь стебель контуру: в исходнике он обведён
    жирно, и на ширине в один пиксель чёрного всегда больше, чем зелёного.
    Поэтому контур побеждает, только если своей краски в блоке почти нет.
    """
    ranked = sorted(counts.items(), key=lambda item: item[1], reverse=True)
    winner, votes = ranked[0]
    if sum(winner) > OUTLINE_LEVEL:
        return winner
    for colour, count in ranked[1:]:
        if sum(colour) > OUTLINE_LEVEL and count * 4 >= opaque:
            return colour
    return winner


def species_palette(flower: Image.Image) -> Image.Image:
    """Палитра вида — краски самого рисунка, сведённые к нескольким.

    Считается один раз по целому цветку и применяется ко всем его стадиям:
    посчитай палитру для каждой стадии отдельно — и у бутона окажется свой
    оттенок зелени, отличный от стебля на предыдущей стадии.
    """
    pixels = [
        (red, green, blue)
        for red, green, blue, transparency in flower.getdata()
        if transparency >= ALPHA_CUTOFF
    ]
    # Считать по всему кадру нельзя: прозрачная часть больше самого цветка,
    # и цвет подложки забирал половину палитры, а лепестки уходили в бежевый.
    strip = Image.new("RGB", (len(pixels), 1))
    strip.putdata(pixels)
    reduced = strip.quantize(colors=SPECIES_COLORS, method=Image.Quantize.MEDIANCUT)
    palette = reduced.getpalette()[: SPECIES_COLORS * 3]
    reference = Image.new("P", (1, 1))
    reference.putpalette(palette + [0] * (768 - len(palette)))
    return reference


def frame(sprite: Image.Image) -> Image.Image:
    """Ставит спрайт на дно кадра по центру."""
    canvas = Image.new("RGBA", (WIDTH, HEIGHT), (0, 0, 0, 0))
    if sprite.width > WIDTH:
        sprite = sprite.resize(
            (WIDTH, max(1, round(sprite.height * WIDTH / sprite.width))),
            Image.Resampling.BOX,
        )
    canvas.alpha_composite(sprite, ((WIDTH - sprite.width) // 2, HEIGHT - sprite.height))
    return canvas


def bottom(image: Image.Image, share: float) -> Image.Image:
    """Нижняя доля рисунка: цветок буквально поднимается из земли."""
    cut = round(image.height * (1 - share))
    return trim(image.crop((0, cut, image.width, image.height)))


def build_species(source: Path, output: Path, name: str, spec: dict) -> None:
    flower = load(source, spec["flower"])
    seed = load(source, spec["seed"])
    heights = spec["heights"]
    palette = species_palette(flower)
    # Масштаб общий для всех стадий вида: иначе стебель на стадии «бутон»
    # оказался бы толще, чем у распустившегося цветка.
    unit = heights[-1] / flower.height

    if not spec["head"]:
        # У розетки нет стебля: обрезка снизу дала бы блин из листьев, поэтому
        # растёт она целиком.
        stages = [frame(pixelize(seed, heights[0], palette))]
        stages.extend(frame(pixelize(flower, height, palette)) for height in heights[1:])
        save(output, name, stages, unit)
        return

    # Доли подобраны по рисункам набора: нижняя треть у всех видов — голый
    # стебель, первый лист начинается примерно с 45% высоты.
    stages = [
        frame(pixelize(seed, heights[0], palette)),
        frame(pixelize(bottom(flower, 0.45), heights[1], palette)),
        frame(pixelize(bottom(flower, 0.66), heights[2], palette)),
    ]

    if spec["head"]:
        head = load(source, spec["head"])
        stem = bottom(flower, 0.80)
        bud = Image.new(
            "RGBA",
            (max(stem.width, head.width), stem.height + head.height // 2),
            (0, 0, 0, 0),
        )
        # Бутон — та же головка, сжатая вдвое по высоте и посаженная на макушку
        # стебля: закрытый цветок именно так и выглядит сверху.
        squashed = head.resize((head.width, max(1, head.height // 2)), Image.Resampling.BOX)
        bud.alpha_composite(stem, ((bud.width - stem.width) // 2, bud.height - stem.height))
        bud.alpha_composite(squashed, ((bud.width - squashed.width) // 2, 0))
        stages.append(frame(pixelize(trim(bud), heights[3], palette)))

    stages.append(frame(pixelize(flower, heights[4], palette)))
    save(output, name, stages, unit)


def save(output: Path, name: str, stages: list[Image.Image], unit: float) -> None:
    for index, sprite in enumerate(stages):
        filename = f"plant_{name}_{index}.webp"
        sprite.save(output / filename, "WEBP", lossless=True, method=6)
        print(f"{filename}: {sprite.width}x{sprite.height}, масштаб {unit:.3f}")


# Садовник: восемь кадров полива. Рисунок гладкий, и в пиксельном мире его
# приходилось ужимать дробно — 150 px кадра в 56 px на экране. Здесь он
# уменьшается тем же способом, что растения, и дальше масштабируется целым.
GARDENER_FRAMES = 8
GARDENER_SIZE = (30, 40)


def build_gardener(source: Path, output: Path) -> None:
    path = source / "citavuk_garden.webp"
    if not path.is_file():
        print(f"пропущен садовник: нет {path}")
        return
    with Image.open(path) as image:
        sheet = image.convert("RGBA")

    width, height = GARDENER_SIZE
    cell = sheet.width // GARDENER_FRAMES
    canvas = Image.new("RGBA", (width * GARDENER_FRAMES, height), (0, 0, 0, 0))
    palette = species_palette(sheet)
    for index in range(GARDENER_FRAMES):
        frame_box = (index * cell, 0, (index + 1) * cell, sheet.height)
        # Кадр уменьшается целиком, без обрезки по содержимому: обрезанные
        # вплотную кадры имеют разную высоту, и волк приседает посреди
        # анимации полива.
        small = shrink(sheet.crop(frame_box), width, height)
        alpha = small.getchannel("A")
        flat = small.convert("RGB").quantize(palette=palette, dither=Image.Dither.NONE)
        frame = flat.convert("RGB")
        frame.putalpha(alpha)
        canvas.alpha_composite(despeckle(frame), (index * width, 0))
    canvas.save(output / "gardener.webp", "WEBP", lossless=True, method=6)
    print(f"gardener.webp: {canvas.width}x{canvas.height}")
    build_walk(canvas.crop((0, 0, width, height)), output)


# Ходьба: четыре кадра из одной позы. Рисованного цикла шага у Читавука нет, а
# заводить второго волка ради него нельзя — на экране это был бы уже не он.
WALK_FRAMES = 4


def build_walk(stand: Image.Image, output: Path) -> None:
    """Цикл шага: тело подпрыгивает, ноги идут по очереди.

    Кадры считаются из позы стоя. Ноги ищутся по просвету между ними: у волка
    их видно последние несколько рядов, и просвет — единственное, что их
    разделяет. Кадры 0 и 2 — та же поза стоя, поэтому остановка посреди шага
    не дёргает картинку.
    """
    top, split = legs_of(stand)
    canvas = Image.new("RGBA", (stand.width * WALK_FRAMES, stand.height), (0, 0, 0, 0))
    canvas.alpha_composite(stand, (0, 0))
    canvas.alpha_composite(stand, (stand.width * 2, 0))
    canvas.alpha_composite(step(stand, top, split, lift="right"), (stand.width, 0))
    canvas.alpha_composite(step(stand, top, split, lift="left"), (stand.width * 3, 0))
    canvas.save(output / "gardener_walk.webp", "WEBP", lossless=True, method=6)
    print(f"gardener_walk.webp: {canvas.width}x{canvas.height}, ноги с {top}, просвет {split}")


# Сколько нижних рядов считать ногами. Волк ростом в сорок пикселей, ног у него
# видно четыре ряда — искать просвет выше бессмысленно: там хвост и руки, и
# дырок в силуэте хватает.
LEG_BAND = 5


def legs_of(frame: Image.Image) -> tuple[int, int]:
    """Верхний ряд ног и колонка между ними."""
    alpha = frame.getchannel("A")
    band = range(frame.height - LEG_BAND, frame.height)
    filled = {
        (x, y): alpha.getpixel((x, y)) > 0
        for y in band
        for x in range(frame.width)
    }
    columns = [x for x in range(frame.width) if filled[(x, frame.height - 1)]]
    if not columns:
        return frame.height - LEG_BAND, frame.width // 2
    # Просвет ищется в середине следа: по краям стоят сами ступни.
    left = columns[0] + (columns[-1] - columns[0]) // 4
    right = columns[-1] - (columns[-1] - columns[0]) // 4
    middle = range(left, right + 1) or range(columns[0], columns[-1] + 1)
    split = min(middle, key=lambda x: sum(filled[(x, y)] for y in band))
    rows = [y for y in band if not filled[(split, y)]]
    return (rows[0] if rows else frame.height - LEG_BAND) - 1, split


def step(frame: Image.Image, top: int, split: int, lift: str) -> Image.Image:
    """Одна нога на земле, вторая поднята; тело переносится на опорную.

    На такой мелочи ноги — четыре ряда пикселей, и одного их сдвига не видно.
    Читается перенос веса: волк на шаге наклоняется в сторону той ноги, что
    стоит, и подпрыгивает на пиксель.
    """
    out = Image.new("RGBA", frame.size, (0, 0, 0, 0))
    swing = 1 if lift == "right" else -1
    body = frame.crop((0, 0, frame.width, top + 1))
    # paste, а не alpha_composite: кадр съезжает вверх и вбок, а composite
    # отрицательных координат не берёт.
    out.paste(body, (-swing, -1), body)

    legs = frame.crop((0, top, frame.width, frame.height))
    grounded = legs.copy()
    lifted = legs.copy()
    if lift == "right":
        grounded.paste((0, 0, 0, 0), (split, 0, legs.width, legs.height))
        lifted.paste((0, 0, 0, 0), (0, 0, split, legs.height))
    else:
        grounded.paste((0, 0, 0, 0), (0, 0, split, legs.height))
        lifted.paste((0, 0, 0, 0), (split, 0, legs.width, legs.height))
    out.paste(grounded, (0, top), grounded)
    out.paste(lifted, (swing, top - 1), lifted)
    return out


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument(
        "--source",
        type=Path,
        default=Path(__file__).parents[1] / "tools/assets/garden/FlowerAssets/FlowerAssets",
    )
    parser.add_argument(
        "--gardener",
        type=Path,
        default=Path(__file__).parents[1] / "web/public/img/garden",
        help="папка с citavuk_garden.webp",
    )
    parser.add_argument(
        "--output",
        type=Path,
        default=Path(__file__).parents[1] / "web/public/img/garden/world",
    )
    args = parser.parse_args()
    args.output.mkdir(parents=True, exist_ok=True)
    for name, spec in SPECIES.items():
        build_species(args.source, args.output, name, spec)
    build_gardener(args.gardener, args.output)


if __name__ == "__main__":
    main()
