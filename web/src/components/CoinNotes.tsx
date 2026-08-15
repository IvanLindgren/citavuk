import { useCallback, useRef, useState } from 'react';
import { LuCoins } from 'react-icons/lu';

import { coinWord } from '../garden/strings';

export interface CoinNote {
  id: number;
  title: string;
  coins: number;
}

/** Сколько записок висит разом: дальше они перекрывают сад. */
const LIMIT = 4;
const LIFETIME = 6000;

/**
 * Записка о начислении.
 *
 * Динары приходят за что угодно: за чтение, за повторение слов, за дуэль, за
 * урок, за задание дня, за политый сад соседа. Раньше все они молча меняли
 * число в углу. Теперь каждое начисление говорит, за что оно.
 */
export function CoinNotes({ notes }: { notes: CoinNote[] }) {
  if (notes.length === 0) return null;
  return (
    <div className="garden-coin-notes" role="status" aria-live="polite">
      {notes.map((note) => (
        <span key={note.id} className="garden-coin-note">
          <LuCoins aria-hidden className="shrink-0 text-[#8a4d27]" />
          <b>
            +{note.coins} {coinWord(note.coins)}
          </b>
          <i>{note.title}</i>
        </span>
      ))}
    </div>
  );
}

export function useCoinNotes() {
  const [notes, setNotes] = useState<CoinNote[]>([]);
  const last = useRef(0);

  const add = useCallback((arrivals: { title: string; coins: number }[]) => {
    if (arrivals.length === 0) return;
    const fresh = arrivals.map((item) => ({ ...item, id: (last.current += 1) }));
    setNotes((current) => [...current, ...fresh].slice(-LIMIT));
    const shown = new Set(fresh.map((item) => item.id));
    window.setTimeout(
      () => setNotes((current) => current.filter((item) => !shown.has(item.id))),
      LIFETIME,
    );
  }, []);

  return { notes, add };
}
