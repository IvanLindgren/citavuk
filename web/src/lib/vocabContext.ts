import { toLatin } from './tokenize';

/**
 * Пример из книги для слова, сохранённого без контекста.
 *
 * Читалка кладёт в карточку предложение, из которого слово взято, но так было
 * не всегда: у записей постарше поле пустое, а слово с одним переводом через
 * месяц не значит уже ничего — «kraj» это и «конец», и «край», и понять, какое
 * из них имелось в виду, без предложения нельзя.
 *
 * Книга при этом лежит рядом: искать предложение заново дешевле, чем хранить
 * его копию. Найденное НЕ записывается в карточку — иначе понадобилась бы
 * миграция и отправка на сервер ради подсказки, которую всегда можно собрать
 * заново.
 */

/** Границы предложения: точка, вопрос, восклицание и многоточие. */
const SENTENCE_END = /(?<=[.!?…])\s+/;

/** Не-буквы, по которым предложение делится на слова. */
const NOT_LETTER = /[^\p{L}]+/u;

/** Сколько знаков предложения показываем целиком. */
const MAX_LENGTH = 220;

function normalize(text: string): string {
  return toLatin(text.toLowerCase());
}

/**
 * Примеры сразу для многих слов: книга читается один раз.
 *
 * Искать каждое слово словаря отдельным проходом по всему тексту — сотни
 * проходов на одну книгу. Здесь проход один: предложение разбирается на слова,
 * и слова ищутся в нём, а не оно в них.
 *
 * Ключ ответа — слово в том виде, в каком его передали.
 */
export function findSentences(
  paragraphs: readonly string[],
  words: Iterable<string>,
): Map<string, string> {
  const found = new Map<string, string>();

  // Ищем по латинице в нижнем регистре: «кућа» и «kuća» — одно слово, а слово
  // в начале предложения написано с большой буквы.
  const wanted = new Map<string, string>();
  for (const word of words) {
    const trimmed = word.trim();
    // Фраза целым куском в книге, конечно, есть — она из неё и взята, — но
    // разбирать её на слова здесь нечестно, а искать целиком незачем.
    if (!trimmed || /\s/.test(trimmed)) continue;
    const needle = normalize(trimmed);
    if (needle && !wanted.has(needle)) wanted.set(needle, trimmed);
  }
  if (wanted.size === 0) return found;

  for (const paragraph of paragraphs) {
    for (const sentence of paragraph.split(SENTENCE_END)) {
      const text = sentence.trim();
      // Длинное предложение в карточке нечитаемо, а обрывать его на полуслове
      // значит спрятать как раз то место, ради которого искали. Пропускаем и
      // смотрим дальше: слово в книге встречается не по одному разу.
      if (!text || text.length > MAX_LENGTH) continue;
      for (const part of normalize(text).split(NOT_LETTER)) {
        const original = wanted.get(part);
        if (original === undefined) continue;
        wanted.delete(part);
        found.set(original, text);
      }
      if (wanted.size === 0) return found;
    }
  }
  return found;
}

/**
 * Первое подходящее предложение книги, где слово стоит целым словом.
 *
 * Первое, а не самое короткое: слово ищут, чтобы вспомнить смысл, а порядок в
 * книге ближе всего к тому, как оно человеку встретилось.
 *
 * Целым словом, а не куском: «rad» иначе находился бы в «radost» и «gradu», и
 * пример вставал бы к чужому слову — это хуже, чем никакого примера.
 */
export function findSentence(
  paragraphs: readonly string[],
  word: string,
): string | null {
  return findSentences(paragraphs, [word]).get(word.trim()) ?? null;
}
