// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';

import { htmlToSpans, spansToHtml } from './PageEditor';
import { parseBlock, richParagraph } from '../lib/blocks';

function field(html: string): HTMLElement {
  const div = document.createElement('div');
  div.innerHTML = html;
  return div;
}

describe('правка страницы: оформление туда и обратно', () => {
  it('отрезки переживают путь в поле правки и обратно', () => {
    const text = 'Ovo je velika kuća.';
    const spans = [
      { start: 0, end: 3, style: 'b' },
      { start: 7, end: 13, style: 'im' },
      { start: 14, end: 18, style: 'u' },
    ];
    const back = htmlToSpans(field(spansToHtml(text, spans)));
    expect(back.text).toBe(text);
    expect(parseBlock(richParagraph(back.text, back.spans))).toEqual(
      parseBlock(richParagraph(text, spans)),
    );
  });

  it('понимает разметку, которую вставляет сам браузер', () => {
    const back = htmlToSpans(field(
      '<strong>Ovo</strong> je <span style="font-style: italic">velika</span> <span style="background-color: rgb(246, 226, 122)">kuća</span>.',
    ));
    expect(back.text).toBe('Ovo je velika kuća.');
    expect(back.spans).toEqual([
      { start: 0, end: 3, style: 'b' },
      { start: 7, end: 13, style: 'i' },
      { start: 14, end: 18, style: 'm' },
    ]);
  });

  it('прозрачный фон — это не маркер, а снятый маркер', () => {
    const back = htmlToSpans(field('<span style="background-color: transparent">reč</span>'));
    expect(back.spans).toEqual([]);
  });

  it('пробелы по краям уходят вместе со сдвигом отрезков', () => {
    const back = htmlToSpans(field('  <b>reč</b> i  '));
    expect(back.text).toBe('reč i');
    expect(back.spans).toEqual([{ start: 0, end: 3, style: 'b' }]);
  });

  it('текст экранируется: правка не превращает слова в разметку', () => {
    expect(spansToHtml('<script>', [])).toBe('&lt;script&gt;');
  });
});
