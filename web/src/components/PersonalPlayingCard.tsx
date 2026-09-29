import { useRef } from 'react';
import {
  motion,
  useMotionValue,
  useReducedMotion,
  useSpring,
  useTransform,
  type Variants,
} from 'framer-motion';
import { LuArrowRight, LuCheck, LuLock } from 'react-icons/lu';

import { KIND_LABELS, KindIcon, lessonKind } from '../personal/kinds';
import './playing-card.css';

export type CardState = 'today' | 'open' | 'done' | 'locked';

/**
 * Раздача: карты слетают на стол по одной, чуть повёрнутые, и выравниваются.
 * `custom` — номер карты в колоде, от него задержка и наклон.
 */
export const dealVariants: Variants = {
  hidden: (i: number) => ({ opacity: 0, y: -42, x: -18, rotate: i % 2 ? 7 : -6, scale: 0.9 }),
  dealt: (i: number) => ({
    opacity: 1,
    y: 0,
    x: 0,
    rotate: 0,
    scale: 1,
    transition: { type: 'spring', stiffness: 240, damping: 22, delay: Math.min(i, 24) * 0.035 },
  }),
};

/** Печать ставится после того, как карта легла. */
const sealVariants: Variants = {
  hidden: { opacity: 0, scale: 1.9, rotate: -38 },
  dealt: (i: number) => ({
    opacity: 1,
    scale: 1,
    rotate: -12,
    transition: { type: 'spring', stiffness: 420, damping: 16, delay: Math.min(i, 24) * 0.035 + 0.38 },
  }),
};

function plural(n: number, one: string, few: string, many: string) {
  const tail = n % 100;
  if (tail >= 11 && tail <= 14) return many;
  return n % 10 === 1 ? one : n % 10 >= 2 && n % 10 <= 4 ? few : many;
}

export function opensIn(days: number) {
  if (days <= 0) return '';
  if (days === 1) return 'откроется завтра';
  return `через ${days} ${plural(days, 'день', 'дня', 'дней')}`;
}

/** Лицевая сторона: масть, узор, медальон с эмблемой. Общая для колоды и «Карты дня». */
export function CardFace({
  day,
  kind,
  title,
  art,
  children,
}: {
  day: number;
  kind: string;
  title: string;
  /** Иллюстрация месяца — только на большой карте дня. */
  art?: string;
  children?: React.ReactNode;
}) {
  return (
    <span className={`card-face kind-${lessonKind(kind)} ${art ? 'has-art' : ''}`} aria-hidden="true">
      {art ? (
        <>
          <img className="card-art" src={art} alt="" decoding="async" />
          <span className="card-art-shade" />
        </>
      ) : (
        <>
          <span className="card-pattern" />
          <span className="card-medallion">
            <KindIcon kind={kind} className="card-emblem" />
          </span>
        </>
      )}
      <span className="card-frame" />
      <span className="card-index">
        {day}
        <KindIcon kind={kind} className="card-index-icon" />
      </span>
      <span className="card-caption">
        <span className="card-kind">{KIND_LABELS[lessonKind(kind)]}</span>
        <span className="personal-card-title">{title}</span>
        {children}
      </span>
    </span>
  );
}

export function CardBack({ day, title, when }: { day?: number; title?: string; when?: string }) {
  return (
    <span className="card-back" aria-hidden="true">
      <span className="card-pattern" />
      <span className="card-frame" />
      <img className="card-back-medallion" src="/personal/decor/ravanica-medallion.png" alt="" loading="lazy" decoding="async" />
      {day ? (
        <span className="card-back-caption">
          <span className="card-back-day">День {day}</span>
          {title && <span className="card-back-title">{title}</span>}
          {when && (
            <span className="card-back-when">
              <LuLock />
              {when}
            </span>
          )}
        </span>
      ) : null}
    </span>
  );
}

export function WaxSeal({ score, className = '' }: { score: string; className?: string }) {
  return (
    <span className={`wax-seal ${className}`}>
      <span className="wax-seal-rim" />
      <span className="wax-seal-score">{score}</span>
    </span>
  );
}

