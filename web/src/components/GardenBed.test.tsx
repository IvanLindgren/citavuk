import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { GardenBed } from './GardenBed';
import { RouterProvider } from '../lib/router';

const CATALOG = [
  {
    id: 'suncokret',
    serbian: 'сунцокрет',
    russian: 'подсолнух',
    price: 20,
    topic: 'grammar-a1-08',
    theme: 'винительный падеж',
    phrase: 'Волим сунцокрет.',
  },
];

function plant(overrides: Record<string, unknown> = {}) {
  return {
    slot: 0,
    species: 'suncokret',
    stage: 1,
    growth: 1.4,
    blooming: false,
    speed: 1,
    plantedAt: '2026-08-11T10:00:00Z',
    ...overrides,
  };
}

let host: HTMLDivElement;
let root: ReturnType<typeof createRoot>;

function render(element: React.ReactElement) {
  act(() => {
    root.render(<RouterProvider>{element}</RouterProvider>);
  });
}

beforeEach(() => {
  host = document.createElement('div');
  document.body.append(host);
  root = createRoot(host);
});

afterEach(() => {
  act(() => root.unmount());
  host.remove();
});

describe('грядка', () => {
  it('пустая грядка предлагает посадить', () => {
    const onPlant = vi.fn();
    render(
      <GardenBed slot={3} catalog={CATALOG} stages={5} busy={false} onPlant={onPlant} />,
    );
    const button = host.querySelector('button');
    expect(button?.textContent).toContain('Посади');
    act(() => button?.click());
    expect(onPlant).toHaveBeenCalledOnce();
  });

  it('в чужом саду сажать нельзя', () => {
    render(<GardenBed slot={0} catalog={CATALOG} stages={5} busy />);
    const button = host.querySelector('button');
    expect(button?.disabled).toBe(true);
    expect(button?.textContent).toContain('Празна леја');
  });

  it('растущий цветок показан частично и предлагает полив', () => {
    render(
      <GardenBed
        slot={0}
        plant={plant()}
        catalog={CATALOG}
        stages={5}
        busy={false}
        onWater={() => undefined}
      />,
    );
    const image = host.querySelector('img');
    expect(image?.getAttribute('src')).toBe('/img/garden/plant_suncokret.webp');
    // Росток занимает часть грядки: полная высота только у распустившегося.
    expect(image?.style.height).toBe('34%');
    expect(host.textContent).toContain('Залиј');
  });

  it('распустившийся цветок ведёт в свою тему, а не к лейке', () => {
    render(
      <GardenBed
        slot={0}
        plant={plant({ stage: 4, growth: 5, blooming: true })}
        catalog={CATALOG}
        stages={5}
        busy={false}
        onWater={() => undefined}
      />,
    );
    const link = host.querySelector('a');
    expect(link?.getAttribute('href')).toBe('/trainer?topic=grammar-a1-08');
    expect(host.textContent).not.toContain('Залиј');
    expect(host.querySelector('img')?.style.height).toBe('100%');
  });

  it('неизвестный вид не роняет грядку', () => {
    render(
      <GardenBed
        slot={0}
        plant={plant({ species: 'нет-такого' })}
        catalog={CATALOG}
        stages={5}
        busy={false}
      />,
    );
    expect(host.querySelector('img')).toBeNull();
  });
});
