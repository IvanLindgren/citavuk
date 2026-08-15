/**
 * Части дуэли с переводчиком: спрайт Читавука и счётная полоса.
 *
 * Своего оформления у дуэли нет. Панели, шрифты и цвета — те же, что у
 * читалки и урока; сторона человека берёт акцент сайта, сторона машины —
 * индиго палитры (`--machine`). Первая версия была тёмной ареной с неоном:
 * выглядела как чужая игра, вставленная в Читавук.
 */

import { useEffect, useRef, useState } from 'react';
import { motion, useReducedMotion } from 'framer-motion';

/*
  Атлас поз: 5 колонок на 4 строки, собирается tools/build_duel_sprites.py.
  Позиция фона в процентах отсчитывается от «свободного хода» картинки внутри
  окна, поэтому делитель — на единицу меньше числа клеток, а не равен ему.
*/
const ATLAS = { cols: 5, rows: 4, ratio: 200 / 230 };

/** Имена поз по местам в атласе. Порядок задан листом, менять его нельзя. */
export const POSE = {
  taunt: 0,
  card: 1,
  study: 2,
  compare: 3,
  cheer: 4,
  think: 5,
  hurry: 6,
  inspect: 7,
  judge: 8,
  know: 9,
  typing: 10,
  rhythm: 11,
  strike: 12,
  listen: 13,
  smug: 14,
  options: 15,
  globe: 16,
  hurt: 17,
  hush: 18,
  trophy: 19,
} as const;

export type Pose = keyof typeof POSE;

export function Fighter({ pose, className = '' }: { pose: Pose; className?: string }) {
  const reduced = useReducedMotion() ?? false;
  const index = POSE[pose];
  const col = index % ATLAS.cols;
  const row = Math.floor(index / ATLAS.cols);
  return (
    <motion.div
      key={pose}
      // Смена позы — короткое проявление, без подскока: Читавук на других
      // страницах сайта тоже просто стоит.
      initial={reduced ? false : { opacity: 0.35 }}
      animate={{ opacity: 1 }}
      transition={{ duration: 0.18 }}
      aria-hidden
      className={className}
      style={{
        aspectRatio: `${ATLAS.ratio}`,
        backgroundRepeat: 'no-repeat',
        backgroundImage: 'url(/img/citavuk_duel_sprites.webp)',
        backgroundSize: `${ATLAS.cols * 100}% ${ATLAS.rows * 100}%`,
        backgroundPosition: `${(col / (ATLAS.cols - 1)) * 100}% ${(row / (ATLAS.rows - 1)) * 100}%`,
      }}
    />
  );
}

/**
 * Счёт раунда двумя встречными полосами.
 *
 * Полосы те же, что показывают прогресс урока, только их две и растут они
 * навстречу. Считают они выигранные предложения и ничего кроме: разгон от
 * быстрого набора сюда не попадает (см. lib/duelScore.ts).
 */
export function ScoreBar({
  hero,
  foe,
  max,
  wonHero,
  wonFoe,
  foeName,
}: {
  hero: number;
  foe: number;
  max: number;
  /** Выигранные предложения — то, что показывается цифрами. */
  wonHero: number;
  wonFoe: number;
  foeName: string;
}) {
  // Счёт в разборе меняется по одному предложению, и без толчка это движение
  // теряется среди пяти открывающихся сравнений.
  const scored = useJust(wonHero + wonFoe);

  return (
    <div>
      <div className="flex items-baseline justify-between gap-3 text-xs font-bold uppercase tracking-wide">
        <span className="text-[var(--accent)]">Вы</span>
        {/* Цифрами — выигранные предложения, а не внутренние очки полос:
            «72 : 32» человеку ничего не говорит, «3 : 1» говорит всё. */}
        <motion.span
          className="font-sans text-sm tabular-nums"
          animate={{
            scale: scored ? 1.25 : 1,
            color: scored ? 'var(--color-gold)' : 'var(--text-muted)',
          }}
          transition={{ type: 'spring', stiffness: 420, damping: 16 }}
        >
          {wonHero} : {wonFoe}
        </motion.span>
        <span className="truncate text-[var(--machine)]">{foeName}</span>
      </div>
      <div className="mt-1.5 flex items-center gap-1.5">
        <Half value={hero} max={max} color="var(--accent)" flip />
        <Half value={foe} max={max} color="var(--machine)" />
      </div>
    </div>
  );
}

/** Полсекунды «только что выросло» — на этом держится подскок счёта. */
function useJust(value: number): boolean {
  const previous = useRef(value);
  const [just, setJust] = useState(false);
  useEffect(() => {
    if (value > previous.current) {
      setJust(true);
      const timer = window.setTimeout(() => setJust(false), 500);
      previous.current = value;
      return () => window.clearTimeout(timer);
    }
    previous.current = value;
  }, [value]);
  return just;
}

function Half({ value, max, color, flip = false }: { value: number; max: number; color: string; flip?: boolean }) {
  return (
    <div className={`h-1.5 flex-1 overflow-hidden rounded-full bg-[var(--bg-sunken)] ${flip ? 'rotate-180' : ''}`}>
      <div
        className="h-full rounded-full transition-[width] duration-500 ease-out"
        style={{ width: `${Math.max(0, Math.min(100, (value / max) * 100))}%`, background: color }}
      />
    </div>
  );
}
