import { describe, expect, it } from 'vitest';

import { imageParagraph, tableParagraph } from './blocks';
import { PAGE_CHARS, paginate, splitParagraph } from './pages';

/**
 * Главное здесь — две вещи, каждая из которых видна читателю сразу: страница
 * не должна быть огромной (телефон на ней тормозит) и текст не должен
 * потеряться при разрыве.
 */

/** Абзац из n предложений примерно по 100 знаков. */
function longParagraph(sentences: number): string {
  const sentence = 'Ovo je duga rečenica o kući sa baštom koja se nalazi na kraju sela pored reke. ';
  return sentence.repeat(sentences).trimEnd();
}

describe('разбиение на страницы', () => {
  it('склеивается обратно знак в знак', () => {
    const paragraph = longParagraph(60);
    expect(splitParagraph(paragraph).join('')).toBe(paragraph);
  });

  it('ни одна страница не выходит далеко за предел', () => {
    // Одна глава одним абзацем — так приходят книги из публичной библиотеки.
    const pages = paginate([longParagraph(400)]);
    expect(pages.length).toBeGreaterThan(10);
    for (const page of pages) {
      const size = page.texts.join('').length;
      expect(size).toBeLessThanOrEqual(PAGE_CHARS);
    }
  });

  // Прежнее поведение: длинный абзац выталкивал недобранную страницу и сам
  // становился страницей на десятки тысяч знаков.
  it('короткий абзац рядом с огромным не остаётся один на странице', () => {
    const pages = paginate(['Kratak uvod.', longParagraph(200)]);
    expect(pages[0]!.texts.length).toBeGreaterThan(1);
  });

  it('страницы помнят, с какого абзаца начались', () => {
    const pages = paginate(['Prvi.', 'Drugi.', longParagraph(100), 'Poslednji.']);
    const starts = pages.map((page) => page.start);

    expect(starts[0]).toBe(0);
    // Курсор не пятится: иначе «продолжить чтение» отправляло бы назад.
    expect(starts).toEqual([...starts].sort((a, b) => a - b));
    // Разрыв внутри одного абзаца — несколько страниц подряд ссылаются на него.
    expect(starts.filter((start) => start === 2).length).toBeGreaterThan(1);
    // Последний абзац дописан к последней странице, а не выброшен.
    expect(pages.at(-1)!.texts.at(-1)).toContain('Poslednji.');
  });

  it('разрыв проходит между предложениями, а не внутри них', () => {
    for (const piece of splitParagraph(longParagraph(60))) {
      // Каждый кусок кончается концом предложения — значит следующая страница
      // начинается с начала следующего.
      expect(piece.trimEnd()).toMatch(/[.!?…]$/);
    }
  });

  it('текст без единого знака конца всё равно режется', () => {
    const wall = 'reč '.repeat(2000).trimEnd();
    const pieces = splitParagraph(wall);
    expect(pieces.length).toBeGreaterThan(1);
    expect(pieces.join('')).toBe(wall);
    for (const piece of pieces) expect(piece.length).toBeLessThanOrEqual(PAGE_CHARS);
  });

  // Слово длиннее страницы разорвать больше нечем, но зациклиться нельзя.
  it('слово длиннее страницы не подвешивает разбиение', () => {
    const word = 'a'.repeat(PAGE_CHARS * 3);
    const pieces = splitParagraph(word);
    expect(pieces.join('')).toBe(word);
    for (const piece of pieces) expect(piece.length).toBeLessThanOrEqual(PAGE_CHARS);
  });

  // Картинка и таблица — цельные объекты: разрезать их значит показать
  // половину адреса файла вместо иллюстрации.
  it('картинка и таблица не режутся', () => {
    const image = imageParagraph('https://cdn/' + 'x'.repeat(PAGE_CHARS * 2) + '.webp', 'Мапа');
    expect(splitParagraph(image)).toEqual([image]);

    const table = tableParagraph([['a'.repeat(PAGE_CHARS), 'b']]);
    expect(splitParagraph(table)).toEqual([table]);
  });

  it('пустая книга даёт ноль страниц', () => {
    expect(paginate([])).toEqual([]);
  });
});
