"""Готовит материалы для карточки Google Play.

Из скриншотов телефона (`screens/*.jpg`) собирает промо-кадры 1080×1920 с
подписью и рисует обложку 1024×500. Всё в фирменных цветах приложения:
пергамент, сербский красный, индиго, золото.

    python tools/make_store_assets.py

Результат — в `release/play/`.
"""

from pathlib import Path

from PIL import Image, ImageDraw, ImageFilter, ImageFont

REPO = Path(__file__).resolve().parent.parent
SCREENS = REPO / "screens"
FONTS = REPO / "frontend" / "assets" / "fonts"
IMGS = REPO / "frontend" / "assets" / "imgs"
OUT = REPO / "release" / "play"

# Палитра приложения (frontend/lib/theme/app_theme.dart).
PARCHMENT = (247, 239, 220)
PARCHMENT_DEEP = (235, 223, 194)
SERB_RED = (158, 43, 37)
INK = (43, 33, 24)
MUTED = (92, 79, 65)
GOLD = (201, 162, 75)
LINE = (217, 203, 178)

SHOT_W, SHOT_H = 1080, 1920

# Подписи: заголовок, выделяемое красным слово, пояснение.
# Порядок задаёт порядок в карточке магазина — первым идёт главное.
SHOTS = [
    (
        "perevod_slov_priamo_v_prilozenii.jpg",
        "Перевод прямо\nв тексте",
        "тексте",
        "Нажмите слово — увидите значение\nименно в этом предложении",
    ),
    (
        "razbor_grammatiki.jpg",
        "Грамматика\nбез учебника",
        "без учебника",
        "Разбор фразы, времена и правила\nобъясняются по-русски",
    ),
    (
        "perosonalizirui_ctenie.jpg",
        "Читайте так,\nкак удобно",
        "как удобно",
        "Шрифт, размер, фон и подсветка\nначала слова для быстрого чтения",
    ),
    (
        "izucai_jezik.jpg",
        "Курс сербского\nс нуля",
        "с нуля",
        "Разделы, уроки и понятная карта\nпройденного",
    ),
    (
        "prohodi_uprazhnenia.jpg",
        "Упражнения,\nа не зубрёжка",
        "а не зубрёжка",
        "Каждый ответ разбирается:\nвидно, где ошибка и почему",
    ),
    (
        "slushai_podkasti.jpg",
        "Понимание\nна слух",
        "на слух",
        "Подкасты с расшифровкой:\nслово подсвечивается, когда звучит",
    ),
    (
        "smotri_spravochnik.jpg",
        "Справочник\nвсегда под рукой",
        "всегда под рукой",
        "Падежи, времена и правила\nкороткими карточками",
    ),
]


def font(name: str, size: int) -> ImageFont.FreeTypeFont:
    return ImageFont.truetype(str(FONTS / name), size)


def background(width: int, height: int) -> Image.Image:
    """Пергамент с мягким градиентом сверху вниз."""
    base = Image.new("RGB", (width, height), PARCHMENT)
    draw = ImageDraw.Draw(base)
    for y in range(height):
        t = y / height
        color = tuple(
            round(PARCHMENT[i] + (PARCHMENT_DEEP[i] - PARCHMENT[i]) * t)
            for i in range(3)
        )
        draw.line([(0, y), (width, y)], fill=color)
    return base


def ornament(draw: ImageDraw.ImageDraw, y: int, width: int, size: int = 13,
             gap: int = 34, color=SERB_RED) -> None:
    """Полоса ромбов — тот же орнамент, что в приложении."""
    x = gap // 2
    while x < width:
        draw.polygon(
            [(x, y - size), (x + size, y), (x, y + size), (x - size, y)],
            outline=color,
            width=3,
        )
        draw.rectangle([x - 3, y - 3, x + 3, y + 3], fill=color)
        x += gap


def rounded_shadow(canvas: Image.Image, box, radius: int, blur: int = 26,
                   alpha: int = 70) -> None:
    """Мягкая тень под скруглённым прямоугольником."""
    left, top, right, bottom = box
    shadow = Image.new("RGBA", canvas.size, (0, 0, 0, 0))
    ImageDraw.Draw(shadow).rounded_rectangle(
        [left, top + 12, right, bottom + 12], radius=radius,
        fill=(43, 33, 24, alpha),
    )
    canvas.alpha_composite(shadow.filter(ImageFilter.GaussianBlur(blur)))


