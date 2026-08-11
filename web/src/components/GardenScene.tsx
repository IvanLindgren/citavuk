import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import type { GardenPlant, GardenSpecies } from '../api/garden';
import { playGardenSound, unlockGardenAudio } from '../garden/audio';
import { GARDEN } from '../garden/strings';
import { isBlooming, projectedGrowth } from '../garden/scene';
import { GardenBed } from './GardenBed';

interface Props {
  slots: number;
  plants: GardenPlant[];
  catalog: GardenSpecies[];
  /** Когда пришёл ответ сервера: от него отсчитывается живой рост. */
  fetchedAt: number;
  /** Грядка, которую сейчас поливают: к ней идёт садовник. */
  watering?: number | null;
  decorations?: string[];
  soundEnabled?: boolean;
  onBed?: (slot: number, plant?: GardenPlant) => void;
}

interface Point {
  x: number;
  y: number;
}

interface Destination extends Point {
  action?: () => void;
}

const BED_POINTS: Point[] = [
  { x: 39, y: 43 }, { x: 51, y: 43 }, { x: 63, y: 43 }, { x: 75, y: 43 },
  { x: 39, y: 61 }, { x: 51, y: 61 }, { x: 63, y: 61 }, { x: 75, y: 61 },
  { x: 39, y: 79 }, { x: 51, y: 79 }, { x: 63, y: 79 }, { x: 75, y: 79 },
];

export function GardenScene({
  slots,
  plants,
  catalog,
  fetchedAt,
  watering = null,
  decorations = [],
  soundEnabled = true,
  onBed,
}: Props) {
  const now = useNow(1000);
  const gust = useGust();
  const sceneRef = useRef<HTMLDivElement>(null);
  const { player, moving, facing, moveTo } = useGardenMovement(sceneRef);

  useEffect(() => {
    if (!moving || !soundEnabled) return;
    playGardenSound('step');
    const timer = window.setInterval(() => playGardenSound('step'), 310);
    return () => window.clearInterval(timer);
  }, [moving, soundEnabled]);

  useEffect(() => {
    if (watering !== null) playGardenSound('water', soundEnabled);
  }, [soundEnabled, watering]);

  const bySlot = useMemo(() => {
    const map = new Map<number, GardenPlant>();
    for (const plant of plants) map.set(plant.slot, plant);
    return map;
  }, [plants]);

  const goToBed = useCallback(
    (slot: number, plant: GardenPlant | undefined) => {
      if (!onBed) return;
      unlockGardenAudio();
      const point = bedPoint(slot, slots);
      moveTo({ x: point.x, y: Math.min(90, point.y + 9), action: () => onBed(slot, plant) });
    },
    [moveTo, onBed, slots],
  );

  return (
    <div
      ref={sceneRef}
      tabIndex={0}
      role="application"
      aria-label="Башта Читавука. Нажмите на место, куда должен подойти Читавук. На компьютере также работают стрелки и WASD."
      className={`garden-world relative size-full min-h-[520px] overflow-hidden focus:outline-none ${
        gust ? 'garden-gust' : ''
      }`}
      onPointerDown={(event) => {
        unlockGardenAudio();
        if ((event.target as HTMLElement).closest('button')) return;
        const bounds = event.currentTarget.getBoundingClientRect();
        moveTo({
          x: ((event.clientX - bounds.left) / bounds.width) * 100,
          y: ((event.clientY - bounds.top) / bounds.height) * 100,
        });
      }}
    >
      <div className="garden-world__path" aria-hidden />
      <div className="garden-world__pond" aria-hidden />
      <WorldSprite name="house" className="left-[2%] top-[2%] w-[25%] max-w-60" />
      <WorldSprite name="grove" className="right-[-1%] top-[1%] w-[25%] max-w-64" />
      <WorldSprite name="grove" className="bottom-[-2%] left-[-2%] w-[22%] max-w-56" />
      <WorldSprite name="fountain" className="right-[8%] top-[22%] w-[9%] max-w-24" />
      <WorldSprite name="bench" className="left-[18%] top-[42%] w-[8%] max-w-20" />
      <WorldSprite name="campfire" className="bottom-[8%] right-[6%] w-[7%] max-w-16" />
      {decorations.includes('berry-bushes') && (
        <WorldSprite name="bushes" className="right-[1%] top-[52%] w-[24%] max-w-60" />
      )}
      <WorldSprite name="fence" className="left-[26%] top-[23%] w-[10%] max-w-24" />
      <WorldSprite name="signs" className="bottom-[1%] right-[18%] w-[13%] max-w-32" />

      <div className="garden-world__field" aria-hidden />
      {Array.from({ length: slots }, (_, slot) => {
        const point = bedPoint(slot, slots);
        const plant = bySlot.get(slot);
        const species = plant
          ? catalog.find((item) => item.id === plant.species)
          : undefined;
        const growth = plant ? projectedGrowth(plant, now - fetchedAt) : undefined;

        return (
          <div
            key={slot}
            className="garden-world__bed absolute h-[16%] w-[11%] min-w-14 max-w-28 -translate-x-1/2 -translate-y-1/2"
            style={{ left: `${point.x}%`, top: `${point.y}%`, zIndex: Math.round(point.y) }}
          >
            <GardenBed
              slot={slot}
              growth={species ? growth : undefined}
              species={species}
              seedIndex={Math.max(0, catalog.findIndex((item) => item.id === plant?.species))}
              watering={watering === slot}
              onAct={onBed ? () => goToBed(slot, plant) : undefined}
              actionLabel={
                !plant
                  ? GARDEN.plant.sr
                  : growth !== undefined && isBlooming(growth)
                    ? GARDEN.practise.sr
                    : GARDEN.water.sr
              }
            />
          </div>
        );
      })}

      <span
        aria-hidden
        className="garden-game-player pointer-events-none absolute"
        style={{
          left: `${player.x}%`,
          top: `${player.y}%`,
          zIndex: Math.round(player.y) + 2,
        }}
      >
        <span
          className={`garden-game-player__sprite ${moving ? 'garden-game-player__sprite--walking' : ''} ${
            watering !== null ? 'garden-game-player__sprite--watering' : ''
          }`}
          style={{ '--garden-facing': facing } as React.CSSProperties}
        />
      </span>
    </div>
  );
}

