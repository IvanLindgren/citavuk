"""Портреты собеседников для диалогов.

В диалоге урока у каждой реплики есть персонаж — `teacher`, `student`, `woman`
или `man`. Редактор давал его выбрать, данные его хранили, а показать было нечем:
картинок для этих четырёх ролей в проекте не существовало.

Рисуются, а не берутся из фотобанка: лицензия, единый вид и один стиль с
остальными картинками Читавука. Тона взяты из палитры сайта.

Кладутся в assets приложения. На сайт те же картинки попадают из них
`web/scripts/prepare-assets.py` — как все остальные: в WebP и двух размерах.
Класть их в web/public руками нельзя, там всё производное и закрыто от git.

    python tools/dialogue_faces.py
"""

from __future__ import annotations

import math
from pathlib import Path

from PIL import Image, ImageDraw

ROOT = Path(__file__).resolve().parent.parent
FLUTTER = ROOT / "frontend" / "assets" / "imgs"

SIZE = 288
SCALE = 4  # рисуется с запасом и уменьшается: края выходят гладкими

INK = (43, 33, 24)
PAPER = (251, 246, 234)


def rgb(value: str) -> tuple[int, int, int]:
    return tuple(int(value[i:i + 2], 16) for i in (1, 3, 5))  # type: ignore[return-value]


