"""Собирает атлас спрайтов Читавука для дуэли с переводчиком.

Исходник — лист 5x4 из двадцати поз (frontend/assets/imgs). В вебе он не
годится как есть: два мегабайта PNG ради экрана упражнения, а клетки внутри
листа обведены пустотой разной ширины, из-за чего фигура прыгала бы при смене
позы.

Скрипт режет лист по сетке, находит общую рамку содержимого по всем клеткам и
режет по ней. Общую, а не по каждой клетке отдельно: если каждую позу обрезать
вплотную и растянуть на клетку, персонаж будет менять рост от позы к позе —
масштаб и положение обязаны сохраниться.

    python tools/build_duel_sprites.py
"""

from __future__ import annotations

from pathlib import Path

from PIL import Image

ROOT = Path(__file__).resolve().parent.parent
SRC = ROOT / "frontend" / "assets" / "imgs" / "citavuk_sprites_gamevsperevodchik.png"
DST = ROOT / "web" / "public" / "img" / "citavuk_duel_sprites.webp"

COLS, ROWS = 5, 4

# Ширина одной клетки в готовом атласе. Спрайт показывается высотой примерно
# 150–200 CSS-пикселей, так что 200 дают полуторный запас плотности. Второго
# файла (@2x) здесь нет намеренно: клетка исходника — 250 пикселей, растягивать
# её вдвое значит раздуть вес ради мыла.
CELL_WIDTH = 200


def main() -> int:
    with Image.open(SRC) as sheet:
        sheet = sheet.convert("RGBA")
        cell_w = sheet.width / COLS
        cell_h = sheet.height / ROWS

        # Общая рамка содержимого в координатах клетки.
        left, top = cell_w, cell_h
        right = bottom = 0.0
        for row in range(ROWS):
            for col in range(COLS):
                box = (
                    round(col * cell_w),
                    round(row * cell_h),
                    round((col + 1) * cell_w),
                    round((row + 1) * cell_h),
                )
                bbox = sheet.crop(box).getbbox()
                if bbox is None:
                    continue
                left, top = min(left, bbox[0]), min(top, bbox[1])
                right, bottom = max(right, bbox[2]), max(bottom, bbox[3])

        crop_w, crop_h = round(right - left), round(bottom - top)
        scale = CELL_WIDTH / crop_w
        out_w, out_h = CELL_WIDTH, round(crop_h * scale)

        atlas = Image.new("RGBA", (out_w * COLS, out_h * ROWS), (0, 0, 0, 0))
        for row in range(ROWS):
            for col in range(COLS):
                box = (
                    round(col * cell_w + left),
                    round(row * cell_h + top),
                    round(col * cell_w + right),
                    round(row * cell_h + bottom),
                )
                cell = sheet.crop(box).resize((out_w, out_h), Image.LANCZOS)
                atlas.paste(cell, (col * out_w, row * out_h))

    DST.parent.mkdir(parents=True, exist_ok=True)
    # 82 против 88 — минус четверть веса; на клетке в 200 пикселей разницы
    # не видно, а это экран упражнения, а не обложка.
    atlas.save(DST, "WEBP", quality=82, method=6)

    before = SRC.stat().st_size
    after = DST.stat().st_size
    print(f"клетка исходника  {cell_w:.0f}x{cell_h:.0f}")
    print(f"рамка содержимого {crop_w}x{crop_h} (отступы {left:.0f},{top:.0f})")
    print(f"клетка атласа     {out_w}x{out_h}, лист {atlas.width}x{atlas.height}")
    print(f"{SRC.name}  {before / 1048576:.1f} МБ -> {after / 1024:.0f} КБ")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
