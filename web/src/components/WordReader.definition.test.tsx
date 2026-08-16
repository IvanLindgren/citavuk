import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../state/sync', () => ({
  useSync: () => ({ sync: vi.fn() }),
}));

import { WordReader } from './WordReader';

/**
 * Подпись под толкованием.
 *
 * Словарь Матице српске показывается как цитата — со ссылкой на статью. Слова,
 * которого в нём нет, объясняет нейросеть, и такое толкование обязано называть
 * себя: сочинённый текст под названием словаря — это уже приписывание чужому
 * изданию того, чего в нём нет.
 */

const ANALYSIS = {
  surface: 'фолирант',
  lemma: 'фолирант',
  upos: 'NOUN',
  posFull: 'существительное',
  posShort: 'сущ.',
  feats: {},
  known: true,
  facts: [],
  summary: '',
  why: '',
  paradigms: [],
};

const DICTIONARY_ENTRY = {
  headword: 'нихилѝзам',
  senses: [{ definition: 'потпуно одрицање' }],
  sourceTitle: 'Речник српскохрватскога књижевног језика',
  volume: 3,
  page: 796,
  url: 'https://srpskirecnik.com/odrednica/нихилизам/69c8',
};

const GENERATED_ENTRY = {
  headword: 'фолѝрант',
  senses: [{ definition: 'особа која се претвара да је нешто што није' }],
  sourceTitle: 'Объяснение составлено нейросетью',
  url: '',
  generated: true,
};

function stubFetch(definition: unknown) {
  vi.stubGlobal(
    'fetch',
    vi.fn(async (input: RequestInfo | URL) => {
      const path = String(input);
      let body: unknown = { text: 'позёр', sentence: '', provider: 'test', cached: false };
      if (path.includes('/v1/analyze')) body = ANALYSIS;
      if (path.includes('/v1/definition')) body = definition;
      return new Response(JSON.stringify(body), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      });
    }),
  );
}

/**
 * Открывает слово и возвращает всё показанное.
 *
 * Именно body, а не окно перевода: когда рядом есть место, толкование встаёт
 * отдельной карточкой сбоку, а на узком экране — внутри окна.
 */
async function openCard(): Promise<HTMLElement> {
  const page = document.createElement('div');
  document.body.append(page);
  const root = createRoot(page);
  await act(async () => {
    root.render(<WordReader paragraphs={['Он је фолирант.']} />);
  });
  const word = [...page.querySelectorAll<HTMLElement>('[data-reader-word]')].find(
    (element) => element.textContent === 'фолирант',
  );
  await act(async () => {
    word!.dispatchEvent(new MouseEvent('click', { bubbles: true }));
  });
  // Толкование догоняет разбор отдельным запросом: без прокрутки очереди
  // карточка успевает показать только перевод.
  for (let tick = 0; tick < 10; tick += 1) {
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 0));
    });
  }
  return document.body;
}

describe('подпись под толкованием', () => {
  beforeEach(() => {
    (
      globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }
    ).IS_REACT_ACT_ENVIRONMENT = true;
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    document.body.replaceChildren();
  });

  it('ставит ссылку на статью, когда слово нашлось в словаре', async () => {
    stubFetch(DICTIONARY_ENTRY);
    const dialog = await openCard();

    const link = dialog.querySelector<HTMLAnchorElement>('a[href*="srpskirecnik.com"]');
    expect(link?.textContent).toContain('Речник');
    expect(dialog.textContent).toContain('том 3');
  });

  it('называет нейросеть и не ссылается на словарь, когда слово сочинено', async () => {
    stubFetch(GENERATED_ENTRY);
    const dialog = await openCard();

    expect(dialog.textContent).toContain('Объяснение составлено нейросетью');
    expect(dialog.textContent).not.toContain('Речник српскохрватскога');
    // Ссылкой подпись быть не должна: статьи, на которую можно сослаться, не
    // существует, а пустая ссылка ведёт читателя на ту же страницу.
    const asLink = [...dialog.querySelectorAll('a')].find((element) =>
      element.textContent?.includes('Объяснение составлено'),
    );
    expect(asLink).toBeUndefined();
  });
});
