/**
 * Обстановка матча: часы, стол с игроками, занавес фазы и пьедестал.
 *
 * Многопользовательский матч отличается от игры с DeepL тем, что ждать
 * приходится людей, а не сервер. Пустой экран с надписью «ожидание» этого
 * ожидания не держит: человек уходит в другую вкладку и возвращается к
 * проигранному раунду. Поэтому всё, что происходит за столом, показано
 * движением — часы утекают, соседи дописывают фразу на глазах, счёт
 * подскакивает в тот же миг, когда судья назвал победителя.
 *
 * Оформление — обычные панели Читавука: пергамент, Lora, красный акцент сайта,
 * индиго у машин, золото у победителя. Неона и тёмной арены тут не будет: в
 * одиночной игре это уже пробовали, и выглядело как чужая игра, вставленная в
 * сайт (см. шапку pages/TranslationDuel.tsx).
 */

import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion';
import { LuBot, LuCheck, LuCrown, LuDoorOpen, LuPencil } from 'react-icons/lu';

import type { DuelPlayer, DuelRoom, DuelStanding } from '../api/duel';
import { initial, pending, seated, urgency } from '../duel/room';
import { Ornament } from './Ornament';

const EASE = [0.22, 1, 0.36, 1] as const;

/**
 * Часы фазы: кольцо утекает, цифры считают.
 *
 * Последние полминуты кольцо желтеет, последние десять секунд — краснеет и
 * бьётся. Цифры человек не читает, пока пишет; цвет и пульс он видит боковым
 * зрением.
 */
export function DuelClock({ seconds, total }: { seconds: number; total: number }) {
  const reduced = useReducedMotion() ?? false;
  const heat = urgency(seconds, total);
  const part = Math.max(0, Math.min(1, seconds / total));
  const color =
    heat === 'hot' ? 'var(--accent)' : heat === 'warm' ? 'var(--color-gold)' : 'var(--text-muted)';
  const radius = 20;
  const length = 2 * Math.PI * radius;

  return (
    <motion.div
      className="relative grid size-14 shrink-0 place-items-center"
      animate={reduced || heat !== 'hot' ? undefined : { scale: [1, 1.07, 1] }}
      transition={{ duration: 1, repeat: Infinity, ease: 'easeInOut' }}
      role="timer"
      aria-label={`Осталось ${seconds} секунд`}
    >
      <svg viewBox="0 0 48 48" className="absolute inset-0 -rotate-90">
        <circle cx="24" cy="24" r={radius} fill="none" stroke="var(--line)" strokeWidth="4" />
        <circle
          cx="24"
          cy="24"
          r={radius}
          fill="none"
          stroke={color}
          strokeWidth="4"
          strokeLinecap="round"
          strokeDasharray={length}
          strokeDashoffset={length * (1 - part)}
          style={{ transition: 'stroke-dashoffset 1s linear, stroke 400ms ease' }}
        />
      </svg>
      <span className="font-display text-sm font-bold tabular-nums" style={{ color }}>
        {Math.floor(seconds / 60)}:{String(seconds % 60).padStart(2, '0')}
      </span>
    </motion.div>
  );
}

/**
 * Занавес фазы: широкая полоса с орнаментом проходит по экрану и уходит.
 *
 * Без него смена фазы — это просто другой текст на том же месте, и человек её
 * пропускает. Полтора удара сердца занавеса хватает, чтобы понять: раунд
 * кончился, теперь голосуем.
 */
export function PhaseCurtain({ label, title }: { label: string; title: string }) {
  const reduced = useReducedMotion() ?? false;
  if (reduced) return null;

  return (
    <motion.div
      className="pointer-events-none fixed inset-x-0 top-1/3 z-[90] flex justify-center px-4"
      initial={{ opacity: 0, y: 24 }}
      animate={{ opacity: [0, 1, 1, 0], y: [24, 0, 0, -18] }}
      transition={{ duration: CURTAIN_MS / 1000, times: [0, 0.22, 0.78, 1], ease: EASE }}
    >
      <div className="rounded-3xl border border-[var(--line)] bg-[var(--bg-raised)] px-8 py-6 text-center shadow-[var(--shadow-lift)]">
        <p className="text-xs font-bold uppercase tracking-[0.2em] text-[var(--accent)]">{label}</p>
        <h2 className="mt-1 font-display text-3xl">{title}</h2>
        <Ornament className="mx-auto mt-3 w-40" count={7} />
      </div>
    </motion.div>
  );
}

