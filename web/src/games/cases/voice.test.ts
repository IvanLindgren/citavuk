import { describe, expect, it } from 'vitest';

import { spokenAnswer } from './voice';

describe('голосовой ответ', () => {
  it('находит форму внутри фразы и в любом варианте распознавания', () => {
    expect(spokenAnswer(['Идем без куће'], ['kuće'])).toBe('kuće');
    expect(spokenAnswer(['bez kuća', 'bez kuće'], ['kuće'])).toBe('kuće');
  });

  it('понимает составные формы в обоих порядках', () => {
    const answers = ['sam radila', 'radila sam'];
    expect(spokenAnswer(['ја сам радила'], answers)).toBe('sam radila');
    expect(spokenAnswer(['radila sam juče'], answers)).toBe('radila sam');
  });

  it('не засчитывает часть слова и неверную форму', () => {
    expect(spokenAnswer(['jedem'], ['je'])).toBeNull();
    expect(spokenAnswer(['kuća'], ['kuće'])).toBeNull();
  });

  it('чёрточки, потерянные распознавателем, не мешают', () => {
    expect(spokenAnswer(['kuce'], ['kuće'])).toBe('kuće');
    expect(spokenAnswer(['djaka'], ['đaka'])).toBe('đaka');
  });
});
