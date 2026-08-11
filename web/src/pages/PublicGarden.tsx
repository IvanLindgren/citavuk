import { useEffect, useState } from 'react';
import { LuArrowLeft, LuDroplets, LuFlower2 } from 'react-icons/lu';

import { ApiError } from '../api/client';
import {
  helpGarden,
  loadPublicGarden,
  type GardenSpecies,
  type PublicGarden as PublicGardenData,
} from '../api/garden';
import { GardenScene } from '../components/GardenScene';
import { Button, ErrorNote, Spinner } from '../components/ui';
import { GARDEN, coinWord } from '../garden/strings';
import { useParams, useRouter } from '../lib/router';
import { useSeo } from '../lib/seo';
import { useAuth } from '../state/auth';

export function PublicGarden() {
  const { nickname = '' } = useParams();
  const { navigate } = useRouter();
  const { account } = useAuth();
  const [garden, setGarden] = useState<PublicGardenData | null>(null);
  const [catalog, setCatalog] = useState<GardenSpecies[]>([]);
  const [fetchedAt, setFetchedAt] = useState(() => Date.now());
  const [error, setError] = useState('');
  const [thanks, setThanks] = useState('');
  const [busy, setBusy] = useState(false);
  const [watering, setWatering] = useState<number | null>(null);

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
        setFetchedAt(Date.now());
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
      // Садовник проходит по всем грядкам соседа: полив общий на весь сад.
      const first = garden?.plants[0]?.slot ?? 0;
      setWatering(first);
      window.setTimeout(() => setWatering(null), 2400);
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
    <main className="garden-game-shell fixed inset-0 z-[60] overflow-hidden">
      {garden ? (
        <GardenScene slots={garden.slots} plants={garden.plants} catalog={catalog} fetchedAt={fetchedAt} watering={watering} />
      ) : (
        <div className="grid size-full place-items-center"><Spinner /></div>
      )}

      <div className="pointer-events-none absolute inset-x-0 top-0 z-[120] flex items-start justify-between gap-3 p-3 sm:p-4">
        <div className="garden-game-plaque pointer-events-auto flex items-center gap-2 px-2 py-2 sm:px-3">
          <button type="button" onClick={() => navigate('/basta')} className="grid size-9 shrink-0 place-items-center border-2 border-[#8c5b37] bg-[#f5dfaa]" aria-label="Вернуться в свой сад" title="Вернуться в свой сад"><LuArrowLeft /></button>
          <span><span className="block font-display text-lg font-bold">Башта: {nickname}</span><span className="block text-[11px] text-[#5e4635]">{GARDEN.neighbours.sr} — {GARDEN.neighbours.ru}</span></span>
        </div>
        {garden && (
          <div className="garden-game-plaque pointer-events-auto flex items-center gap-3 px-3 py-2">
            <span className="flex items-center gap-1.5 font-bold"><LuFlower2 className="text-[#8a4d27]" /> {garden.bloomed}</span>
            {account && garden.canWater && <Button onClick={water} disabled={busy}><LuDroplets /> {GARDEN.helpNeighbour.sr}</Button>}
            {!account && <span className="text-xs text-[#5e4635]">Войди, чтобы полить</span>}
            {thanks && <span className="text-sm font-semibold text-[#317240]">{thanks}</span>}
          </div>
        )}
      </div>

      {error && <div className="absolute left-1/2 top-24 z-[130] w-[min(92%,42rem)] -translate-x-1/2"><ErrorNote>{error}</ErrorNote></div>}
    </main>
  );
}

function describe(cause: unknown): string {
  if (cause instanceof ApiError) return cause.message;
  return 'Не удалось открыть сад.';
}