/** Сколько занавес висит на экране. */
export const CURTAIN_MS = 1400;

/**
 * Стол с игроками.
 *
 * Главная часть азарта: видно, кто уже дописывает пятую фразу, кто ещё думает
 * над первой, а кто закрыл вкладку. Текста чужих переводов здесь нет и быть не
 * может — только число переведённых фраз.
 */
export function DuelTable({ room, sentences }: { room: DuelRoom; sentences: number }) {
  const reduced = useReducedMotion() ?? false;
  const rows = useMemo(() => {
    const order = room.standings ?? [];
    const place = new Map(order.map((row, index) => [row.id, index]));
    return seated(room)
      .slice()
      .sort((a, b) => (place.get(a.id) ?? 99) - (place.get(b.id) ?? 99) || b.score - a.score);
  }, [room]);
  const waiting = pending(room);

  return (
    <div className="space-y-2">
      {rows.map((player) => (
        <Seat
          key={player.id}
          player={player}
          room={room}
          sentences={sentences}
          waiting={waiting.some((item) => item.id === player.id)}
          reduced={reduced}
        />
      ))}
      {Array.from({ length: Math.max(0, room.seats - rows.length) }, (_, index) => (
        <motion.div
          key={`free-${index}`}
          className="flex items-center gap-3 rounded-2xl border border-dashed border-[var(--line)] px-3 py-2.5 text-sm text-[var(--text-muted)]"
          animate={reduced ? undefined : { opacity: [0.45, 0.85, 0.45] }}
          transition={{ duration: 2.4, repeat: Infinity, delay: index * 0.3 }}
        >
          <span className="grid size-9 place-items-center rounded-full border border-dashed border-[var(--line)]">
            <LuDoorOpen className="size-4" />
          </span>
          Свободное место
        </motion.div>
      ))}
    </div>
  );
}

function Seat({
  player,
  room,
  sentences,
  waiting,
  reduced,
}: {
  player: DuelPlayer;
  room: DuelRoom;
  sentences: number;
  waiting: boolean;
  reduced: boolean;
}) {
  const grown = useGrown(player.score);
  const done = room.phase === 'translate' ? player.ready : room.phase === 'vote' ? player.voted : false;
  const progress = Math.min(sentences, player.progress ?? 0);

  return (
    <motion.div
      layout={!reduced}
      initial={reduced ? false : { opacity: 0, x: 18 }}
      animate={{ opacity: player.joined ? 1 : 0.55, x: 0 }}
      transition={{ duration: 0.35, ease: EASE }}
      className={[
        'relative flex items-center gap-3 overflow-hidden rounded-2xl border px-3 py-2.5',
        player.you ? 'border-[var(--accent)]/45 bg-[var(--accent)]/[0.06]' : 'border-[var(--line)]',
      ].join(' ')}
    >
      <motion.span
        className={[
          'grid size-9 shrink-0 place-items-center rounded-full font-display text-sm font-bold',
          player.machine
            ? 'bg-[var(--machine)] text-parchment'
            : 'bg-[var(--accent)] text-parchment',
        ].join(' ')}
        animate={reduced || !grown ? undefined : { scale: [1, 1.25, 1], rotate: [0, -10, 8, 0] }}
        transition={{ duration: 0.5 }}
      >
        {player.machine ? <LuBot className="size-4" /> : initial(player.name)}
      </motion.span>

      <div className="min-w-0 flex-1">
        <p className="flex items-center gap-1.5 truncate font-bold">
          {player.name}
          {player.you && <span className="text-xs font-normal text-[var(--text-muted)]">· ты</span>}
          {player.host && <LuCrown className="size-3.5 shrink-0 text-[var(--color-gold)]" />}
        </p>
        <SeatStatus
          room={room}
          player={player}
          done={Boolean(done)}
          waiting={waiting}
          progress={progress}
          sentences={sentences}
          reduced={reduced}
        />
      </div>

      <motion.span
        key={player.score}
        className="font-display text-lg font-bold tabular-nums"
        initial={reduced || !grown ? false : { scale: 1.8, color: 'var(--color-gold)' }}
        animate={{ scale: 1, color: 'var(--text)' }}
        transition={{ duration: 0.6, ease: EASE }}
      >
        {player.score}
      </motion.span>

      {done && (
        <motion.span
          className="grid size-6 shrink-0 place-items-center rounded-full bg-[var(--success)] text-parchment"
          initial={reduced ? false : { scale: 0, rotate: -40 }}
          animate={{ scale: 1, rotate: 0 }}
          transition={{ type: 'spring', stiffness: 420, damping: 16 }}
        >
          <LuCheck className="size-3.5" />
        </motion.span>
      )}
    </motion.div>
  );
}

