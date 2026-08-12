import { useCallback, useEffect, useRef, useState } from 'react';

import { unlockGardenAudio } from './audio';
import type { Point } from './world';

/**
 * Ходьба Читавука.
 *
 * Одна и та же на дворе и в комнате: снаружи он ходит по земле между рекой и
 * нижним краем карты, внутри — по полу между стеной и порогом. Разница только в
 * границах, поэтому логика живёт здесь, а не в сцене.
 */
export interface WalkArea {
  minX: number;
  maxX: number;
  minY: number;
  maxY: number;
  /** Пикселей мира в секунду. */
  speed: number;
}

export interface Destination extends Point {
  action?: () => void;
}

export function useWalker(area: WalkArea, spawn: Point) {
  const [point, setPoint] = useState<Point>(spawn);
  const pointRef = useRef(point);
  const destination = useRef<Destination | null>(null);
  const pressed = useRef(new Set<string>());
  const areaRef = useRef(area);
  const [moving, setMoving] = useState(false);
  const [facing, setFacing] = useState(1);

  // Смена области — это другое место: старые координаты в нём ничего не значат.
  useEffect(() => {
    areaRef.current = area;
    destination.current = null;
    pointRef.current = spawn;
    setPoint(spawn);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [area]);

  const moveTo = useCallback((next: Destination) => {
    destination.current = { ...clampTo(areaRef.current, next), action: next.action };
  }, []);

  useEffect(() => {
    const down = (event: KeyboardEvent) => {
      if (isTyping(event.target)) return;
      const key = movementKey(event.key);
      if (!key) return;
      event.preventDefault();
      unlockGardenAudio();
      destination.current = null;
      pressed.current.add(key);
    };
    const up = (event: KeyboardEvent) => {
      const key = movementKey(event.key);
      if (key) pressed.current.delete(key);
    };
    window.addEventListener('keydown', down);
    window.addEventListener('keyup', up);
    return () => {
      window.removeEventListener('keydown', down);
      window.removeEventListener('keyup', up);
    };
  }, []);

  useEffect(() => {
    let frame = 0;
    let previous = performance.now();
    let wasMoving = false;
    const tick = (time: number) => {
      const elapsed = Math.min(40, time - previous) / 1000;
      previous = time;
      const keys = pressed.current;
      const bounds = areaRef.current;
      let dx = Number(keys.has('right')) - Number(keys.has('left'));
      let dy = Number(keys.has('down')) - Number(keys.has('up'));
      let next = pointRef.current;
      let active = dx !== 0 || dy !== 0;

      if (active) {
        const length = Math.hypot(dx, dy) || 1;
        dx /= length;
        dy /= length;
        next = clampTo(bounds, {
          x: next.x + dx * bounds.speed * elapsed,
          y: next.y + dy * bounds.speed * elapsed,
        });
      } else if (destination.current) {
        const target = destination.current;
        const gapX = target.x - next.x;
        const gapY = target.y - next.y;
        const distance = Math.hypot(gapX, gapY);
        if (distance < 2) {
          next = { x: target.x, y: target.y };
          destination.current = null;
          target.action?.();
        } else {
          active = true;
          const step = Math.min(distance, bounds.speed * 1.15 * elapsed);
          dx = gapX / distance;
          dy = gapY / distance;
          next = { x: next.x + dx * step, y: next.y + dy * step };
        }
      }

      if (next !== pointRef.current) {
        pointRef.current = next;
        setPoint(next);
      }
      if (dx !== 0) setFacing(dx < 0 ? -1 : 1);
      if (active !== wasMoving) {
        wasMoving = active;
        setMoving(active);
      }
      frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, []);

  return { point, moving, facing, moveTo };
}

function clampTo(area: WalkArea, point: Point): Point {
  return {
    x: clamp(point.x, area.minX, area.maxX),
    y: clamp(point.y, area.minY, area.maxY),
  };
}

function movementKey(key: string): 'left' | 'right' | 'up' | 'down' | null {
  switch (key.toLowerCase()) {
    case 'a':
    case 'arrowleft':
      return 'left';
    case 'd':
    case 'arrowright':
      return 'right';
    case 'w':
    case 'arrowup':
      return 'up';
    case 's':
    case 'arrowdown':
      return 'down';
    default:
      return null;
  }
}

function isTyping(target: EventTarget | null): boolean {
  return (
    target instanceof HTMLElement &&
    Boolean(target.closest('input, textarea, select, [contenteditable="true"]'))
  );
}

function clamp(value: number, minimum: number, maximum: number): number {
  return Math.min(maximum, Math.max(minimum, value));
}
