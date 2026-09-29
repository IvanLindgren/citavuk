import { afterEach, expect, it, vi } from 'vitest';
import { apiResourceUrl, request, setToken } from './client';

afterEach(() => { vi.unstubAllGlobals(); vi.useRealTimers(); localStorage.clear(); sessionStorage.clear(); });

it('переносит только наши медиа на прокси API', () => {
  expect(apiResourceUrl('https://api.citavuk.ru/v1/micro-feed/abc/image')).toBe('/api/v1/micro-feed/abc/image');
  expect(apiResourceUrl('/audio/proxy?url=sample')).toBe('/api/audio/proxy?url=sample');
  expect(apiResourceUrl('https://api.citavuk.ru.example/image')).toBe('https://api.citavuk.ru.example/image');
});

it('отправляет вход и cookie-сессию через основной домен', async () => {
  const fetchMock = vi.fn().mockResolvedValue(new Response('{"id":"test"}', {status:200}));
  vi.stubGlobal('fetch', fetchMock);
  setToken('cookie');
  await request('/v1/auth/me');
  expect(fetchMock).toHaveBeenCalledWith('/api/v1/auth/me', expect.objectContaining({credentials:'include'}));
});

it('прерывает запрос, если заголовки пришли, а JSON завис', async () => {
  vi.useFakeTimers();
  vi.stubGlobal('fetch', vi.fn(async (_url: string, options: RequestInit) => ({
    ok: true,
    status: 200,
    text: () => new Promise<string>((_resolve, reject) => {
      options.signal?.addEventListener('abort', () => reject(new Error('aborted')), { once: true });
    }),
  })));
  const result = request('/v1/test', { timeoutMs: 100 }).catch(error => error);
  await vi.advanceTimersByTimeAsync(101);
  expect(await result).toMatchObject({ status: 0, message: 'Нет связи с сервером.' });
});