function SeatStatus({
  room,
  player,
  done,
  waiting,
  progress,
  sentences,
  reduced,
}: {
  room: DuelRoom;
  player: DuelPlayer;
  done: boolean;
  waiting: boolean;
  progress: number;
  sentences: number;
  reduced: boolean;
}) {
  const muted = 'text-xs text-[var(--text-muted)]';
  if (!player.joined) return <p className={muted}>Ещё не подтвердил</p>;
  if (player.machine) return <p className={muted}>Переводчик</p>;
  if (done) return <p className="text-xs font-bold text-[var(--success)]">Готов</p>;

  if (room.phase === 'translate') {
    return (
      <div className="mt-1 flex items-center gap-2">
        <span className="flex h-1.5 flex-1 gap-0.5" aria-label={`Переведено ${progress} из ${sentences}`}>
          {Array.from({ length: sentences }, (_, index) => (
            <motion.i
              key={index}
              className={`h-full flex-1 rounded-full ${index < progress ? 'bg-[var(--accent)]' : 'bg-[var(--bg-sunken)]'}`}
              initial={false}
              animate={reduced ? undefined : { scaleY: index < progress ? [1, 2.2, 1] : 1 }}
              transition={{ duration: 0.4 }}
            />
          ))}
        </span>
        <LuPencil className="size-3 shrink-0 text-[var(--text-muted)]" />
      </div>
    );
  }
  if (waiting) return <p className={muted}>Выбирает…</p>;
  return <p className={muted}>За столом</p>;
}

/** Подсказывает, что число только что выросло: по этому и пляшет кружок. */
function useGrown(score: number): boolean {
  const previous = useRef(score);
  const [grown, setGrown] = useState(false);
  useEffect(() => {
    if (score > previous.current) {
      setGrown(true);
      const timer = window.setTimeout(() => setGrown(false), 700);
      previous.current = score;
      return () => window.clearTimeout(timer);
    }
    previous.current = score;
  }, [score]);
  return grown;
}

/**
 * Пьедестал: первое место в середине и выше остальных.
 *
 * Столбики растут снизу, поэтому итог читается за один взгляд — раньше, чем
 * человек успеет разобрать цифры.
 */
export function Podium({ rows, you }: { rows: DuelStanding[]; you?: string }) {
  const reduced = useReducedMotion() ?? false;
  const best = Math.max(1, ...rows.map((row) => row.score));

  return (
    <div className="mx-auto flex max-w-md items-end justify-center gap-2">
      {rows.map((row) => (
        <Step key={row.id} row={row} best={best} you={row.id === you} reduced={reduced} />
      ))}
    </div>
  );
}

function Step({
  row,
  best,
  you,
  reduced,
}: {
  row: DuelStanding;
  best: number;
  you: boolean;
  reduced: boolean;
}) {
  const height = 52 + (row.score / best) * 88;
  return (
    <div className="flex min-w-0 flex-1 flex-col items-center gap-2">
      <span
        className={[
          'grid size-10 place-items-center rounded-full font-display text-sm font-bold',
          row.machine ? 'bg-[var(--machine)] text-parchment' : 'bg-[var(--accent)] text-parchment',
        ].join(' ')}
      >
        {row.machine ? <LuBot className="size-4" /> : initial(row.name)}
      </span>
      <span className="w-full truncate text-center text-sm font-bold">{row.name}</span>
      <motion.div
        className={[
          'flex w-full flex-col items-center justify-start rounded-t-xl border border-b-0 pt-2',
          row.place === 1
            ? 'border-[var(--color-gold)] bg-[var(--color-gold)]/20'
            : 'border-[var(--line)] bg-[var(--bg-sunken)]',
        ].join(' ')}
        initial={reduced ? false : { height: 0 }}
        animate={{ height }}
        transition={{ duration: 0.7, ease: EASE, delay: row.place === 1 ? 0.25 : 0 }}
      >
        <span className="font-display text-xl font-bold">{row.place}</span>
        <span className="text-xs text-[var(--text-muted)]">{row.score}</span>
        {you && <span className="mt-1 text-[10px] font-bold uppercase text-[var(--accent)]">ты</span>}
      </motion.div>
    </div>
  );
}

