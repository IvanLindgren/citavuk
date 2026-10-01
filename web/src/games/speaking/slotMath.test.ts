import { describe, expect, it } from 'vitest';
import {
  LEVER_HOLD_MS,
  LEVER_PULL_MS,
  LEVER_RETURN_MS,
  OVERSHOOT,
  REEL_DELAY_MS,
  REEL_IDS,
  REEL_STOP_MS,
  REEL_TRAVEL,
  SETTLE_MS,
  SLOT_SPIN_MS,
  STRIP_LENGTH,
  bulbLevel,
  buildStrip,
  leverAuto,
  leverReturn,
  mulberry32,
  reelPosition,
  slotLayoutFor,
  slotLayoutOfCanvas,
  slotStop,
} from './slotMath';

const item = (id: string) => ({ id });
const pool = (count: number) => Array.from({ length: count }, (_, i) => item(`t${i}`));
const key = (value: { id: string }) => value.id;

describe('slotStop', () => {
  it('встаёт ровно на выбранную ячейку при любом стартовом положении', () => {
    for (const length of [1, 2, 18, 28]) {
      for (let index = 0; index < length; index++) {
        for (const from of [0, 3, 27, 84.4, 1000.25]) {
          const to = slotStop(from, index, length, 12);
          expect(Number.isInteger(to)).toBe(true);
          expect(((to % length) + length) % length).toBe(index);
          expect(to).toBeGreaterThanOrEqual(from + 12);
          // Не прибавляет лишних кругов: ближайшая подходящая остановка.
          expect(to).toBeLessThan(from + 12 + length);
        }
      }
    }
  });

  it('отвергает несуществующую ячейку', () => {
    expect(() => slotStop(0, 5, 5, 3)).toThrow(RangeError);
    expect(() => slotStop(0, -1, 5, 3)).toThrow(RangeError);
    expect(() => slotStop(0, 1.5, 5, 3)).toThrow(RangeError);
    expect(() => slotStop(0, 0, 0, 3)).toThrow(RangeError);
  });
});

describe('reelPosition', () => {
  for (const id of REEL_IDS) {
    it(`барабан «${id}» стартует с места и замирает ровно в цели`, () => {
      const run = { from: 4, to: slotStop(4, 9, STRIP_LENGTH[id], REEL_TRAVEL[id]), stopMs: REEL_STOP_MS[id] };
      expect(reelPosition(run, 0)).toBe(run.from);
      expect(reelPosition(run, run.stopMs)).toBe(run.to);
      expect(reelPosition(run, run.stopMs + 500)).toBe(run.to);
      const main = run.stopMs - SETTLE_MS;
      let last = run.from;
      for (let t = 0; t <= main; t += 10) {
        const pos = reelPosition(run, t);
        expect(pos).toBeGreaterThanOrEqual(last - 1e-9);
        last = pos;
      }
      // Перед отскоком барабан чуть дальше цели, потом возвращается.
      expect(reelPosition(run, main)).toBeCloseTo(run.to + OVERSHOOT, 9);
      for (let t = main; t <= run.stopMs; t += 10) {
        const pos = reelPosition(run, t);
        expect(pos).toBeLessThanOrEqual(run.to + OVERSHOOT + 1e-9);
        expect(pos).toBeGreaterThanOrEqual(run.to - 1e-9);
      }
    });
  }

  it('барабаны встают по очереди, а выпадение приходит после последней остановки', () => {
    expect(REEL_STOP_MS.left).toBeLessThan(REEL_STOP_MS.right);
    expect(REEL_STOP_MS.right).toBeLessThan(REEL_STOP_MS.center);
    expect(REEL_DELAY_MS + REEL_STOP_MS.center).toBeLessThan(SLOT_SPIN_MS);
  });

  it('в конце вращения центральный барабан идёт медленно — видны отдельные темы', () => {
    const run = { from: 0, to: slotStop(0, 6, 28, REEL_TRAVEL.center), stopMs: REEL_STOP_MS.center };
    const lastSecond = reelPosition(run, run.stopMs - SETTLE_MS) - reelPosition(run, run.stopMs - SETTLE_MS - 1000);
    expect(lastSecond).toBeLessThan(5);
    expect(lastSecond).toBeGreaterThan(0.5);
  });
});

