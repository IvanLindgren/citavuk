/**
 * Математика автомата тем — без DOM, чтобы проверяться юнит-тестами.
 *
 * Положение барабана измеряется в ячейках: целое число — ячейка стоит точно в
 * центре окна. Всё считается от времени, а не от числа кадров, поэтому
 * остановка на выбранной теме не зависит от FPS.
 */

/** Сколько проходит от рывка рычага до сигнала «тема выпала». */
export const SLOT_SPIN_MS = 4200;
/** Барабаны трогаются чуть позже рычага — как у настоящего автомата. */
export const REEL_DELAY_MS = 150;

export type ReelId = 'left' | 'right' | 'center';
export const REEL_IDS: readonly ReelId[] = ['left', 'right', 'center'];

/** Когда барабан окончательно замирает (с учётом отскока), мс от начала. */
export const REEL_STOP_MS: Record<ReelId, number> = { left: 1600, right: 2400, center: 3750 };
/** Не меньше стольких ячеек пролетает барабан до остановки. */
export const REEL_TRAVEL: Record<ReelId, number> = { left: 13, right: 15, center: 22 };
/** Длина ленты: центральная — названия тем, боковые — значки жанров. */
export const STRIP_LENGTH: Record<ReelId, number> = { left: 18, right: 18, center: 28 };

/** Последняя фаза — барабан чуть перелетает цель и мягко возвращается. */
export const SETTLE_MS = 280;
export const OVERSHOOT = 0.16;

export function mod(value: number, size: number): number {
  return ((value % size) + size) % size;
}

export function smoothstep(value: number): number {
  const t = Math.max(0, Math.min(1, value));
  return t * t * (3 - 2 * t);
}

export function easeInOutSine(value: number): number {
  const t = Math.max(0, Math.min(1, value));
  return -(Math.cos(Math.PI * t) - 1) / 2;
}

