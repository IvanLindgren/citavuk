import { describe, expect, it } from 'vitest';

import { serbianLetterDetails } from './serbianLetters';

describe('serbianLetterDetails', () => {
  it('explains Serbian ј through the familiar Russian й', () => {
    expect(serbianLetterDetails('ј')).toEqual({
      sound: '[й]',
      russianAnalogue: 'й',
    });
  });

  it('contains explanations for every special Cyrillic card', () => {
    for (const letter of ['ј', 'љ', 'њ', 'ћ', 'ђ', 'џ']) {
      expect(serbianLetterDetails(letter)).not.toBeNull();
    }
  });
});