function WorldSprite({ name, className }: { name: string; className: string }) {
  return (
    <img
      src={`/img/garden/world/${name}.webp`}
      alt=""
      draggable={false}
      className={`garden-pixel-art pointer-events-none absolute z-10 h-auto select-none ${className}`}
    />
  );
}

function useGardenMovement(sceneRef: React.RefObject<HTMLDivElement | null>) {
  const [player, setPlayer] = useState<Point>({ x: 24, y: 76 });
  const playerRef = useRef(player);
  const destination = useRef<Destination | null>(null);
  const pressed = useRef(new Set<string>());
  const [moving, setMoving] = useState(false);
  const [facing, setFacing] = useState(1);

  const moveTo = useCallback(
    (point: Destination) => {
      destination.current = { x: clamp(point.x, 5, 95), y: clamp(point.y, 25, 91), action: point.action };
      sceneRef.current?.focus({ preventScroll: true });
    },
    [sceneRef],
  );

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
      let dx = Number(keys.has('right')) - Number(keys.has('left'));
      let dy = Number(keys.has('down')) - Number(keys.has('up'));
      let next = playerRef.current;
      let active = dx !== 0 || dy !== 0;

      if (active) {
        const length = Math.hypot(dx, dy) || 1;
        dx /= length;
        dy /= length;
        next = {
          x: clamp(next.x + dx * 25 * elapsed, 5, 95),
          y: clamp(next.y + dy * 25 * elapsed, 25, 91),
        };
      } else if (destination.current) {
        const target = destination.current;
        const gapX = target.x - next.x;
        const gapY = target.y - next.y;
        const distance = Math.hypot(gapX, gapY);
        if (distance < 0.8) {
          next = { x: target.x, y: target.y };
          destination.current = null;
          target.action?.();
        } else {
          active = true;
          const step = Math.min(distance, 28 * elapsed);
          dx = gapX / distance;
          dy = gapY / distance;
          next = { x: next.x + dx * step, y: next.y + dy * step };
        }
      }

      if (next !== playerRef.current) {
        playerRef.current = next;
        setPlayer(next);
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

  return { player, moving, facing, moveTo };
}

function bedPoint(slot: number, slots: number): Point {
  if (BED_POINTS[slot]) return BED_POINTS[slot];
  const columns = Math.min(6, Math.max(1, Math.ceil(Math.sqrt(slots))));
  const row = Math.floor(slot / columns);
  const column = slot % columns;
  return { x: 38 + column * 10, y: 43 + row * 17 };
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
  return target instanceof HTMLElement && Boolean(target.closest('input, textarea, select, [contenteditable="true"]'));
}

function clamp(value: number, minimum: number, maximum: number): number {
  return Math.min(maximum, Math.max(minimum, value));
}

/** Тик раз в секунду. Скрытая вкладка не считается: сад никто не смотрит. */
function useNow(intervalMs: number): number {
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    let timer = 0;
    const tick = () => setNow(Date.now());
    const start = () => {
      stop();
      if (typeof document !== 'undefined' && document.hidden) return;
      timer = window.setInterval(tick, intervalMs);
    };
    const stop = () => {
      if (timer) window.clearInterval(timer);
      timer = 0;
    };
    const onVisibility = () => {
      tick();
      start();
    };
    start();
    document.addEventListener('visibilitychange', onVisibility);
    return () => {
      stop();
      document.removeEventListener('visibilitychange', onVisibility);
    };
  }, [intervalMs]);

  return now;
}

/** Раз в полминуты по полю проходит ветер. */
function useGust(): boolean {
  const [gust, setGust] = useState(false);
  const timers = useRef<number[]>([]);

  useEffect(() => {
    const interval = window.setInterval(() => {
      setGust(true);
      timers.current.push(window.setTimeout(() => setGust(false), 4200));
    }, 32_000);
    return () => {
      window.clearInterval(interval);
      for (const timer of timers.current) window.clearTimeout(timer);
      timers.current = [];
    };
  }, []);

  return gust;
}
