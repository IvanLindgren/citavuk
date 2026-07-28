import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../state/sync', () => ({
  useSync: () => ({ sync: vi.fn() }),
}));

import { WordReader } from './WordReader';

describe('WordReader floating panels', () => {
  beforeEach(() => {
    (globalThis as typeof globalThis & {
      IS_REACT_ACT_ENVIRONMENT: boolean;
    }).IS_REACT_ACT_ENVIRONMENT = true;

    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: RequestInfo | URL) => {
        const path = String(input);
        const body = path.includes('/v1/analyze')
          ? {
              surface: 'кућа',
              lemma: 'кућа',
              upos: 'NOUN',
              posFull: 'существительное',
              posShort: 'сущ.',
              feats: {},
              known: true,
              facts: [],
              summary: '',
              why: '',
              paradigms: [],
            }
          : {
              text: 'дом',
              sentence: 'Это дом.',
              provider: 'test',
              cached: false,
              aligned: true,
            };
        return new Response(JSON.stringify(body), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        });
      }),
    );
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    document.body.replaceChildren();
  });

  it('renders the word card outside a transformed reader page', async () => {
    const transformedPage = document.createElement('div');
    transformedPage.style.transform = 'translateX(0)';
    document.body.append(transformedPage);
    const root = createRoot(transformedPage);

    await act(async () => {
      root.render(<WordReader paragraphs={['Ово је кућа.']} />);
    });
    const word = [...transformedPage.querySelectorAll<HTMLElement>('[data-reader-word]')]
      .find((element) => element.textContent === 'кућа');
    expect(word).toBeTruthy();

    await act(async () => {
      word!.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });

    const dialog = document.body.querySelector<HTMLElement>('[role="dialog"]');
    expect(dialog).toBeTruthy();
    expect(dialog!.parentElement).toBe(document.body);
    expect(transformedPage.contains(dialog)).toBe(false);

    await act(async () => root.unmount());
  });

  it('renders the phrase toolbar outside a transformed reader page', async () => {
    const transformedPage = document.createElement('div');
    transformedPage.style.transform = 'translateX(0)';
    document.body.append(transformedPage);
    const root = createRoot(transformedPage);

    await act(async () => {
      root.render(<WordReader paragraphs={['Ово је велика кућа.']} />);
    });
    const words = transformedPage.querySelectorAll<HTMLElement>('[data-reader-word]');
    const range = document.createRange();
    Object.defineProperty(range, 'getClientRects', {
      value: () => [new DOMRect(120, 160, 180, 28)],
    });
    range.setStart(words.item(0).firstChild!, 0);
    range.setEnd(words.item(2).firstChild!, words.item(2).textContent!.length);
    const selection = window.getSelection()!;
    selection.removeAllRanges();
    selection.addRange(range);

    await act(async () => {
      document.dispatchEvent(new Event('selectionchange'));
      await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
    });

    const toolbar = document.body.querySelector<HTMLElement>('[role="toolbar"]');
    expect(toolbar).toBeTruthy();
    expect(toolbar!.parentElement).toBe(document.body);
    expect(transformedPage.contains(toolbar)).toBe(false);

    selection.removeAllRanges();
    await act(async () => root.unmount());
  });
});
