import { describe, expect, it } from 'vitest';

import { walkOrder, withPin, type Palace } from './palace';

/**
 * Хранилище проверяется сквозным прогоном, здесь — то, что можно проверить без
 * браузерной базы: правила развески, порядок обхода и форма записи, которую
 * ждёт сервер.
 */

function palace(overrides: Partial<Palace> = {}): Palace {
  return {
    id: '11111111-1111-4111-8111-111111111111',
    name: 'Кухня',
    sceneId: 'kuhinja',
    pins: {},
    createdAt: 1_600_000_000_000,
    updatedAt: 1_600_000_000_000,
    deleted: 0,
    dirty: 0,
    ...overrides,
  };
}

describe('развеска слов', () => {
  it('вешает слово на предмет и помечает дворец к отправке', () => {
    const result = withPin(palace(), 'prozor', {
      word: 'прозор',
      translation: 'окно',
      vocabId: null,
    });
    expect(result.pins.prozor?.word).toBe('прозор');
    expect(result.dirty).toBe(1);
    expect(result.updatedAt).toBeGreaterThan(palace().updatedAt);
  });

  it('обрезает пробелы вокруг слова', () => {
    const result = withPin(palace(), 'sto', {
      word: '  сто  ',
      translation: 'стол',
      vocabId: null,
    });
    expect(result.pins.sto?.word).toBe('сто');
  });

  it('пустое слово снимает прежнее', () => {
    const filled = withPin(palace(), 'sto', {
      word: 'сто',
      translation: 'стол',
      vocabId: null,
    });
    const cleared = withPin(filled, 'sto', null);
    expect(cleared.pins.sto).toBeUndefined();

    const blanked = withPin(filled, 'sto', {
      word: '   ',
      translation: '',
      vocabId: null,
    });
    expect(blanked.pins.sto).toBeUndefined();
  });

  it('не трогает соседние предметы', () => {
    const first = withPin(palace(), 'sto', {
      word: 'сто',
      translation: 'стол',
      vocabId: null,
    });
    const second = withPin(first, 'lampa', {
      word: 'лампа',
      translation: 'лампа',
      vocabId: null,
    });
    expect(Object.keys(second.pins).sort()).toEqual(['lampa', 'sto']);
    // Исходный объект не изменился: страница сравнивает состояния по ссылке.
    expect(Object.keys(first.pins)).toEqual(['sto']);
  });
});

describe('порядок обхода', () => {
  const filled = palace({
    pins: {
      lampa: { word: 'лампа', translation: 'лампа', vocabId: null },
      prozor: { word: 'прозор', translation: 'окно', vocabId: null },
    },
  });

  it('идёт в порядке предметов сцены, а не развески', () => {
    // Ключи объекта перечисляются в порядке вставки — «лампа» первой. Обход
    // обязан следовать сцене: маршрут должен быть один и тот же каждый раз,
    // иначе место перестаёт быть подсказкой.
    const route = walkOrder(filled, ['prozor', 'frizider', 'lampa']);
    expect(route.map((step) => step.objectId)).toEqual(['prozor', 'lampa']);
  });

  it('пропускает предметы без слова', () => {
    expect(walkOrder(palace(), ['prozor', 'sto'])).toEqual([]);
  });
});

/** Повторяет toRemotePalace из sync.ts: именно эти имена полей ждёт сервер. */
function toRemote(source: Palace) {
  return {
    id: source.id,
    name: source.name,
    sceneId: source.sceneId,
    pins: Object.fromEntries(
      Object.entries(source.pins).map(([object, pin]) => [
        object,
        {
          word: pin.word,
          translation: pin.translation,
          vocabId: pin.vocabId ?? '',
        },
      ]),
    ),
    deleted: source.deleted === 1,
    updatedAt: new Date(source.updatedAt).toISOString(),
  };
}

describe('формат записи для сервера', () => {
  it('время уходит в ISO 8601, а удаление — логическим значением', () => {
    const wire = toRemote(palace({ deleted: 1 }));
    expect(wire.updatedAt).toBe('2020-09-13T12:26:40.000Z');
    expect(wire.deleted).toBe(true);
  });

  it('несвязанное слово уходит пустой строкой, а не null', () => {
    // Go разбирает vocabId в string: null превратился бы в ошибку разбора всей
    // посылки, а не одного поля.
    const wire = toRemote(
      palace({
        pins: { sto: { word: 'сто', translation: 'стол', vocabId: null } },
      }),
    );
    expect(wire.pins.sto?.vocabId).toBe('');
  });

  it('связанное слово сохраняет ссылку на словарь', () => {
    const wire = toRemote(
      palace({
        pins: {
          sto: { word: 'сто', translation: 'стол', vocabId: 'abc-123' },
        },
      }),
    );
    expect(wire.pins.sto?.vocabId).toBe('abc-123');
  });
});
