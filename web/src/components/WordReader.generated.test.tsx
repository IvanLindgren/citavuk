import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../state/sync', () => ({
  useSync: () => ({ sync: vi.fn() }),
}));

import { WordReader } from './WordReader';

/**
 * Разбор слова, которого нет в словаре форм.
 *
 * Начальную форму подсказывает нейросеть, падеж и склонение считает движок.
 * Читатель должен видеть разбор — и знать, что словарной статьи за ним нет.
 */

const BASE = {
  surface: 'šljakerima',
  lemma: 'šljaker',
  upos: 'NOUN',
  posFull: 'существительное',
  posShort: 'сущ.',
  feats: { Case: 'Dat', Number: 'Plur', Gender: 'Masc' },
  known: true,
  facts: [{ label: 'падеж', value: 'дательный' }],
  summary: 'существительное, дательный падеж',
  why: 'Дательный падеж отвечает на вопрос «кому».',
  paradigms: [],
};

function stubFetch(analysis: unknown) {
  vi.stubGlobal(
    'fetch',
    vi.fn(async (input: RequestInfo | URL) => {
      const path = String(input);
      let body: unknown = { text: 'работягам', sentence: '', provider: 'test', cached: false };
      if (path.includes('/v1/analyze')) body = analysis;
      if (path.includes('/v1/definition')) {
        return new Response(JSON.stringify({ error: 'not_found' }), { status: 404 });
      }
      return new Response(JSON.stringify(body), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      });
    }),
  );
}

async function openCard(): Promise<HTMLElement> {
  const page = document.createElement('div');
  document.body.append(page);
  const root = createRoot(page);
  await act(async () => {
    root.render(<WordReader paragraphs={['Pomaže šljakerima.']} />);
  });
  const word = [...page.querySelectorAll<HTMLElement>('[data-reader-word]')].find(
    (element) => element.textContent === 'šljakerima',
  );
  await act(async () => {
    word!.dispatchEvent(new MouseEvent('click', { bubbles: true }));
  });
  for (let tick = 0; tick < 10; tick += 1) {
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 0));
    });
  }
  return document.body;
}

describe('разбор по подсказке нейросети', () => {
  beforeEach(() => {
    (
      globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }
    ).IS_REACT_ACT_ENVIRONMENT = true;
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    document.body.replaceChildren();
  });

  it('показывает разбор и предупреждает, что словарной статьи нет', async () => {
    stubFetch({ ...BASE, generated: true });
    const card = await openCard();

    expect(card.textContent).toContain('дательный');
    expect(card.textContent).toContain('начальную форму подсказала');
    // Прежнее «разбора и склонения не будет» должно уйти: разбор теперь есть.
    expect(card.textContent).not.toContain('склонение не будет');
  });

  it('не приписывает нейросеть обычному словарному разбору', async () => {
    stubFetch(BASE);
    const card = await openCard();

    expect(card.textContent).toContain('дательный');
    expect(card.textContent).not.toContain('нейросеть');
  });
});
