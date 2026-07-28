/**
 * Починка текста из PDF, свёрстанных в LaTeX.
 *
 * В таких файлах текст лежит не так, как в книгах из Word: буква с диакритикой
 * рисуется двумя глифами (галочка отдельно, буква отдельно), «fi» и «fl» — это
 * один глиф-лигатура, а между абзацами попадаются формулы, которые в текст
 * книги превращаются в мусор.
 *
 * Те же правила в приложении — frontend/lib/utils/latex_text.dart.
 */

import type { LayoutLine } from './reflow';

/** Лигатуры, которые LaTeX ставит вместо пар букв. */
const LIGATURES: Array<[string, string]> = [
  ['ﬀ', 'ff'],
  ['ﬁ', 'fi'],
  ['ﬂ', 'fl'],
  ['ﬃ', 'ffi'],
  ['ﬄ', 'ffl'],
  ['ﬅ', 'st'],
  ['ﬆ', 'st'],
];

/** Отдельно стоящие знаки диакритики и их комбинирующие двойники. */
const ACCENTS: Record<string, string> = {
  'ˇ': 'caron',
  '̌': 'caron',
  '´': 'acute',
  '́': 'acute',
  'ˊ': 'acute',
  '`': 'grave',
  '̀': 'grave',
  '¨': 'diaeresis',
  '̈': 'diaeresis',
  '^': 'circumflex',
  '̂': 'circumflex',
  '˚': 'ring',
  '̊': 'ring',
  '~': 'tilde',
  '̃': 'tilde',
  '¯': 'macron',
  '̄': 'macron',
  '˝': 'doubleacute',
  '̋': 'doubleacute',
};

/**
 * Что получается из буквы под знаком. Набор — славянская латиница: сербская,
 * хорватская, чешская, польская; их достаточно для книг, которые читают в
 * приложении.
 */
const COMPOSED: Record<string, Record<string, string>> = {
  caron: {
    c: 'č', C: 'Č', s: 'š', S: 'Š', z: 'ž', Z: 'Ž',
    d: 'ď', D: 'Ď', t: 'ť', T: 'Ť', n: 'ň', N: 'Ň',
    r: 'ř', R: 'Ř', e: 'ě', E: 'Ě', g: 'ǧ', G: 'Ǧ',
  },
  acute: {
    c: 'ć', C: 'Ć', s: 'ś', S: 'Ś', z: 'ź', Z: 'Ź',
    n: 'ń', N: 'Ń', a: 'á', A: 'Á', e: 'é', E: 'É',
    i: 'í', I: 'Í', o: 'ó', O: 'Ó', u: 'ú', U: 'Ú',
    y: 'ý', Y: 'Ý', l: 'ĺ', L: 'Ĺ', r: 'ŕ', R: 'Ŕ',
  },
  grave: {
    a: 'à', A: 'À', e: 'è', E: 'È', i: 'ì', I: 'Ì',
    o: 'ò', O: 'Ò', u: 'ù', U: 'Ù',
  },
  diaeresis: {
    a: 'ä', A: 'Ä', e: 'ë', E: 'Ë', i: 'ï', I: 'Ï',
    o: 'ö', O: 'Ö', u: 'ü', U: 'Ü',
  },
  circumflex: {
    a: 'â', A: 'Â', e: 'ê', E: 'Ê', i: 'î', I: 'Î',
    o: 'ô', O: 'Ô', u: 'û', U: 'Û',
  },
  ring: { u: 'ů', U: 'Ů', a: 'å', A: 'Å' },
  tilde: { a: 'ã', A: 'Ã', n: 'ñ', N: 'Ñ', o: 'õ', O: 'Õ' },
  macron: {
    a: 'ā', A: 'Ā', e: 'ē', E: 'Ē', i: 'ī', I: 'Ī',
    o: 'ō', O: 'Ō', u: 'ū', U: 'Ū',
  },
  doubleacute: { o: 'ő', O: 'Ő', u: 'ű', U: 'Ű' },
};

/**
 * Разворачивает лигатуры и собирает буквы с диакритикой.
 *
 * Знак может стоять и перед буквой, и после неё: порядок зависит от того, как
 * его поставил TeX и в каком порядке глифы попали в файл.
 */
