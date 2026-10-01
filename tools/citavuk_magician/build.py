"""
Читавук-фокусник для автомата тем «Говори!»: SVG-детали из референса.

Вход — design/citavuk_magician_reference.webp (рисунок с прозрачным фоном:
персонаж, отдельно поднятая лапа и цилиндр). Скрипт режет его на детали
(голова, туловище, хвост, рукав, лапа, цилиндр; кулак с палочкой рисуется
вектором в slotWolf.ts), обводит каждую в SVG
двумя слоями — цветные заливки и тёмный контур поверх — и пишет файлы в
web/public/img/citavuk-magician/. Как детали собираются и двигаются, описано
в web/src/games/speaking/slotWolf.ts: WOLF_BOXES там должны совпасть с тем,
что скрипт печатает в конце.

Нужны Python 3.11+, Pillow, numpy и vtracer (pip install pillow numpy vtracer).
После пересборки — node web/scripts/build-slot-embed.mjs (страница приложения).
"""
import json
import re
import tempfile
from collections import deque
from pathlib import Path

import numpy as np
import vtracer
from PIL import Image, ImageDraw, ImageFilter

ROOT = Path(__file__).resolve().parents[2]
SOURCE = ROOT / 'design' / 'citavuk_magician_reference.webp'
OUT = ROOT / 'web' / 'public' / 'img' / 'citavuk-magician'

# Цвет обводится в 0,9 масштаба, контур — в полном; 7 бит на канал, шаг слоёв 10.
COLOR_SCALE, LINE_SCALE = 0.9, 1.0
COLOR_PRECISION, LAYER_DIFFERENCE, SPECKLE = 7, 10, 4
# Тёмнее этого — кандидат в контур; толще OPEN пикселей — уже пятно (нос, сюртук), а не линия.
DARK, OPEN = 70, 9
# Фактуру меха, узор жилета и цилиндра сглаживаем медианой — иначе тысячи мелких путей.
MEDIAN, MEDIAN_PARTS = 3, {'head', 'torso', 'hat'}
INK = '#2a1b1a'


def poly_mask(points, size):
    m = Image.new('L', size, 0)
    ImageDraw.Draw(m).polygon(points, fill=255)
    return np.array(m) > 0


def components(solid):
    """Связные куски непрозрачного: персонаж, поднятая лапа, цилиндр."""
    h, w = solid.shape
    lab = np.zeros((h, w), np.int32)
    sizes, boxes, n = {}, {}, 0
    for y0 in range(h):
        for x0 in np.nonzero(solid[y0] & (lab[y0] == 0))[0]:
            if lab[y0, x0]:
                continue
            n += 1
            q = deque([(y0, x0)])
            lab[y0, x0] = n
            cnt, x1, x2, y1, y2 = 0, x0, x0, y0, y0
            while q:
                y, x = q.popleft()
                cnt += 1
                x1, x2, y1, y2 = min(x1, x), max(x2, x), min(y1, y), max(y2, y)
                for dy, dx in ((1, 0), (-1, 0), (0, 1), (0, -1)):
                    ny, nx = y + dy, x + dx
                    if 0 <= ny < h and 0 <= nx < w and solid[ny, nx] and not lab[ny, nx]:
                        lab[ny, nx] = n
                        q.append((ny, nx))
            sizes[n], boxes[n] = cnt, (x1, y1, x2, y2)
    return lab, sizes, boxes


