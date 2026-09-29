import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { expect, it } from 'vitest';

import { Paragraph } from '../components/WordReaderBlocks';
import { quoteColor } from './readerQuotes';

it('незнакомый цвет от будущей версии становится подчёркиванием', () => {
  expect(quoteColor('yellow')).toBe('yellow');
  expect(quoteColor('ultraviolet')).toBe('');
  expect(quoteColor(undefined)).toBe('');
});

it('цветное выделение рисуется маркером, подчёркивание — линией', async () => {
  const host = document.createElement('div');
  document.body.append(host);
  const root = createRoot(host);
  await act(async () => root.render(
    <Paragraph
      text="Idem bez kuće danas."
      selectedStart={null}
      cliticStart={null}
      onSelect={() => {}}
      bionic={0}
      stress={null}
      className=""
      marks={[
        { start: 5, end: 13, kind: 'quote', value: 'yellow' },
        { start: 14, end: 19, kind: 'quote' },
      ]}
    />,
  ));
  const marked = [...host.querySelectorAll('span')].filter((span) => span.className.includes('rgb(250_204_21'));
  // Слова и пробел между ними: выделение сплошное, без просветов.
  expect(marked.map((span) => span.textContent).join('')).toBe('bez kuće');
  const underlined = [...host.querySelectorAll('span')].filter((span) => span.className.includes('underline'));
  expect(underlined.map((span) => span.textContent).join('')).toBe('danas');
  await act(async () => root.unmount());
  host.remove();
});