export function composeAccents(line: string): string {
  let text = line;
  for (const [ligature, plain] of LIGATURES) {
    if (text.includes(ligature)) text = text.split(ligature).join(plain);
  }
  if (!Object.keys(ACCENTS).some((accent) => text.includes(accent))) return text;

  const out: string[] = [];
  const chars = [...text];
  for (let i = 0; i < chars.length; i++) {
    const char = chars[i]!;
    const accent = ACCENTS[char];
    if (accent === undefined) {
      out.push(char);
      continue;
    }
    const table = COMPOSED[accent]!;

    // Знак после буквы: «cˇ».
    const last = out[out.length - 1];
    if (last !== undefined && table[last] !== undefined) {
      out[out.length - 1] = table[last]!;
      continue;
    }
    // Знак перед буквой: «ˇc».
    const next = i + 1 < chars.length ? chars[i + 1]! : '';
    if (table[next] !== undefined) {
      out.push(table[next]!);
      i++;
      continue;
    }
    out.push(char);
  }
  return out.join('');
}

/** Символы, которые встречаются в формулах и почти не встречаются в прозе. */
const MATH_SIGNS = /[=∑∏∫√≈≤≥≠∞±×÷⊂∈∀∃∇∂→←↔⇒⇔αβγδθλμσφψω]/u;

/** Номер формулы в конце строки: «(3.14)», «(2)». */
const FORMULA_NUMBER = /\s*\(\d+(?:\.\d+)*\)\s*$/u;

const LETTERS = /\p{L}/gu;

/**
 * Похожа ли строка на формулу, а не на текст.
 *
 * Формулы в PDF из LaTeX распадаются на отдельные буквы и знаки, и в книге
 * такая строка выглядит мусором. Признак — мало букв на длину строки при
 * наличии математических знаков.
 */
export function looksLikeFormula(line: string): boolean {
  const text = line.trim();
  if (text === '') return false;
  if (text.length > 200) return false;

  const letters = (text.match(LETTERS) ?? []).length;
  const ratio = letters / text.length;
  if (!MATH_SIGNS.test(text)) {
    // Без знаков формулой считаем только совсем беспросветное: «x i j k n».
    return ratio < 0.25 && text.length > 6;
  }
  return ratio < 0.55;
}

/**
 * Чистит строку из LaTeX-PDF. Возвращает пустую строку, если строку нужно
 * выбросить целиком.
 */
export function cleanLatexLine(line: string): string {
  const composed = composeAccents(line);
  if (looksLikeFormula(composed)) return '';
  return composed.replace(FORMULA_NUMBER, '').trimEnd();
}

/** Доля строк с математикой, начиная с которой документ считается техническим. */
const FORMULA_SHARE = 0.03;

function isTechnical(texts: string[]): boolean {
  let mathy = 0;
  for (const text of texts) {
    if (MATH_SIGNS.test(text)) mathy++;
  }
  return texts.length > 0 && mathy / texts.length >= FORMULA_SHARE;
}

/**
 * Готовит строки PDF к сборке абзацев.
 *
 * Диакритика собирается всегда — отдельно стоящая галочка над буквой в обычной
 * книге не встречается, портить нечего. А формулы выбрасываются только в
 * техническом тексте: в художественной книге строка без букв — это скорее
 * дата, номер главы или реплика, и терять её нельзя.
 */
export function cleanLatexDocument(pages: string[][]): string[][] {
  const technical = isTechnical(pages.flat());
  return pages.map((page) =>
    page
      .map((line) => (technical ? cleanLatexLine(line) : composeAccents(line)))
      .filter((line) => line !== ''),
  );
}

/**
 * То же, но для строк с координатами: чистка не должна терять геометрию,
 * по которой дальше собираются абзацы.
 */
export function cleanLatexLayout(pages: LayoutLine[][]): LayoutLine[][] {
  const technical = isTechnical(pages.flat().map((line) => line.text));

  return pages.map((page) => {
    const cleaned: LayoutLine[] = [];
    for (const line of page) {
      const text = technical ? cleanLatexLine(line.text) : composeAccents(line.text);
      if (text === '') continue;
      cleaned.push({ text, left: line.left, right: line.right });
    }
    return cleaned;
  });
}
