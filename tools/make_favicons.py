"""Собирает значки сайта из иконки приложения.

Один исходник — `frontend/assets/imgs/citavuk_icon.png` — превращается в полный
набор: значок вкладки, иконка для iOS и иконки для установки сайта на телефон.

    python tools/make_favicons.py

Почему набор, а не один файл: браузер вкладки берёт .ico и мелкие png, Safari
требует непрозрачный png (на прозрачном фоне иконка становится чёрной), а
Chrome для установки просит 512×512 и отдельную maskable-версию с полями —
система сама обрежет её под форму значков прошивки.
"""

from pathlib import Path

from PIL import Image

REPO = Path(__file__).resolve().parent.parent
SRC = REPO / "frontend" / "assets" / "imgs" / "citavuk_icon.png"
OUT = REPO / "web" / "public"

# Пергамент из палитры приложения — фон под непрозрачные значки.
BACKGROUND = (247, 239, 220)

# Доля значка, которую занимает рисунок в maskable-иконке. Всё, что за
# пределами круга в 80% ширины, прошивка вправе срезать.
MASKABLE_SCALE = 0.78


def load() -> Image.Image:
    return Image.open(SRC).convert("RGBA")


def flatten(image: Image.Image, size: int) -> Image.Image:
    """Кладёт иконку на непрозрачный фон."""
    canvas = Image.new("RGB", (size, size), BACKGROUND)
    scaled = image.resize((size, size), Image.LANCZOS)
    canvas.paste(scaled, (0, 0), scaled)
    return canvas


def maskable(image: Image.Image, size: int) -> Image.Image:
    """Иконка с полями: центр не срежется ни круглой, ни квадратной маской."""
    canvas = Image.new("RGB", (size, size), BACKGROUND)
    inner = round(size * MASKABLE_SCALE)
    scaled = image.resize((inner, inner), Image.LANCZOS)
    offset = (size - inner) // 2
    canvas.paste(scaled, (offset, offset), scaled)
    return canvas


def main() -> None:
    icon = load()
    OUT.mkdir(parents=True, exist_ok=True)

    # Вкладка браузера.
    icon.resize((32, 32), Image.LANCZOS).save(OUT / "favicon.png", "PNG")
    icon.resize((48, 48), Image.LANCZOS).save(
        OUT / "favicon.ico", "ICO", sizes=[(16, 16), (32, 32), (48, 48)]
    )

    # iOS: только png и только без прозрачности.
    flatten(icon, 180).save(OUT / "apple-touch-icon.png", "PNG")

    # Установка сайта как приложения.
    for size in (192, 512):
        flatten(icon, size).save(OUT / f"icon-{size}.png", "PNG")
    maskable(icon, 512).save(OUT / "icon-maskable-512.png", "PNG")

    for name in ("favicon.png", "favicon.ico", "apple-touch-icon.png",
                 "icon-192.png", "icon-512.png", "icon-maskable-512.png"):
        path = OUT / name
        print(f"{name:26} {path.stat().st_size // 1024 or 1} КБ")


if __name__ == "__main__":
    main()
