import { motion, useReducedMotion } from 'framer-motion';
import { useMemo } from 'react';

/** Цвета флага и золото маскота. */
const COLORS = ['#c23b33', '#2e3b5b', '#faf3e7', '#c9a24b', '#e0bd6b', '#9e2b25'];

interface Piece {
  id: number;
  x: number;
  drift: number;
  size: number;
  color: string;
  round: boolean;
  delay: number;
  duration: number;
  spin: number;
}

function makePieces(count: number, seed: number): Piece[] {
  // Детерминированный разброс: при повторном рендере конфетти не прыгает.
  let state = seed;
  const rand = () => {
    state = (state * 16807) % 2147483647;
    return (state - 1) / 2147483646;
  };
  return Array.from({ length: count }, (_, id) => ({
    id,
    x: rand() * 100,
    drift: (rand() - 0.5) * 30,
    size: 6 + rand() * 8,
    color: COLORS[Math.floor(rand() * COLORS.length)]!,
    round: rand() > 0.65,
    delay: rand() * 0.9,
    duration: 2.6 + rand() * 1.8,
    spin: (rand() > 0.5 ? 1 : -1) * (360 + rand() * 540),
  }));
}

/**
 * Конфетти на весь экран: сыплется сверху один раз и исчезает. Слой не
 * перехватывает нажатия; при «уменьшить движение» не показывается вовсе.
 */
export function Confetti({ count = 130 }: { count?: number }) {
  const reduceMotion = useReducedMotion();
  const pieces = useMemo(() => makePieces(count, 20260928), [count]);
  if (reduceMotion) return null;

  return (
    <div data-confetti className="pointer-events-none fixed inset-0 z-[60] overflow-hidden" aria-hidden="true">
      {pieces.map((piece) => (
        <motion.span
          key={piece.id}
          className="absolute top-0 block"
          style={{
            left: `${piece.x}%`,
            width: piece.size,
            height: piece.round ? piece.size : piece.size * 0.45,
            background: piece.color,
            borderRadius: piece.round ? '999px' : '2px',
            boxShadow: piece.color === '#faf3e7' ? '0 0 0 1px rgb(0 0 0 / 0.08)' : undefined,
          }}
          initial={{ y: '-5vh', x: 0, rotate: 0, opacity: 1 }}
          animate={{
            y: '105vh',
            x: [0, piece.drift, -piece.drift / 2, piece.drift],
            rotate: piece.spin,
            opacity: [1, 1, 1, 0],
          }}
          transition={{ duration: piece.duration, delay: piece.delay, ease: [0.25, 0.1, 0.4, 1] }}
        />
      ))}
    </div>
  );
}

/** Лучи и искры вокруг маскота: вспышка при появлении и спокойное мерцание. */
export function Glory({ children }: { children: React.ReactNode }) {
  const reduceMotion = useReducedMotion();

  return (
    <div className="relative mx-auto grid size-48 place-items-center sm:size-56">
      {!reduceMotion && (
        <>
          <motion.div
            className="absolute inset-0 rounded-full"
            style={{
              background:
                'repeating-conic-gradient(from 0deg, color-mix(in srgb, var(--color-gold) 38%, transparent) 0deg 10deg, transparent 10deg 30deg)',
              maskImage: 'radial-gradient(circle, black 30%, transparent 70%)',
              WebkitMaskImage: 'radial-gradient(circle, black 30%, transparent 70%)',
            }}
            initial={{ scale: 0.4, opacity: 0 }}
            animate={{ scale: 1, opacity: 1, rotate: 360 }}
            transition={{
              scale: { duration: 0.7, ease: [0.22, 1, 0.36, 1] },
              opacity: { duration: 0.5 },
              rotate: { duration: 40, repeat: Infinity, ease: 'linear' },
            }}
          />
          {[0, 1, 2, 3, 4, 5].map((index) => {
            const angle = (index / 6) * Math.PI * 2;
            return (
              <motion.span
                key={index}
                className="absolute size-2.5 rounded-full bg-gold"
                style={{ left: '50%', top: '50%' }}
                initial={{ x: 0, y: 0, opacity: 0, scale: 0 }}
                animate={{
                  x: Math.cos(angle) * 110,
                  y: Math.sin(angle) * 110,
                  opacity: [0, 1, 0.8, 0],
                  scale: [0, 1.4, 1, 0.6],
                }}
                transition={{ duration: 1.4, delay: 0.25 + index * 0.04, ease: 'easeOut' }}
              />
            );
          })}
        </>
      )}
      <motion.div
        className="relative"
        initial={reduceMotion ? false : { scale: 0.3, rotate: -12, opacity: 0 }}
        animate={{ scale: 1, rotate: 0, opacity: 1 }}
        transition={{ type: 'spring', stiffness: 260, damping: 14, delay: 0.1 }}
      >
        {children}
      </motion.div>
    </div>
  );
}
