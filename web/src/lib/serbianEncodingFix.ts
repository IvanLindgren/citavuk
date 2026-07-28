/**
 * Восстановление сербских букв, испорченных кодировкой PDF.
 *
 * В книгах, свёрстанных старыми редакторами, шрифт отдаёт đ, č и ž чужими
 * буквами: «gospoĊe» вместо «gospođe», «ĉasova» вместо «časova», «ţenu»
 * вместо «ženu». Сам текст при этом читается, поэтому обычная проверка на
 * кодировку такой файл пропускает.
 *
 * Те же правила в приложении — frontend/lib/utils/serbian_encoding_fix.dart.
 */

/** Что на что подменяется. Пары взяты из книг, где поломка встретилась. */
const REPLACEMENTS: Array<[string, string]> = [
  ['Ċ', 'đ'], ['ċ', 'đ'], // C с точкой — вместо đ
  ['Ĉ', 'Č'], ['ĉ', 'č'], // C с циркумфлексом — вместо č
  ['Ţ', 'Ž'], ['ţ', 'ž'], // T с седилью — вместо ž
  ['Ď', 'Đ'], ['ď', 'đ'],
  ['Ŝ', 'Š'], ['ŝ', 'š'],
];

/**
 * Сколько подмен на текст, чтобы считать его испорченным.
 *
 * Одиночное вхождение может быть настоящей буквой другого языка: ĉ есть в
 * эсперанто, ċ — в мальтийском, ţ — в румынском.
 */
const MIN_HITS = 3;

/** Признаки сербской латиницы: если их нет, чужие буквы трогать нельзя. */
const SERBIAN = /\b(je|da|se|na|za|su|nije|koji|koja|sam|bio|ali|ovo)\b|[šžćč]/i;

/** Похоже ли, что в тексте сербские буквы заменены чужими. */
export function hasBrokenSerbianLetters(text: string): boolean {
  let hits = 0;
  for (const [broken] of REPLACEMENTS) {
    for (const char of text) {
      if (char === broken) hits++;
    }
    if (hits >= MIN_HITS) break;
  }
  return hits >= MIN_HITS && SERBIAN.test(text);
}

/** Возвращает текст с восстановленными буквами. */
export function fixSerbianLetters(text: string): string {
  let result = text;
  for (const [broken, correct] of REPLACEMENTS) {
    if (result.includes(broken)) result = result.split(broken).join(correct);
  }
  return result;
}

/**
 * Чинит весь документ разом — решение принимается по всему тексту, а не по
 * отдельной строке: на одной строке признаков языка может не быть.
 */
export function fixSerbianDocument(paragraphs: string[]): string[] {
  if (paragraphs.length === 0) return paragraphs;

  const sample = paragraphs.slice(0, 80).join(' ');
  if (!hasBrokenSerbianLetters(sample)) return paragraphs;
  return paragraphs.map(fixSerbianLetters);
}

/** То же для сплошного текста: DOCX, FB2 и EPUB приходят одной строкой. */
export function fixSerbianText(text: string): string {
  if (!hasBrokenSerbianLetters(text.slice(0, 20_000))) return text;
  return fixSerbianLetters(text);
}
