import { useEffect, useRef, useState } from 'react';

import type { GardenSpecies } from '../api/garden';
import { STAGES, plantImage } from '../garden/strings';
import {
  isBlooming,
  stageOf,
  swayFor,
  type Sway,
} from '../garden/scene';

export interface BedProps {
  slot: number;
  /** Рост, досчитанный на текущий момент. Пусто — грядка свободна. */
  growth?: number;
  species?: GardenSpecies;
  seedIndex?: number;
  watering?: boolean;
  onAct?: () => void;
  actionLabel?: string;
}

export function GardenBed({
  slot,
  growth,
  species,
  watering = false,
  onAct,
  actionLabel,
}: BedProps) {
  const sway = swayFor(slot);
  const planted = growth !== undefined && species !== undefined;
  const blooming = planted && isBlooming(growth);
  const justBloomed = useJustBloomed(blooming);

  const label = planted
    ? `${species.serbian}, ${STAGES[stageOf(growth)]?.sr ?? ''}`
    : `Празна леја ${slot + 1}`;

  return (
    <button
      type="button"
      onClick={onAct}
      disabled={!onAct}
      aria-label={actionLabel ? `${actionLabel}: ${label}` : label}
      title={planted ? species.phrase : undefined}
      className="group relative flex h-full w-full flex-col items-center justify-end rounded-xl focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-[var(--accent)] disabled:cursor-default"
    >
      {planted ? (
        <Plant
          growth={growth}
          species={species}
          sway={sway}
          pop={justBloomed}
        />
      ) : (
        <Hole />
      )}

      {watering && <Droplets />}
      {blooming && <Sparkle />}

      <span className="pointer-events-none mt-1 block max-w-full truncate text-center text-[11px] font-semibold leading-tight opacity-0 transition-opacity group-hover:opacity-100 group-focus-visible:opacity-100">
        {planted ? species.serbian : actionLabel}
      </span>
    </button>
  );
}

function Plant({
  growth,
  species,
  sway,
  pop,
}: {
  growth: number;
  species: GardenSpecies;
  sway: Sway;
  pop: boolean;
}) {
  const stage = stageOf(growth);

  return (
    <span
      className={`garden-sway block w-full ${pop ? 'garden-bloom' : ''}`}
      style={
        {
          '--sway-duration': `${sway.duration}s`,
          '--sway-delay': `${sway.delay}s`,
          '--sway-tilt': sway.tilt,
        } as React.CSSProperties
      }
    >
      <img
        src={plantImage(species.id, stage)}
        alt=""
        className="garden-pixel-plant mx-auto block object-contain object-bottom"
      />
    </span>
  );
}

function Hole() {
  return (
    <span
      aria-hidden
      className="block h-3 w-10 rounded-[50%] transition-colors group-hover:bg-[var(--accent)]/30"
      style={{ background: 'color-mix(in srgb, var(--machine) 55%, transparent)' }}
    />
  );
}

function Droplets() {
  return (
    <span aria-hidden className="pointer-events-none absolute bottom-6 flex gap-2">
      {[0, 1, 2].map((index) => (
        <span
          key={index}
          className="garden-drop block h-1.5 w-1.5 rounded-full bg-sky-400"
          style={{ animationDelay: `${index * 180}ms` }}
        />
      ))}
    </span>
  );
}

function Sparkle() {
  return (
    <span aria-hidden className="pointer-events-none absolute bottom-1/2 flex gap-3">
      {[0, 1].map((index) => (
        <span
          key={index}
          className="garden-sparkle block h-1.5 w-1.5 rotate-45 bg-[var(--color-gold,#e8b64c)]"
          style={{ animationDelay: `${index * 700}ms` }}
        />
      ))}
    </span>
  );
}

/** Цветок распускается один раз — и это надо заметить. */
function useJustBloomed(blooming: boolean): boolean {
  const seen = useRef(blooming);
  const [pop, setPop] = useState(false);

  useEffect(() => {
    if (blooming === seen.current) return;
    seen.current = blooming;
    if (!blooming) return;
    setPop(true);
    const timer = setTimeout(() => setPop(false), 900);
    return () => clearTimeout(timer);
  }, [blooming]);

  return pop;
}
