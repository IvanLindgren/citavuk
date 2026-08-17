"""Картинки для виджетов Читавука на рабочем столе.

Виджет рисуется RemoteViews: ни SVG, ни своей отрисовки там нет, только готовые
битмапы. Поэтому Читавук, гирлянда и значки собираются здесь и кладутся в
res/drawable-xxhdpi — Android сам уменьшит их под экраны меньшей плотности.

Значки рисуются, а не берутся из шрифта: emoji на разных прошивках выглядят
по-разному, а часть символов и вовсе рисуется пустым квадратом.

    python tools/widget_assets.py
"""

from __future__ import annotations

import math
from pathlib import Path

from PIL import Image, ImageDraw, ImageFilter

ROOT = Path(__file__).resolve().parent.parent
APP_IMGS = ROOT / "frontend" / "assets" / "imgs"
SOURCE = APP_IMGS / "citavuk_widget.png"
DRAWABLE = ROOT / "frontend" / "android" / "app" / "src" / "main" / "res" / "drawable-xxhdpi"

# Палитра повторяет res/values/citavuk_widget.xml.
GOLD = (198, 154, 52)
GOLD_LIGHT = (247, 219, 140)
GOLD_GLOW = (252, 214, 118)
ACCENT = (158, 43, 37)
ACCENT_LIGHT = (226, 122, 96)
ACCENT_GLOW = (240, 148, 116)
INK = (43, 33, 24)


def save(image: Image.Image, name: str) -> None:
    DRAWABLE.mkdir(parents=True, exist_ok=True)
    image.save(DRAWABLE / name)
    print(name, image.size)


