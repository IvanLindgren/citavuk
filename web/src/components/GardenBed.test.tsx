import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { GardenBed } from './GardenBed';
import { growthHeight } from '../garden/scene';

const SUNCOKRET = {
  id: 'suncokret',
  serbian: 'сунцокрет',
  russian: 'подсолнух',
  price: 20,
  topic: 'grammar-a1-08',
  theme: 'винительный падеж',
  phrase: 'Волим сунцокрет.',
};

let host: HTMLDivElement;
let root: ReturnType<typeof createRoot>;

function render(element: React.ReactElement) {
  act(() => root.render(element));
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
  it('пустая лунка зовёт посадить', () => {
    const onAct = vi.fn();
    render(<GardenBed slot={3} onAct={onAct} actionLabel="Посади" />);
    const button = host.querySelector('button');
    expect(button?.getAttribute('aria-label')).toContain('Празна леја 4');
    act(() => button?.click());
    expect(onAct).toHaveBeenCalledOnce();
  });

  it('в чужом саду грядка не нажимается', () => {
    render(<GardenBed slot={0} />);
    expect(host.querySelector('button')?.disabled).toBe(true);
  });

  it('только что посаженное показано семенем, а не цветком', () => {
    render(<GardenBed slot={0} growth={0.2} species={SUNCOKRET} seedIndex={1} />);
    expect(host.querySelector('img')).toBeNull();
    expect(host.querySelector('button')?.getAttribute('aria-label')).toContain('семе');
  });

  it('растущий цветок занимает высоту по своему росту', () => {
    render(<GardenBed slot={0} growth={2.5} species={SUNCOKRET} />);
    const image = host.querySelector('img');
    expect(image?.getAttribute('src')).toBe('/img/garden/plant_suncokret.webp');
    expect(image?.style.height).toBe(`${growthHeight(2.5)}%`);
    // Между стадиями высота дробная — цветок растёт непрерывно.
    expect(image?.style.height).not.toBe(`${growthHeight(2)}%`);
  });

  it('качается вокруг основания стебля и стабильно для своей грядки', () => {
    render(<GardenBed slot={5} growth={3} species={SUNCOKRET} />);
    const sway = host.querySelector('.garden-sway') as HTMLElement | null;
    expect(sway).not.toBeNull();
    expect(sway?.style.getPropertyValue('--sway-duration')).toMatch(/^\d/);

    const first = sway?.style.getPropertyValue('--sway-delay');
    render(<GardenBed slot={5} growth={3.4} species={SUNCOKRET} />);
    const again = host.querySelector('.garden-sway') as HTMLElement | null;
    expect(again?.style.getPropertyValue('--sway-delay')).toBe(first);
  });

  it('распустившийся цветок вырастает во всю грядку', () => {
    render(<GardenBed slot={0} growth={5} species={SUNCOKRET} />);
    expect(host.querySelector('img')?.style.height).toBe('100%');
    expect(host.querySelector('.garden-sparkle')).not.toBeNull();
  });

  it('во время полива над грядкой капли', () => {
    render(<GardenBed slot={0} growth={2} species={SUNCOKRET} watering />);
    expect(host.querySelectorAll('.garden-drop').length).toBeGreaterThan(0);
  });

  it('без вида грядка не роняет сцену', () => {
    render(<GardenBed slot={0} growth={3} />);
    expect(host.querySelector('img')).toBeNull();
    expect(host.querySelector('button')).not.toBeNull();
  });
});
