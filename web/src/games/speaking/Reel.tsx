import { useEffect, useMemo, useRef, useState } from 'react';
import { useReducedMotion } from 'framer-motion';

import type { SpeakingGenre, SpeakingTopic } from '../../api/speaking';
import { GenreIcon } from './GenreIcon';

const ROW = 76;
const SPIN_MS = 3600;
const FILLER = 26;

/** Короткий щелчок на каждой проехавшей строке — как у настоящего барабана. */
let audio: AudioContext | null = null;
function tick(volume: number) {
  try {
    audio ??= new AudioContext();
    if (audio.state === 'suspended') void audio.resume();
    const now = audio.currentTime;
    const osc = audio.createOscillator();
    const gain = audio.createGain();
    osc.type = 'square';
    osc.frequency.setValueAtTime(1400, now);
    osc.frequency.exponentialRampToValueAtTime(600, now + 0.03);
    gain.gain.setValueAtTime(0.0001, now);
    gain.gain.exponentialRampToValueAtTime(0.05 * volume, now + 0.004);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.05);
    osc.connect(gain).connect(audio.destination);
    osc.start(now);
    osc.stop(now + 0.06);
  } catch {
    // Без звука барабан крутится так же.
  }
}

const easeOut = (t: number) => 1 - (1 - t) ** 4;

function pick<T>(items: T[], not?: T): T {
  for (let attempt = 0; attempt < 8; attempt += 1) {
    const item = items[Math.floor(Math.random() * items.length)]!;
    if (item !== not || items.length === 1) return item;
  }
  return items[0]!;
}

function TopicRow({ topic, genre, dim }: { topic: SpeakingTopic; genre?: SpeakingGenre; dim?: boolean }) {
  return (
    <div
      className={['flex items-center gap-3 px-4 transition-opacity', dim ? 'opacity-60' : ''].join(' ')}
      style={{ height: ROW }}
    >
      <span
        className="grid size-11 shrink-0 place-items-center rounded-xl border border-[var(--line)] bg-[var(--bg)] text-[var(--accent)] shadow-[inset_0_-2px_0_var(--line)]"
        aria-hidden="true"
      >
        <GenreIcon genre={genre} className="size-6" />
      </span>
      <span className="min-w-0">
        <span className="block text-xs font-bold uppercase tracking-wide text-[var(--accent)]">{genre?.ru}</span>
        <span className="line-clamp-2 text-balance text-[15px] font-semibold leading-snug">{topic.ru}</span>
      </span>
    </div>
  );
}

export interface ReelProps {
  pool: SpeakingTopic[];
  genres: SpeakingGenre[];
  /** Каждое новое значение запускает вращение к `target`. */
  spinId: number;
  target: SpeakingTopic | null;
  muted: boolean;
  onLanded: () => void;
}

/**
 * Барабан тем: вертикальная лента, которая раскручивается и плавно
 * останавливается на выпавшей теме. Тему выбирает вызывающий — барабан только
 * показывает её, поэтому результат не зависит от кадров анимации.
 */
export function Reel({ pool, genres, spinId, target, muted, onLanded }: ReelProps) {
  const reduced = useReducedMotion();
  const genreById = useMemo(() => new Map(genres.map((genre) => [genre.id, genre])), [genres]);
  const [strip, setStrip] = useState<SpeakingTopic[]>(() =>
    pool.length ? Array.from({ length: 5 }, () => pick(pool)) : [],
  );
  const [landed, setLanded] = useState(-1);
  const trackRef = useRef<HTMLDivElement>(null);
  const position = useRef(2);
  const frame = useRef(0);
  const landedRef = useRef(onLanded);
  landedRef.current = onLanded;

  const place = (row: number) => {
    position.current = row;
    if (trackRef.current) trackRef.current.style.transform = `translateY(${-(row - 1) * ROW}px)`;
  };

  useEffect(() => {
    place(position.current);
  }, [strip]);

  useEffect(() => {
    if (spinId === 0 || !target || !pool.length) return;
    cancelAnimationFrame(frame.current);
    const current = strip[Math.round(position.current)];
    const next: SpeakingTopic[] = [pick(pool), current ?? pick(pool)];
    for (let i = 0; i < FILLER; i += 1) next.push(pick(pool, next[next.length - 1]));
    const finalRow = next.length;
    next.push(target, pick(pool, target), pick(pool));
    setStrip(next);
    setLanded(-1);
    place(1);

    const finish = () => {
      place(finalRow);
      setLanded(finalRow);
      landedRef.current();
    };
    if (reduced) {
      finish();
      return;
    }
    const startedAt = performance.now();
    let lastRow = 1;
    const step = (now: number) => {
      const t = Math.min(1, (now - startedAt) / SPIN_MS);
      const row = 1 + (finalRow - 1) * easeOut(t);
      place(row);
      const crossed = Math.round(row);
      if (crossed !== lastRow) {
        lastRow = crossed;
        if (!muted) tick(t > 0.85 ? 1.6 : 1);
      }
      if (t < 1) frame.current = requestAnimationFrame(step);
      else finish();
    };
    frame.current = requestAnimationFrame(step);
    return () => cancelAnimationFrame(frame.current);
    // Вращение запускается только новым spinId: остальные значения читаются в момент старта.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [spinId]);

  const idle = spinId === 0;
  return (
    <div
      className="relative mx-auto w-full max-w-xl overflow-hidden rounded-3xl border border-[var(--line)] bg-[var(--bg-raised)] shadow-inner"
      style={{ height: ROW * 3 }}
      role="img"
      aria-label={target && landed >= 0 ? `Выпала тема: ${target.ru}` : 'Барабан тем'}
    >
      <div ref={trackRef} className="will-change-transform" aria-hidden="true">
        {strip.map((topic, index) => (
          <TopicRow
            key={`${index}-${topic.id}`}
            topic={topic}
            genre={genreById.get(topic.genre)}
            dim={idle || (landed >= 0 && index !== landed)}
          />
        ))}
      </div>
      {/* Окошко: рамка вокруг средней строки и затемнение соседних. */}
      <div
        className={[
          'pointer-events-none absolute inset-x-2 rounded-2xl border-2 transition-colors duration-300',
          landed >= 0 ? 'border-[var(--accent)] bg-[var(--accent)]/5' : 'border-[var(--line)]',
        ].join(' ')}
        style={{ top: ROW, height: ROW }}
      />
      <div className="pointer-events-none absolute inset-x-0 top-0 h-[70px] bg-gradient-to-b from-[var(--bg-raised)] to-transparent" />
      <div className="pointer-events-none absolute inset-x-0 bottom-0 h-[70px] bg-gradient-to-t from-[var(--bg-raised)] to-transparent" />
    </div>
  );
}
