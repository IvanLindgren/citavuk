"""Картинки достижений для приложения и сайта.

Исходники — design/achievements/<ключ>.png, 1254×1254 RGBA, около 2,5 МБ
каждый. В сборку они не идут: двадцать таких файлов весили 45 МБ, а на экране
картинка занимает сотню точек. Здесь они ужимаются до 384 px в WebP — с запасом
для экранов с плотностью 3x — и кладутся в две одинаковые копии.

    python tools/build_achievement_art.py
"""

from pathlib import Path

from PIL import Image

ROOT = Path(__file__).resolve().parent.parent
SOURCE = ROOT / "design" / "achievements"
TARGETS = [
    ROOT / "frontend" / "assets" / "imgs" / "achievements",
    ROOT / "web" / "public" / "img" / "achievements",
]
SIZE = 384


def main() -> None:
    total = 0
    for target in TARGETS:
        target.mkdir(parents=True, exist_ok=True)
    for src in sorted(SOURCE.glob("*.png")):
        image = Image.open(src).convert("RGBA").resize((SIZE, SIZE), Image.LANCZOS)
        for target in TARGETS:
            out = target / f"{src.stem}.webp"
            image.save(out, "WEBP", quality=84, method=6)
        total += (TARGETS[0] / f"{src.stem}.webp").stat().st_size
    print(f"готово: {len(list(SOURCE.glob('*.png')))} картинок, {total // 1024} КиБ на копию")


if __name__ == "__main__":
    main()
