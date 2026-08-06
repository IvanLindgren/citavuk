import { describe, expect, it } from 'vitest';
import { serbianIpa, serbianIpaParts, splitAccented, syllableCount } from './serbianPronunciation';

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

describe('syllableCount', () => {
  it('считает гласные', () => {
    expect(syllableCount('kuća')).toBe(2);
    expect(syllableCount('razumeti')).toBe(4);
  });

  // Без слогового «r» такие слова выглядели бы вовсе без слогов.
  it('считает слоговое r между согласными', () => {
    expect(syllableCount('prst')).toBe(1);
    expect(syllableCount('krv')).toBe(1);
    expect(syllableCount('crn')).toBe(1);
  });

  it('не считает r рядом с гласной', () => {
    expect(syllableCount('rad')).toBe(1);
    expect(syllableCount('more')).toBe(2);
  });
});

describe('serbianIpaParts', () => {
  it('в двусложном слове ударен первый слог — последний в сербском не бывает', () => {
    expect(serbianIpaParts('knjiga')).toEqual({ before: '/kɲ', stressed: 'i', after: 'ɡa/' });
  });

  it('в односложном ударен единственный гласный', () => {
    expect(serbianIpaParts('grad')).toEqual({ before: '/ɡr', stressed: 'a', after: 'd/' });
  });

  it('отмечает слоговое r', () => {
    expect(serbianIpaParts('prst')).toEqual({ before: '/p', stressed: 'r', after: 'st/' });
  });

  // Дальше двух слогов ударение может стоять на любом, кроме последнего.
  // Пустое место честнее уверенной ошибки.
  it('в длинном слове ударение не выдумывается', () => {
    expect(serbianIpaParts('razumeti')).toEqual({
      before: '/razumeti/',
      stressed: '',
      after: '',
    });
  });

  it('одинаково работает с кириллицей', () => {
    expect(serbianIpaParts('књига')).toEqual(serbianIpaParts('knjiga'));
  });
});

describe('splitAccented', () => {
  it('выделяет ударную букву словаря', () => {
    expect(splitAccented('knjȉga')).toEqual({ before: 'knj', stressed: 'ȉ', after: 'ga' });
  });

  it('работает с кириллицей', () => {
    expect(splitAccented('књи̏га')).toEqual({ before: 'књ', stressed: 'и̏', after: 'га' });
  });

  // «ć» в разложенном виде — это «c» плюс акут, тот же знак, что и долгое
  // восходящее ударение. Принять его за ударение значит выделить согласную.
  it('не принимает ć за ударение', () => {
    expect(splitAccented('kȕća')).toEqual({ before: 'k', stressed: 'ȕ', after: 'ća' });
  });

  // Макрон — долгота безударного слога, а не ударение.
  it('не выделяет долготу', () => {
    expect(splitAccented('knjīga').stressed).toBe('');
  });
});