def segment(source):
    """Режет референс на детали. Координаты многоугольников — в пикселях референса 1254 × 1254."""
    A = np.array(source).astype(np.int32)
    H, W = A.shape[:2]
    r, g, b, alpha = A[:, :, 0], A[:, :, 1], A[:, :, 2], A[:, :, 3]
    lab, sizes, boxes = components(alpha > 8)
    big = sorted(sizes, key=sizes.get, reverse=True)[:5]
    body = lab == big[0]
    arm = lab == next(k for k in big if boxes[k][0] > 820 and boxes[k][3] < 700)
    hat = lab == next(k for k in big if boxes[k][0] > 760 and boxes[k][1] > 700)
    yy, xx = np.mgrid[0:H, 0:W]
    mask = lambda pts: poly_mask(pts, (W, H))

    # Поднятая лапа и рукав: делим по верхнему краю манжеты.
    p1, p2 = (884, 466), (1040, 394)
    paw = arm & ((p2[0] - p1[0]) * (yy - p1[1]) - (p2[1] - p1[1]) * (xx - p1[0]) < 0)
    sleeve = arm & ~paw

    lum = (r * 299 + g * 587 + b * 114) // 1000
    coatish = (b >= r - 6) & (lum < 110)
    gold = (r > 140) & (b < 120) & (r - b > 60)
    redish = (r > 100) & (g < 75) & (r - g > 50)

    # Кулак уходит в руку с палочкой, а на месте всего предплечья — гладкий сюртук.
    fist_area = mask([(429, 878), (446, 860), (480, 854), (512, 858), (526, 876), (530, 930), (525, 975), (502, 990), (462, 988), (438, 970), (426, 935)])
    forearm = mask([(447, 856), (470, 850), (510, 852), (548, 858), (580, 868), (596, 884), (600, 930), (594, 968), (566, 986), (520, 994), (470, 992), (436, 972), (421, 934), (424, 886)])
    fist = body & fist_area & ~(coatish & (b > r + 2)) & ~gold & ~((xx > 514) & (r > 215) & (g > 205))
    coat = body & (xx >= 455) & (xx <= 530) & (yy >= 998) & (yy <= 1030) & coatish
    coat_rgb = tuple(int(np.median(c[coat])) for c in (r, g, b))

    # Хвост: левая граница идёт ровно по контуру сюртука.
    tail = body & mask([(642, 856), (662, 838), (700, 826), (745, 798), (792, 838), (814, 920), (810, 1000), (787, 1062), (746, 1112), (700, 1142), (648, 1154), (630, 1122), (620, 1082), (612, 1042), (607, 1000), (606, 960), (611, 926), (630, 894)])

    # Голова: всё выше шеи плюс мех из полосы шеи, связанный с головой сверху.
    band = (yy >= 688) & (yy < 732)
    furry = ~coatish & ~gold & ~redish & ~((r > 225) & (g > 215) & (b > 205) & (yy > 712))
    cand = body & band & furry & ((xx < 230) | (xx > 440) | (yy < 706))
    head = body & (yy < 688)
    frontier = deque(zip(*np.nonzero(head & (yy == 687))))
    while frontier:
        y, x = frontier.popleft()
        for dy, dx in ((1, 0), (0, 1), (0, -1), (-1, 0)):
            ny, nx = y + dy, x + dx
            if 0 <= ny < H and 0 <= nx < W and cand[ny, nx] and not head[ny, nx]:
                head[ny, nx] = True
                frontier.append((ny, nx))
    head &= ~tail
    torso = body & ~head & ~tail & ~fist

    parts = {'head': head, 'torso': torso, 'tail': tail, 'fist': fist, 'sleeve': sleeve, 'paw': paw, 'hat': hat}
    images, boxes_out = {}, {}
    for name, m in parts.items():
        ys, xs = np.nonzero(m)
        x1, y1, x2, y2 = xs.min() - 4, ys.min() - 4, xs.max() + 5, ys.max() + 5
        P = A.copy()
        P[~m, 3] = 0
        if name == 'torso':
            fill = forearm & body
            P[fill, 0], P[fill, 1], P[fill, 2], P[fill, 3] = (*coat_rgb, 255)
            # Подложка под шеей: при наклоне головы под ней не должно быть дыры.
            neck = mask([(200, 676), (300, 668), (500, 668), (600, 676), (580, 698), (420, 700), (220, 698)]) & ~(P[:, :, 3] > 8)
            P[neck, 0], P[neck, 1], P[neck, 2], P[neck, 3] = 238, 222, 206, 255
        images[name] = Image.fromarray(P.astype(np.uint8), 'RGBA').crop((x1, y1, x2, y2))
        boxes_out[name] = {'x': int(x1), 'y': int(y1), 'w': int(x2 - x1), 'h': int(y2 - y1)}
    return images, boxes_out