/** Детерминированный генератор для тестов; в игре подставляется Math.random. */
export function mulberry32(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * Положение, в котором барабан встанет на ячейку `targetIndex`: не ближе чем
 * на `travel` ячеек вперёд от `from`. Результат всегда целый.
 */
export function slotStop(from: number, targetIndex: number, length: number, travel: number): number {
  if (!Number.isInteger(length) || length < 1 || !Number.isInteger(targetIndex) || targetIndex < 0 || targetIndex >= length) {
    throw new RangeError('Invalid slot cell');
  }
  const first = mod(targetIndex - from, length);
  const laps = Math.ceil(Math.max(0, travel - first) / length);
  const raw = from + first + laps * length;
  return targetIndex + length * Math.round((raw - targetIndex) / length);
}

export interface ReelRun {
  from: number;
  to: number;
  /** Когда барабан замирает окончательно, мс от начала вращения. */
  stopMs: number;
}

/** Разгон, долгое замедление «на нервах», отскок: положение барабана в момент t. */
export function reelPosition(run: ReelRun, t: number): number {
  if (t <= 0) return run.from;
  if (t >= run.stopMs) return run.to;
  const main = run.stopMs - SETTLE_MS;
  if (t < main) {
    const u = t / main;
    // Первый множитель — замедление к цели, второй — плавный разгон с места.
    const eased = (1 - (1 - u) ** 2.6) * smoothstep(u / 0.12);
    return run.from + (run.to + OVERSHOOT - run.from) * eased;
  }
  return run.to + OVERSHOOT * (1 - easeInOutSine((t - main) / SETTLE_MS));
}

/** Скорость барабана в ячейках в секунду — для размытия движения и тиканья. */
export function reelSpeed(run: ReelRun, t: number): number {
  const dt = 16;
  return Math.abs(reelPosition(run, t + dt) - reelPosition(run, t - dt)) / (2 * dt / 1000);
}

/**
 * Лента барабана: `length` ячеек по кругу. Ячейки из `fixed` стоят на своих
 * местах (там, где барабан уже показывает темы, и там, где он остановится);
 * остальные берутся из тасованной колоды, чтобы соседи не повторялись.
 */
export function buildStrip<T>(
  pool: readonly T[],
  key: (item: T) => string,
  length: number,
  fixed: ReadonlyMap<number, T>,
  rng: () => number = Math.random,
): T[] {
  if (!pool.length) throw new RangeError('Empty slot pool');
  const out: (T | undefined)[] = new Array<T | undefined>(length).fill(undefined);
  for (const [index, item] of fixed) out[mod(index, length)] = item;
  const reserved = new Set([...fixed.values()].map(key));
  const shuffled = (items: readonly T[]): T[] => {
    const copy = items.slice();
    for (let i = copy.length - 1; i > 0; i--) {
      const j = Math.floor(rng() * (i + 1));
      [copy[i], copy[j]] = [copy[j]!, copy[i]!];
    }
    return copy;
  };
  const free = pool.filter((item) => !reserved.has(key(item)));
  const source = free.length >= 3 ? free : pool;
  let deck: T[] = [];
  for (let i = 0; i < length; i++) {
    if (out[i] !== undefined) continue;
    const near = new Set<string>();
    for (const side of [out[mod(i - 1, length)], out[mod(i + 1, length)]]) if (side !== undefined) near.add(key(side));
    const take = (): T | undefined => {
      const at = deck.findIndex((item) => !near.has(key(item)));
      return at < 0 ? undefined : deck.splice(at, 1)[0];
    };
    let pick = take();
    if (pick === undefined) {
      deck = shuffled(source);
      pick = take() ?? deck.shift();
    }
    out[i] = pick;
  }
  return out as T[];
}

/** Рычаг: 0 — в покое наверху, 1 — дёрнут до упора. */
export const LEVER_PULL_MS = 280;
export const LEVER_HOLD_MS = 70;
export const LEVER_RETURN_MS = 480;

/** Автоматический рывок (кнопка «Выбрать тему» или клик): вниз, пауза, пружина обратно. */
export function leverAuto(t: number): number {
  if (t <= 0) return 0;
  if (t < LEVER_PULL_MS) return easeInOutSine(t / LEVER_PULL_MS);
  if (t < LEVER_PULL_MS + LEVER_HOLD_MS) return 1;
  return leverReturn(1, t - LEVER_PULL_MS - LEVER_HOLD_MS);
}

/** Возврат пружиной из положения `from` с небольшим перелётом вверх. */
export function leverReturn(from: number, s: number): number {
  if (s <= 0) return from;
  if (s >= LEVER_RETURN_MS) return 0;
  const u = s / LEVER_RETURN_MS;
  return from * Math.exp(-5 * u) * Math.cos(6.5 * u);
}

/** Рычаг дёрнут достаточно, чтобы считаться рывком. */
export const LEVER_TRIGGER = 0.6;

export type BulbMode = 'idle' | 'spin' | 'win';

/** Яркость лампочки `index` (0..1) через `t` мс после начала режима. */
export function bulbLevel(index: number, mode: BulbMode, t: number): number {
  if (mode === 'spin') return mod(index - t / 55, 4) < 1.6 ? 1 : 0.16;
  if (mode === 'win') {
    if (t < 1500) return Math.floor(t / 150) % 2 === index % 2 ? 1 : 0.2;
    return Math.max(0.35, 1 - (t - 1500) / 1200);
  }
  return 0.34 + 0.36 * (0.5 + 0.5 * Math.sin(t / 700 + index * 0.9));
}

export type SlotLayoutKind = 'wide' | 'compact';
/** Пропорции холста: широкий автомат и узкий — для телефона. */
export const SLOT_ASPECT: Record<SlotLayoutKind, number> = { wide: 1200 / 700, compact: 600 / 824 };

export function slotLayoutFor(width: number): SlotLayoutKind {
  return width < 560 ? 'compact' : 'wide';
}

/** Сцена выбирает раскладку по пропорциям самого холста. */
export function slotLayoutOfCanvas(width: number, height: number): SlotLayoutKind {
  return height > 0 && width / height < 1.1 ? 'compact' : 'wide';
}
