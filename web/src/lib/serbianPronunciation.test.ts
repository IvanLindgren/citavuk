import { describe, expect, it } from 'vitest';
import { serbianIpa } from './serbianPronunciation';

describe('serbianIpa', () => {
  it('distinguishes Latin digraphs and consonants', () => {
    expect(serbianIpa('ljubav')).toBe('/ʎubaʋ/');
    expect(serbianIpa('džem')).toBe('/dʒem/');
    expect(serbianIpa('đak')).toBe('/dʑak/');
  });

  it('supports Cyrillic', () => {
    expect(serbianIpa('читање')).toBe('/tʃitaɲe/');
  });
});