TOKEN = re.compile(r'([MCLZmclz])|(-?\d+(?:\.\d+)?)')


def fmt(v):
    s = f'{v:.1f}'.rstrip('0').rstrip('.')
    return '0' if s in ('-0', '') else s


def join(nums):
    out = ''
    for n in nums:
        s = fmt(n)
        out += s if (not out or s.startswith('-')) else ' ' + s
    return out


def relative(d, tx, ty):
    """Абсолютные M/C/L/Z со сдвигом vtracer → относительные m/c/l/z без лишних пробелов."""
    out, cmd, nums = [], None, []
    cx = cy = sx = sy = 0.0

    def flush():
        nonlocal cx, cy, sx, sy
        if cmd is None:
            return
        if cmd == 'Z':
            out.append('z')
            cx, cy = sx, sy
            return
        step = {'M': 2, 'L': 2, 'C': 6}[cmd]
        for i in range(0, len(nums), step):
            chunk = [v + (tx if j % 2 == 0 else ty) for j, v in enumerate(nums[i:i + step])]
            if cmd == 'M' and i == 0:
                out.append('m' + join([chunk[0] - cx, chunk[1] - cy]))
                cx, cy = chunk
                sx, sy = cx, cy
            elif cmd in ('M', 'L'):
                out.append('l' + join([chunk[0] - cx, chunk[1] - cy]))
                cx, cy = chunk
            else:
                out.append('c' + join([chunk[k] - (cx if k % 2 == 0 else cy) for k in range(6)]))
                cx, cy = chunk[4], chunk[5]

    for letter, num in TOKEN.findall(d):
        if letter:
            flush()
            cmd, nums = letter.upper(), []
        else:
            nums.append(float(num))
    flush()
    # Подряд идущие c можно писать без повтора буквы.
    return re.sub(r'c(?=[^mclz]*c)', 'c', ''.join(out))


def optimize(svg, k, fill=None):
    paths = []
    for p in re.findall(r'<path[^>]*/>', svg):
        d = re.search(r' d="([^"]*)"', p).group(1)
        color = fill or re.search(r'fill="([^"]*)"', p).group(1).lower()
        m = re.search(r'translate\(([-\d.]+),([-\d.]+)\)', p)
        tx, ty = (float(m.group(1)), float(m.group(2))) if m else (0.0, 0.0)
        paths.append(f'<path fill="{color}" d="{relative(d, tx, ty)}"/>')
    return f'<g transform="scale({1 / k:.5f})">' + ''.join(paths) + '</g>'