export function PersonalPlayingCard({
  day,
  kind,
  title,
  state,
  score,
  daysAhead = 0,
  index,
  appear = false,
  onOpen,
}: {
  day: number;
  kind: string;
  title: string;
  state: CardState;
  score?: string;
  daysAhead?: number;
  index: number;
  /** Карта появилась позже раздачи (из стопки) и раздаётся сама. */
  appear?: boolean;
  onOpen: () => void;
}) {
  const ref = useRef<HTMLButtonElement>(null);
  const reduced = useReducedMotion();
  const x = useMotionValue(0);
  const y = useMotionValue(0);
  const rx = useSpring(useTransform(y, [-1, 1], [7, -7]), { stiffness: 190, damping: 20 });
  const ry = useSpring(useTransform(x, [-1, 1], [-9, 9]), { stiffness: 190, damping: 20 });
  const glareX = useTransform(x, [-1, 1], ['0%', '100%']);
  const glareY = useTransform(y, [-1, 1], ['0%', '100%']);
  const reset = () => {
    x.set(0);
    y.set(0);
  };
  const open = state !== 'locked';
  const k = lessonKind(kind);
  const status =
    state === 'done' ? `пройдена, ${score}` : state === 'today' ? 'карта дня' : open ? 'открыта' : opensIn(daysAhead) || 'закрыта';

  return (
    <motion.button
      ref={ref}
      type="button"
      custom={index}
      variants={dealVariants}
      {...(appear && !reduced ? { initial: 'hidden', animate: 'dealt' } : {})}
      className={`personal-card kind-${k} is-${state} ${open ? 'is-open' : 'is-closed'}`}
      disabled={!open}
      aria-label={`Карта ${day}. ${KIND_LABELS[k]}. ${title}. ${status}`}
      onClick={onOpen}
      onPointerLeave={reset}
      onBlur={reset}
      onPointerMove={(e) => {
        if (reduced || e.pointerType !== 'mouse') return;
        const b = e.currentTarget.getBoundingClientRect();
        x.set(Math.max(-1, Math.min(1, ((e.clientX - b.left) / b.width) * 2 - 1)));
        y.set(Math.max(-1, Math.min(1, ((e.clientY - b.top) / b.height) * 2 - 1)));
      }}
      style={reduced ? undefined : { rotateX: rx, rotateY: ry, transformPerspective: 900 }}
      whileHover={reduced ? undefined : { y: open ? -8 : -3, transition: { type: 'spring', stiffness: 320, damping: 22 } }}
      whileTap={reduced || !open ? undefined : { scale: 0.96 }}
    >
      {open ? (
        <CardFace day={day} kind={kind} title={title}>
          <span className="personal-card-bottom">
            {state === 'done' ? (
              <>
                <LuCheck /> В коллекции
              </>
            ) : (
              <>
                Открыть <LuArrowRight />
              </>
            )}
          </span>
        </CardFace>
      ) : (
        <CardBack day={day} title={title} when={opensIn(daysAhead)} />
      )}
      {state === 'done' && score && (
        <motion.span className="card-seal-slot" custom={index} variants={sealVariants} aria-hidden="true">
          <WaxSeal score={score} />
        </motion.span>
      )}
      {state === 'today' && <span className="card-ribbon">Сегодня</span>}
      <motion.span
        className="card-glare"
        aria-hidden="true"
        style={reduced ? undefined : { backgroundPositionX: glareX, backgroundPositionY: glareY }}
      />
      <span className="card-sheen" aria-hidden="true" />
    </motion.button>
  );
}

/** Стопка ещё не открытых карт: колода, из которой их будут выдавать. */
export function DeckPile({ count, index, onExpand }: { count: number; index: number; onExpand: () => void }) {
  const reduced = useReducedMotion();
  return (
    <motion.button
      type="button"
      className="deck-pile"
      custom={index}
      variants={dealVariants}
      onClick={onExpand}
      whileTap={reduced ? undefined : { scale: 0.97 }}
      aria-label={`Ещё ${count} ${plural(count, 'карта', 'карты', 'карт')} впереди. Показать все`}
    >
      {[2, 1, 0].map((layer) => (
        <span key={layer} className={`deck-pile-card is-layer-${layer}`}>
          <CardBack />
        </span>
      ))}
      <span className="deck-pile-label">
        <b>Ещё {count}</b>
        <span>{plural(count, 'карта', 'карты', 'карт')} в колоде</span>
        <span className="deck-pile-action">Показать все</span>
      </span>
    </motion.button>
  );
}
