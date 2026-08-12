import { describe, expect, it } from 'vitest';

import {
  FLOOR,
  PARTITION,
  ROOM,
  SPAWN,
  THINGS,
  blockedRects,
  thingRect,
} from './room';
import { HOUSE } from './strings';
import { overlaps, type Point, type Rect } from './world';

const ALL = THINGS.filter((thing) => thing.bought).map((thing) => thing.id);

function inside(point: Point, rect: Rect): boolean {
  return point.x > rect.x0 && point.x < rect.x1 && point.y > rect.y0 && point.y < rect.y1;
}

describe('квартира Читавука', () => {
  it('мебель не стоит в чужой мебели', () => {
    const solid = THINGS.filter((thing) => !thing.flat && !thing.on);
    for (let i = 0; i < solid.length; i += 1) {
      for (let j = i + 1; j < solid.length; j += 1) {
        const first = solid[i]!;
        const second = solid[j]!;
        expect(
          overlaps(thingRect(first), thingRect(second)),
          `${first.id} и ${second.id}`,
        ).toBe(false);
      }
    }
  });

  it('всё умещается в комнату', () => {
    for (const thing of THINGS) {
      const rect = thingRect(thing);
      expect(rect.x0, thing.id).toBeGreaterThanOrEqual(0);
      expect(rect.x1, thing.id).toBeLessThanOrEqual(ROOM.w);
      expect(rect.y0, thing.id).toBeGreaterThanOrEqual(0);
      expect(rect.y1, thing.id).toBeLessThanOrEqual(ROOM.h);
    }
  });

  it('мебель стоит на полу, а картины висят на стене', () => {
    for (const thing of THINGS) {
      if (thing.wall) expect(thing.y, thing.id).toBeLessThanOrEqual(FLOOR.top);
      else expect(thing.y, thing.id).toBeGreaterThan(FLOOR.top);
    }
  });

  /*
    Главное свойство комнаты: до каждой вещи можно дойти. Обхода препятствий
    хватает только на скольжение вдоль них, поэтому место, куда Читавук встаёт,
    обязано быть свободным — иначе он упрётся в диван и действие не сработает.
  */
  it('до каждой вещи есть куда встать', () => {
    const blocked = blockedRects(ALL);
    for (const thing of THINGS) {
      const stand = thing.stand;
      expect(stand.x, thing.id).toBeGreaterThanOrEqual(FLOOR.left);
      expect(stand.x, thing.id).toBeLessThanOrEqual(FLOOR.right);
      expect(stand.y, thing.id).toBeGreaterThanOrEqual(FLOOR.top);
      expect(stand.y, thing.id).toBeLessThanOrEqual(FLOOR.bottom);
      for (const rect of blocked) {
        expect(inside(stand, rect), `${thing.id} встаёт в мебель`).toBe(false);
      }
    }
  });

  it('входят на свободный пол', () => {
    for (const rect of blockedRects(ALL)) expect(inside(SPAWN, rect)).toBe(false);
    expect(SPAWN.y).toBeGreaterThanOrEqual(FLOOR.top);
  });

  it('кухня отделена перегородкой, но проход открыт', () => {
    expect(PARTITION.y1).toBeLessThan(FLOOR.bottom);
    // Между низом перегородки и нижней стеной должно быть где пройти.
    expect(FLOOR.bottom - PARTITION.y1).toBeGreaterThan(24);
  });

  it('каждая вещь называет себя по-сербски', () => {
    for (const thing of THINGS) {
      expect(HOUSE[thing.id]?.sr, thing.id).toBeTruthy();
      expect(HOUSE[thing.id]?.ru, thing.id).toBeTruthy();
    }
  });

  it('ковёр и кот не мешают ходить', () => {
    const flat = THINGS.filter((thing) => thing.flat).map((thing) => thing.id);
    expect(flat).toContain('rug');
    const rects = blockedRects(ALL);
    for (const thing of THINGS.filter((item) => item.flat)) {
      expect(rects).not.toContainEqual(thingRect(thing));
    }
  });
});
