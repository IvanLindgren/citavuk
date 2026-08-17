import { describe, expect, it } from 'vitest';

import { findSentence, findSentences } from './vocabContext';

const book = [
  'Ovo je prvi pasus. Kuća je bila velika i tiha.',
  'Radost je ispunila grad, a rad se nastavio.',
  'Последња реченица помиње кућу поново.',
];

describe('пример из книги', () => {
  it('находит предложение со словом', () => {
    expect(findSentence(book, 'kuća')).toBe('Kuća je bila velika i tiha.');
  });

  // «rad» иначе нашёлся бы в «radost» и «gradu», и пример встал бы к чужому
  // слову — это хуже, чем никакого примера.
  it('не принимает слово внутри другого слова', () => {
    expect(findSentence(['Radost je ispunila grad.'], 'rad')).toBeNull();
  });

  it('находит слово, записанное другим письмом', () => {
    expect(findSentence(['Кућа је велика.'], 'kuća')).toBe('Кућа је велика.');
  });

  it('первое предложение, а не первое попавшееся вхождение абзаца', () => {
    expect(findSentence(book, 'rad')).toBe('Radost je ispunila grad, a rad se nastavio.');
  });

  it('у фразы примера не ищет', () => {
    expect(findSentence(book, 'mala kuća')).toBeNull();
  });

  it('слова нет в книге — примера нет', () => {
    expect(findSentence(book, 'квазимодогенез')).toBeNull();
  });

  it('пустой запрос и пустая книга не ломают поиск', () => {
    expect(findSentence([], 'kuća')).toBeNull();
    expect(findSentence(book, '   ')).toBeNull();
  });

  // Обрывать предложение на полуслове значит спрятать как раз то место, ради
  // которого его искали.
  it('слишком длинное предложение не берётся', () => {
    const long = `${'reč '.repeat(80)}kuća.`;
    expect(findSentence([long], 'kuća')).toBeNull();
  });

  it('за длинным предложением ищет дальше', () => {
    const long = `${'reč '.repeat(80)}kuća.`;
    expect(findSentence([long, 'Kuća je tu.'], 'kuća')).toBe('Kuća je tu.');
  });
});

describe('примеры для многих слов', () => {
  it('находит каждому слову своё предложение', () => {
    const found = findSentences(book, ['kuća', 'rad']);
    expect(found.get('kuća')).toBe('Kuća je bila velika i tiha.');
    expect(found.get('rad')).toBe('Radost je ispunila grad, a rad se nastavio.');
  });

  it('слова без примера в ответе не появляются', () => {
    const found = findSentences(book, ['kuća', 'квазимодогенез', 'mala kuća', '']);
    expect([...found.keys()]).toEqual(['kuća']);
  });

  it('ключ ответа — слово в том виде, в каком его дали', () => {
    expect([...findSentences(book, ['  KUĆA  ']).keys()]).toEqual(['KUĆA']);
  });
});
