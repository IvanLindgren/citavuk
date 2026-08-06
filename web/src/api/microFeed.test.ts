import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  getMicroFeed,
  microFeedVisitorToken,
  recordMicroFeedInteraction,
} from './microFeed';

afterEach(() => {
  vi.unstubAllGlobals();
  localStorage.clear();
});

const SIGNED = 'v1.33333333-3333-4333-8333-333333333333.podpis';

describe('micro-feed anonymous identity', () => {
  it('stores the token the server issued', async () => {
    // Ответ создаётся на каждый вызов: тело Response читается ровно один раз.
    const fetchMock = vi.fn(async (..._args: unknown[]) => new Response(
      JSON.stringify({ items: [], strategy: 'cold', visitorToken: SIGNED }),
      { status: 200 },
    ));
    vi.stubGlobal('fetch', fetchMock);

    expect(microFeedVisitorToken()).toBe('');
    await getMicroFeed([]);
    expect(microFeedVisitorToken()).toBe(SIGNED);

    // Идентификатор больше не придумывает браузер: первый запрос уходит без
    // него, а дальше в ход идёт то, что подписал сервер.
    expect(String(fetchMock.mock.calls[0]![0])).not.toContain('visitorToken');
    await getMicroFeed([]);
    expect(String(fetchMock.mock.calls[1]![0])).toContain(
      `visitorToken=${encodeURIComponent(SIGNED)}`,
    );
  });

  it('sends exclusions and dwell time without a browser fingerprint', async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(new Response(
        JSON.stringify({ items: [], strategy: 'cold', visitorToken: SIGNED }),
        { status: 200 },
      ))
      .mockResolvedValueOnce(new Response(null, { status: 204 }));
    vi.stubGlobal('fetch', fetchMock);

    await getMicroFeed(['11111111-1111-4111-8111-111111111111']);
    await recordMicroFeedInteraction('22222222-2222-4222-8222-222222222222', 'quick_skip', 940.4);

    expect(String(fetchMock.mock.calls[0]![0])).toContain('exclude=11111111-1111-4111-8111-111111111111');
    const interaction = fetchMock.mock.calls[1]![1] as RequestInit;
    const body = JSON.parse(String(interaction.body));
    expect(body).toMatchObject({ event: 'quick_skip', dwellMs: 940 });
    expect(body.visitorToken).toBe(SIGNED);
    expect(body).not.toHaveProperty('ip');
  });

  it('does not report actions before the server issued a token', async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);

    await recordMicroFeedInteraction('22222222-2222-4222-8222-222222222222', 'like');

    // Учитывать действие не за кем — запрос слать незачем.
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