def trace(source, images, boxes, work):
    for name, box in boxes.items():
        if name == 'fist':
            # Кулак вырезан только чтобы убрать его с туловища: с палочкой он рисуется вектором (slotWolf.ts).
            continue
        im = images[name]
        a = np.array(im).astype(np.float32)
        alpha = a[:, :, 3]
        lum = 0.299 * a[:, :, 0] + 0.587 * a[:, :, 1] + 0.114 * a[:, :, 2]
        # Контур — тонкие тёмные линии: тёмное минус то, что переживает «открытие» (большие пятна).
        dark = ((lum < DARK) & (alpha > 60)) | ((alpha > 20) & (alpha < 200))
        darkimg = Image.fromarray((dark * 255).astype(np.uint8))
        opened = darkimg.filter(ImageFilter.MinFilter(OPEN)).filter(ImageFilter.MaxFilter(OPEN))
        line = dark & ~(np.array(opened) > 0)
        # Обводим только настоящий край рисунка, а не линии, по которым резали детали.
        ref = source.crop((box['x'], box['y'], box['x'] + im.width, box['y'] + im.height))
        sil = Image.fromarray(((np.array(ref)[:, :, 3] > 120) * 255).astype(np.uint8))
        edge = (np.array(sil.filter(ImageFilter.MaxFilter(3))) > 0) & ~(np.array(sil.filter(ImageFilter.MinFilter(7))) > 0)
        line |= edge & (alpha > 30)
        # Цветной слой: на месте линий — цвет соседей.
        keep = (~line & (alpha > 120)).astype(np.float32)
        rgb = a[:, :, :3] * keep[..., None]
        num = np.stack([np.array(Image.fromarray(rgb[:, :, c].astype(np.uint8)).filter(ImageFilter.GaussianBlur(5))).astype(np.float32) for c in range(3)], -1)
        den = np.array(Image.fromarray((keep * 255).astype(np.uint8)).filter(ImageFilter.GaussianBlur(5))).astype(np.float32)[..., None] / 255
        fill = np.where(keep[..., None] > 0, a[:, :, :3], num / np.maximum(den, 1e-3))
        col = np.dstack([np.clip(fill, 0, 255), np.where(alpha > 120, 255, 0)]).astype(np.uint8)
        w, h = im.size
        small = Image.fromarray(col, 'RGBA').resize((max(1, round(w * COLOR_SCALE)), max(1, round(h * COLOR_SCALE))), Image.LANCZOS)
        if name in MEDIAN_PARTS:
            rgbm = small.convert('RGB').filter(ImageFilter.MedianFilter(MEDIAN))
            small = Image.merge('RGBA', (*rgbm.split(), small.split()[3]))
        # Полупрозрачные края после масштабирования сбивают VTracer: делаем альфу двоичной.
        small.putalpha(small.split()[3].point(lambda v: 255 if v >= 128 else 0))
        small.save(f'{work}/c_{name}.png')
        lw, lh = max(1, round(w * LINE_SCALE)), max(1, round(h * LINE_SCALE))
        lim = Image.fromarray(np.where(line, 0, 255).astype(np.uint8)).resize((lw, lh), Image.LANCZOS).point(lambda v: 0 if v < 128 else 255).convert('RGB')
        lim.save(f'{work}/l_{name}.png')
        vtracer.convert_image_to_svg_py(f'{work}/c_{name}.png', f'{work}/c_{name}.svg', colormode='color', hierarchical='stacked', mode='spline',
            filter_speckle=SPECKLE, color_precision=COLOR_PRECISION, layer_difference=LAYER_DIFFERENCE, corner_threshold=60,
            length_threshold=4.0, max_iterations=10, splice_threshold=45, path_precision=0)
        vtracer.convert_image_to_svg_py(f'{work}/l_{name}.png', f'{work}/l_{name}.svg', colormode='binary', mode='spline',
            filter_speckle=3, corner_threshold=60, length_threshold=3.0, max_iterations=10, splice_threshold=45, path_precision=0)
        svg = (f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {w} {h}" width="{w}" height="{h}">'
               + optimize(Path(f'{work}/c_{name}.svg').read_text(), COLOR_SCALE)
               + optimize(Path(f'{work}/l_{name}.svg').read_text(), LINE_SCALE, INK) + '</svg>')
        (OUT / f'{name}.svg').write_text(svg)
        print(f'{name}.svg: {len(svg) // 1024} KB')


def main():
    source = Image.open(SOURCE).convert('RGBA')
    images, boxes = segment(source)
    OUT.mkdir(parents=True, exist_ok=True)
    with tempfile.TemporaryDirectory() as work:
        trace(source, images, boxes, work)
    print('WOLF_BOXES:', json.dumps(boxes))


if __name__ == '__main__':
    main()
