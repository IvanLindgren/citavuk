import { useEffect, useState } from 'react';

import { ApiError } from '../api/client';
import {
  helpGarden,
  loadPublicGarden,
  type GardenSpecies,
  type PublicGarden as PublicGardenData,
} from '../api/garden';
import { GardenBed } from '../components/GardenBed';
import { Button, Card, ErrorNote, Reveal, Spinner } from '../components/ui';
import { GARDEN, coinWord } from '../garden/strings';
import { Link, useParams } from '../lib/router';
import { useSeo } from '../lib/seo';
import { useAuth } from '../state/auth';

export function PublicGarden() {
  const { nickname = '' } = useParams();
  const { account } = useAuth();
  const [garden, setGarden] = useState<PublicGardenData | null>(null);
  const [catalog, setCatalog] = useState<GardenSpecies[]>([]);
  const [stages, setStages] = useState(5);
  const [error, setError] = useState('');
  const [thanks, setThanks] = useState('');
  const [busy, setBusy] = useState(false);

  useSeo({
    title: `Башта: ${nickname}`,
    description: `Сад садовода ${nickname} в Читавуке.`,
  });

  useEffect(() => {
    let alive = true;
    setGarden(null);
    setError('');
    loadPublicGarden(nickname)
      .then((result) => {
        if (!alive) return;
        setGarden(result.garden);
        setCatalog(result.catalog);
        setStages(result.stages);
      })
      .catch((cause) => {
        if (alive) setError(describe(cause));
      });
    return () => {
      alive = false;
    };
  }, [nickname]);

  async function water() {
    setBusy(true);
    setError('');
    try {
      const result = await helpGarden(nickname);
      setThanks(`Хвала! +${result.reward} ${coinWord(result.reward)}`);
      setGarden((current) => (current ? { ...current, canWater: false } : current));
    } catch (cause) {
      setError(describe(cause));
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="paper-grain relative min-h-[calc(100dvh-4rem)] overflow-x-hidden px-4 py-10 sm:px-5 sm:py-14">
      <div className="mx-auto max-w-5xl">
        <Reveal>
          <p className="text-sm font-bold uppercase text-[var(--accent)]">
            {GARDEN.neighbours.sr} — {GARDEN.neighbours.ru}
          </p>
          <h1 className="mt-2 text-4xl sm:text-5xl">Башта: {nickname}</h1>
        </Reveal>

        {error && (
          <div className="mt-6">
            <ErrorNote>{error}</ErrorNote>
          </div>
        )}

        {!garden && !error && (
          <div className="mt-10 flex justify-center">
            <Spinner />
          </div>
        )}

        {garden && (
          <>
            <Card className="mt-8 flex flex-wrap items-center gap-5 p-5 sm:p-7">
              <div>
                <p className="font-display text-2xl font-bold">{garden.bloomed}</p>
                <p className="text-sm text-[var(--text-muted)]">
                  {GARDEN.bloomed.sr} — {GARDEN.bloomed.ru}
                </p>
              </div>
              <div className="ml-auto">
                {account && garden.canWater && (
                  <Button onClick={water} disabled={busy}>
                    {GARDEN.helpNeighbour.sr} — {GARDEN.helpNeighbour.ru}
                  </Button>
                )}
                {thanks && (
                  <p className="text-sm font-semibold text-[var(--success)]">{thanks}</p>
                )}
                {!account && (
                  <p className="text-sm text-[var(--text-muted)]">
                    Полить чужой сад может вошедший садовод.
                  </p>
                )}
              </div>
            </Card>

            <section className="mt-8">
              <div
                className="grid gap-3 rounded-3xl border border-[var(--line)] p-3 sm:gap-4 sm:p-5"
                style={{
                  gridTemplateColumns: 'repeat(auto-fill, minmax(9rem, 1fr))',
                  background:
                    'linear-gradient(180deg, color-mix(in srgb, var(--success) 12%, transparent), transparent 60%), var(--bg-sunken)',
                }}
              >
                {Array.from({ length: garden.slots }, (_, slot) => (
                  <GardenBed
                    key={slot}
                    slot={slot}
                    plant={garden.plants.find((item) => item.slot === slot)}
                    catalog={catalog}
                    stages={stages}
                    busy
                  />
                ))}
              </div>
            </section>
          </>
        )}

        <p className="mt-8">
          <Link to="/basta" className="font-semibold text-[var(--accent)]">
            ← Моя башта
          </Link>
        </p>
      </div>
    </main>
  );
}

function describe(cause: unknown): string {
  if (cause instanceof ApiError) return cause.message;
  return 'Не удалось открыть сад.';
}