describe('buildStrip', () => {
  it('держит закреплённые ячейки и цель на своих местах', () => {
    const items = pool(150);
    const target = items[42]!;
    const kept = new Map([[0, items[1]!], [1, items[2]!], [27, items[3]!], [6, target]]);
    for (let seed = 1; seed <= 20; seed++) {
      const strip = buildStrip(items, key, 28, kept, mulberry32(seed));
      expect(strip).toHaveLength(28);
      expect(strip[6]).toBe(target);
      expect(strip[0]).toBe(items[1]);
      expect(strip[27]).toBe(items[3]);
      // Цель встречается в ленте один раз: иначе её можно «выиграть» заранее.
      expect(strip.filter((entry) => entry.id === target.id)).toHaveLength(1);
      expect(new Set(strip.map(key)).size).toBe(28);
    }
  });

  it('соседи по кругу не повторяются, пока в пуле есть выбор', () => {
    for (const size of [3, 4, 15, 150]) {
      const items = pool(size);
      for (let seed = 1; seed <= 20; seed++) {
        const strip = buildStrip(items, key, 18, new Map([[5, items[0]!]]), mulberry32(seed));
        for (let i = 0; i < strip.length; i++) expect(strip[i]!.id).not.toBe(strip[(i + 1) % strip.length]!.id);
      }
    }
  });

  it('не падает на пуле из одной и двух тем', () => {
    for (const size of [1, 2]) {
      const items = pool(size);
      const strip = buildStrip(items, key, 28, new Map([[3, items[0]!]]), mulberry32(7));
      expect(strip).toHaveLength(28);
      expect(strip[3]).toBe(items[0]);
      expect(strip.every((entry) => items.includes(entry))).toBe(true);
    }
    expect(() => buildStrip([], key, 5, new Map())).toThrow(RangeError);
  });

  it('при одном и том же зерне даёт одну и ту же ленту', () => {
    const items = pool(40);
    const a = buildStrip(items, key, 28, new Map(), mulberry32(99));
    const b = buildStrip(items, key, 28, new Map(), mulberry32(99));
    expect(a.map(key)).toEqual(b.map(key));
  });
});

describe('рычаг', () => {
  it('идёт вниз до упора, держится и возвращается в покой', () => {
    expect(leverAuto(0)).toBe(0);
    expect(leverAuto(LEVER_PULL_MS)).toBe(1);
    expect(leverAuto(LEVER_PULL_MS + LEVER_HOLD_MS / 2)).toBe(1);
    const end = LEVER_PULL_MS + LEVER_HOLD_MS + LEVER_RETURN_MS;
    expect(leverAuto(end)).toBe(0);
    expect(leverAuto(end + 1000)).toBe(0);
    for (let t = 0; t <= end; t += 5) {
      const value = leverAuto(t);
      // Небольшой перелёт вверх допустим, больше — нет.
      expect(value).toBeLessThanOrEqual(1);
      expect(value).toBeGreaterThan(-0.15);
    }
  });

  it('возвращается из любого положения, в котором его отпустили', () => {
    for (const from of [0.6, 0.8, 1]) {
      expect(leverReturn(from, 0)).toBe(from);
      expect(leverReturn(from, LEVER_RETURN_MS)).toBe(0);
      expect(leverReturn(from, LEVER_RETURN_MS / 3)).toBeLessThan(from);
    }
  });
});

describe('лампочки и раскладка', () => {
  it('яркость всегда в пределах 0..1', () => {
    for (const mode of ['idle', 'spin', 'win'] as const) {
      for (let i = 0; i < 30; i++) {
        for (let t = 0; t < 4000; t += 37) {
          const level = bulbLevel(i, mode, t);
          expect(level).toBeGreaterThanOrEqual(0);
          expect(level).toBeLessThanOrEqual(1);
        }
      }
    }
  });

  it('узкий холст получает компактную раскладку', () => {
    expect(slotLayoutFor(360)).toBe('compact');
    expect(slotLayoutFor(672)).toBe('wide');
    expect(slotLayoutOfCanvas(360, 394)).toBe('compact');
    expect(slotLayoutOfCanvas(672, 538)).toBe('wide');
    expect(slotLayoutOfCanvas(0, 0)).toBe('wide');
  });
});
