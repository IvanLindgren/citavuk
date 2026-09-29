import { describe, expect, it } from 'vitest';

import type { SpeakingMistake } from '../../api/speaking';
import { annotate, countWords } from './highlight';

const mistake = (original: string, fixed = 'x'): SpeakingMistake => ({
  original,
  fixed,
  kind: 'case',
  label: 'Падеж',
  explanation: '',
});

describe('annotate', () => {
  it('подсвечивает ошибки и сохраняет текст целиком', () => {
    const text = 'Ja volim Beograd jer je on veliki grad.';
    const parts = annotate(text, [mistake('veliki grad'), mistake('Ja volim')]);
    expect(parts.map((part) => part.text).join('')).toBe(text);
    expect(parts.filter((part) => part.mistake !== undefined)).toEqual([
      { text: 'Ja volim', mistake: 1 },
      { text: 'veliki grad', mistake: 0 },
    ]);
  });

  it('не различает регистр, но возвращает текст как написан', () => {
    const parts = annotate('Volim ĐAK i đaka', [mistake('đak')]);
    expect(parts[1]).toEqual({ text: 'ĐAK', mistake: 0 });
  });

  it('повторная ошибка занимает следующее свободное вхождение', () => {
    const parts = annotate('kuća kuća', [mistake('kuća'), mistake('kuća')]);
    expect(parts.filter((part) => part.mistake !== undefined)).toEqual([
      { text: 'kuća', mistake: 0 },
      { text: 'kuća', mistake: 1 },
    ]);
  });

  it('пересекающиеся ошибки не накладываются', () => {
    const parts = annotate('u velikom gradu', [mistake('velikom gradu'), mistake('gradu')]);
    expect(parts.filter((part) => part.mistake !== undefined)).toEqual([{ text: 'velikom gradu', mistake: 0 }]);
  });

  it('ошибка, которой нет в тексте, просто не подсвечивается', () => {
    expect(annotate('Dobar dan', [mistake('noć')])).toEqual([{ text: 'Dobar dan' }]);
  });
});

describe('countWords', () => {
  it('считает так же, как сервер', () => {
    expect(countWords('  Ja   volim\nBeograd ')).toBe(3);
    expect(countWords('   ')).toBe(0);
  });
});
