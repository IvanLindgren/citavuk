/**
 * Карта Башты в мировых пикселях.
 *
 * Раньше предметы стояли в процентах от сцены, а рисовались в пикселях,
 * умноженных на масштаб. На широком экране это совпадало, на телефоне — нет:
 * забор налезал на дом, грядки слипались в сплошную полосу. Здесь у мира есть
 * собственный размер в пикселях, и всё остальное — производное от него.
 *
 * Раскладки две. Телефон держат вертикально, и растягивать на него ту же
 * карту, что на ноутбук, нечестно: получится либо мышиный масштаб, либо каша.
 */

export interface Point {
  x: number;
  y: number;
}

/** Размер спрайта в мировых пикселях. Нужен, чтобы считать, кто с кем спорит. */
export interface Sprite {
  w: number;
  h: number;
}

export const SPRITES: Record<string, Sprite> = {
  bushes: { w: 86, h: 32 },
  campfire: { w: 26, h: 27 },
  fence: { w: 29, h: 32 },
  fir: { w: 46, h: 91 },
  flowers: { w: 48, h: 16 },
  fountain: { w: 46, h: 60 },
  house: { w: 124, h: 131 },
  pots: { w: 48, h: 13 },
  sign: { w: 13, h: 16 },
  stall: { w: 48, h: 42 },
  tree: { w: 64, h: 90 },
  tree_small: { w: 48, h: 64 },
};

export interface WorldItem {
  /** Ключ подписи в WORLD. Пусто — предмет молчит. */
  name: string;
  sprite: string;
  /** Середина предмета по горизонтали. */
  x: number;
  /** Земля под предметом: рисунок растёт вверх от неё. */
  y: number;
  /** Предмет без подписи: забор и цветочки в траве — фон, а не слово. */
  quiet?: boolean;
}

export interface Layout {
  id: 'wide' | 'tall';
  w: number;
  h: number;
  /** Высота реки: выше неё земли нет. */
  river: number;
  items: WorldItem[];
  beds: Point[];
  /** Куда встаёт Читавук, чтобы войти в дом. */
  door: Point;
  spawn: Point;
}

/** Грядка — два тайла земли. */
export const BED: Sprite = { w: 32, h: 16 };

const RIVER = 64;

const WIDE: Layout = {
  id: 'wide',
  w: 448,
  h: 240,
  river: RIVER,
  items: [
    { name: 'house', sprite: 'house', x: 82, y: 200 },
    { name: 'fence', sprite: 'fence', x: 162, y: 200, quiet: true },
    { name: 'pots', sprite: 'pots', x: 48, y: 216, quiet: true },
    { name: 'stall', sprite: 'stall', x: 172, y: 236 },
    { name: 'campfire', sprite: 'campfire', x: 72, y: 240 },
    { name: 'sign', sprite: 'sign', x: 210, y: 214 },
    { name: 'fountain', sprite: 'fountain', x: 222, y: 132 },
    { name: 'tree', sprite: 'tree_small', x: 206, y: 190 },
    { name: 'fir', sprite: 'fir', x: 418, y: 160 },
    { name: 'tree', sprite: 'tree', x: 404, y: 238 },
    { name: 'flowers', sprite: 'flowers', x: 26, y: 238, quiet: true },
    { name: 'flowers', sprite: 'flowers', x: 262, y: 100, quiet: true },
    { name: 'flowers', sprite: 'flowers', x: 420, y: 196, quiet: true },
  ],
  beds: grid([268, 312, 356], [132, 166, 200, 234]),
  door: { x: 82, y: 210 },
  spawn: { x: 122, y: 214 },
};

const TALL: Layout = {
  id: 'tall',
  w: 192,
  h: 384,
  river: RIVER,
  items: [
    { name: 'house', sprite: 'house', x: 70, y: 200 },
    { name: 'fountain', sprite: 'fountain', x: 166, y: 140 },
    { name: 'fence', sprite: 'fence', x: 152, y: 206, quiet: true },
    { name: 'stall', sprite: 'stall', x: 32, y: 228 },
    { name: 'campfire', sprite: 'campfire', x: 110, y: 228 },
    { name: 'sign', sprite: 'sign', x: 176, y: 214 },
    { name: 'flowers', sprite: 'flowers', x: 40, y: 108, quiet: true },
    { name: 'flowers', sprite: 'flowers', x: 150, y: 108, quiet: true },
  ],
  beds: grid([34, 96, 158], [250, 284, 318, 352]),
  door: { x: 70, y: 212 },
  spawn: { x: 108, y: 236 },
};

/** Куда встают ягодные кусты: они появляются только после покупки. */
export const BUSH_SPOT: Record<Layout['id'], WorldItem> = {
  wide: { name: 'bushes', sprite: 'bushes', x: 340, y: 100 },
  tall: { name: 'bushes', sprite: 'bushes', x: 140, y: 170 },
};

function grid(columns: number[], rows: number[]): Point[] {
  const points: Point[] = [];
  for (const y of rows) for (const x of columns) points.push({ x, y });
  return points;
}

/**
 * Вертикальный экран получает вертикальную карту.
 *
 * Порог взят с запасом от квадрата: планшет в портрете (0.75) — уже телефонная
 * карта, ноутбук (1.6) — всегда широкая.
 */
export function pickLayout(width: number, height: number): Layout {
  if (!width || !height) return WIDE;
  return width / height >= 1.15 ? WIDE : TALL;
}

/**
 * Во сколько раз мир крупнее своих пикселей.
 *
 * Масштаб идёт половинками. Целый был бы честнее к пикселю, но ступенька между
 * двойным и тройным — это сорок процентов размера: на ноутбуке мир из-за неё
 * ужимался вдвое и тонул в пустой траве. К тому же экраны давно с дробной
 * плотностью, и в физические пиксели целый масштаб всё равно не попадает.
 *
 * Ниже двойного округлять нечем: там выбор между дробным масштабом и картой в
 * половину экрана, и карта важнее.
 */
export function worldScale(layout: Layout, width: number, height: number): number {
  const fit = Math.min(width / layout.w, height / layout.h);
  if (!Number.isFinite(fit) || fit <= 0) return 2;
  if (fit >= 2) return Math.min(6, Math.floor(fit * 2) / 2);
  return Math.max(0.75, Math.floor(fit * 100) / 100);
}

export interface Rect {
  x0: number;
  y0: number;
  x1: number;
  y1: number;
}

export function itemRect(item: WorldItem): Rect {
  const sprite = SPRITES[item.sprite] ?? { w: 16, h: 16 };
  return {
    x0: item.x - sprite.w / 2,
    y0: item.y - sprite.h,
    x1: item.x + sprite.w / 2,
    y1: item.y,
  };
}

/**
 * След предмета на земле.
 *
 * Кроны деревьев могут перекрывать друг друга — это глубина, а не ошибка. А вот
 * основания перекрываться не должны: именно так забор и оказывался в стене дома.
 */
export function footRect(item: WorldItem): Rect {
  const rect = itemRect(item);
  return { ...rect, y0: Math.max(rect.y0, rect.y1 - 16) };
}

export function bedRect(point: Point): Rect {
  return {
    x0: point.x - BED.w / 2,
    y0: point.y - BED.h,
    x1: point.x + BED.w / 2,
    y1: point.y,
  };
}

export function overlaps(a: Rect, b: Rect): boolean {
  return a.x0 < b.x1 && b.x0 < a.x1 && a.y0 < b.y1 && b.y0 < a.y1;
}

export const LAYOUTS: Layout[] = [WIDE, TALL];
