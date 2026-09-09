import { motion, useReducedMotion } from 'framer-motion';
import type { ButtonHTMLAttributes, CSSProperties, ReactNode } from 'react';

/** Базовые элементы интерфейса, общие для всех страниц. */

type ButtonVariant = 'primary' | 'secondary' | 'ghost';

const VARIANTS: Record<ButtonVariant, string> = {
  // Объёмная кнопка с «толщиной» — только для главных действий. Тот же приём,
  // что на «тропе уровней» в приложении: нажатие утапливает кнопку.
  primary:
    'bg-[var(--accent)] text-parchment shadow-[0_4px_0_0_color-mix(in_srgb,var(--accent)_60%,black)] ' +
    'hover:bg-[var(--accent-hover)] active:translate-y-[3px] active:shadow-[0_1px_0_0_color-mix(in_srgb,var(--accent)_60%,black)]',
  // Обычные действия — спокойная контурная кнопка без объёма и сдвига.
  secondary:
    'bg-[var(--bg-raised)] text-[var(--text)] border border-[var(--line)] ' +
    'hover:border-[var(--accent)] active:bg-[var(--bg-sunken)]',
  ghost: 'text-[var(--text-muted)] hover:text-[var(--accent)] hover:bg-[var(--bg-sunken)]',
};

export function Button({
  variant = 'primary',
  size = 'md',
  className = '',
  children,
  ...rest
}: {
  variant?: ButtonVariant;
  size?: 'sm' | 'md' | 'lg';
  children: ReactNode;
} & ButtonHTMLAttributes<HTMLButtonElement>) {
  const sizes = {
    sm: 'px-4 py-2 text-sm',
    md: 'px-6 py-3 text-base',
    lg: 'px-8 py-4 text-lg',
  };

  return (
    <button
      className={[
        'relative inline-flex items-center justify-center gap-2 rounded-2xl font-semibold',
        // Смещение вниз при нажатии имитирует настоящую кнопку с толщиной —
        // тот же приём, что на «тропе уровней» в приложении.
        'transition-[background-color,border-color,transform,box-shadow] duration-150',
        'disabled:pointer-events-none disabled:opacity-50',
        VARIANTS[variant],
        sizes[size],
        className,
      ].join(' ')}
      {...rest}
    >
      {children}
    </button>
  );
}

/**
 * Карточка. Поверхности делятся на три:
 * - `raised` (по умолчанию) — приподнятая, с мягкой тенью;
 * - `contour` — плоская с рамкой, без тени: списки книг, сообщения;
 * - `flat` — просто фон: вставки внутри других поверхностей.
 * Объёмная тень остаётся только у слоёв (меню, диалоги, панели) и `raised`.
 */
export function Card({
  className = '',
  style,
  tone = 'raised',
  children,
}: {
  className?: string;
  style?: CSSProperties;
  tone?: 'raised' | 'contour' | 'flat';
  children: ReactNode;
}) {
  return (
    <div
      className={[
        'relative overflow-hidden rounded-3xl',
        tone === 'raised' &&
          'border border-[var(--line)] bg-[var(--bg-raised)] shadow-[var(--shadow-soft)]',
        tone === 'contour' && 'border border-[var(--line)] bg-[var(--bg-raised)]',
        tone === 'flat' && 'bg-[var(--bg-sunken)]',
        className,
      ]
        .filter(Boolean)
        .join(' ')}
      style={style}
    >
      {children}
    </div>
  );
}

/**
 * Появление блока при прокрутке.
 *
 * `once: true` обязателен: повторный запуск анимации при каждом возврате к
 * блоку раздражает и мешает читать.
 */
export function Reveal({
  children,
  delay = 0,
  y = 24,
  className = '',
}: {
  children: ReactNode;
  delay?: number;
  y?: number;
  className?: string;
}) {
  const reduceMotion = useReducedMotion();
  if (reduceMotion) return <div className={className}>{children}</div>;

  return (
    <motion.div
      className={className}
      initial={{ opacity: 0, y }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, margin: '-60px' }}
      transition={{ duration: 0.55, delay, ease: [0.22, 1, 0.36, 1] }}
    >
      {children}
    </motion.div>
  );
}

/** Ненавязчивый индикатор ожидания ответа сервера. */
export function Spinner({ className = '' }: { className?: string }) {
  return (
    <span
      className={[
        'inline-block size-4 animate-spin rounded-full',
        'border-2 border-current border-t-transparent',
        className,
      ].join(' ')}
      role="status"
      aria-label="Загрузка"
    />
  );
}

/** Короткий праздничный акцент для завершённого действия. */
export function SparkleBurst({ className = '' }: { className?: string }) {
  const reduced = useReducedMotion();
  if (reduced) return null;
  const sparks = [
    [-42, -18, 0], [38, -25, 0.05], [-28, 23, 0.1],
    [46, 18, 0.15], [4, -38, 0.2], [9, 31, 0.25],
  ] as const;
  return (
    <span className={`pointer-events-none absolute inset-0 overflow-visible ${className}`} aria-hidden="true">
      {sparks.map(([x, y, delay], index) => (
        <motion.span
          key={`${x}-${y}`}
          className="absolute left-1/2 top-1/2 text-gold"
          initial={{ x: 0, y: 0, opacity: 0, scale: 0.2, rotate: 0 }}
          animate={{ x, y, opacity: [0, 1, 0], scale: [0.2, 1.15, 0.65], rotate: 90 + index * 30 }}
          transition={{ duration: 0.72, delay, ease: [0.22, 1, 0.36, 1] }}
        >✦</motion.span>
      ))}
    </span>
  );
}

/** Три точки с неодинаковой фазой — ожидание без вращающегося круга. */
export function ThinkingDots() {
  const reduced = useReducedMotion();
  return (
    <span className="inline-flex items-center gap-1" aria-hidden="true">
      {[0, 1, 2].map((index) => (
        <motion.span
          key={index}
          className="size-1.5 rounded-full bg-current"
          animate={reduced ? undefined : { y: [0, -4, 0], opacity: [0.35, 1, 0.35] }}
          transition={{ duration: 0.85, delay: index * 0.14, repeat: Infinity, ease: 'easeInOut' }}
        />
      ))}
    </span>
  );
}

/** Плашка ошибки. Текст приходит с сервера уже на русском. */
export function ErrorNote({ children }: { children: ReactNode }) {
  return (
    <div
      role="alert"
      className="flex items-start gap-2 rounded-2xl border border-serb-red/30 bg-serb-red/10 px-4 py-3 text-sm text-[var(--text)]"
    >
      <svg viewBox="0 0 20 20" className="mt-0.5 size-4 shrink-0 fill-serb-red" aria-hidden="true">
        <path d="M10 2a8 8 0 100 16 8 8 0 000-16zm0 4a1 1 0 011 1v4a1 1 0 11-2 0V7a1 1 0 011-1zm0 8.5a1.25 1.25 0 110-2.5 1.25 1.25 0 010 2.5z" />
      </svg>
      <span>{children}</span>
    </div>
  );
}
