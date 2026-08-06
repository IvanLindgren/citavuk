const single: Record<string, string> = {
  a: 'a', b: 'b', c: 'ts', č: 'tʃ', ć: 'tɕ', d: 'd', đ: 'dʑ',
  e: 'e', f: 'f', g: 'ɡ', h: 'x', i: 'i', j: 'j', k: 'k', l: 'l',
  m: 'm', n: 'n', o: 'o', p: 'p', r: 'r', s: 's', š: 'ʃ', t: 't',
  u: 'u', v: 'ʋ', z: 'z', ž: 'ʒ',
  а: 'a', б: 'b', в: 'ʋ', г: 'ɡ', д: 'd', ђ: 'dʑ', е: 'e', ж: 'ʒ',
  з: 'z', и: 'i', ј: 'j', к: 'k', л: 'l', љ: 'ʎ', м: 'm', н: 'n',
  њ: 'ɲ', о: 'o', п: 'p', р: 'r', с: 's', т: 't', ћ: 'tɕ', у: 'u',
  ф: 'f', х: 'x', ц: 'ts', ч: 'tʃ', џ: 'dʒ', ш: 'ʃ',
};

const pairs: Record<string, string> = { dž: 'dʒ', lj: 'ʎ', nj: 'ɲ' };

const IPA_VOWELS = 'aeiou';

/** Звук транскрипции и признак «это вершина слога». */
interface Sound {
  text: string;
  nucleus: boolean;
}

function sounds(word: string): Sound[] {
  const value = word.trim().toLocaleLowerCase('sr');
  const out: Sound[] = [];
  for (let index = 0; index < value.length; index += 1) {
    const pair = value.slice(index, index + 2);
    if (pairs[pair]) {
      out.push({ text: pairs[pair]!, nucleus: false });
      index += 1;
      continue;
    }
    const character = value[index]!;
    out.push({ text: single[character] ?? character, nucleus: false });
  }

  // Вершина слога — гласный либо слоговое «r» между согласными («prst», «krv»).
  // Без второго правила такие слова выглядели бы вовсе без слогов.
  const isVowel = (sound: Sound | undefined) =>
    sound !== undefined && sound.text.length === 1 && IPA_VOWELS.includes(sound.text);

  for (let index = 0; index < out.length; index += 1) {
    const sound = out[index]!;
    if (isVowel(sound)) {
      sound.nucleus = true;
      continue;
    }
    if (sound.text !== 'r') continue;
    if (!isVowel(out[index - 1]) && !isVowel(out[index + 1])) sound.nucleus = true;
  }
  return out;
}

export function serbianIpa(word: string): string {
  const output = sounds(word)
    .map((sound) => sound.text)
    .join('');
  return output ? `/${output}/` : '';
}

/** Число слогов сербского слова. */
export function syllableCount(word: string): number {
  return sounds(word).filter((sound) => sound.nucleus).length;
}

// Знаки сербского ударения: краткое нисходящее (двойной гравис), долгое
// нисходящее (перевёрнутая бреве), краткое восходящее (гравис), долгое
// восходящее (акут). Макрон (U+0304) сюда не входит — он обозначает долготу
// безударного слога, и выделять по нему значит показать ударение не там.
const STRESS_MARKS = '̏̑̀́';

/**
 * Разрезает ударное написание словаря на части вокруг ударной буквы.
 *
 * «knjȉga» → knj / ȉ / ga. Ударный слог в сербском несёт диакритику, и это
 * единственное надёжное указание на место ударения: по буквам его не
 * восстановить.
 *
 * Проверяется, что знак стоит на гласной или на слоговом «r»: в разложенном
 * виде «ć» — это «c» плюс акут, то есть ровно тот же знак, что и долгое
 * восходящее ударение.
 */
export function splitAccented(written: string): IpaParts {
  const decomposed = written.normalize('NFD');
  let base = -1;
  for (let index = 0; index < decomposed.length; index += 1) {
    if (!STRESS_MARKS.includes(decomposed[index]!)) continue;
    const letter = decomposed[index - 1];
    if (!letter || !'aeiouraeiourАЕИОУРаеиоур'.includes(letter)) continue;
    base = index - 1;
    break;
  }
  if (base < 0) return { before: written, stressed: '', after: '' };

  let end = base + 1;
  while (end < decomposed.length && /\p{M}/u.test(decomposed[end]!)) end += 1;
  return {
    before: decomposed.slice(0, base).normalize('NFC'),
    stressed: decomposed.slice(base, end).normalize('NFC'),
    after: decomposed.slice(end).normalize('NFC'),
  };
}

/** Транскрипция, разрезанная на ударном звуке. */
export interface IpaParts {
  before: string;
  /** Ударный звук; пустая строка — место ударения неизвестно. */
  stressed: string;
  after: string;
}

/**
 * Транскрипция с отмеченным ударением.
 *
 * Место ударения в сербском по написанию не восстанавливается: ударений четыре
 * (краткое и долгое, восходящее и нисходящее), словаря ударений в проекте нет,
 * а поставить знак наугад значит учить неправильному произношению.
 *
 * Но в коротких словах место определяется однозначно, без всякого словаря:
 * ударение никогда не падает на последний слог (твёрдая норма литературного
 * сербского), поэтому в одно- и двусложном слове ударен первый слог. Там оно и
 * отмечается. В словах длиннее ударение может стоять на любом слоге, кроме
 * последнего, — там транскрипция остаётся без пометы: пустое место честнее
 * уверенной ошибки.
 */
export function serbianIpaParts(word: string): IpaParts {
  const all = sounds(word);
  if (all.length === 0) return { before: '', stressed: '', after: '' };

  const nuclei = all.flatMap((sound, index) => (sound.nucleus ? [index] : []));
  const at = nuclei.length > 0 && nuclei.length <= 2 ? nuclei[0]! : -1;
  const join = (from: number, to?: number) =>
    all.slice(from, to).map((sound) => sound.text).join('');

  if (at < 0) return { before: `/${join(0)}/`, stressed: '', after: '' };
  return {
    before: `/${join(0, at)}`,
    stressed: all[at]!.text,
    after: `${join(at + 1)}/`,
  };
}
