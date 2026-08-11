import type { GardenPlant, GardenSpecies } from '../api/garden';
import { GARDEN, STAGES, plantImage, stageHeight } from '../garden/strings';
import { Link } from '../lib/router';

interface Props {
  slot: number;
  plant?: GardenPlant;
  catalog: GardenSpecies[];
  stages: number;
  busy: boolean;
  onPlant?: () => void;
  onWater?: () => void;
}

export function GardenBed({
  slot,
  plant,
  catalog,
  stages,
  busy,
  onPlant,
  onWater,
}: Props) {
  const species = plant ? catalog.find((item) => item.id === plant.species) : undefined;

  if (!plant || !species) {
    return (
      <button
        type="button"
        disabled={busy || !onPlant}
        onClick={onPlant}
        className="group flex aspect-[3/4] flex-col items-center justify-end rounded-2xl border border-dashed border-[var(--line)] bg-[var(--bg-raised)]/40 p-3 transition-colors hover:border-[var(--accent)] disabled:pointer-events-none disabled:opacity-60"
        aria-label={`${GARDEN.plant.ru}, грядка ${slot + 1}`}
      >
        <Soil />
        <span className="mt-2 text-sm font-semibold text-[var(--text-muted)] group-hover:text-[var(--accent)]">
          {onPlant ? GARDEN.plant.sr : GARDEN.empty.sr}
        </span>
      </button>
    );
  }

  const stage = STAGES[Math.min(plant.stage, STAGES.length - 1)] ?? STAGES[0]!;
  const height = stageHeight(plant.stage, stages);

  return (
    <div className="flex aspect-[3/4] flex-col items-center justify-end rounded-2xl border border-[var(--line)] bg-[var(--bg-raised)]/40 p-3">
      <div className="relative flex w-full flex-1 items-end justify-center">
        <img
          src={plantImage(plant.species)}
          alt={`${species.serbian} — ${stage.sr}`}
          className="max-h-full w-auto object-contain object-bottom"
          style={{
            height: `${height}%`,
            // Обрезка снизу вверх: цветок поднимается из земли, а не
            // сжимается целиком.
            objectPosition: 'bottom',
            clipPath: 'inset(0 0 0 0)',
          }}
        />
      </div>
      <Soil />
      <p className="mt-2 text-center text-sm font-semibold leading-tight">
        {species.serbian}
        <span className="block text-xs font-normal text-[var(--text-muted)]">
          {plant.blooming ? stage.sr : `${stage.sr} — ${stage.ru}`}
        </span>
      </p>

      {plant.blooming ? (
        <Link
          to={`/trainer?topic=${encodeURIComponent(species.topic)}`}
          className="mt-2 rounded-xl px-3 py-1.5 text-center text-xs font-semibold text-[var(--accent)]"
          title={species.phrase}
        >
          {GARDEN.practise.sr} · {species.theme}
        </Link>
      ) : (
        onWater && (
          <button
            type="button"
            disabled={busy}
            onClick={onWater}
            className="mt-2 rounded-xl border border-[var(--line)] px-3 py-1.5 text-xs font-semibold transition-colors hover:border-[var(--accent)] hover:text-[var(--accent)] disabled:opacity-50"
          >
            {GARDEN.water.sr}
          </button>
        )
      )}
    </div>
  );
}

function Soil() {
  return (
    <span
      aria-hidden
      className="block h-3 w-full rounded-full"
      style={{
        background:
          'repeating-linear-gradient(90deg, color-mix(in srgb, var(--machine) 45%, transparent) 0 6px, color-mix(in srgb, var(--machine) 25%, transparent) 6px 12px)',
      }}
    />
  );
}
