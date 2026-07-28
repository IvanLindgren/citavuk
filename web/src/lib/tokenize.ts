/**
 * Разбиение сербского текста на токены.
 *
 * Повторяет поведение токенизатора приложения: слова отделяются от пробелов и
 * пунктуации, а смещения указывают на исходную строку — они уходят на сервер
 * при переводе слова в контексте, поэтому текст между разбиением и запросом
 * менять нельзя.
 */

export interface Token {
  text: string;
  /** Смещение начала в исходной строке, в единицах UTF-16. */
  start: number;
  /** Смещение конца, не включая сам символ. */
  end: number;
  isWord: boolean;
}

/**
 * Буквы сербского алфавита в обеих графиках плюс латиница с диакритикой.
 *
 * Диакритика перечислена явно, а не свёрнута к базовым буквам: в сербском
 * č и ć, dž и đ — разные буквы, и «нормализация» слепила бы разные слова.
 */
const LETTER = /\p{L}/u;

/** Дефис и апостроф внутри слова его не разрывают: «српско-руски», «d'Artanjan». */
const INNER_WORD = new Set(['-', '‑', "'", '’']);

export function tokenize(text: string): Token[] {
  const tokens: Token[] = [];
  let index = 0;

  while (index < text.length) {
    const char = text[index] ?? '';

    if (LETTER.test(char)) {
      const start = index;
      while (index < text.length) {
        const current = text[index] ?? '';
        if (LETTER.test(current)) {
          index++;
          continue;
        }
        // Дефис считается частью слова, только если за ним снова буква:
        // иначе «слово —» превратилось бы в одно длинное слово.
        if (INNER_WORD.has(current) && LETTER.test(text[index + 1] ?? '')) {
          index++;
          continue;
        }
        break;
      }
      tokens.push({ text: text.slice(start, index), start, end: index, isWord: true });
      continue;
    }

    // Всё остальное — пробелы, пунктуация, цифры. Копится подряд, чтобы не
    // плодить по токену на символ.
    const start = index;
    while (index < text.length && !LETTER.test(text[index] ?? '')) index++;
    tokens.push({ text: text.slice(start, index), start, end: index, isWord: false });
  }

  return tokens;
}

/** Кириллица -> латиница по сербской таблице соответствий. */
const CYRILLIC_TO_LATIN: Record<string, string> = {
  а: 'a', б: 'b', в: 'v', г: 'g', д: 'd', ђ: 'đ', е: 'e', ж: 'ž', з: 'z',
  и: 'i', ј: 'j', к: 'k', л: 'l', љ: 'lj', м: 'm', н: 'n', њ: 'nj', о: 'o',
  п: 'p', р: 'r', с: 's', т: 't', ћ: 'ć', у: 'u', ф: 'f', х: 'h', ц: 'c',
  ч: 'č', џ: 'dž', ш: 'š',
};

/**
 * Переводит сербскую кириллицу в латиницу.
 *
 * Нужна для поиска по словарю: он хранит формы в латинице, а текст книги может
 * быть написан любой из двух равноправных график.
 */
export function toLatin(text: string): string {
  let out = '';
  for (const char of text) {
    const lower = char.toLowerCase();
    const mapped = CYRILLIC_TO_LATIN[lower];
    if (mapped === undefined) {
      out += char;
      continue;
    }
    // Регистр восстанавливается: «Њ» -> «Nj», а не «nj».
    out += char === lower ? mapped : mapped.charAt(0).toUpperCase() + mapped.slice(1);
  }
  return out;
}

/** Делит длинный текст на абзацы, отбрасывая пустые строки. */
export function splitParagraphs(text: string): string[] {
  return text
    .split(/\n\s*\n|\r\n\s*\r\n/)
    .map((paragraph) => paragraph.replace(/\s+/g, ' ').trim())
    .filter((paragraph) => paragraph.length > 0);
}
