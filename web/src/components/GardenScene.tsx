import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import type { GardenPlant, GardenSpecies } from '../api/garden';
import { playGardenSound, unlockGardenAudio } from '../garden/audio';
import { GARDEN, WORLD } from '../garden/strings';
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
  weather?: 'clear' | 'rain';
  /** Река течёт: в неё можно зайти за водой. */
  river?: boolean;
  onBed?: (slot: number, plant?: GardenPlant) => void;
  onRiver?: () => void;
}

interface Point {
  x: number;
  y: number;
}

interface Destination extends Point {
  action?: () => void;
}

interface WorldItem {
  name: keyof typeof WORLD | string;
  sprite: string;
  x: number;
  y: number;
  /** Предмет без подписи: забор и цветочки в траве — фон, а не слово. */
  quiet?: boolean;
}

/**
 * Мир расставлен вручную. Раньше дом, роща и фонтан жались к четырём углам, а
 * между ними лежало пустое поле — отсюда и ощущение безжизненности. Теперь у
 * карты есть берег наверху, двор с домом и магазином слева и роща по краям.
 */
const WORLD_ITEMS: WorldItem[] = [
  { name: 'house', sprite: 'house', x: 12, y: 56 },
  { name: 'fence', sprite: 'fence', x: 24, y: 60, quiet: true },
  { name: 'pots', sprite: 'pots', x: 8, y: 62, quiet: true },
  { name: 'stall', sprite: 'stall', x: 27, y: 72 },
  { name: 'sign', sprite: 'sign', x: 34, y: 52 },
  { name: 'fountain', sprite: 'fountain', x: 60, y: 42 },
  { name: 'fir', sprite: 'fir', x: 88, y: 44 },
  { name: 'tree', sprite: 'tree', x: 96, y: 60 },
  { name: 'tree', sprite: 'tree_small', x: 4, y: 82 },
  { name: 'tree', sprite: 'tree', x: 94, y: 92 },
  { name: 'campfire', sprite: 'campfire', x: 22, y: 92 },
  { name: 'flowers', sprite: 'flowers', x: 66, y: 96, quiet: true },
  { name: 'flowers', sprite: 'flowers', x: 14, y: 70, quiet: true },
  { name: 'flowers', sprite: 'flowers', x: 36, y: 94, quiet: true },
];

const BED_POINTS: Point[] = [
  { x: 44, y: 56 }, { x: 57, y: 56 }, { x: 70, y: 56 }, { x: 83, y: 56 },
  { x: 44, y: 71 }, { x: 57, y: 71 }, { x: 70, y: 71 }, { x: 83, y: 71 },
  { x: 44, y: 86 }, { x: 57, y: 86 }, { x: 70, y: 86 }, { x: 83, y: 86 },
];

/** Берег реки: ниже него начинается ходячая часть карты. */
const SHORE = 32;
const RIVER_LABEL: Point = { x: 58, y: 26 };

export function GardenScene({
  slots,
  plants,
  catalog,
  fetchedAt,
  watering = null,
  decorations = [],
  soundEnabled = true,
  weather = 'clear',
  river = false,
  onBed,
  onRiver,
}: Props) {
  const now = useNow(1000);
  const gust = useGust();
  const sceneRef = useRef<HTMLDivElement>(null);
  const scale = useSceneScale(sceneRef);
  const night = useNight();
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
      moveTo({ x: point.x, y: Math.min(92, point.y + 7), action: () => onBed(slot, plant) });
    },
    [moveTo, onBed, slots],
  );

  const goToRiver = useCallback(() => {
    if (!onRiver) return;
    unlockGardenAudio();
    moveTo({ x: player.x, y: SHORE + 2, action: onRiver });
  }, [moveTo, onRiver, player.x]);

  // Подпись показывается у того предмета, к которому подошёл Читавук. Держать
  // подписи включёнными у всех сразу нельзя: карта превращается в список слов.
  const nearby = useMemo(() => nearestItem(player), [player]);
  const nearRiver = player.y <= SHORE + 6;

  return (
    <div
      ref={sceneRef}
      tabIndex={0}
      role="application"
      aria-label="Башта Читавука. Нажмите на место, куда должен подойти Читавук. На компьютере также работают стрелки и WASD."
      className={`garden-world relative size-full min-h-[520px] overflow-hidden focus:outline-none ${
        gust ? 'garden-gust' : ''
      } ${night ? 'garden-world--night' : ''} ${weather === 'rain' ? 'garden-world--rain' : ''}`}
      style={{ '--gs': scale } as React.CSSProperties}
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
      <div className="garden-world__grass" aria-hidden />
      <button
        type="button"
        className={`garden-world__river ${river ? 'garden-world__river--flowing' : ''}`}
        onClick={goToRiver}
        disabled={!onRiver}
        aria-label={`${GARDEN.fill.sr} — ${GARDEN.fill.ru}`}
      >
        <img
          src="/img/garden/world/duck.webp"
          alt=""
          draggable={false}
          className="garden-world__duck garden-pixel-art"
        />
      </button>

      {WORLD_ITEMS.map((item, index) => (
        <WorldSprite key={`${item.sprite}-${index}`} item={item} />
      ))}
      {decorations.includes('berry-bushes') && (
        <WorldSprite item={{ name: 'bushes', sprite: 'bushes', x: 88, y: 68 }} />
      )}

      {Array.from({ length: slots }, (_, slot) => {
        const point = bedPoint(slot, slots);
        const plant = bySlot.get(slot);
        const species = plant
          ? catalog.find((item) => item.id === plant.species)
          : undefined;
        const growth = plant ? projectedGrowth(plant, now - fetchedAt) : undefined;
        const blooming = growth !== undefined && isBlooming(growth);

        return (
          <div
            key={slot}
            className="garden-world__bed absolute -translate-x-1/2 -translate-y-full"
            style={{ left: `${point.x}%`, top: `${point.y}%`, zIndex: Math.round(point.y) }}
          >
            <GardenBed
              slot={slot}
              growth={species ? growth : undefined}
              species={species}
              watering={watering === slot}
              onAct={onBed ? () => goToBed(slot, plant) : undefined}
              actionLabel={
                !plant ? GARDEN.plant.sr : blooming ? GARDEN.cut.sr : GARDEN.water.sr
              }
            />
            {blooming && <Bee />}
          </div>
        );
      })}

      {nearby && <WorldLabel item={nearby} />}
      {nearRiver && (
        <span
          className="garden-world__label"
          style={{ left: `${RIVER_LABEL.x}%`, top: `${RIVER_LABEL.y}%`, zIndex: 118 }}
        >
          <b>{WORLD.river?.sr}</b>
          <i>{WORLD.river?.ru}</i>
        </span>
      )}

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

      {weather === 'rain' && <span aria-hidden className="garden-world__rain" />}
    </div>
  );
}

