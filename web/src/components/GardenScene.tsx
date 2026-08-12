import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import type { GardenPlant, GardenSpecies } from '../api/garden';
import { playGardenSound, unlockGardenAudio } from '../garden/audio';
import { GARDEN, WORLD } from '../garden/strings';
import { isBlooming, projectedGrowth } from '../garden/scene';
import {
  BUSH_SPOT,
  SPRITES,
  pickLayout,
  worldScale,
  type Layout,
  type Point,
  type WorldItem,
} from '../garden/world';
import { useWalker } from '../garden/walk';
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
  onHouse?: () => void;
}

/** Дверь: столько мировых пикселей занимает вход в середине нижнего края дома. */
const DOOR: { w: number; h: number } = { w: 28, h: 38 };

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
  onHouse,
}: Props) {
  const now = useNow(1000);
  const gust = useGust();
  const sceneRef = useRef<HTMLDivElement>(null);
  const { layout, scale } = useWorldFit(sceneRef);
  const night = useNight();
  const area = useMemo(
    () => ({
      minX: 14,
      maxX: layout.w - 14,
      minY: layout.river + 4,
      maxY: layout.h - 6,
      // Шаг в мировых пикселях: карту любого размера Читавук проходит примерно
      // за одно и то же время.
      speed: layout.w / 6,
    }),
    [layout],
  );
  const { point: player, moving, facing, moveTo } = useWalker(area, layout.spawn);

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

  const items = useMemo(() => {
    const list = [...layout.items];
    if (decorations.includes('berry-bushes')) list.push(BUSH_SPOT[layout.id]);
    return list;
  }, [decorations, layout]);

  const goToBed = useCallback(
    (slot: number, plant: GardenPlant | undefined) => {
      if (!onBed) return;
      unlockGardenAudio();
      const point = bedPoint(layout, slot);
      moveTo({ x: point.x, y: point.y + 10, action: () => onBed(slot, plant) });
    },
    [layout, moveTo, onBed],
  );

  const goToRiver = useCallback(() => {
    if (!onRiver) return;
    unlockGardenAudio();
    moveTo({ x: player.x, y: layout.river + 4, action: onRiver });
  }, [layout.river, moveTo, onRiver, player.x]);

  const goToDoor = useCallback(() => {
    if (!onHouse) return;
    unlockGardenAudio();
    moveTo({ ...layout.door, action: onHouse });
  }, [layout.door, moveTo, onHouse]);

  // Подпись показывается у того предмета, к которому подошёл Читавук. Держать
  // подписи включёнными у всех сразу нельзя: карта превращается в список слов.
  const nearby = useMemo(() => nearestItem(items, player), [items, player]);
  const nearRiver = player.y <= layout.river + 12;
  const house = useMemo(() => items.find((item) => item.sprite === 'house'), [items]);

  return (
    <div
      ref={sceneRef}
      tabIndex={0}
      role="application"
      aria-label="Башта Читавука. Нажмите на место, куда должен подойти Читавук. На компьютере также работают стрелки и WASD."
      className={`garden-world relative grid size-full min-h-[420px] place-items-center overflow-hidden focus:outline-none ${
        gust ? 'garden-gust' : ''
      } ${night ? 'garden-world--night' : ''} ${weather === 'rain' ? 'garden-world--rain' : ''}`}
      style={{ '--gs': scale } as React.CSSProperties}
    >
      <div className="garden-world__grass" aria-hidden />

      <div
        className="garden-world__stage"
        style={{ width: layout.w * scale, height: layout.h * scale }}
        onPointerDown={(event) => {
          unlockGardenAudio();
          if ((event.target as HTMLElement).closest('button')) return;
          const bounds = event.currentTarget.getBoundingClientRect();
          moveTo({
            x: (event.clientX - bounds.left) / scale,
            y: (event.clientY - bounds.top) / scale,
          });
        }}
      >
        <button
          type="button"
          className={`garden-world__river ${river ? 'garden-world__river--flowing' : ''}`}
          style={{ height: layout.river * scale }}
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

        {items.map((item, index) => (
          <WorldSprite key={`${item.sprite}-${index}`} item={item} scale={scale} />
        ))}

        {/* Дверь: вход в дом, а не украшение — поэтому у неё своя кнопка. */}
        {house && onHouse && (
          <button
            type="button"
            className="garden-world__door"
            style={{
              left: (house.x - DOOR.w / 2) * scale,
              top: (house.y - DOOR.h) * scale,
              width: DOOR.w * scale,
              height: DOOR.h * scale,
              zIndex: Math.round(house.y) + 1,
            }}
            onClick={goToDoor}
            aria-label={`${GARDEN.enter.sr} — ${GARDEN.enter.ru}`}
            title={`${GARDEN.enter.sr} — ${GARDEN.enter.ru}`}
          />
        )}

        {Array.from({ length: slots }, (_, slot) => {
          const point = bedPoint(layout, slot);
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
              style={{ left: point.x * scale, top: point.y * scale, zIndex: Math.round(point.y) }}
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

        {nearby && <WorldLabel item={nearby} scale={scale} />}
        {nearRiver && (
          <span
            className="garden-world__label"
            style={{
              left: layout.w * scale * 0.5,
              top: layout.river * scale,
              zIndex: 118,
            }}
          >
            <b>{WORLD.river?.sr}</b>
            <i>{WORLD.river?.ru}</i>
          </span>
        )}

        <span
          aria-hidden
          className="garden-game-player pointer-events-none absolute"
          style={{
            left: player.x * scale,
            top: player.y * scale,
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

      {weather === 'rain' && (
        <span aria-hidden className="garden-world__rain">
          <span className="garden-world__rain-near" />
          <span className="garden-world__rain-splash" />
        </span>
      )}
    </div>
  );
}

function WorldSprite({ item, scale }: { item: WorldItem; scale: number }) {
  const sprite = SPRITES[item.sprite];
  return (
    <span
      aria-hidden
      className="garden-world__item pointer-events-none absolute"
      style={{ left: item.x * scale, top: item.y * scale, zIndex: Math.round(item.y) }}
    >
      <img
        src={`/img/garden/world/${item.sprite}.webp`}
        alt=""
        draggable={false}
        width={sprite?.w}
        height={sprite?.h}
        className="garden-pixel-art block select-none"
      />
    </span>
  );
}

/** Сербское название предмета с русским пояснением: без него A1 заперт. */
function WorldLabel({ item, scale }: { item: WorldItem; scale: number }) {
  const phrase = WORLD[item.name];
  if (!phrase) return null;
  const sprite = SPRITES[item.sprite] ?? { w: 16, h: 16 };
  return (
    <span
      className="garden-world__label"
      style={{
        left: item.x * scale,
        top: (item.y - Math.min(sprite.h, 72)) * scale,
        zIndex: Math.round(item.y) + 3,
      }}
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

function nearestItem(items: WorldItem[], player: Point): WorldItem | null {
  let best: WorldItem | null = null;
  let bestDistance = 46;
  for (const item of items) {
    if (item.quiet) continue;
    const distance = Math.hypot(item.x - player.x, item.y - player.y);
    if (distance < bestDistance) {
      bestDistance = distance;
      best = item;
    }
  }
  return best;
}

/**
 * Мир целиком помещается в сцену.
 *
 * Раскладка выбирается по форме экрана, а масштаб — по тому, сколько раз мир в
 * него влезает. Дробный масштаб мылит пиксели, поэтому он остаётся только там,
 * где целого не хватает: на маленьком телефоне.
 */
function useWorldFit(sceneRef: React.RefObject<HTMLDivElement | null>) {
  const [size, setSize] = useState({ width: 960, height: 600 });

  useEffect(() => {
    const node = sceneRef.current;
    if (!node || typeof ResizeObserver === 'undefined') return;
    // Пояс с инструментами и табличка сверху висят поверх сцены, поэтому мир
    // считает своей только ту высоту, которую они не закрывают: иначе нижний
    // ряд грядок оказывается под кнопками.
    const measure = () =>
      setSize({
        width: node.clientWidth || 960,
        height: Math.max(240, (node.clientHeight || 600) - 84),
      });
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(node);
    return () => observer.disconnect();
  }, [sceneRef]);

  const layout = useMemo(() => pickLayout(size.width, size.height), [size]);
  const scale = useMemo(
    () => worldScale(layout, size.width, size.height),
    [layout, size],
  );

  return { layout, scale };
}

function bedPoint(layout: Layout, slot: number): Point {
  const point = layout.beds[slot];
  if (point) return point;
  const columns = Math.max(1, Math.floor((layout.w - 32) / 44));
  const row = Math.floor(slot / columns);
  const column = slot % columns;
  return {
    x: 24 + column * 44,
    y: Math.min(layout.h - 8, layout.river + 60 + row * 34),
  };
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
