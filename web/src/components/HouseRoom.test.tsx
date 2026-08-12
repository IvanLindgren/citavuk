import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { RouterProvider } from '../lib/router';
import { HouseRoom } from './HouseRoom';

/**
 * Дом проверяется целиком: нажали вещь — Читавук дошёл — вещь назвалась и
 * сделала своё. Кадры крутятся вручную, как в walk.test.tsx: на настоящем
 * requestAnimationFrame тест зависел бы от скорости ходьбы.
 */
let host: HTMLDivElement;
let root: ReturnType<typeof createRoot>;
let frames: FrameRequestCallback[];
let clock: number;

function walk(seconds = 8): void {
  for (let index = 0; index < seconds * 60; index += 1) {
    const pending = frames;
    frames = [];
    clock += 16;
    act(() => {
      for (const frame of pending) frame(clock);
    });
  }
}

function pick(label: string): HTMLButtonElement {
  const button = [...host.querySelectorAll('button')].find((item) =>
    item.getAttribute('aria-label')?.startsWith(label),
  );
  if (!button) throw new Error(`в комнате нет вещи «${label}»`);
  return button as HTMLButtonElement;
}

function render(element: React.ReactElement) {
  act(() => root.render(<RouterProvider>{element}</RouterProvider>));
}

beforeEach(() => {
  frames = [];
  clock = 0;
  vi.stubGlobal('requestAnimationFrame', (callback: FrameRequestCallback) => {
    frames.push(callback);
    return frames.length;
  });
  vi.stubGlobal('cancelAnimationFrame', () => undefined);
  vi.spyOn(performance, 'now').mockImplementation(() => clock);
  host = document.createElement('div');
  document.body.append(host);
  root = createRoot(host);
});

afterEach(() => {
  act(() => root.unmount());
  host.remove();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('квартира Читавука', () => {
  it('дойдя до холодильника, показывает слово и что внутри', () => {
    render(<HouseRoom decorations={[]} catalog={[]} coins={0} onClose={vi.fn()} />);

    act(() => pick('фрижидер').click());
    walk();

    expect(host.querySelector('.garden-house__word')?.textContent).toContain('фрижидер');
    expect(host.textContent).toContain('јогурт');
  });

  /* Кухня за перегородкой: сюда Читавук доходит только через проход. */
  it('доска у кухни открывает обе азбуки', () => {
    render(<HouseRoom decorations={[]} catalog={[]} coins={0} onClose={vi.fn()} />);

    act(() => pick('табла').click());
    walk();

    expect(host.textContent).toContain('Ђ');
  });

  it('дверь выпускает во двор', () => {
    const onClose = vi.fn();
    render(<HouseRoom decorations={[]} catalog={[]} coins={0} onClose={onClose} />);

    act(() => pick('врата').click());
    walk(2);

    expect(onClose).toHaveBeenCalled();
  });

  it('некупленное появляется только после покупки', () => {
    render(<HouseRoom decorations={[]} catalog={[]} coins={0} onClose={vi.fn()} />);
    expect(() => pick('тепих')).toThrow();

    render(<HouseRoom decorations={['rug']} catalog={[]} coins={0} onClose={vi.fn()} />);
    expect(pick('тепих')).toBeTruthy();
  });
});
