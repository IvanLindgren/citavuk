/**
 * Повторение фразы сборкой из слов.
 *
 * Обычная карточка спрашивает перевод, и для фразы это выходит «переведи
 * предложение» — упражнение совсем другой тяжести, чем вспомнить слово. Письмом
 * фразы не повторяются намеренно (см. lib/writing.ts): писать рукой предложение
 * долго.
 *
 * Поэтому у фраз своё: показывается перевод, а сербскую фразу надо собрать из
 * перемешанных слов. Порядок слов в сербском и есть то, что в ней трудно, а
 * узнавание среди готовых кусков даётся легче письма — и на телефоне работает.
 */

export interface Tile {
  /** Своё место в перемешанном ряду: одинаковые слова во фразе не редкость. */
  id: number;
  text: string;
}

/** Слова фразы в исходном порядке. Знаки препинания остаются при словах. */
export function phraseWords(phrase: string): string[] {
  return phrase.trim().split(/\s+/).filter(Boolean);
}

/**
 * Перемешанные кусочки фразы.
 *
 * Перемешивание проверяется на результат: если фраза случайно легла в исходном
 * порядке, упражнение выродилось в «нажми всё подряд». Из фраз в одно-два слова
 * перемешать нечего, и они отдаются как есть.
 */
export function shuffleTiles(phrase: string, random = Math.random): Tile[] {
  const words = phraseWords(phrase);
  const tiles = words.map((text, id) => ({ id, text }));
  if (tiles.length < 3) return tiles;

  for (let attempt = 0; attempt < 8; attempt++) {
    for (let i = tiles.length - 1; i > 0; i--) {
      const j = Math.floor(random() * (i + 1));
      [tiles[i], tiles[j]] = [tiles[j]!, tiles[i]!];
    }
    if (tiles.some((tile, index) => tile.id !== index)) break;
  }
  return tiles;
}

/**
 * Собрано ли верно.
 *
 * Сравниваются слова, а не строка целиком: двойной пробел между кусочками —
 * не ошибка ученика. Регистр и знаки на концах слов тоже прощаются: упражнение
 * про порядок слов, а не про заглавную букву в начале.
 */
export function isAssembled(picked: readonly Tile[], phrase: string): boolean {
  const expected = phraseWords(phrase).map(bare);
  const actual = picked.map((tile) => bare(tile.text));
  return (
    expected.length === actual.length &&
    expected.every((word, index) => word === actual[index])
  );
}

function bare(word: string): string {
  return word.toLowerCase().replace(/^[^\p{L}\d]+|[^\p{L}\d]+$/gu, '');
}
