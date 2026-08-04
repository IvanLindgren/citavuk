import { describe, expect, it } from 'vitest';

import { letters, writable } from './writing';

describe('повторение письмом', () => {
  it('берёт отдельные слова', () => {
    for (const word of ['kuća', 'књига', 'razumeti', 'ђак']) {
      expect(writable(word)).toBe(true);
    }
  });

  // Фразы отсеиваются намеренно: писать рукой предложение долго, и
  // вспоминается оно не так, как слово.
  it('не берёт фразы', () => {
    for (const phrase of [
      'dobar dan',
      'како сте',
      'ja sam student',
      '  ',
      '',
    ]) {
      expect(writable(phrase)).toBe(false);
    }
  });

  it('не берёт слишком короткое и слишком длинное', () => {
    expect(writable('a')).toBe(false);
    expect(writable('a'.repeat(25))).toBe(false);
    expect(writable('a'.repeat(24))).toBe(true);
  });

  // Диакритика в сербской латинице — часть буквы. Разбиение по кодовым
  // единицам дало бы «пустые» буквы, которые не нарисовать.
  it('делит слово по видимым буквам', () => {
    expect(letters('kuća')).toEqual(['k', 'u', 'ć', 'a']);
    expect(letters('ђак')).toEqual(['ђ', 'а', 'к']);
    // Составная запись «c» + комбинирующая гачек — та же буква «č».
    expect(letters('čas')).toEqual(['č', 'a', 's']);
  });
});
