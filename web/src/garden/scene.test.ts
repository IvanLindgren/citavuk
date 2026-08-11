import { describe, expect, it } from 'vitest';

import {
  MAX_GROWTH,
  STAGE_HOURS,
  bedPosition,
  bedRows,
  growthHeight,
  isBlooming,
  projectedGrowth,
  showsSeed,
  stageOf,
  swayFor,
} from './scene';

describe('сцена сада', () => {
  it('досчитывает рост между ответами сервера', () => {
    const plant = { growth: 1, speed: 1 };
    expect(projectedGrowth(plant, 0)).toBe(1);
    expect(projectedGrowth(plant, STAGE_HOURS * 3_600_000)).toBe(2);
    // Двойная скорость — вдвое быстрее.
    expect(projectedGrowth({ growth: 1, speed: 2 }, STAGE_HOURS * 3_600_000)).toBe(3);
  });

  it('не растит цветок выше последней стадии и не уводит в минус', () => {
    expect(projectedGrowth({ growth: 4.9, speed: 2 }, 100 * 3_600_000)).toBe(MAX_GROWTH);
    // Часы у клиента могут отставать от серверных — отрицательный промежуток не
    // должен отматывать рост назад.
    expect(projectedGrowth({ growth: 2, speed: 1 }, -9_000_000)).toBe(2);
  });

  it('высота растёт непрерывно, а не скачками по стадиям', () => {
    let previous = -1;
    for (let growth = 0; growth <= MAX_GROWTH; growth += 0.25) {
      const height = growthHeight(growth);
      expect(height).toBeGreaterThan(previous);
      expect(height).toBeLessThanOrEqual(100);
      previous = height;
    }
    expect(growthHeight(MAX_GROWTH)).toBe(100);
    expect(growthHeight(-5)).toBe(growthHeight(0));
    expect(growthHeight(99)).toBe(100);
  });

  it('стадия и цветение считаются от роста', () => {
    expect(stageOf(0)).toBe(0);
    expect(stageOf(2.9)).toBe(2);
    expect(stageOf(MAX_GROWTH)).toBe(MAX_GROWTH - 1);
    expect(isBlooming(4.99)).toBe(false);
    expect(isBlooming(MAX_GROWTH)).toBe(true);
    expect(showsSeed(0.2)).toBe(true);
    expect(showsSeed(0.9)).toBe(false);
  });

  it('покачивание постоянно для грядки и разное у соседей', () => {
    expect(swayFor(3)).toEqual(swayFor(3));
    expect(swayFor(3)).not.toEqual(swayFor(4));
    for (let slot = 0; slot < 12; slot += 1) {
      const sway = swayFor(slot);
      expect(sway.duration).toBeGreaterThan(3);
      expect(sway.duration).toBeLessThan(6);
      expect(sway.delay).toBeLessThanOrEqual(0);
      expect(sway.tilt).toBeGreaterThan(1);
    }
  });

  it('грядки раскладываются рядами', () => {
    expect(bedRows(6, 3)).toEqual([
      [0, 1, 2],
      [3, 4, 5],
    ]);
    // Неполный последний ряд — обычное дело для поля.
    expect(bedRows(5, 3)).toEqual([
      [0, 1, 2],
      [3, 4],
    ]);
    expect(bedRows(3, 0)).toEqual([[0], [1], [2]]);
  });

  it('садовник встаёт по центру грядки', () => {
    expect(bedPosition(0, 2)).toBe(25);
    expect(bedPosition(1, 2)).toBe(75);
    expect(bedPosition(0, 0)).toBe(50);
  });
});
