import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { useWalker, type WalkArea } from './walk';

/**
 * Ходьба живёт на requestAnimationFrame, поэтому кадры здесь крутятся вручную:
 * в скрытой вкладке браузер их замораживает, и на этом легко обмануться — в
 * фоновом окне Читавук честно стоит на месте.
 */
const AREA: WalkArea = { minX: 10, maxX: 200, minY: 20, maxY: 100, speed: 100 };

let host: HTMLDivElement;
let root: ReturnType<typeof createRoot>;
let frames: FrameRequestCallback[];
let clock: number;

function runFrames(count: number, stepMs = 16): void {
  for (let index = 0; index < count; index += 1) {
    const pending = frames;
    frames = [];
    clock += stepMs;
    act(() => {
      for (const frame of pending) frame(clock);
    });
  }
}

let api: ReturnType<typeof useWalker> | null = null;

function Walker({ area = AREA }: { area?: WalkArea }) {
  api = useWalker(area, { x: 50, y: 50 });
  return <span data-x={api.point.x} data-y={api.point.y} />;
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
  api = null;
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('ходьба Читавука', () => {
  it('доходит до цели и делает то, зачем шёл', () => {
    const arrived = vi.fn();
    act(() => root.render(<Walker />));

    act(() => api!.moveTo({ x: 150, y: 90, action: arrived }));
    runFrames(120);

    expect(arrived).toHaveBeenCalledTimes(1);
    expect(api!.point.x).toBeCloseTo(150, 0);
    expect(api!.point.y).toBeCloseTo(90, 0);
  });

  it('за пределы своей земли не выходит', () => {
    act(() => root.render(<Walker />));

    act(() => api!.moveTo({ x: 9999, y: -9999 }));
    runFrames(200);

    expect(api!.point.x).toBeLessThanOrEqual(AREA.maxX);
    expect(api!.point.y).toBeGreaterThanOrEqual(AREA.minY);
  });

  it('на пути к цели он идёт, а придя — останавливается', () => {
    act(() => root.render(<Walker />));

    act(() => api!.moveTo({ x: 150, y: 90 }));
    runFrames(3);
    expect(api!.moving).toBe(true);

    runFrames(150);
    expect(api!.moving).toBe(false);
  });

  it('цель отменяется шагом с клавиатуры: человек передумал', () => {
    const arrived = vi.fn();
    act(() => root.render(<Walker />));

    act(() => api!.moveTo({ x: 190, y: 95, action: arrived }));
    runFrames(2);
    act(() => {
      window.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowLeft' }));
    });
    runFrames(60);

    expect(arrived).not.toHaveBeenCalled();
    expect(api!.point.x).toBeLessThan(50);
  });
});
