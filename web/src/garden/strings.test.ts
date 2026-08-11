import { describe, expect, it } from 'vitest';

import { GARDEN, STAGES, coinWord, plantImage, seedOffset, stageHeight } from './strings';

describe('сад: строки и стадии', () => {
  it('каждая сербская надпись несёт русское пояснение', () => {
    for (const [key, phrase] of Object.entries(GARDEN)) {
      expect(phrase.sr, key).not.toHaveLength(0);
      expect(phrase.ru, key).not.toHaveLength(0);
      expect(phrase.sr, key).not.toBe(phrase.ru);
    }
    for (const stage of STAGES) {
      expect(stage.sr).not.toHaveLength(0);
      expect(stage.ru).not.toHaveLength(0);
    }
  });

  it('интерфейс сада написан кириллицей', () => {
    // Латиница в сербской надписи означала бы, что письмо разъехалось: половина
    // сада на ћирилици, половина на latinici.
    for (const [key, phrase] of Object.entries(GARDEN)) {
      expect(phrase.sr, key).not.toMatch(/[a-zA-Z]/);
    }
  });

  it('цветок растёт снизу вверх и не превышает грядку', () => {
    let previous = 0;
    for (let stage = 0; stage < STAGES.length; stage += 1) {
      const height = stageHeight(stage, STAGES.length);
      expect(height).toBeGreaterThan(previous);
      expect(height).toBeLessThanOrEqual(100);
      previous = height;
    }
    expect(stageHeight(STAGES.length - 1, STAGES.length)).toBe(100);
  });

  it('стадия вне диапазона не ломает вёрстку', () => {
    expect(stageHeight(-3, 5)).toBe(stageHeight(0, 5));
    expect(stageHeight(99, 5)).toBe(100);
    expect(stageHeight(0, 1)).toBe(100);
  });

  it('картинка цветка берётся по виду', () => {
    expect(plantImage('suncokret')).toBe('/img/garden/plant_suncokret.webp');
  });

  it('семя ищется в атласе по порядку каталога', () => {
    const catalog = [{ id: 'suncokret' }, { id: 'krasuljak' }];
    expect(seedOffset('krasuljak', catalog)).toBe(1);
    expect(seedOffset('нет-такого', catalog)).toBe(0);
  });

  it('динары склоняются', () => {
    expect(coinWord(1)).toBe('динар');
    expect(coinWord(21)).toBe('динар');
    expect(coinWord(3)).toBe('динара');
    expect(coinWord(5)).toBe('динаров');
    expect(coinWord(11)).toBe('динаров');
    expect(coinWord(112)).toBe('динаров');
    expect(coinWord(0)).toBe('динаров');
  });
});
