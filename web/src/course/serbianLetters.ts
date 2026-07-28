export interface SerbianLetterDetails {
  sound: string;
  russianAnalogue: string;
}

const DETAILS: Record<string, SerbianLetterDetails> = {
  ј: { sound: '[й]', russianAnalogue: 'й' },
  љ: { sound: '[ль]', russianAnalogue: 'мягкое «ль»' },
  њ: { sound: '[нь]', russianAnalogue: 'мягкое «нь»' },
  ћ: { sound: '[чь]', russianAnalogue: 'мягкое «ч»' },
  ђ: {
    sound: '[джь]',
    russianAnalogue: 'мягкое «дж», точного аналога нет',
  },
  џ: { sound: '[дж]', russianAnalogue: 'дж' },
};

export function serbianLetterDetails(
  letter: string,
): SerbianLetterDetails | null {
  return DETAILS[letter.toLocaleLowerCase('sr')] ?? null;
}
