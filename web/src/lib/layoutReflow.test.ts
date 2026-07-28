import { describe, expect, it } from 'vitest';

import { cleanLatexLayout } from './latexText';
import { reflowDocumentWithLayout, type LayoutLine } from './reflow';
import { fixSerbianDocument } from './serbianEncodingFix';

/** Строка колонки шириной 400 пунктов. */
function line(text: string, left = 100, right = 500): LayoutLine {
  return { text, left, right };
}

describe('reflowDocumentWithLayout', () => {
  it('красная строка начинает новый абзац', () => {
    const paragraphs = reflowDocumentWithLayout([
      [
        line('Neko mora da je oklevetao Jozefa K., jer je, iako nije'),
        line('učinio nikakvo zlo, jednog jutra bio uhapšen.'),
        // Отступ первой строки — новый абзац, хотя предыдущая полная.
        line('Kuvarica gospođe Grubah, njegove gazdarice, donosila mu je', 118),
        line('svakog dana doručak oko osam časova.'),
      ],
    ]);

    expect(paragraphs).toHaveLength(2);
    expect(paragraphs[0]).toMatch(/^Neko mora/);
    expect(paragraphs[1]).toMatch(/^Kuvarica/);
  });

  it('строка, не дошедшая до правого края, закрывает абзац', () => {
    const paragraphs = reflowDocumentWithLayout([
      [
        line('Prvi red teksta koji ide do samog kraja kolone i dalje'),
        line('kratak kraj pasusa.', 100, 300),
        line('Sledeći pasus počinje ovde i nastavlja se dalje po redu'),
      ],
    ]);

    expect(paragraphs).toHaveLength(2);
    expect(paragraphs[1]).toMatch(/^Sledeći/);
  });

  it('сплошной текст без отступов остаётся одним абзацем', () => {
    const paragraphs = reflowDocumentWithLayout([
      [
        line('Prva linija teksta koja se nastavlja bez ikakvog prekida'),
        line('druga linija istog pasusa koja takođe ide do kraja reda'),
        line('treća linija istog pasusa koja se završava tačkom.'),
      ],
    ]);

    expect(paragraphs).toHaveLength(1);
  });

  it('колонтитул со всех страниц выбрасывается', () => {
    const pages = Array.from({ length: 5 }, (_, index) => [
      line('FRANC KAFKA'),
      line(`Tekst stranice broj ${index} koji se nastavlja dalje po redu`),
    ]);

    const paragraphs = reflowDocumentWithLayout(pages);
    expect(paragraphs.join(' ')).not.toContain('FRANC KAFKA');
  });
});

describe('сербские буквы из ломаного шрифта', () => {
  it('восстанавливаются, когда текст сербский', () => {
    const broken =
      'Kuvarica gospoĊe Grubah donosila mu je doruĉak oko osam ĉasova, ' +
      'a on je gledao u staru ţenu koja je stanovala preko puta.';
    const fixed = fixSerbianDocument([broken])[0]!;

    expect(fixed).toContain('gospođe');
    expect(fixed).toContain('časova');
    expect(fixed).toContain('ženu');
    expect(fixed).not.toContain('Ċ');
  });

  it('чужой язык не трогаем', () => {
    const esperanto = 'Ĉu vi parolas Esperanton? Ĉiuj homoj estas liberaj.';
    expect(fixSerbianDocument([esperanto])[0]).toBe(esperanto);
  });
});

describe('cleanLatexLayout', () => {
  it('собирает диакритику и сохраняет геометрию', () => {
    const cleaned = cleanLatexLayout([[line('cˇasova i sˇuma'), line('ﬁnale')]]);

    expect(cleaned[0]![0]!.text).toBe('časova i šuma');
    expect(cleaned[0]![0]!.left).toBe(100);
    expect(cleaned[0]![1]!.text).toBe('finale');
  });
});
