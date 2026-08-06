import { afterEach, describe, expect, it, vi } from 'vitest';

import { fetchDefinition } from './definition';

afterEach(() => {
  vi.unstubAllGlobals();
});

const ENTRY = {
  headword: 'нихилѝзам',
  grammar: 'м',
  senses: [{ definition: 'потпуно одрицање свих друштвених норми' }],
  sourceTitle: 'Речник српскохрватскога књижевног језика',
  volume: 3,
  page: 796,
  url: 'https://srpskirecnik.com/odrednica/нихилизам/69c8',
};

describe('толкование слова', () => {
  it('спрашивает слово у сервера и отдаёт статью', async () => {
    const fetchMock = vi.fn(
      async (_input: RequestInfo | URL) =>
        new Response(JSON.stringify(ENTRY), { status: 200 }),
    );
    vi.stubGlobal('fetch', fetchMock);

    const definition = await fetchDefinition('nihilizam');

    expect(definition?.headword).toBe('нихилѝзам');
    // Источник обязан дойти до карточки: статья показывается как цитата.
    expect(definition?.sourceTitle).toContain('Речник');
    expect(definition?.url).toContain('srpskirecnik.com');
    expect(String(fetchMock.mock.calls[0]?.[0])).toContain(
      `word=${encodeURIComponent('nihilizam')}`,
    );
  });

  // Слова в толковом словаре может не быть — это обычный исход, и карточка
  // просто не появляется. Ошибку наверх пускать нельзя: перевод уже показан.
  it('возвращает null, когда слова в словаре нет', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response(JSON.stringify({ error: 'not_found' }), { status: 404 })),
    );

    await expect(fetchDefinition('abrakadabra')).resolves.toBeNull();
  });

  // Карточка не должна падать на неполном ответе: словарь чужой, а ронять из-за
  // него чтение нельзя.
  it('считает статью без значений отсутствующей', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response(JSON.stringify({ headword: 'нешто' }), { status: 200 })),
    );

    await expect(fetchDefinition('nešto')).resolves.toBeNull();
  });

  it('не ходит на сервер за пустым словом', async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);

    await expect(fetchDefinition('   ')).resolves.toBeNull();
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
