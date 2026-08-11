import { describe, expect, it } from 'vitest';

import { rotatedOptionIndexes } from './TestRun';

describe('порядок вариантов теста', () => {
  it('сдвигает варианты, не теряя исходные индексы', () => {
    expect(rotatedOptionIndexes(4, 1)).toEqual([1, 2, 3, 0]);
    expect(rotatedOptionIndexes(4, 3)).toEqual([3, 0, 1, 2]);
  });

  it('обрабатывает пустой вопрос', () => {
    expect(rotatedOptionIndexes(0, 2)).toEqual([]);
  });
});
