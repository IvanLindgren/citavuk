"""Собирает спрайты Башты Читавука.

Исходники лежат в tools/assets/garden. Пак Little Dreamyland в репозиторий не
входит — он запрещает распространение как есть, — но сейчас и не используется.

    python tools/build_garden_sprites.py
"""

from __future__ import annotations

from pathlib import Path

from PIL import Image

ROOT = Path(__file__).resolve().parent.parent
SRC = ROOT / "tools" / "assets" / "garden"
# Сад есть и на сайте, и в приложении, спрайты у них одни и те же.
DESTINATIONS = (
    ROOT / "web" / "public" / "img" / "garden",
    ROOT / "frontend" / "assets" / "imgs" / "garden",
)

WOLF_FRAMES = 8
WOLF_CELL_WIDTH = 150
WOLF_CELL_HEIGHT = 202

# Цветок показывается в грядке высотой около 190 CSS-пикселей. Двойная
# плотность — предел разумного: исходники и так рисованные, дальше растёт только
# вес.
PLANT_HEIGHT = 380
SEED_SIZE = 96

PLANTS = {
    "suncokret": "SunflowerFlower.png",
    "krasuljak": "DaisyFlower.png",
    "koleus": "ColeusFlower.png",
    "cuvarkuca": "SucculentFlower.png",
}

SEEDS = {
    "suncokret": "SunflowerSeed.png",
    "krasuljak": "DaisySeed.png",
    "koleus": "ColeusSeed.png",
    "cuvarkuca": "SucculentSeed.png",
}


def trimmed(path: Path) -> Image.Image:
    with Image.open(path) as image:
        image = image.convert("RGBA")
        box = image.getbbox()
        return image.crop(box) if box else image.copy()


def build_wolf() -> None:
    """Читавук с лейкой: восемь кадров полива в один лист.

    Ширина исходника на восемь не делится, поэтому кадры режутся по дробной
    сетке и обрезаются общей рамкой: обрезать каждый кадр вплотную значит
    заставить волка менять рост посреди анимации.
    """
    with Image.open(SRC / "citavuk_plants.png") as sheet:
        sheet = sheet.convert("RGBA")
        cell = sheet.width / WOLF_FRAMES
        frames: list[Image.Image] = []
        for index in range(WOLF_FRAMES):
            box = (round(index * cell), 0, round((index + 1) * cell), sheet.height)
            frame = sheet.crop(box)
            frame_box = frame.getbbox()
            frames.append(frame.crop(frame_box) if frame_box else frame)

        max_width = max(frame.width for frame in frames)
        max_height = max(frame.height for frame in frames)
        scale = min(WOLF_CELL_WIDTH / max_width, WOLF_CELL_HEIGHT / max_height)
        atlas = Image.new(
            "RGBA",
            (WOLF_CELL_WIDTH * WOLF_FRAMES, WOLF_CELL_HEIGHT),
            (0, 0, 0, 0),
        )
        for index, frame in enumerate(frames):
            size = (max(1, round(frame.width * scale)), max(1, round(frame.height * scale)))
            frame = frame.resize(size, Image.LANCZOS)
            x = index * WOLF_CELL_WIDTH + (WOLF_CELL_WIDTH - frame.width) // 2
            y = WOLF_CELL_HEIGHT - frame.height
            atlas.paste(frame, (x, y), frame)
        save(atlas, "citavuk_garden.webp")
        print(
            f"citavuk_garden.webp {atlas.width}x{atlas.height}, "
            f"кадр {WOLF_CELL_WIDTH}x{WOLF_CELL_HEIGHT}"
        )


def build_plants() -> None:
    for species, name in PLANTS.items():
        image = trimmed(SRC / "FlowerAssets" / "FlowerAssets" / name)
        scale = PLANT_HEIGHT / image.height
        image = image.resize((max(1, round(image.width * scale)), PLANT_HEIGHT), Image.LANCZOS)
        save(image, f"plant_{species}.webp")
        print(f"plant_{species}.webp {image.width}x{image.height}")


def build_seeds() -> None:
    """Семена одного размера в один ряд: они нужны только иконками в магазине."""
    atlas = Image.new("RGBA", (SEED_SIZE * len(SEEDS), SEED_SIZE), (0, 0, 0, 0))
    for index, name in enumerate(SEEDS.values()):
        image = trimmed(SRC / "FlowerAssets" / "FlowerAssets" / name)
        scale = min(SEED_SIZE / image.width, SEED_SIZE / image.height)
        size = (max(1, round(image.width * scale)), max(1, round(image.height * scale)))
        image = image.resize(size, Image.LANCZOS)
        atlas.paste(
            image,
            (index * SEED_SIZE + (SEED_SIZE - size[0]) // 2, (SEED_SIZE - size[1]) // 2),
            image,
        )
    save(atlas, "garden_seeds.webp")
    print(f"garden_seeds.webp {atlas.width}x{atlas.height}, ячейка {SEED_SIZE}")


def save(image: Image.Image, name: str) -> None:
    for folder in DESTINATIONS:
        folder.mkdir(parents=True, exist_ok=True)
        image.save(folder / name, "WEBP", quality=88, method=6)


def main() -> int:
    if not SRC.exists():
        print(f"нет исходников: {SRC}")
        return 1
    build_wolf()
    build_plants()
    build_seeds()
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
