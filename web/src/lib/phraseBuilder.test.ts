import { describe, expect, it } from 'vitest';

import { isAssembled, phraseWords, shuffleTiles } from './phraseBuilder';

/** Предсказуемый «случай»: перемешивание должно проверяться, а не угадываться. */
function sequence(values: number[]): () => number {
  let index = 0;
  return () => values[index++ % values.length]!;
}

describe('сборка фразы из слов', () => {
  it('делит фразу на слова', () => {
    expect(phraseWords('  Kako  ste danas? ')).toEqual(['Kako', 'ste', 'danas?']);
  });

  it('у каждого кусочка своё место', () => {
    const tiles = shuffleTiles('da li je to to');
    expect(tiles.map((t) => t.id).sort((a, b) => a - b)).toEqual([0, 1, 2, 3, 4]);
    expect(tiles.map((t) => t.text).sort()).toEqual(['da', 'je', 'li', 'to', 'to']);
  });

  // Первый заход тут меняет каждое слово с самим собой, то есть не перемешивает.
  // Такой ряд лёг бы в исходном порядке — и упражнение выродилось бы в «нажми
  // всё подряд», поэтому перемешивание повторяется.
  it('исходный порядок не отдаётся', () => {
    const tiles = shuffleTiles('jedan dva tri', sequence([0.99, 0.99, 0, 0]));
    expect(tiles.map((t) => t.id)).not.toEqual([0, 1, 2]);
    expect(tiles.map((t) => t.text).sort()).toEqual(['dva', 'jedan', 'tri']);
  });

  it('из двух слов перемешивать нечего', () => {
    expect(shuffleTiles('dobar dan').map((t) => t.text)).toEqual(['dobar', 'dan']);
  });

  it('собранное в правильном порядке принимается', () => {
    const phrase = 'Kako ste danas?';
    const tiles = shuffleTiles(phrase);
    const picked = [...tiles].sort((a, b) => a.id - b.id);
    expect(isAssembled(picked, phrase)).toBe(true);
  });

  it('перепутанный порядок не принимается', () => {
    const phrase = 'Kako ste danas?';
    const tiles = [...shuffleTiles(phrase)].sort((a, b) => b.id - a.id);
    expect(isAssembled(tiles, phrase)).toBe(false);
  });

  // Упражнение про порядок слов: заглавная буква и точка в конце к нему не
  // относятся, придираться к ним значит наказывать за чужую ошибку.
  it('регистр и знаки на концах прощаются', () => {
    const picked = [
      { id: 0, text: 'kako' },
      { id: 1, text: 'ste' },
      { id: 2, text: 'danas' },
    ];
    expect(isAssembled(picked, 'Kako ste danas?')).toBe(true);
  });

  it('недособранная фраза не принимается', () => {
    const picked = [
      { id: 0, text: 'Kako' },
      { id: 1, text: 'ste' },
    ];
    expect(isAssembled(picked, 'Kako ste danas?')).toBe(false);
  });

  it('одинаковые слова считаются каждое за себя', () => {
    const phrase = 'to je to';
    expect(isAssembled([{ id: 0, text: 'to' }, { id: 1, text: 'je' }, { id: 2, text: 'to' }], phrase)).toBe(true);
    expect(isAssembled([{ id: 0, text: 'je' }, { id: 1, text: 'to' }, { id: 2, text: 'to' }], phrase)).toBe(false);
  });
});