/**
 * Бумажное конфетти цветов сайта.
 *
 * Не блёстки и не неон: обрезки пергамента, золота и красного — те же цвета,
 * которыми набран весь Читавук.
 */
export function Confetti({ count = 40 }: { count?: number }) {
  const reduced = useReducedMotion() ?? false;
  const pieces = useMemo(
    () =>
      Array.from({ length: count }, (_, index) => ({
        id: index,
        left: Math.random() * 100,
        delay: Math.random() * 0.9,
        duration: 2.2 + Math.random() * 1.4,
        tilt: Math.random() * 360,
        color: ['var(--accent)', 'var(--color-gold)', 'var(--machine)', 'var(--success)'][index % 4],
      })),
    [count],
  );
  if (reduced) return null;

  return (
    <div className="pointer-events-none absolute inset-0 overflow-hidden" aria-hidden>
      {pieces.map((piece) => (
        <span
          key={piece.id}
          className="duel-confetti"
          style={{
            left: `${piece.left}%`,
            background: piece.color,
            animationDelay: `${piece.delay}s`,
            animationDuration: `${piece.duration}s`,
            rotate: `${piece.tilt}deg`,
          }}
        />
      ))}
    </div>
  );
}

/**
 * Ожидание с Читавуком.
 *
 * Отдельный вид, потому что ждать в матче приходится часто: пока судья читает,
 * пока сосед дописывает, пока подбор ищет людей.
 */
export function DuelWaiting({
  title,
  text,
  children,
}: {
  title: string;
  text: string;
  children?: ReactNode;
}) {
  const reduced = useReducedMotion() ?? false;
  return (
    <div className="grid min-h-72 place-items-center p-8 text-center">
      <div>
        {children}
        <div className="mt-3 flex justify-center gap-1.5">
          {[0, 1, 2].map((item) => (
            <motion.span
              key={item}
              className="size-2 rounded-full bg-[var(--accent)]"
              animate={reduced ? undefined : { opacity: [0.25, 1, 0.25], y: [0, -4, 0] }}
              transition={{ duration: 1, repeat: Infinity, delay: item * 0.16 }}
            />
          ))}
        </div>
        <h2 className="mt-5 font-display text-2xl">{title}</h2>
        <p className="mx-auto mt-2 max-w-md text-[var(--text-muted)]">{text}</p>
      </div>
    </div>
  );
}

/**
 * Рубашки переводов, которые тасует судья.
 *
 * Пока Gemma читает, на экране должно что-то происходить: пустая панель с
 * надписью «идёт разбор» читается как зависший сайт.
 */
export function ShuffleDeck({ count }: { count: number }) {
  const reduced = useReducedMotion() ?? false;
  const cards = Array.from({ length: Math.max(2, Math.min(6, count)) }, (_, index) => index);
  return (
    <div className="mx-auto flex h-16 items-center justify-center gap-2" aria-hidden>
      <AnimatePresence>
        {cards.map((card) => (
          <motion.span
            key={card}
            className="h-14 w-10 rounded-lg border border-[var(--line)] bg-[var(--bg-sunken)]"
            style={{
              backgroundImage:
                'repeating-linear-gradient(45deg, transparent 0 4px, color-mix(in srgb, var(--accent) 22%, transparent) 4px 6px)',
            }}
            animate={
              reduced
                ? undefined
                : { y: [0, -10, 0], rotate: [0, card % 2 ? 7 : -7, 0] }
            }
            transition={{ duration: 1.6, repeat: Infinity, delay: card * 0.12, ease: 'easeInOut' }}
          />
        ))}
      </AnimatePresence>
    </div>
  );
}
