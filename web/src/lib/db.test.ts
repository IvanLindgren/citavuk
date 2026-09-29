import { afterEach, expect, it, vi } from 'vitest';

afterEach(() => { vi.unstubAllGlobals(); vi.useRealTimers(); });

it('прекращает зависшее открытие IndexedDB и закрывает опоздавшее соединение', async () => {
  vi.useFakeTimers();
  vi.resetModules();
  const close = vi.fn();
  const request = { onsuccess: null as null | (() => void), result: { close }, error: null };
  const open = vi.fn(() => request);
  vi.stubGlobal('indexedDB', { open });
  const { storageAvailable } = await import('./db');
  const available = storageAvailable();
  await vi.advanceTimersByTimeAsync(12001);
  expect(await available).toBe(false);
  request.onsuccess?.();
  expect(close).toHaveBeenCalledTimes(1);
  const retry = storageAvailable();
  request.onsuccess?.();
  expect(await retry).toBe(true);
  expect(open).toHaveBeenCalledTimes(2);
});
