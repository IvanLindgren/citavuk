import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

import { bzzDecode } from './djvu/bzz';
import { extractDjvuText } from './djvu';
import { extractEpub, extractFb2 } from './ebook';

function fixture(name: string): Uint8Array {
  return new Uint8Array(readFileSync(join(__dirname, '__fixtures__', name)));
}

describe('bzzDecode', () => {
  it('распаковывает короткий блок', () => {
    expect(bzzDecode(fixture('test_short.bzz'))).toEqual(
      fixture('test_short.txt'),
    );
  });

  // 9 КБ — это уже несколько проходов адаптации частот, где ошибка в MTF
  // сразу разъезжается.
  it('распаковывает длинный блок', () => {
    expect(bzzDecode(fixture('test_long.bzz'))).toEqual(fixture('test_long.txt'));
  });

  it('короткий поток отвергается, а не зависает', () => {
    expect(() => bzzDecode(new Uint8Array([0]))).toThrow();
  });
});

describe('DjVu', () => {
  it('читает текстовый слой страницы', () => {
    const text = extractDjvuText(fixture('ccitt_2.djvu'));
    expect(text.trim().length).toBeGreaterThan(0);
  });

  it('не-DjVu отвергается понятной ошибкой', () => {
    expect(() => extractDjvuText(new Uint8Array(64).fill(0x41))).toThrow(
      /не DjVu/,
    );
  });
});

describe('FB2', () => {
  const fb2 = (xml: string) => new TextEncoder().encode(xml);

  it('читает абзацы и пропускает сноски', () => {
    const text = extractFb2(
      fb2(`<?xml version="1.0" encoding="utf-8"?>
        <FictionBook>
          <body>
            <title><p>Прва глава</p></title>
            <section><p>Читав сам књигу.</p><empty-line/><p>Друга реченица.</p></section>
          </body>
          <body name="notes"><section><p>Сноска</p></section></body>
        </FictionBook>`),
    );

    expect(text).toContain('Прва глава');
    expect(text).toContain('Читав сам књигу.');
    expect(text).not.toContain('Сноска');
  });

  it('windows-1251 не превращается в кракозябры', () => {
    // «Проба» в cp1251: каждая буква — один байт.
    const header = '<?xml version="1.0" encoding="windows-1251"?><FictionBook><body><section><p>';
    const footer = '</p></section></body></FictionBook>';
    const bytes = new Uint8Array([
      ...new TextEncoder().encode(header),
      0xcf, 0xf0, 0xee, 0xe1, 0xe0,
      ...new TextEncoder().encode(footer),
    ]);

    expect(extractFb2(bytes)).toContain('Проба');
  });
});

describe('EPUB', () => {
  it('главы идут в порядке spine, сущности разворачиваются', async () => {
    const { zipSync, strToU8 } = await import('fflate');
    const epub = zipSync({
      'META-INF/container.xml': strToU8(
        '<?xml version="1.0"?><container><rootfiles>' +
          '<rootfile full-path="OEBPS/book.opf"/></rootfiles></container>',
      ),
      'OEBPS/book.opf': strToU8(
        '<?xml version="1.0"?><package><manifest>' +
          '<item id="c1" href="ch1.xhtml"/><item id="c2" href="ch2.xhtml"/>' +
          '</manifest><spine><itemref idref="c1"/><itemref idref="c2"/></spine></package>',
      ),
      'OEBPS/ch1.xhtml': strToU8(
        '<html><body><h1>Глава 1</h1><p>Први пасус &mdash; с тире.</p></body></html>',
      ),
      'OEBPS/ch2.xhtml': strToU8(
        '<html><body><p>Друга глава.</p></body></html>',
      ),
    });

    const text = extractEpub(epub);
    expect(text).toContain('Глава 1');
    expect(text).toContain('Први пасус — с тире.');
    expect(text.indexOf('Глава 1')).toBeLessThan(text.indexOf('Друга глава.'));
  });
});
