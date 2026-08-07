import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { SentenceAnalysisPanel } from './SentenceAnalysisPanel';

describe('SentenceAnalysisPanel', () => {
  beforeEach(() => {
    (globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean })
      .IS_REACT_ACT_ENVIRONMENT = true;
    vi.stubGlobal(
      'fetch',
      vi.fn(async () =>
        new Response(
          JSON.stringify({
            sentence: 'Živim u kući.',
            tokens: [
              {
                index: 0,
                surface: 'Živim',
                start: 0,
                end: 6,
                lemma: 'živeti',
                upos: 'VERB',
                posShort: 'глагол',
                feats: { Tense: 'Pres' },
                known: true,
                translation: 'жить',
                chosenByContext: false,
              },
              {
                index: 1,
                surface: 'u',
                start: 7,
                end: 8,
                lemma: 'u',
                upos: 'ADP',
                posShort: 'предлог',
                feats: {},
                known: true,
                translation: 'в',
                chosenByContext: false,
              },
            ],
            chunks: [
              {
                kind: 'prep',
                head: 1,
                tokens: [1],
                text: 'u kući',
                case: 'Loc',
                caseName: 'Предложный/Местный (lokativ)',
                label: 'предлог «u» + предложный/местный падеж',
                note: 'в (где — место)',
              },
            ],
          }),
          { status: 200, headers: { 'Content-Type': 'application/json' } },
        ),
      ),
    );
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    document.body.replaceChildren();
  });

  it('opens automatically and places a colored part of speech above each word', async () => {
    const host = document.createElement('div');
    document.body.append(host);
    const root = createRoot(host);

    await act(async () => {
      root.render(<SentenceAnalysisPanel sentence="Živim u kući." defaultOpen />);
      await new Promise((resolve) => setTimeout(resolve, 0));
    });

    expect(host.textContent).toContain('Грамматический разбор');
    expect(host.textContent).toContain('глагол');
    expect(host.textContent).toContain('Živim');
    expect(host.textContent).toContain('предлог');
    expect(host.querySelector('[aria-label="Части речи во фразе"]')).toBeTruthy();
    const verb = [...host.querySelectorAll<HTMLElement>('[title]')].find((element) =>
      element.textContent?.includes('Živim'),
    );
    expect(verb?.className).toContain('border-[#dc2626]/35');

    await act(async () => root.unmount());
  });
});
