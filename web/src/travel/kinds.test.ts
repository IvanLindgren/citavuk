import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

import { matchKind, matchOmt, placeName } from './kinds';
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

describe('опознание места по подклассу векторного тайла', () => {
  it('узнаёт место по подклассу', () => {
    expect(matchOmt('bakery', 'bakery', kinds)).toBe('bakery');
    expect(matchOmt('pharmacy', 'pharmacy', kinds)).toBe('pharmacy');
    expect(matchOmt('lodging', 'hostel', kinds)).toBe('hotel');
  });

  it('подкласс сильнее класса: книжный — не библиотека', () => {
    expect(matchOmt('library', 'books', kinds)).toBe('bookstore');
    expect(matchOmt('library', 'library', kinds)).toBe('library');
    expect(matchOmt('art_gallery', 'artwork', kinds)).toBe('artwork');
    expect(matchOmt('art_gallery', 'gallery', kinds)).toBe('museum');
  });

  it('правило «класс целиком» ловит то, у чего подкласс свой у каждого', () => {
    // Баскетбольная, теннисная и футбольная площадки — всё это один тип.
    expect(matchOmt('pitch', 'basketball', kinds)).toBe('sport_field');
    expect(matchOmt('pitch', 'tennis', kinds)).toBe('sport_field');
    expect(matchOmt('attraction', 'theme_park', kinds)).toBe('landmark');
  });

  it('незнакомое место остаётся незнакомым', () => {
    expect(matchOmt('office', 'lawyer', kinds)).toBeNull();
    expect(matchOmt('', '', kinds)).toBeNull();
  });

  it('каждое правило принадлежит одному типу', () => {
    const seen = new Map<string, string>();
    for (const kind of kinds) {
      for (const rule of kind.omt) {
        expect(seen.get(rule), `${rule}: ${seen.get(rule)} и ${kind.id}`).toBeUndefined();
        seen.set(rule, kind.id);
      }
    }
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

  it('названное место незнакомого типа тоже годится', () => {
    // Адвокатской конторы в справочнике нет, но слова, нужные везде, там
    // пригодятся — и это лучше, чем молчание в ответ на нажатие.
    const found = pickPlace(
      [
        {
          type: 'node',
          lon: 20.4569,
          lat: 44.8176,
          tags: { office: 'lawyer', name: 'Адвокатска канцеларија' },
        },
      ],
      clicked,
      kinds,
    );
    expect(found?.kind).toBeNull();
    expect(found?.name).toBe('Адвокатска канцеларија');
  });

  it('знакомый тип важнее чужого названия рядом', () => {
    const found = pickPlace(
      [
        { type: 'node', lon: 20.4569, lat: 44.8176, tags: { office: 'lawyer', name: 'Контора' } },
        { type: 'node', lon: 20.4572, lat: 44.8178, tags: { amenity: 'pharmacy' } },
      ],
      clicked,
      kinds,
    );
    expect(found?.kind).toBe('pharmacy');
  });

  it('пустой ответ — это не ошибка, а «здесь ничего нет»', () => {
    expect(pickPlace([], clicked, kinds)).toBeNull();
    expect(pickPlace([{ type: 'node', lon: 20.4569, lat: 44.8176 }], clicked, kinds)).toBeNull();
    // Безымянный контур здания — не место, а просто геометрия.
    expect(
      pickPlace(
        [{ type: 'way', center: { lon: 20.4569, lat: 44.8176 }, tags: { building: 'yes' } }],
        clicked,
        kinds,
      ),
    ).toBeNull();
  });
});