class Face:
    """Один портрет: круглая подложка, плечи, голова, причёска, черты лица."""

    def __init__(self, bg: str, skin: str, hair: str, clothes: str,
                 style: str, glasses: bool = False, beard: bool = False,
                 brow: str | None = None):
        self.bg = rgb(bg)
        self.skin = rgb(skin)
        self.hair = rgb(hair)
        # Брови обычно в цвет волос, но не всегда: под зелёной кепкой зелёные
        # брови выглядят кляксой.
        self.brow = rgb(brow) if brow else rgb(hair)
        self.clothes = rgb(clothes)
        self.style = style
        self.glasses = glasses
        self.beard = beard

    def draw(self) -> Image.Image:
        s = SIZE * SCALE
        image = Image.new("RGBA", (s, s), (0, 0, 0, 0))
        d = ImageDraw.Draw(image)
        # Подложка — круг своего оттенка: в списке реплик портрет виден
        # величиной с ноготь, и различаются собеседники прежде всего цветом.
        d.ellipse([0, 0, s - 1, s - 1], fill=self.bg + (255,))

        cx = s * 0.5
        head_cy, head_r = s * 0.46, s * 0.215

        self._hair_back(d, s, cx, head_cy, head_r)
        self._shoulders(d, s, cx)
        # Шея рисуется после плеч и до головы, иначе висит в воздухе.
        d.rounded_rectangle(
            [cx - head_r * 0.34, head_cy + head_r * 0.5,
             cx + head_r * 0.34, head_cy + head_r * 1.5],
            radius=head_r * 0.3, fill=self.skin + (255,),
        )
        d.ellipse([cx - head_r, head_cy - head_r, cx + head_r, head_cy + head_r],
                  fill=self.skin + (255,))
        # Уши — по краям, иначе голова читается как шар.
        for side in (-1, 1):
            d.ellipse([cx + side * head_r - head_r * 0.16, head_cy - head_r * 0.1,
                       cx + side * head_r + head_r * 0.16, head_cy + head_r * 0.26],
                      fill=self.skin + (255,))
        self._hair_front(d, s, cx, head_cy, head_r)
        self._features(d, s, cx, head_cy, head_r)

        return image.resize((SIZE, SIZE), Image.LANCZOS)

    def _shoulders(self, d: ImageDraw.ImageDraw, s: float, cx: float) -> None:
        top = s * 0.735
        d.ellipse([cx - s * 0.36, top, cx + s * 0.36, top + s * 0.52],
                  fill=self.clothes + (255,))
        # Воротник: светлый клин у шеи. Без него плечи выглядят цветным пятном.
        d.polygon([(cx - s * 0.075, top), (cx + s * 0.075, top), (cx, top + s * 0.1)],
                  fill=PAPER + (235,))

    def _hair_back(self, d: ImageDraw.ImageDraw, s: float, cx: float,
                   cy: float, r: float) -> None:
        if self.style == "long":
            d.ellipse([cx - r * 1.22, cy - r * 1.05, cx + r * 1.22, cy + r * 1.95],
                      fill=self.hair + (255,))
        elif self.style == "bun":
            d.ellipse([cx - r * 0.42, cy - r * 1.62, cx + r * 0.42, cy - r * 0.78],
                      fill=self.hair + (255,))

    def _hair_front(self, d: ImageDraw.ImageDraw, s: float, cx: float,
                    cy: float, r: float) -> None:
        if self.style == "cap":
            # Козырёк и купол: ученика узнают по кепке быстрее, чем по лицу.
            # Всё выше линии бровей: надвинутая кепка закрывает пол-лица, и
            # вместо ученика получается человек без глаз.
            d.ellipse([cx - r * 1.06, cy - r * 1.2, cx + r * 1.06, cy - r * 0.3],
                      fill=self.hair + (255,))
            d.rectangle([cx - r * 1.06, cy - r * 0.56, cx + r * 1.06, cy - r * 0.42],
                        fill=self.hair + (255,))
            d.ellipse([cx - r * 1.32, cy - r * 0.6, cx + r * 0.42, cy - r * 0.3],
                      fill=tuple(int(c * 0.82) for c in self.hair) + (255,))
            return
        # Шапка волос: полукруг сверху, подстриженный линией лба.
        d.ellipse([cx - r * 1.04, cy - r * 1.12, cx + r * 1.04, cy + r * 0.72],
                  fill=self.hair + (255,))
        d.ellipse([cx - r * 0.86, cy - r * 0.62, cx + r * 0.86, cy + r * 1.1],
                  fill=self.skin + (255,))
        if self.style == "long":
            for side in (-1, 1):
                d.ellipse([cx + side * r * 0.98 - r * 0.3, cy - r * 0.55,
                           cx + side * r * 0.98 + r * 0.3, cy + r * 1.25],
                          fill=self.hair + (255,))

    def _features(self, d: ImageDraw.ImageDraw, s: float, cx: float,
                  cy: float, r: float) -> None:
        eye_y = cy + r * 0.08
        dx = r * 0.36
        for side in (-1, 1):
            d.ellipse([cx + side * dx - r * 0.075, eye_y - r * 0.095,
                       cx + side * dx + r * 0.075, eye_y + r * 0.095],
                      fill=INK + (255,))
            # Бровь — короткая дуга: без неё лицо получается безучастным.
            d.arc([cx + side * dx - r * 0.2, eye_y - r * 0.48,
                   cx + side * dx + r * 0.2, eye_y - r * 0.06],
                  start=200, end=340, fill=self.brow + (255,), width=int(r * 0.07))

        if self.beard:
            # Борода по краю челюсти, а не на всём подбородке: залитый овал
            # съедает рот и выходит вместо бороды тёмное пятно.
            d.ellipse([cx - r * 0.7, cy + r * 0.02, cx + r * 0.7, cy + r * 1.08],
                      fill=self.hair + (255,))
            d.ellipse([cx - r * 0.5, cy - r * 0.12, cx + r * 0.5, cy + r * 0.7],
                      fill=self.skin + (255,))
            # Усы отдельной полосой над ртом.
            d.ellipse([cx - r * 0.26, cy + r * 0.18, cx + r * 0.26, cy + r * 0.34],
                      fill=self.hair + (255,))

        # Улыбка — дуга, а не отрезок: прямая линия читается как недовольство.
        mouth_y = cy + r * (0.48 if self.beard else 0.44)
        half = r * (0.19 if self.beard else 0.26)
        d.arc([cx - half, mouth_y - r * 0.2, cx + half, mouth_y + r * 0.26],
              start=15, end=165, fill=rgb("#8f4d43") + (255,), width=int(r * 0.085))

        if self.glasses:
            ring = int(r * 0.075)
            for side in (-1, 1):
                d.ellipse([cx + side * dx - r * 0.27, eye_y - r * 0.27,
                           cx + side * dx + r * 0.27, eye_y + r * 0.27],
                          outline=INK + (235,), width=ring)
            d.line([(cx - dx + r * 0.27, eye_y), (cx + dx - r * 0.27, eye_y)],
                   fill=INK + (235,), width=ring)


# Оттенки подложек разведены по кругу цветов: четыре собеседника не должны
# путаться друг с другом даже размером 40 пикселей.
FACES = {
    "teacher": Face(bg="#e8dcc4", skin="#e8b98f", hair="#4a3527",
                    clothes="#9e2b25", style="bun", glasses=True),
    "student": Face(bg="#d9e4d2", skin="#f0c9a0", hair="#2e8b57",
                    clothes="#3f6cb4", style="cap", brow="#6b4a2f"),
    "woman": Face(bg="#f0dcc6", skin="#eec19b", hair="#5b2f1f",
                  clothes="#c9802b", style="long"),
    "man": Face(bg="#d3dfe2", skin="#dda878", hair="#2f2a24",
                clothes="#2e3b5b", style="short", beard=True),
}


def main() -> None:
    FLUTTER.mkdir(parents=True, exist_ok=True)
    for name, face in FACES.items():
        image = face.draw()
        image.save(FLUTTER / f"face_{name}.png")
        print(f"face_{name}.png", image.size)
    print("для сайта: cd web && python scripts/prepare-assets.py")


if __name__ == "__main__":
    main()
