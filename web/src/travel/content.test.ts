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
  it('типов хватает на настоящий город, а не на восемь меток', () => {
    const places = index.kinds.filter((kind) => kind.group === 'place');
    const roads = index.kinds.filter((kind) => kind.group === 'road');
    expect(places.length).toBeGreaterThanOrEqual(40);
    expect(roads.length).toBeGreaterThanOrEqual(15);
    // Слова, нужные в любом заведении: с ними незнакомое место — тоже место.
    expect(index.kinds.some((kind) => kind.id === 'anywhere')).toBe(true);
  });

  it('самые частые места сербского города узнаются по тайлу', () => {
    // Список взят из настоящих тайлов пяти городов: без этих подклассов на
    // карте останутся безымянные точки там, где стоят кафе и аптеки.
    const common = [
      'cafe', 'restaurant', 'fast_food', 'bakery', 'pharmacy', 'supermarket',
      'convenience', 'clothes', 'hairdresser', 'bank', 'atm', 'kiosk', 'bar',
      'park', 'parking', 'bus_stop', 'hotel', 'school', 'library', 'dentist',
      'butcher', 'florist', 'optician', 'post_office', 'fuel', 'museum',
    ];
    const known = new Set(index.kinds.flatMap((kind) => kind.omt));
    for (const subclass of common) {
      expect(known.has(subclass), subclass).toBe(true);
    }
  });

  it('у каждого типа есть важность подписи', () => {
    for (const kind of index.kinds) {
      expect(Number.isInteger(kind.rank), kind.id).toBe(true);
      expect(kind.rank, kind.id).toBeGreaterThan(0);
    }
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

describe('актуальность справочника Путешествия', () => {
  it('помечен датой последней полной сверки', () => {
    expect(index.contentReviewedAt).toBe('2026-08-14');
  });

  it('не содержит известных устаревших правил оплаты', () => {
    const files = index.kinds.map((kind) =>
      readFileSync(`${ASSETS}/places/${kind.id}.json`, 'utf8'),
    );
    const text = files.join('\n').toLowerCase();
    expect(text).not.toContain('busplus');
    expect(text).not.toContain('bus plus');
    expect(text).not.toContain('виньеткой');
    expect(text).not.toContain('красная зона');
    expect(text).not.toContain('30–50 динаров');
  });
});

describe('города Путешествия', () => {
  const pin = (cityId: string, pinId: string) =>
    cities.cities.find((city) => city.id === cityId)?.pins.find((item) => item.id === pinId);

  it('пять крупных городов, у каждого есть куда ткнуть', () => {
    expect(cities.cities.length).toBeGreaterThanOrEqual(5);
    const ids = cities.cities.map((city) => city.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const city of cities.cities) {
      expect(city.pins.length, city.id).toBeGreaterThanOrEqual(12);
      const pins = city.pins.map((pin) => pin.id);
      expect(new Set(pins).size, city.id).toBe(pins.length);
    }
    // Белград и Нови-Сад — самые большие: в них и смотреть есть что.
    const big = ['beograd', 'novi-sad'];
    for (const id of big) {
      const city = cities.cities.find((item) => item.id === id);
      expect(city?.pins.length, id).toBeGreaterThanOrEqual(20);
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

  it('уличные метки стоят на геометрии улицы, а не на старой точке здания', () => {
    // Координаты сверены с геометрией pedestrian/highway в OpenStreetMap:
    // прежняя точка Кнез Михаиловой попадала в здание на Обилићевом венцу.
    expect(pin('beograd', 'knez-mihailova')?.at).toEqual([20.4583, 44.81664]);
    expect(pin('nis', 'obrenoviceva')?.at).toEqual([21.89512, 43.31952]);
  });

  /*
    Метки, которые стояли не на своём месте: рынок Зелени венац был на две
    сотни метров в стороне, вокзал Суботицы — в полукилометре, а Палићко језеро
    вообще на берегу вместо озера. Всё сверено с объектами OpenStreetMap, и
    здесь закреплено, чтобы правка не уехала обратно.
  */
  it('сверенные с OSM метки стоят на своих объектах', () => {
    const checked: Record<string, [number, number]> = {
      'beograd/zeleni-venac': [20.45745, 44.81336],
      'beograd/pijaca-kalenic': [20.47541, 44.80014],
      'beograd/brankov-most': [20.44714, 44.81481],
      'beograd/slavija': [20.46605, 44.80268],
      'beograd/aerodrom': [20.29128, 44.82026],
      'novi-sad/riblja-pijaca': [19.85108, 45.25746],
      'novi-sad/strand': [19.84654, 45.23631],
      'novi-sad/zeleznicka': [19.82912, 45.26584],
      'nis/muzej': [21.89342, 43.31835],
      'nis/zeleznicka': [21.87734, 43.31611],
      'subotica/zeleznicka': [19.67081, 46.10292],
      'subotica/palic': [19.75752, 46.08111],
      'kragujevac/pijaca': [20.91282, 44.00983],
      'kragujevac/zeleznicka': [20.92843, 44.01013],
    };
    for (const [key, at] of Object.entries(checked)) {
      const [cityId = '', pinId = ''] = key.split('/');
      expect(pin(cityId, pinId)?.at, key).toEqual(at);
    }
  });

  /*
    Придуманных названий на карте быть не должно: «Нишка пијаца» и «Мост на
    Лепеници» звучали правдоподобно, но таких объектов в городе нет, и человек
    не найдёт их ни на вывеске, ни в поиске.
  */
  it('названия совпадают с настоящими объектами', () => {
    expect(pin('nis', 'pijaca')?.sr).toBe('Главна пијаца');
    expect(pin('nis', 'most')?.sr).toBe('Тврђавски мост');
    expect(pin('kragujevac', 'most')?.sr).toBe('Лучни мост');
    expect(pin('subotica', 'mlecna-pijaca')?.sr).toBe('Млечна пијаца');
  });
});
