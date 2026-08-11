"""Собирает спрайты Башты Читавука.

Исходники лежат в tools/assets/garden и в репозиторий не входят: пак Little
Dreamyland запрещает распространение как есть, а происхождение FlowerAssets не
подтверждено. В web/public/img/garden попадают только производные файлы.

    python tools/build_garden_sprites.py
"""

from __future__ import annotations

from pathlib import Path

from PIL import Image

ROOT = Path(__file__).resolve().parent.parent
SRC = ROOT / "tools" / "assets" / "garden"
DST = ROOT / "web" / "public" / "img" / "garden"

WOLF_FRAMES = 8
WOLF_CELL_WIDTH = 150

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
        left, top = sheet.width, sheet.height
        right = bottom = 0
        for index in range(WOLF_FRAMES):
            box = (round(index * cell), 0, round((index + 1) * cell), sheet.height)
            frame_box = sheet.crop(box).getbbox()
            if frame_box is None:
                continue
            left = min(left, box[0] + frame_box[0])
            top = min(top, frame_box[1])
            right = max(right, box[0] + frame_box[2])
            bottom = max(bottom, frame_box[3])

        crop_w = (right - left) / WOLF_FRAMES
        crop_h = bottom - top
        scale = WOLF_CELL_WIDTH / crop_w
        cell_h = round(crop_h * scale)

        atlas = Image.new("RGBA", (WOLF_CELL_WIDTH * WOLF_FRAMES, cell_h), (0, 0, 0, 0))
        for index in range(WOLF_FRAMES):
            box = (round(index * cell), top, round((index + 1) * cell), bottom)
            frame = sheet.crop(box).resize((WOLF_CELL_WIDTH, cell_h), Image.LANCZOS)
            atlas.paste(frame, (index * WOLF_CELL_WIDTH, 0), frame)
        save(atlas, DST / "citavuk_garden.webp")
        print(f"citavuk_garden.webp {atlas.width}x{atlas.height}, кадр {WOLF_CELL_WIDTH}")


def build_plants() -> None:
    for species, name in PLANTS.items():
        image = trimmed(SRC / "FlowerAssets" / "FlowerAssets" / name)
        scale = PLANT_HEIGHT / image.height
        image = image.resize((max(1, round(image.width * scale)), PLANT_HEIGHT), Image.LANCZOS)
        save(image, DST / f"plant_{species}.webp")
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
    save(atlas, DST / "garden_seeds.webp")
    print(f"garden_seeds.webp {atlas.width}x{atlas.height}, ячейка {SEED_SIZE}")


def save(image: Image.Image, path: Path) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    image.save(path, "WEBP", quality=88, method=6)


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
