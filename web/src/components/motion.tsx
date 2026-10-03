import { animate, motion, useInView, useMotionValue, useReducedMotion, useTransform } from 'framer-motion';
import { useEffect, useMemo, useRef, type ReactNode } from 'react';

/**
 * Общие приёмы движения: всплеск при верном ответе, встряска при ошибке,
 * счётчик и проявление текста по словам. Все уважают «уменьшить движение» в
 * системе: тогда показывают итог сразу.
 */

const COLORS = ['#c0392b', '#d4a017', '#2f7d58', '#3b6fb6', '#e67e22', '#8e44ad'];

/** Конфетти из центра: короткий салют на верный ответ. */
export function Confetti({ count = 18, className = '' }: { count?: number; className?: string }) {
  const reduced = useReducedMotion();
  const pieces = useMemo(
    () =>
      Array.from({ length: count }, (_, index) => {
        const angle = (index / count) * Math.PI * 2 + Math.random() * 0.5;
        const distance = 60 + Math.random() * 70;
        return {
          x: Math.cos(angle) * distance,
          y: Math.sin(angle) * distance - 30,
          rotate: Math.random() * 540 - 270,
          color: COLORS[index % COLORS.length],
          round: index % 3 === 0,
          delay: Math.random() * 0.08,
        };
      }),
    [count],
  );
  if (reduced) return null;
  return (
    <span aria-hidden="true" className={`pointer-events-none absolute z-10 ${className}`}>
      {pieces.map((piece, index) => (
        <motion.span
          key={index}
          className={`absolute left-0 top-0 block ${piece.round ? 'size-2 rounded-full' : 'h-2.5 w-1.5 rounded-[1px]'}`}
          style={{ backgroundColor: piece.color }}
          initial={{ x: 0, y: 0, opacity: 1, scale: 0.4, rotate: 0 }}
          animate={{ x: piece.x, y: [0, piece.y, piece.y + 40], opacity: [1, 1, 0], scale: 1, rotate: piece.rotate }}
          transition={{ duration: 1.1, delay: piece.delay, ease: [0.22, 1, 0.36, 1] }}
        />
      ))}
    </span>
  );
}

/** Встряска по ключу: при каждой смене [trigger] блок коротко дёргается. */
export function Shake({ trigger, children, className }: { trigger: unknown; children: ReactNode; className?: string }) {
  const reduced = useReducedMotion();
  return (
    <motion.div
      key={String(trigger)}
      className={className}
      animate={reduced || !trigger ? undefined : { x: [0, -9, 8, -6, 4, -2, 0] }}
      transition={{ duration: 0.45, ease: 'easeInOut' }}
    >
      {children}
    </motion.div>
  );
}

/** Число, которое «набегает» до значения, когда появляется на экране. */
export function CountUp({ value, suffix = '', duration = 1.1 }: { value: number; suffix?: string; duration?: number }) {
  const reduced = useReducedMotion();
  const ref = useRef<HTMLSpanElement>(null);
  const inView = useInView(ref, { once: true });
  const count = useMotionValue(reduced ? value : 0);
  const rounded = useTransform(count, (latest) => `${Math.round(latest)}${suffix}`);
  useEffect(() => {
    if (!inView || reduced) return;
    const controls = animate(count, value, { duration, ease: [0.22, 1, 0.36, 1] });
    return () => controls.stop();
  }, [count, duration, inView, reduced, value]);
  return <motion.span ref={ref}>{rounded}</motion.span>;
}

/** Текст проявляется по словам: из размытия, с лёгким подъёмом. */
export function WordsReveal({ text, delay = 0, className }: { text: string; delay?: number; className?: string }) {
  const reduced = useReducedMotion();
  if (reduced) return <span className={className}>{text}</span>;
  const words = text.split(/(\s+)/);
  return (
    <span className={className}>
      {words.map((word, index) =>
        /\s+/.test(word) ? (
          word
        ) : (
          <motion.span
            key={index}
            className="inline-block"
            initial={{ opacity: 0, y: 6, filter: 'blur(6px)' }}
            animate={{ opacity: 1, y: 0, filter: 'blur(0px)' }}
            transition={{ duration: 0.32, delay: delay + index * 0.035, ease: [0.22, 1, 0.36, 1] }}
          >
            {word}
          </motion.span>
        ),
      )}
    </span>
  );
}

/** Появление при прокрутке: подъём и проявление один раз. */
export function Reveal({ children, delay = 0, className }: { children: ReactNode; delay?: number; className?: string }) {
  const reduced = useReducedMotion();
  return (
    <motion.div
      className={className}
      initial={reduced ? false : { opacity: 0, y: 18 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, margin: '-40px' }}
      transition={{ duration: 0.45, delay, ease: [0.22, 1, 0.36, 1] }}
    >
      {children}
    </motion.div>
  );
}
