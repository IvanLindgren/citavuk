import { describe, expect, it } from 'vitest';

import {
  accentWord,
  parseStressTable,
  stressIndex,
  syllableNuclei,
} from './stress';

describe('знак ударения', () => {
  it('остаётся внутри единой строки слова', () => {
    expect(accentWord('knjiga', 3)).toBe('knji\u0301ga');
    expect(accentWord('књига', 2)).toBe('књи́га');
  });

  it('не меняет слово при неверном индексе', () => {
    expect(accentWord('knjiga', -1)).toBe('knjiga');
    expect(accentWord('knjiga', 99)).toBe('knjiga');
  });
});

describe('слоги', () => {
  it('вершина слога — гласная', () => {
    expect(syllableNuclei('knjiga')).toEqual([3, 5]);
    expect(syllableNuclei('књига')).toEqual([2, 4]);
  });

  it('слоговое «r» между согласными тоже вершина', () => {
    expect(syllableNuclei('prst')).toEqual([1]);
    expect(syllableNuclei('крв')).toEqual([1]);
    // А между гласными — обычный согласный.
    expect(syllableNuclei('para')).toEqual([1, 3]);
  });

  it('в слове без гласных вершин нет', () => {
    expect(syllableNuclei('!')).toEqual([]);
  });
});

describe('ударная буква', () => {
  const table = parseStressTable('abadžija\t1\nposlastičarnica\t3\nbazen\t2\n');

  it('берётся из таблицы', () => {
    // «poslastičarnica»: вершины o(1), a(4), i(7), a(9), i(12), a(14).
    expect(stressIndex('poslastičarnica', table)).toBe(7);
  });

  it('в двусложном слове по умолчанию первый слог', () => {
    expect(stressIndex('kuća', null)).toBe(1);
    expect(stressIndex('кућа', null)).toBe(1);
  });

  it('но исключение из таблицы сильнее правила', () => {
    expect(stressIndex('bazen', table)).toBe(3);
  });

  it('длинное незнакомое слово остаётся без пометы', () => {
    expect(stressIndex('nepoznatarijada', null)).toBeNull();
  });

  it('односложное не помечается: выбора всё равно нет', () => {
    expect(stressIndex('pas', null)).toBeNull();
  });

  it('кириллица ищется в таблице по латинскому ключу', () => {
    expect(stressIndex('посластичарница', table)).toBe(7);
  });

  it('битая строка таблицы не ломает разбор', () => {
    const broken = parseStressTable('мусор\nknjiga\tx\nkuća\t2\n');
    expect(broken.size).toBe(1);
    expect(stressIndex('kuća', broken)).toBe(3);
  });
});
