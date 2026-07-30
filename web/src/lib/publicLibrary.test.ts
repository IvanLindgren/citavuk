import { afterEach, describe, expect, it, vi } from 'vitest';

import { loadPublicBook, loadPublicLibrary } from './publicLibrary';

describe('public library transport', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('catalog request does not download book texts', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ version: 1, generatedAt: 'x', items: [] }),
    });
    vi.stubGlobal('fetch', fetchMock);

    const result = await loadPublicLibrary(new AbortController().signal);

    expect(result.items).toEqual([]);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock).toHaveBeenCalledWith(
      '/public-library/catalog.json',
      expect.objectContaining({ cache: 'no-cache' }),
    );
  });

  it('selected text is fetched separately', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      text: async () => 'Ово је текст.',
    });
    vi.stubGlobal('fetch', fetchMock);

    const text = await loadPublicBook({
      id: 'book',
      title: 'Књига',
      author: 'Аутор',
      year: '1900',
      kind: 'Рассказ',
      genre: 'Реализм',
      level: 'A2',
      summary: '',
      coverUrl: '/cover.webp',
      textUrl: '/text.txt',
      sourceUrls: [],
      license: '',
      characters: 12,
    });

    expect(text).toBe('Ово је текст.');
    expect(fetchMock).toHaveBeenCalledWith('/text.txt', {
      signal: undefined,
    });
  });
});
