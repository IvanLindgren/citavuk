import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  getMicroFeed,
  microFeedVisitorId,
  recordMicroFeedInteraction,
} from './microFeed';

afterEach(() => {
  vi.unstubAllGlobals();
  localStorage.clear();
});

describe('micro-feed anonymous identity', () => {
  it('keeps one valid UUID in local storage', () => {
    const first = microFeedVisitorId();
    const second = microFeedVisitorId();
    expect(second).toBe(first);
    expect(first).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i);
  });

  it('sends exclusions and dwell time without a browser fingerprint', async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(new Response(JSON.stringify({ items: [], strategy: 'cold' }), { status: 200 }))
      .mockResolvedValueOnce(new Response(null, { status: 204 }));
    vi.stubGlobal('fetch', fetchMock);

    await getMicroFeed(['11111111-1111-4111-8111-111111111111']);
    await recordMicroFeedInteraction('22222222-2222-4222-8222-222222222222', 'quick_skip', 940.4);

    expect(String(fetchMock.mock.calls[0]![0])).toContain('exclude=11111111-1111-4111-8111-111111111111');
    const interaction = fetchMock.mock.calls[1]![1] as RequestInit;
    const body = JSON.parse(String(interaction.body));
    expect(body).toMatchObject({ event: 'quick_skip', dwellMs: 940 });
    expect(body.visitorId).toBe(microFeedVisitorId());
    expect(body).not.toHaveProperty('ip');
  });
});
