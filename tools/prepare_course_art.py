"""Упаковка готовых иллюстраций в общие WebP, без генерации и изменения рисунка."""
import argparse
from pathlib import Path
from PIL import Image

parser = argparse.ArgumentParser()
parser.add_argument("name", choices=["guide", "reading", "celebrate"])
parser.add_argument("source", type=Path)
args = parser.parse_args()
root = Path(__file__).resolve().parents[1]
destination = root / "frontend/assets/course" / f"citavuk-{args.name}-v1.webp"
image = Image.open(args.source).convert("RGBA")
if image.getchannel("A").getextrema()[0] == 255:
    raise SystemExit("Нет прозрачного фона: не подменяем его автоматически")
image.thumbnail((720, 720), Image.Resampling.LANCZOS)
image.save(destination, "WEBP", quality=88, method=6)
print(f"{destination}: {destination.stat().st_size} bytes; {image.size}; alpha preserved")
