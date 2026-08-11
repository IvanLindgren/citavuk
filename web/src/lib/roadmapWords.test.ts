import { describe, expect, it } from 'vitest';

import { exampleTarget, plainExample, splitExample } from './roadmapWords';

describe('разбор примера к слову', () => {
  it('выделяет помеченное слово посреди фразы', () => {
    expect(splitExample('Naša *mačka* spava na fotelji.')).toEqual([
      { text: 'Naša ', target: false },
      { text: 'mačka', target: true },
      { text: ' spava na fotelji.', target: false },
    ]);
  });

  it('справляется с пометкой в начале и в конце', () => {
    expect(splitExample('*Majka* kuva ručak.')).toEqual([
      { text: 'Majka', target: true },
      { text: ' kuva ručak.', target: false },
    ]);
    expect(splitExample('Ovo je *sto*')).toEqual([
      { text: 'Ovo je ', target: false },
      { text: 'sto', target: true },
    ]);
  });

  // Записи без разметки должны показываться целиком, а не пропадать: автор
  // добавляет примеры руками, и звёздочки ставить не обязан.
  it('без разметки отдаёт фразу целиком', () => {
    expect(splitExample('Fraza bez oznake.')).toEqual([
      { text: 'Fraza bez oznake.', target: false },
    ]);
  });

  it('на пустой строке не даёт ничего', () => {
    expect(splitExample('')).toEqual([]);
    expect(splitExample('   ')).toEqual([]);
  });

  it('снимает разметку там, где выделения не показать', () => {
    expect(plainExample('Naša *mačka* spava.')).toBe('Naša mačka spava.');
  });

  it('достаёт само помеченное слово', () => {
    expect(exampleTarget('Naša *mačka* spava.')).toBe('mačka');
    expect(exampleTarget('Bez oznake.')).toBe('');
  });
});
