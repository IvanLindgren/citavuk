import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

import type { CityIndex, KindIndex, PlaceContent } from './types';

/**
 * Содержимое читается прямо из общих ассетов, а не из копии в public: копия
 * делается скриптом сборки, и тест на ней проверял бы вчерашние файлы.
 *
 * Проверяется полнота и связность. Диалог, у которого выбор ведёт в
 * несуществующий узел, ломается не при сборке, а под пальцем у человека —
 * ровно в тот момент, когда он собрался что-то сказать по-сербски.
 */
const ASSETS = '../frontend/assets/travel';

const index = JSON.parse(readFileSync(`${ASSETS}/kinds.json`, 'utf8')) as KindIndex;
const cities = JSON.parse(readFileSync(`${ASSETS}/cities.json`, 'utf8')) as CityIndex;

function content(kind: string): PlaceContent {
  return JSON.parse(readFileSync(`${ASSETS}/places/${kind}.json`, 'utf8')) as PlaceContent;
}

const LATIN = /[a-zA-Z]/;

describe('места Путешествия', () => {
  it('типов хватает на город: 15 заведений и дорожные объекты', () => {
    const places = index.kinds.filter((kind) => kind.group === 'place');
    const roads = index.kinds.filter((kind) => kind.group === 'road');
    expect(places.length).toBeGreaterThanOrEqual(15);
    expect(roads.length).toBeGreaterThanOrEqual(5);
  });

  it('идентификаторы уникальны, а теги OSM не растащены по двум типам', () => {
    const ids = index.kinds.map((kind) => kind.id);
    expect(new Set(ids).size).toBe(ids.length);

    const seen = new Map<string, string>();
    for (const kind of index.kinds) {
      for (const tag of kind.osm) {
        const owner = seen.get(tag);
        expect(owner, `${tag}: ${owner} и ${kind.id}`).toBeUndefined();
        seen.set(tag, kind.id);
      }
    }
  });

  it('у каждого типа нарисован свой значок', () => {
    for (const kind of index.kinds) {
      const svg = readFileSync(`${ASSETS}/icons/${kind.icon}.svg`, 'utf8');
      expect(svg, kind.id).toContain('<svg');
      // Значок красится текущим цветом: иначе он не потемнеет вместе с темой.
      expect(svg, kind.id).toContain('currentColor');
    }
  });

  it.each(index.kinds.map((kind) => kind.id))('%s: слова, фразы и подсказка на месте', (id) => {
    const place = content(id);
    expect(place.kind).toBe(id);
    expect(place.hint.length).toBeGreaterThan(20);
    expect(place.words.length).toBeGreaterThanOrEqual(10);
    expect(place.phrases.length).toBeGreaterThanOrEqual(5);
    for (const word of [...place.words, ...place.phrases]) {
      expect(word.sr.trim()).not.toBe('');
      expect(word.ru.trim()).not.toBe('');
      // Сербское хранится кириллицей: латиница получается транслитерацией, а
      // обратно — нет, `nj` из «конј» и «инјекција» уже не различить.
      expect(LATIN.test(word.sr), `${id}: ${word.sr}`).toBe(false);
    }
  });

  it.each(index.kinds.filter((kind) => kind.group === 'place').map((kind) => kind.id))(
    '%s: в заведении есть диалог',
    (id) => {
      expect(content(id).dialogue, `${id} без диалога`).toBeDefined();
    },
  );

  it.each(index.kinds.map((kind) => kind.id))(
    '%s: диалог, если он есть, связный',
    (id) => {
      const dialogue = content(id).dialogue;
      if (!dialogue) return;

      const nodes = new Map(dialogue.nodes.map((node) => [node.id, node]));
      expect(nodes.size).toBe(dialogue.nodes.length);
      expect(nodes.has(dialogue.startNodeId)).toBe(true);
      expect(dialogue.nodes.length).toBeGreaterThanOrEqual(4);

      const reached = new Set([dialogue.startNodeId]);
      for (const node of dialogue.nodes) {
        expect(LATIN.test(node.text), `${id}: ${node.text}`).toBe(false);
        // Узел либо ведёт дальше, либо честно кончается: тупик посреди
        // разговора выглядит как зависшее приложение.
        expect(Boolean(node.end) || (node.choices?.length ?? 0) > 0, `${id}/${node.id}`).toBe(true);
        for (const choice of node.choices ?? []) {
          expect(nodes.has(choice.next), `${id}/${node.id} → ${choice.next}`).toBe(true);
          expect(LATIN.test(choice.label), `${id}: ${choice.label}`).toBe(false);
          reached.add(choice.next);
        }
      }

      for (const node of dialogue.nodes) {
        expect(reached.has(node.id), `${id}/${node.id} недостижим`).toBe(true);
      }
      expect(dialogue.nodes.some((node) => node.end)).toBe(true);
    },
  );
});

describe('города Путешествия', () => {
  it('пять крупных городов, у каждого есть куда ткнуть', () => {
    expect(cities.cities.length).toBeGreaterThanOrEqual(5);
    const ids = cities.cities.map((city) => city.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const city of cities.cities) {
      expect(city.pins.length, city.id).toBeGreaterThanOrEqual(5);
      const pins = city.pins.map((pin) => pin.id);
      expect(new Set(pins).size, city.id).toBe(pins.length);
    }
  });

  it.each(cities.cities.map((city) => city.id))('%s: метки известного типа и в Сербии', (id) => {
    const city = cities.cities.find((item) => item.id === id);
    expect(city).toBeDefined();
    if (!city) return;

    const known = new Set(index.kinds.map((kind) => kind.id));
    // Рамка страны: перепутанные местами широта и долгота уводят метку в
    // Индийский океан, и на карте это выглядит как пустой город.
    const inSerbia = ([lon, lat]: [number, number]) =>
      lon > 18.8 && lon < 23.1 && lat > 42.2 && lat < 46.2;

    expect(inSerbia(city.center), `${id}: центр`).toBe(true);
    for (const pin of city.pins) {
      expect(known.has(pin.kind), `${id}/${pin.id}: ${pin.kind}`).toBe(true);
      expect(inSerbia(pin.at), `${id}/${pin.id}`).toBe(true);
      expect(LATIN.test(pin.sr), `${id}/${pin.id}: ${pin.sr}`).toBe(false);
    }
  });
});
