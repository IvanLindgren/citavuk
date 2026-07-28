const CYRILLIC_TO_LATIN: Record<string, string> = {
  а: 'a', б: 'b', в: 'v', г: 'g', д: 'd', ђ: 'đ', е: 'e', ж: 'ž',
  з: 'z', и: 'i', ј: 'j', к: 'k', л: 'l', љ: 'lj', м: 'm', н: 'n',
  њ: 'nj', о: 'o', п: 'p', р: 'r', с: 's', т: 't', ћ: 'ć', у: 'u',
  ф: 'f', х: 'h', ц: 'c', ч: 'č', џ: 'dž', ш: 'š',
};

export function toSerbianLatin(input: string): string {
  return Array.from(input.toLocaleLowerCase('sr'))
    .map((character) => CYRILLIC_TO_LATIN[character] ?? character)
    .join('');
}

/** Та же прозрачная бета-эвристика, что в Flutter-клиенте. */
export function isHardToHear(word: string): boolean {
  const value = toSerbianLatin(word);
  if (value.length <= 3) return false;
  let score = 0;
  if (value.length >= 9) score++;
  if (/[čćđ]/u.test(value)) score++;
  if (value.includes('dž') || value.includes('ije')) score++;
  if (/[bcdfghjklmnprstvzšžčćđ]{3}/u.test(value)) score++;
  return score >= 2;
}