function WorldSprite({ item }: { item: WorldItem }) {
  return (
    <span
      aria-hidden
      className="garden-world__item pointer-events-none absolute"
      style={{ left: `${item.x}%`, top: `${item.y}%`, zIndex: Math.round(item.y) }}
    >
      <img
        src={`/img/garden/world/${item.sprite}.webp`}
        alt=""
        draggable={false}
        className="garden-pixel-art block select-none"
      />
    </span>
  );
}

/** Сербское название предмета с русским пояснением: без него A1 заперт. */
function WorldLabel({ item }: { item: WorldItem }) {
  const phrase = WORLD[item.name];
  if (!phrase) return null;
  return (
    <span
      className="garden-world__label"
      style={{ left: `${item.x}%`, top: `${item.y}%`, zIndex: Math.round(item.y) + 3 }}
    >
      <b>{phrase.sr}</b>
      <i>{phrase.ru}</i>
    </span>
  );
}

/** Пчела кружит над распустившимся цветком: цветение видно издалека. */
function Bee() {
  return <span aria-hidden className="garden-bee" />;
}

function nearestItem(player: Point): WorldItem | null {
  let best: WorldItem | null = null;
  let bestDistance = 11;
  for (const item of WORLD_ITEMS) {
    if (item.quiet) continue;
    const distance = Math.hypot(item.x - player.x, item.y - player.y);
    if (distance < bestDistance) {
      bestDistance = distance;
      best = item;
    }
  }
  return best;
}

function useGardenMovement(sceneRef: React.RefObject<HTMLDivElement | null>) {
  const [player, setPlayer] = useState<Point>({ x: 30, y: 74 });
  const playerRef = useRef(player);
  const destination = useRef<Destination | null>(null);
  const pressed = useRef(new Set<string>());
  const [moving, setMoving] = useState(false);
  const [facing, setFacing] = useState(1);

  const moveTo = useCallback(
    (point: Destination) => {
      destination.current = {
        x: clamp(point.x, 4, 96),
        y: clamp(point.y, SHORE + 2, 92),
        action: point.action,
      };
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
          x: clamp(next.x + dx * 25 * elapsed, 4, 96),
          y: clamp(next.y + dy * 25 * elapsed, SHORE + 2, 92),
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

/**
 * Целый множитель мира.
 *
 * Пиксельные спрайты растягивались долями ширины экрана: один и тот же пиксель
 * выходил то в два, то в три экранных, и картинка рябила. Множитель обязан быть
 * целым, поэтому он считается от ширины сцены и меняется ступенями.
 */
function useSceneScale(sceneRef: React.RefObject<HTMLDivElement | null>): number {
  const [scale, setScale] = useState(3);

  useEffect(() => {
    const node = sceneRef.current;
    if (!node || typeof ResizeObserver === 'undefined') return;
    const measure = () => {
      const width = node.clientWidth || 960;
      setScale(Math.max(2, Math.min(5, Math.round(width / 420))));
    };
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(node);
    return () => observer.disconnect();
  }, [sceneRef]);

  return scale;
}

function bedPoint(slot: number, slots: number): Point {
  if (BED_POINTS[slot]) return BED_POINTS[slot];
  const columns = Math.min(6, Math.max(1, Math.ceil(Math.sqrt(slots))));
  const row = Math.floor(slot / columns);
  const column = slot % columns;
  return { x: 41 + column * 13, y: 52 + row * 16 };
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

/**
 * Ночь считается по часам самого человека, а не по серверу: смысл в том, чтобы
 * сад темнел тогда же, когда темнеет за окном.
 */
function useNight(): boolean {
  const [night, setNight] = useState(() => isNight(new Date()));

  useEffect(() => {
    const timer = window.setInterval(() => setNight(isNight(new Date())), 60_000);
    return () => window.clearInterval(timer);
  }, []);

  return night;
}

function isNight(date: Date): boolean {
  const hour = date.getHours();
  return hour >= 21 || hour < 6;
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
