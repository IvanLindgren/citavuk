import { describe, expect, it, vi } from 'vitest';

import { installChunkRecovery } from './chunkRecovery';

function memoryStorage() {
  const values = new Map<string, string>();
  return {
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => values.set(key, value),
    removeItem: (key: string) => values.delete(key),
  };
}

describe('chunk recovery', () => {
  it('reloads once when a lazy page belongs to the previous deployment', () => {
    const reload = vi.fn();
    const storage = memoryStorage();
    const cleanup = installChunkRecovery({
      reload,
      storage,
      now: () => 1000,
      path: () => '/course/lesson/l_pismo_1',
    });

    const first = new Event('vite:preloadError', { cancelable: true });
    window.dispatchEvent(first);
    expect(first.defaultPrevented).toBe(true);
    expect(reload).toHaveBeenCalledTimes(1);

    const second = new Event('vite:preloadError', { cancelable: true });
    window.dispatchEvent(second);
    expect(second.defaultPrevented).toBe(false);
    expect(reload).toHaveBeenCalledTimes(1);

    cleanup();
  });

  it('allows another recovery attempt after the guard window', () => {
    const reload = vi.fn();
    const storage = memoryStorage();
    let now = 1000;
    const cleanup = installChunkRecovery({
      reload,
      storage,
      now: () => now,
      path: () => '/course',
    });

    window.dispatchEvent(new Event('vite:preloadError', { cancelable: true }));
    now += 31_000;
    window.dispatchEvent(new Event('vite:preloadError', { cancelable: true }));

    expect(reload).toHaveBeenCalledTimes(2);
    cleanup();
  });
});
