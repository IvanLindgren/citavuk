import { describe, expect, it } from 'vitest';

import {
  countChars,
  imageParagraph,
  isBlock,
  parseBlock,
  plainParagraphs,
  tableParagraph,
  translatableText,
  withTranslation,
} from './blocks';
import { contentSha } from './content';

describe('блоки книги', () => {
  it('картинка переживает запись и разбор', () => {
    const paragraph = imageParagraph('https://cdn/pic.webp', 'Карта Сербии');
    expect(parseBlock(paragraph)).toEqual({
      kind: 'image',
      url: 'https://cdn/pic.webp',
      alt: 'Карта Сербии',
    });
  });

  it('таблица переживает запись и разбор', () => {
    const rows = [
      ['Падеж', 'Единственное', 'Множественное'],
      ['Номинатив', 'кућа', 'куће'],
    ];
    expect(parseBlock(tableParagraph(rows))).toEqual({ kind: 'table', rows });
  });

  it('обычный текст остаётся текстом', () => {
    expect(parseBlock('Ово је обичан пасус.')).toEqual({
      kind: 'text',
      text: 'Ово је обичан пасус.',
    });
    expect(isBlock('Ово је обичан пасус.')).toBe(false);
  });

  // Абзац приходит из хранилища и с другого устройства: книга обязана
  // открыться при любом его содержимом, а не показать пустой экран.
  it('битая метка показывается текстом, а не ломает читалку', () => {
    for (const broken of [
      '\u0000citavuk:image\n',
      '\u0000citavuk:image',
      '\u0000citavuk:table\n',
      '\u0000citavuk:table\n\t\t',
      '\u0000citavuk:выдумка\nчто-то',
      '\u0000',
    ]) {
      expect(() => parseBlock(broken)).not.toThrow();
      expect(parseBlock(broken).kind).toBe('text');
    }
  });

  // Табуляция и перевод строки разделяют ячейки: попав внутрь ячейки, они
  // сдвинули бы всю таблицу.
  it('таблица не разъезжается от табуляции внутри ячейки', () => {
    const block = parseBlock(
      tableParagraph([['первая\tвторая', 'третья\nчетвёртая']]),
    );
    expect(block).toEqual({
      kind: 'table',
      rows: [['первая вторая', 'третья четвёртая']],
    });
  });

  it('перевод подставляется в ячейки на свои места', () => {
    const block = parseBlock(
      tableParagraph([
        ['one', 'two'],
        ['three', 'four'],
      ]),
    );
    const translated = withTranslation(block, ['jedan', 'dva', 'tri', 'četiri']);
    expect(parseBlock(translated)).toEqual({
      kind: 'table',
      rows: [
        ['jedan', 'dva'],
        ['tri', 'četiri'],
      ],
    });
  });

  // Адрес картинки — не текст. Отправить его переводчику значит получить
  // битую ссылку вместо иллюстрации.
  it('адрес картинки не уходит в перевод', () => {
    const block = parseBlock(imageParagraph('https://cdn/pic.webp', 'Map of Serbia'));
    expect(translatableText(block)).toEqual(['Map of Serbia']);

    const translated = withTranslation(block, ['Карта Србије']);
    expect(parseBlock(translated)).toEqual({
      kind: 'image',
      url: 'https://cdn/pic.webp',
      alt: 'Карта Србије',
    });
  });

  it('служебная разметка не считается текстом документа', () => {
    const paragraphs = [
      'Prvi pasus.',
      imageParagraph('https://cdn/очень-длинный-адрес-картинки.webp', 'Мапа'),
      tableParagraph([['a', 'b']]),
    ];
    expect(plainParagraphs(paragraphs)).toEqual(['Prvi pasus.', 'Мапа', 'a', 'b']);
    expect(countChars(paragraphs)).toBe('Prvi pasus.'.length + 'Мапа'.length + 2);
  });
});

// Главное, ради чего блоки сделаны строками: адрес книги считается от абзацев
// байт в байт тремя реализациями. Если бы блок потребовал новой модели, книга с
// картинкой не выгрузилась бы вовсе.
describe('адрес книги с блоками', () => {
  it('считается тем же способом, что и без них', async () => {
    const paragraphs = [
      'Prvi pasus.',
      imageParagraph('https://cdn/pic.webp', 'Мапа'),
      'Drugi pasus.',
    ];
    const sha = await contentSha(paragraphs);
    expect(sha).toMatch(/^[0-9a-f]{64}$/);
    // Тот же список абзацев обязан дать тот же адрес: иначе одна книга
    // превратилась бы в две при следующей синхронизации.
    expect(await contentSha([...paragraphs])).toBe(sha);
  });

  it('меняется, когда меняется картинка', async () => {
    const withPicture = [imageParagraph('https://cdn/a.webp', '')];
    const withOther = [imageParagraph('https://cdn/b.webp', '')];
    expect(await contentSha(withPicture)).not.toBe(await contentSha(withOther));
  });
});
