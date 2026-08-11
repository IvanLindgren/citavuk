import { useEffect, useMemo, useRef, useState } from 'react';

import type { GardenPlant, GardenSpecies } from '../api/garden';
import { GARDEN } from '../garden/strings';
import { bedPosition, bedRows, isBlooming, projectedGrowth } from '../garden/scene';
import { GardenBed } from './GardenBed';

interface Props {
  slots: number;
  plants: GardenPlant[];
  catalog: GardenSpecies[];
  /** Когда пришёл ответ сервера: от него отсчитывается живой рост. */
  fetchedAt: number;
  /** Грядка, которую сейчас поливают: к ней идёт садовник. */
  watering?: number | null;
  onBed?: (slot: number, plant?: GardenPlant) => void;
  /** Сколько грядок в ряду. На узком экране меньше. */
  perRow?: number;
}

export function GardenScene({
  slots,
  plants,
  catalog,
  fetchedAt,
  watering = null,
  onBed,
  perRow,
}: Props) {
  const now = useNow(1000);
  const auto = useColumns();
  const columns = perRow ?? auto;
  const rows = useMemo(() => bedRows(slots, columns), [slots, columns]);
  const gust = useGust();

  const bySlot = useMemo(() => {
    const map = new Map<number, GardenPlant>();
    for (const plant of plants) map.set(plant.slot, plant);
    return map;
  }, [plants]);

  return (
    <div
      className={`overflow-hidden rounded-3xl border border-[var(--line)] ${
        gust ? 'garden-gust' : ''
      }`}
      style={{
        background:
          'linear-gradient(180deg, color-mix(in srgb, var(--accent) 10%, transparent) 0%, transparent 45%), var(--bg-sunken)',
      }}
    >
      {rows.map((row, rowIndex) => (
        <div
          key={rowIndex}
          className="relative h-40 w-full sm:h-52"
          style={{ zIndex: rows.length - rowIndex }}
        >
          {row.map((slot, index) => {
            const plant = bySlot.get(slot);
            const species = plant
              ? catalog.find((item) => item.id === plant.species)
              : undefined;
            const growth = plant
              ? projectedGrowth(plant, now - fetchedAt)
              : undefined;
            return (
              <div
                key={slot}
                className="absolute bottom-6 h-[calc(100%-1.5rem)] w-24 -translate-x-1/2 sm:w-28"
                style={{ left: `${bedPosition(index, row.length)}%` }}
              >
                <GardenBed
                  slot={slot}
                  growth={species ? growth : undefined}
                  species={species}
                  seedIndex={Math.max(
                    0,
                    catalog.findIndex((item) => item.id === plant?.species),
                  )}
                  watering={watering === slot}
                  onAct={onBed ? () => onBed(slot, plant) : undefined}
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

          <Soil />

          {watering !== null && row.includes(watering) && (
            <Gardener position={bedPosition(row.indexOf(watering), row.length)} />
          )}
        </div>
      ))}
    </div>
  );
}

function Soil() {
  return (
    <div
      aria-hidden
      className="absolute bottom-0 h-6 w-full"
      style={{
        background:
          'repeating-linear-gradient(90deg, color-mix(in srgb, var(--machine) 50%, transparent) 0 10px, color-mix(in srgb, var(--machine) 30%, transparent) 10px 20px)',
        boxShadow: 'inset 0 3px 6px rgb(0 0 0 / 0.18)',
      }}
    />
  );
}

function Gardener({ position }: { position: number }) {
  return (
    <span
      aria-hidden
      className="garden-wolf garden-wolf--watering pointer-events-none absolute bottom-3 origin-bottom scale-[0.42] sm:scale-[0.55]"
      style={{
        left: `${position}%`,
        // Волк подходит к грядке, а не возникает над ней.
        transform: 'translateX(-50%)',
        transition: 'left 700ms ease-in-out',
      }}
    />
  );
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

function useColumns(): number {
  const [columns, setColumns] = useState(() => pickColumns());

  useEffect(() => {
    const onResize = () => setColumns(pickColumns());
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, []);

  return columns;
}

function pickColumns(): number {
  if (typeof window === 'undefined') return 4;
  if (window.innerWidth < 520) return 3;
  if (window.innerWidth < 900) return 4;
  return 6;
}
