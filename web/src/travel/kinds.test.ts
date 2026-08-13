import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

import { matchKind, placeName } from './kinds';
import { pickPlace } from './overpass';
import type { KindIndex, Point } from './types';

const index = JSON.parse(
  readFileSync('../frontend/assets/travel/kinds.json', 'utf8'),
) as KindIndex;

const kinds = index.kinds;

describe('опознание места по тегам OSM', () => {
  it('узнаёт обычное заведение', () => {
    expect(matchKind({ shop: 'bakery', name: 'Хлеб' }, kinds)).toBe('bakery');
    expect(matchKind({ amenity: 'pharmacy' }, kinds)).toBe('pharmacy');
    expect(matchKind({ tourism: 'hotel' }, kinds)).toBe('hotel');
  });

  it('правило с двумя условиями сильнее одиночного', () => {
    // Кондитерская, которая печёт бурек, — всё-таки пекарня.
    expect(matchKind({ shop: 'pastry', cuisine: 'bakery' }, kinds)).toBe('bakery');
    expect(matchKind({ shop: 'pastry' }, kinds)).toBe('pastry');
    // Подземный переход — не просто тропинка.
    expect(matchKind({ highway: 'footway', tunnel: 'yes' }, kinds)).toBe('underpass');
    expect(matchKind({ highway: 'footway' }, kinds)).toBeNull();
  });

  it('мост через проспект остаётся мостом, а не улицей', () => {
    expect(matchKind({ highway: 'primary', bridge: 'yes' }, kinds)).toBe('bridge');
  });

  it('звёздочка означает «тег есть, значение любое»', () => {
    expect(matchKind({ natural: 'water', name: 'Сава' }, kinds)).toBe('quay');
    expect(matchKind({ natural: 'water' }, kinds)).toBeNull();
  });

  it('незнакомое место остаётся незнакомым', () => {
    expect(matchKind({ office: 'lawyer' }, kinds)).toBeNull();
    expect(matchKind({}, kinds)).toBeNull();
  });

  it('название берётся сербское, если оно есть', () => {
    expect(placeName({ name: 'Pekara', 'name:sr': 'Пекара' })).toBe('Пекара');
    expect(placeName({ name: 'Pekara' })).toBe('Pekara');
    expect(placeName({})).toBe('');
  });
});

describe('выбор объекта под нажатием', () => {
  const clicked: Point = [20.4569, 44.8176];

  it('названное заведение важнее безымянного контура вокруг него', () => {
    const found = pickPlace(
      [
        { type: 'way', center: { lon: 20.4569, lat: 44.8176 }, tags: { building: 'yes' } },
        {
          type: 'node',
          lon: 20.4571,
          lat: 44.8177,
          tags: { shop: 'bakery', name: 'Тоше' },
        },
      ],
      clicked,
      kinds,
    );
    expect(found?.kind).toBe('bakery');
    expect(found?.name).toBe('Тоше');
  });

  it('из двух одинаковых берётся ближнее', () => {
    const found = pickPlace(
      [
        { type: 'node', lon: 20.4600, lat: 44.8176, tags: { amenity: 'cafe' }, },
        { type: 'node', lon: 20.4570, lat: 44.8176, tags: { amenity: 'cafe' } },
      ],
      clicked,
      kinds,
    );
    expect(found?.at[0]).toBeCloseTo(20.457, 4);
  });

  it('пустой ответ — это не ошибка, а «здесь ничего знакомого»', () => {
    expect(pickPlace([], clicked, kinds)).toBeNull();
    expect(pickPlace([{ type: 'node', lon: 20.4569, lat: 44.8176 }], clicked, kinds)).toBeNull();
  });
});
