import { describe, expect, it } from 'vitest';

import { DEFAULT_SETTINGS, FULL_WIDTH, paletteFor, sanitize } from './readerSettings';

/**
 * Настройки лежат в localStorage, где может оказаться что угодно: остаток от
 * прошлой версии, ручная правка, обрывок после сбоя. Читалка обязана открыться в
 * любом случае, поэтому разбор проверяется отдельно от неё.
 */
describe('разбор сохранённых настроек', () => {
  it('пустой ввод даёт значения по умолчанию', () => {
    expect(sanitize(null)).toEqual(DEFAULT_SETTINGS);
    expect(sanitize('строка вместо объекта')).toEqual(DEFAULT_SETTINGS);
    expect(sanitize(42)).toEqual(DEFAULT_SETTINGS);
  });

  it('оставляет допустимые значения как есть', () => {
    const result = sanitize({
      fontSize: 24,
      lineHeight: 1.9,
      font: 'sans',
      justify: false,
      theme: 'sepia',
      bionic: 2,
    });
    expect(result.fontSize).toBe(24);
    expect(result.lineHeight).toBe(1.9);
    expect(result.font).toBe('sans');
    expect(result.justify).toBe(false);
    expect(result.theme).toBe('sepia');
    expect(result.bionic).toBe(2);
  });

  it('зажимает числа в допустимые границы', () => {
    expect(sanitize({ fontSize: 900 }).fontSize).toBe(32);
    expect(sanitize({ fontSize: 2 }).fontSize).toBe(14);
    expect(sanitize({ maxWidth: 99_999 }).maxWidth).toBe(FULL_WIDTH);
  });

  it('заменяет мусор в числовом поле значением по умолчанию', () => {
    expect(sanitize({ fontSize: Number.NaN }).fontSize).toBe(
      DEFAULT_SETTINGS.fontSize,
    );
    expect(sanitize({ lineHeight: '1.5' }).lineHeight).toBe(
      DEFAULT_SETTINGS.lineHeight,
    );
  });

  it('не принимает неизвестный шрифт, тему и уровень выделения', () => {
    expect(sanitize({ font: 'comic-sans' }).font).toBe(DEFAULT_SETTINGS.font);
    expect(sanitize({ theme: 'неон' }).theme).toBe(DEFAULT_SETTINGS.theme);
    expect(sanitize({ bionic: 7 }).bionic).toBe(0);
    expect(sanitize({ bionic: -1 }).bionic).toBe(0);
  });

  it('переключатели принимают только логическое значение', () => {
    expect(sanitize({ sound: 'да' }).sound).toBe(DEFAULT_SETTINGS.sound);
    expect(sanitize({ sound: false }).sound).toBe(false);
  });
});

describe('палитра страницы', () => {
  it('«как на сайте» палитры не задаёт', () => {
    expect(paletteFor('auto')).toBeNull();
  });

  it('у остальных тем цвет фона и текста различается', () => {
    for (const theme of ['paper', 'sepia', 'gray', 'night'] as const) {
      const palette = paletteFor(theme);
      expect(palette).not.toBeNull();
      expect(palette!.background).not.toBe(palette!.text);
    }
  });
});
