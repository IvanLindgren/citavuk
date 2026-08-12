import { describe, expect, it } from 'vitest';

import {
  BUSH_SPOT,
  LAYOUTS,
  bedRect,
  footRect,
  itemRect,
  overlaps,
  pickLayout,
  worldScale,
} from './world';

describe('карта Башты', () => {
  it.each(LAYOUTS)('в раскладке $id ничто не стоит в чужой стене', (layout) => {
    const items = [...layout.items, BUSH_SPOT[layout.id]];
    for (let i = 0; i < items.length; i += 1) {
      for (let j = i + 1; j < items.length; j += 1) {
        const first = items[i]!;
        const second = items[j]!;
        expect(
          overlaps(footRect(first), footRect(second)),
          `${first.sprite} и ${second.sprite}`,
        ).toBe(false);
      }
    }
  });

  it.each(LAYOUTS)('в раскладке $id грядки не слипаются и не лезут в предметы', (layout) => {
    const items = [...layout.items, BUSH_SPOT[layout.id]];
    layout.beds.forEach((bed, index) => {
      const rect = bedRect(bed);
      for (const other of layout.beds.slice(index + 1)) {
        expect(overlaps(rect, bedRect(other)), `грядки ${index}`).toBe(false);
      }
      for (const item of items) {
        expect(overlaps(rect, footRect(item)), `грядка ${index} и ${item.sprite}`).toBe(false);
      }
    });
  });

  it.each(LAYOUTS)('в раскладке $id всё умещается в мир и стоит на земле', (layout) => {
    for (const item of [...layout.items, BUSH_SPOT[layout.id]]) {
      const rect = itemRect(item);
      expect(rect.x0, item.sprite).toBeGreaterThanOrEqual(0);
      expect(rect.x1, item.sprite).toBeLessThanOrEqual(layout.w);
      expect(rect.y1, item.sprite).toBeLessThanOrEqual(layout.h);
      // Предмет, залезший в реку, стоит на воде.
      expect(rect.y1, item.sprite).toBeGreaterThan(layout.river);
    }
    for (const bed of layout.beds) {
      const rect = bedRect(bed);
      expect(rect.x0).toBeGreaterThanOrEqual(0);
      expect(rect.x1).toBeLessThanOrEqual(layout.w);
      expect(rect.y1).toBeLessThanOrEqual(layout.h);
      expect(rect.y0).toBeGreaterThan(layout.river);
    }
  });

  it('грядок хватает на весь сад', () => {
    for (const layout of LAYOUTS) expect(layout.beds.length).toBeGreaterThanOrEqual(12);
  });

  it('вертикальный экран получает вертикальную карту', () => {
    expect(pickLayout(1440, 780).id).toBe('wide');
    expect(pickLayout(1024, 640).id).toBe('wide');
    expect(pickLayout(390, 780).id).toBe('tall');
    expect(pickLayout(768, 1024).id).toBe('tall');
  });

  it('масштаб идёт половинками и не мельчит', () => {
    const wide = LAYOUTS.find((layout) => layout.id === 'wide')!;
    const tall = LAYOUTS.find((layout) => layout.id === 'tall')!;
    expect(worldScale(wide, 1440, 780)).toBe(3);
    expect(worldScale(wide, 1920, 1080)).toBe(4);
    // Ноутбук: целый масштаб дал бы двойной мир посреди пустой травы.
    expect(worldScale(wide, 1399, 685)).toBe(2.5);
    expect(worldScale(tall, 390, 780)).toBe(2);
    expect(worldScale(tall, 412, 915)).toBe(2);
    // Маленький телефон: половина экрана под траву — хуже, чем дробный пиксель.
    expect(worldScale(tall, 375, 667)).toBeGreaterThan(1.5);
    expect(worldScale(tall, 375, 667)).toBeLessThan(2);
  });

  it('карта целиком помещается в экран', () => {
    const screens = [
      [1920, 1080], [1440, 780], [1366, 700], [1280, 620],
      [390, 780], [412, 915], [375, 667], [768, 1024],
    ];
    for (const [width, height] of screens) {
      const layout = pickLayout(width!, height!);
      const scale = worldScale(layout, width!, height!);
      expect(layout.w * scale, `${width}x${height}`).toBeLessThanOrEqual(width! + 0.5);
      expect(layout.h * scale, `${width}x${height}`).toBeLessThanOrEqual(height! + 0.5);
    }
  });
});
