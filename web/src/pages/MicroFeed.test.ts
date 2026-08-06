import { describe, expect, it } from 'vitest';

import { hookOf } from './MicroFeed';

/**
 * Крючок существует ради одного: карточка обязана помещаться на экран
 * телефона целиком. Пока текст не помещался, он лежал во вложенном скроллере
 * внутри snap-контейнера, и палец при свайпе попадал в него, а не в ленту —
 * листание срабатывало через раз.
 */

const sentence = 'Beograd je glavni grad Srbije i najveći grad u zemlji. ';

describe('крючок карточки', () => {
  it('короткий текст не режется и не просит продолжения', () => {
    const text = 'Kratka vest o vremenu.';
    expect(hookOf(text)).toEqual({ hook: text, truncated: false });
  });

  it('длинный текст режется и помечается как обрезанный', () => {
    const { hook, truncated } = hookOf(sentence.repeat(20));
    expect(truncated).toBe(true);
    expect(hook.split(/\s+/).length).toBeLessThanOrEqual(46);
  });

  // Оборванная на полуслове фраза читается как сбой загрузки, а не как
  // приглашение открыть продолжение.
  it('разрыв проходит по границе предложения', () => {
    const { hook } = hookOf(sentence.repeat(20));
    expect(hook).toMatch(/[.!?…]$/);
  });

  it('крючок — начало текста, а не пересказ', () => {
    const text = sentence.repeat(20);
    expect(text.startsWith(hook(text))).toBe(true);
  });

  // Одно предложение длиннее крючка встречается: так выглядит абзац без
  // единой точки. Отдать его целиком значило бы вернуться к тому, с чего
  // начали, — к тексту, который не помещается на экран.
  it('предложение длиннее крючка всё равно режется', () => {
    const wall = 'reč '.repeat(300).trim();
    const { hook: cut, truncated } = hookOf(wall);
    expect(truncated).toBe(true);
    expect(cut.split(/\s+/).length).toBeLessThanOrEqual(47);
    expect(cut.endsWith('…')).toBe(true);
  });
});

function hook(text: string): string {
  return hookOf(text).hook;
}
