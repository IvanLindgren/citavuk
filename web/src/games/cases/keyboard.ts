/**
 * Раскладка машинки и перевод нажатий в буквы.
 *
 * Машинка — сербская латинская QWERTZ, какой она была у югославских Olympia и
 * UNIS. С физической клавиатуры буква берётся по положению клавиши
 * (event.code), а не по раскладке системы: у русскоязычного пользователя
 * включена кириллица, и «к» вместо «r» превратило бы игру в борьбу с Alt+Shift.
 * Сербские буквы стоят там же, где на сербской клавиатуре: [ ] ; ' \.
 */

export const TYPEWRITER_ROWS: string[][] = [
  ['q', 'w', 'e', 'r', 't', 'z', 'u', 'i', 'o', 'p', 'š', 'đ'],
  ['a', 's', 'd', 'f', 'g', 'h', 'j', 'k', 'l', 'č', 'ć', 'ž'],
  ['y', 'x', 'c', 'v', 'b', 'n', 'm'],
];

export const SERBIAN_LETTERS = ['č', 'ć', 'š', 'ž', 'đ'];

const CODE_LETTERS: Record<string, string> = {
  BracketLeft: 'š',
  BracketRight: 'đ',
  Semicolon: 'č',
  Quote: 'ć',
  Backslash: 'ž',
  IntlBackslash: 'ž',
};

const SERBIAN_CYRILLIC: Record<string, string> = {
  а: 'a', б: 'b', в: 'v', г: 'g', д: 'd', ђ: 'đ', е: 'e', ж: 'ž', з: 'z', и: 'i', ј: 'j', к: 'k',
  л: 'l', љ: 'lj', м: 'm', н: 'n', њ: 'nj', о: 'o', п: 'p', р: 'r', с: 's', т: 't', ћ: 'ć', у: 'u',
  ф: 'f', х: 'h', ц: 'c', ч: 'č', џ: 'dž', ш: 'š',
};

const LATIN = /^[a-zčćšžđ]$/;
/** Буквы, которых нет в русской раскладке: по ним видна сербская кириллица. */
const SERBIAN_ONLY = /^[ђјљњћџ]$/;

export type TypewriterInput =
  | { kind: 'text'; text: string }
  | { kind: 'backspace' }
  | { kind: 'enter' }
  | null;

/** Нажатие физической клавиши → действие машинки. */
export function inputFromKeyboard(event: Pick<KeyboardEvent, 'key' | 'code' | 'ctrlKey' | 'metaKey' | 'altKey'>): TypewriterInput {
  if (event.ctrlKey || event.metaKey) return null;
  if (event.key === 'Backspace') return { kind: 'backspace' };
  if (event.key === 'Enter') return { kind: 'enter' };
  if (event.key === ' ' || event.code === 'Space') return { kind: 'text', text: ' ' };
  const key = event.key.toLocaleLowerCase('sr');
  // Сербская латинская раскладка системы даёт č сразу — её и берём.
  if (LATIN.test(key)) return { kind: 'text', text: key };
  // «к» есть и в русской, и в сербской кириллице, но на разных клавишах.
  // Русскую раскладку выдаёт только место клавиши, поэтому транслитерируются
  // лишь чисто сербские буквы.
  if (SERBIAN_ONLY.test(key)) return { kind: 'text', text: SERBIAN_CYRILLIC[key]! };
  // Любая другая раскладка: буква по месту клавиши.
  if (/^Key[A-Z]$/.test(event.code)) return { kind: 'text', text: event.code.slice(3).toLowerCase() };
  if (event.code in CODE_LETTERS) return { kind: 'text', text: CODE_LETTERS[event.code]! };
  return null;
}

/** Текст, пришедший из экранной клавиатуры телефона. */
export function textFromInput(data: string): string {
  let out = '';
  for (const ch of data.toLocaleLowerCase('sr')) {
    if (LATIN.test(ch) || ch === ' ') out += ch;
    else if (ch in SERBIAN_CYRILLIC) out += SERBIAN_CYRILLIC[ch];
  }
  return out;
}

/**
 * Какой лапой жать — как у машинистки при слепой печати: q w e r t, a s d f g
 * и y x c v b — левой, остальное правой.
 */
export function pawForKey(key: string): 'left' | 'right' {
  for (const row of TYPEWRITER_ROWS) {
    const index = row.indexOf(key);
    if (index >= 0) return index < 5 ? 'left' : 'right';
  }
  return key === 'backspace' || key === 'enter' ? 'right' : 'left';
}