def cutout_mascot() -> None:
    """Читавук без белого фона.

    Исходник — PNG без альфы, и просто «сделать белое прозрачным» нельзя:
    рубаха и лапы у Читавука тоже белые, в них появились бы дыры. Поэтому фон
    заливается от углов — внутрь фигуры заливка не проходит.
    """
    image = Image.open(SOURCE).convert("RGB")
    marker = (255, 0, 255)
    mask = image.copy()
    for corner in ((0, 0), (mask.width - 1, 0), (0, mask.height - 1),
                   (mask.width - 1, mask.height - 1)):
        ImageDraw.floodfill(mask, corner, marker, thresh=42)

    result = image.convert("RGBA")
    pixels = result.load()
    flooded = mask.load()
    for y in range(result.height):
        for x in range(result.width):
            if flooded[x, y] == marker:
                pixels[x, y] = (255, 255, 255, 0)

    box = result.getbbox()
    if box:
        result = result.crop(box)

    side = max(result.size)
    square = Image.new("RGBA", (side, side), (255, 255, 255, 0))
    square.paste(result, ((side - result.width) // 2, (side - result.height) // 2))
    save(square.resize((288, 288), Image.LANCZOS), "citavuk_widget.png")


def star_points(cx: float, cy: float, radius: float, points: int = 5,
                turn: float = 0.0) -> list[tuple[float, float]]:
    vertices = []
    for index in range(points * 2):
        angle = math.pi / points * index - math.pi / 2 + turn
        length = radius if index % 2 == 0 else radius * 0.44
        vertices.append((cx + math.cos(angle) * length, cy + math.sin(angle) * length))
    return vertices


def glowing_star(size: int, radius: float, body: tuple[int, int, int],
                 glow: tuple[int, int, int]) -> Image.Image:
    """Звезда со свечением: размытый ореол, плотное тело и светлая сердцевина.

    Ореол рисуется отдельным слоем и размывается, иначе на светлом пергаменте
    звезда выглядит наклейкой, а не огоньком. Сердцевина маленькая: сделай её
    крупнее — и звезда превращается в кольцо.
    """
    layer = Image.new("RGBA", (size, size), (0, 0, 0, 0))
    center = size / 2

    halo = Image.new("RGBA", (size, size), (0, 0, 0, 0))
    draw = ImageDraw.Draw(halo)
    # Круги с разной прозрачностью: ближе к звезде свет плотнее. Радиусы
    # заметно меньше половины холста, иначе размытие упирается в край и ореол
    # получается квадратным.
    for scale, alpha in ((2.2, 52), (1.5, 90), (1.0, 140)):
        r = radius * scale
        draw.ellipse([center - r, center - r, center + r, center + r], fill=glow + (alpha,))
    layer.alpha_composite(halo.filter(ImageFilter.GaussianBlur(radius * 0.7)))

    shape = Image.new("RGBA", (size, size), (0, 0, 0, 0))
    draw = ImageDraw.Draw(shape)
    # Светлая кайма по контуру и плотное тело внутри: тело обязано быть темнее
    # пергамента, иначе звезда на нём просто теряется.
    draw.polygon(star_points(center, center, radius * 1.06), fill=glow + (220,))
    draw.polygon(star_points(center, center, radius), fill=body + (255,))
    # Блик — маленький и смещённый вверх-влево, как отсвет на стекле. Крупная
    # светлая середина превращала звезду в кольцо.
    draw.ellipse(
        [center - radius * 0.42, center - radius * 0.46,
         center - radius * 0.06, center - radius * 0.10],
        fill=(255, 250, 232, 200),
    )
    layer.alpha_composite(shape.filter(ImageFilter.GaussianBlur(radius * 0.09)))
    return layer


def garland() -> None:
    """Гирлянда: провисающая нить с горящими звёздами, стыкуется сама с собой.

    Один период рисуется так, чтобы левый и правый край нити были на одной
    высоте — тогда tileMode="repeat" не даёт видимого шва.
    """
    scale = 4
    width, height = 360, 74
    W, H = width * scale, height * scale
    image = Image.new("RGBA", (W, H), (0, 0, 0, 0))

    top, sag = 9 * scale, 24 * scale

    def wire_y(x: float) -> float:
        return top + math.sin(math.pi * (x / W)) * sag

    wire = Image.new("RGBA", (W, H), (0, 0, 0, 0))
    draw = ImageDraw.Draw(wire)
    draw.line([(x, wire_y(x)) for x in range(0, W + 1, 2 * scale)],
              fill=INK + (60,), width=max(1, scale))
    image.alpha_composite(wire)

    count = 7
    for index in range(count):
        x = (index + 0.5) / count * W
        y = wire_y(x)
        big = index % 2 == 0
        radius = (9.0 if big else 6.2) * scale
        body, glow = (GOLD, GOLD_GLOW) if big else (ACCENT, ACCENT_GLOW)
        drop = radius * 0.9
        draw = ImageDraw.Draw(image)
        draw.line([(x, y), (x, y + drop)], fill=INK + (60,), width=max(1, scale))
        # Холст с запасом: размытому ореолу нужно место, иначе он
        # обрезается краем и вокруг звезды видно светлый квадрат.
        box = int(radius * 9)
        star = glowing_star(box, radius, body, glow)
        image.alpha_composite(star, (int(x - box / 2), int(y + drop + radius - box / 2)))

    save(image.resize((width, height), Image.LANCZOS), "widget_garland.png")


def bezier(p0, p1, p2, steps: int = 24) -> list[tuple[float, float]]:
    """Квадратичная кривая точками — из них собирается контур пламени."""
    points = []
    for step in range(steps + 1):
        t = step / steps
        u = 1 - t
        points.append((
            u * u * p0[0] + 2 * u * t * p1[0] + t * t * p2[0],
            u * u * p0[1] + 2 * u * t * p1[1] + t * t * p2[1],
        ))
    return points


def tongues(draw: ImageDraw.ImageDraw, cx: float, base_y: float, height: float,
            width: float) -> None:
    """Три языка пламени, вложенные друг в друга: от тёмно-красного к жёлтому.

    Контур каждого собран из двух кривых и дуги основания: остроконечная
    капля, а не овал — овал читается как лампочка.
    """
    for shrink, color in ((0.0, ACCENT), (0.42, ACCENT_LIGHT), (0.72, GOLD_LIGHT)):
        r = width * (1.0 - shrink * 0.43)
        bottom = base_y - height * shrink * 0.08
        top = height * (1.0 - shrink * 0.26)
        # Остриё уведено вправо и вверх, а бока идут разными кривыми: язык
        # пламени несимметричен, симметричный читается как капля.
        tip = (cx + r * 0.28, bottom - top)
        left, right = (cx - r, bottom - r * 0.35), (cx + r, bottom - r * 0.35)
        outline = (
            bezier(tip, (cx - r * 1.35, bottom - top * 0.42), left, steps=28)
            + [(cx - r * math.cos(a), bottom - r * 0.35 + r * math.sin(a))
               for a in [i / 16 * math.pi for i in range(17)]]
            + bezier(right, (cx + r * 1.15, bottom - top * 0.66), tip, steps=28)
        )
        draw.polygon(outline, fill=color + (255,))


def stove(size: int = 288, name: str = "widget_stove.png") -> Image.Image:
    """Сербская печь с огнём за стеклом — знак серии дней.

    Чугунная печка-варочная плита с латунной столешницей: такие стоят в домах
    по всей Сербии, и огонь в них — не значок «серии», а живая печь, которая
    греет. Голый огонёк на её месте выглядел неопрятно и ничего не говорил.

    Рисуется силуэтом: на 24 точках в строке статистики различимы только
    тёмный корпус, латунная крышка и светящаяся дверца — на них и держится
    узнаваемость, остальное работает на крупных размерах.
    """
    scale = 4
    S = size * scale
    image = Image.new("RGBA", (S, S), (0, 0, 0, 0))

    iron = (58, 48, 43)
    iron_dark = (38, 31, 27)
    glass = (28, 20, 16)

    def box(x0, y0, x1, y1, fill, radius=0.0):
        draw.rounded_rectangle([S * x0, S * y0, S * x1, S * y1],
                               radius=S * radius, fill=fill + (255,))

    # Свечение из дверцы — отдельным слоем под печью: оно должно ложиться на
    # фон вокруг, а не поверх чугуна.
    halo = Image.new("RGBA", (S, S), (0, 0, 0, 0))
    draw = ImageDraw.Draw(halo)
    draw.ellipse([S * 0.13, S * 0.27, S * 0.87, S * 0.90], fill=ACCENT_GLOW + (215,))
    image.alpha_composite(halo.filter(ImageFilter.GaussianBlur(S * 0.06)))

    draw = ImageDraw.Draw(image)

    # Дымоход выходит из крышки назад-вправо, как у настоящей печи.
    box(0.630, 0.000, 0.730, 0.20, iron_dark, 0.010)
    box(0.612, 0.052, 0.748, 0.090, GOLD, 0.010)

    # Ножки. Рисуются до корпуса: их верх должен уходить под него.
    box(0.215, 0.815, 0.310, 0.945, iron_dark, 0.014)
    box(0.690, 0.815, 0.785, 0.945, iron_dark, 0.014)

    box(0.150, 0.215, 0.850, 0.845, iron, 0.030)
    # Латунная столешница со свесом — самая приметная часть сербской печи.
    box(0.095, 0.150, 0.905, 0.232, GOLD, 0.022)
    box(0.095, 0.150, 0.905, 0.176, GOLD_LIGHT, 0.022)

    # Дверца: латунная рама, за ней стекло с огнём.
    box(0.240, 0.298, 0.760, 0.702, GOLD, 0.028)
    box(0.277, 0.335, 0.723, 0.665, glass, 0.018)

    fire = Image.new("RGBA", (S, S), (0, 0, 0, 0))
    ember = ImageDraw.Draw(fire)
    # Поленья: пламя обязано на чём-то стоять, иначе висит в стекле само по
    # себе. Ниже дверцы им нельзя — там уже зольник.
    ember.rounded_rectangle([S * 0.330, S * 0.616, S * 0.670, S * 0.652],
                            radius=S * 0.017, fill=(96, 46, 30, 255))
    tongues(ember, S * 0.5, S * 0.632, S * 0.250, S * 0.085)
    # Огонь размывается отдельно: за стеклом резких краёв не бывает, а сама
    # печь должна остаться чёткой.
    image.alpha_composite(fire.filter(ImageFilter.GaussianBlur(S * 0.006)))

    draw = ImageDraw.Draw(image)
    # Ручка дверцы и зольник внизу — по ним печь читается печью, а не окном.
    draw.ellipse([S * 0.792, S * 0.455, S * 0.842, S * 0.545], fill=GOLD + (255,))
    box(0.225, 0.735, 0.775, 0.800, iron_dark, 0.016)
    box(0.435, 0.752, 0.565, 0.783, GOLD, 0.012)

    result = image.resize((size, size), Image.LANCZOS)
    save(result, name)
    # Та же картинка идёт в приложение: печь на виджете и печь в списке
    # статистики обязаны быть одной печью, а не двумя похожими рисунками.
    APP_IMGS.mkdir(parents=True, exist_ok=True)
    result.save(APP_IMGS / "citavuk_stove.png")
    print("citavuk_stove.png", result.size)
    return result


def check() -> None:
    """Галочка у взятого слова — вместо символа ✓ в тексте."""
    scale, size = 6, 36
    S = size * scale
    image = Image.new("RGBA", (S, S), (0, 0, 0, 0))
    draw = ImageDraw.Draw(image)
    draw.ellipse([0, 0, S - 1, S - 1], fill=(126, 148, 92, 255))
    draw.line(
        [(S * 0.26, S * 0.52), (S * 0.44, S * 0.70), (S * 0.76, S * 0.32)],
        fill=(255, 253, 245, 255), width=int(S * 0.11), joint="curve",
    )
    save(image.resize((size, size), Image.LANCZOS), "widget_check.png")


def dot() -> None:
    """Звёздочка перед словом — та же гирлянда, только помельче."""
    size = 40
    save(glowing_star(size, size * 0.17, GOLD, GOLD_GLOW), "widget_dot.png")


if __name__ == "__main__":
    cutout_mascot()
    garland()
    stove()
    check()
    dot()
