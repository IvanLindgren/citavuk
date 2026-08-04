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

export function serbianIpa(word: string): string {
  const value = word.trim().toLocaleLowerCase('sr');
  let output = '';
  for (let index = 0; index < value.length; index += 1) {
    const pair = value.slice(index, index + 2);
    if (pairs[pair]) {
      output += pairs[pair];
      index += 1;
    } else {
      const character = value[index]!;
      output += single[character] ?? character;
    }
  }
  return output ? `/${output}/` : '';
}