def rounded(image: Image.Image, radius: int) -> Image.Image:
    """Обрезает картинку по скруглённому прямоугольнику."""
    mask = Image.new("L", image.size, 0)
    ImageDraw.Draw(mask).rounded_rectangle([0, 0, *image.size], radius=radius,
                                           fill=255)
    result = image.convert("RGBA")
    result.putalpha(mask)
    return result


def draw_highlighted(draw: ImageDraw.ImageDraw, xy, text: str, accent: str,
                     typeface: ImageFont.FreeTypeFont, leading: int) -> int:
    """Пишет заголовок, выделяя красным нужные слова.

    Выделение идёт по словам, а не по подстроке: так строка не разъезжается,
    если фраза переносится.
    """
    x, y = xy
    accent_words = set(accent.split())
    for line in text.split("\n"):
        cursor = x
        for word in line.split(" "):
            color = SERB_RED if word.strip(",.") in accent_words else INK
            draw.text((cursor, y), word, font=typeface, fill=color)
            cursor += draw.textlength(word + " ", font=typeface)
        y += leading
    return y


def build_shot(name: str, title: str, accent: str, subtitle: str) -> Image.Image:
    canvas = background(SHOT_W, SHOT_H).convert("RGBA")
    draw = ImageDraw.Draw(canvas)

    ornament(draw, 96, SHOT_W)

    title_font = font("NotoSans-Bold.ttf", 68)
    subtitle_font = font("NotoSans-Regular.ttf", 36)

    y = draw_highlighted(draw, (72, 168), title, accent, title_font, 84)
    y += 16
    for line in subtitle.split("\n"):
        draw.text((72, y), line, font=subtitle_font, fill=MUTED)
        y += 50

    # Скриншот телефона: ширина подобрана так, чтобы кадр не упирался в края
    # и оставалось поле под подпись.
    shot = Image.open(SCREENS / name).convert("RGB")
    width = 726
    height = round(shot.height * width / shot.width)
    shot = shot.resize((width, height), Image.LANCZOS)

    left = (SHOT_W - width) // 2
    top = y + 44
    rounded_shadow(canvas, (left, top, left + width, top + height), 44)

    frame = rounded(shot, 40)
    canvas.alpha_composite(frame, (left, top))
    ImageDraw.Draw(canvas).rounded_rectangle(
        [left, top, left + width, top + height], radius=40, outline=LINE, width=3
    )
    return canvas.convert("RGB")


def build_feature() -> Image.Image:
    """Обложка магазина: 1024×500, без мелкого текста — его обрежет превью."""
    width, height = 1024, 500
    canvas = background(width, height).convert("RGBA")
    draw = ImageDraw.Draw(canvas)

    # Красная полоса слева придаёт обложке опору и повторяет шапку приложения.
    draw.rectangle([0, 0, 14, height], fill=SERB_RED)
    ornament(draw, 40, width, size=9, gap=26, color=(201, 162, 75))
    ornament(draw, height - 40, width, size=9, gap=26, color=(201, 162, 75))

    icon = Image.open(IMGS / "citavuk_icon.png").convert("RGBA")
    icon = icon.resize((132, 132), Image.LANCZOS)
    canvas.alpha_composite(icon, (112, 96))

    draw.text((112, 252), "Читавук", font=font("Lora-Bold.ttf", 88), fill=INK)
    draw.text((116, 358), "Сербский через чтение",
              font=font("NotoSans-Regular.ttf", 36), fill=MUTED)

    wolf = Image.open(IMGS / "citavuk_zdravo.png").convert("RGBA")
    size = 390
    wolf = wolf.resize((size, size), Image.LANCZOS)
    canvas.alpha_composite(wolf, (width - size - 96, height - size - 34))

    return canvas.convert("RGB")


def main() -> None:
    OUT.mkdir(parents=True, exist_ok=True)

    for index, (name, title, accent, subtitle) in enumerate(SHOTS, start=1):
        if not (SCREENS / name).exists():
            print(f"пропущен (нет файла): {name}")
            continue
        image = build_shot(name, title, accent, subtitle)
        target = OUT / f"{index:02d}_{Path(name).stem}.png"
        image.save(target, "PNG")
        print(f"{target.name} — {target.stat().st_size // 1024} КБ")

    feature = build_feature()
    feature.save(OUT / "feature_graphic.png", "PNG")
    print("feature_graphic.png — 1024x500")


if __name__ == "__main__":
    main()
