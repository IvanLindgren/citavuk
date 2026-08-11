import { useEffect, useRef, useState } from 'react';

import type { GardenSpecies } from '../api/garden';
import { STAGES, plantImage } from '../garden/strings';
import { isBlooming, stageOf, swayFor, type Sway } from '../garden/scene';

export interface BedProps {
  slot: number;
  /** Рост, досчитанный на текущий момент. Пусто — грядка свободна. */
  growth?: number;
  species?: GardenSpecies;
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
      className="garden-bed group relative block disabled:cursor-default"
    >
      <span aria-hidden className="garden-bed__soil" />
      {planted && (
        <span
          className={`garden-bed__plant garden-sway ${justBloomed ? 'garden-bloom' : ''}`}
          style={
            {
              '--sway-duration': `${sway.duration}s`,
              '--sway-delay': `${sway.delay}s`,
              '--sway-tilt': sway.tilt,
            } as React.CSSProperties
          }
        >
          <img
            src={plantImage(species.id, stageOf(growth))}
            alt=""
            draggable={false}
            className="garden-pixel-art block"
          />
        </span>
      )}

      {watering && <Droplets />}

      <span className="garden-bed__hint">{planted ? species.serbian : actionLabel}</span>
    </button>
  );
}

function Droplets() {
  return (
    <span aria-hidden className="garden-bed__drops">
      {[0, 1, 2].map((index) => (
        <span
          key={index}
          className="garden-drop block h-1.5 w-1.5 rounded-full bg-sky-300"
          style={{ animationDelay: `${index * 180}ms` }}
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

export type { Sway };
