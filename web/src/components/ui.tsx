import { motion, useReducedMotion } from 'framer-motion';
import type { ButtonHTMLAttributes, ReactNode } from 'react';

/** Базовые элементы интерфейса, общие для всех страниц. */

type ButtonVariant = 'primary' | 'secondary' | 'ghost';

const VARIANTS: Record<ButtonVariant, string> = {
  primary:
    'bg-[var(--accent)] text-parchment shadow-[0_4px_0_0_color-mix(in_srgb,var(--accent)_60%,black)] ' +
    'hover:bg-[var(--accent-hover)] active:translate-y-[3px] active:shadow-[0_1px_0_0_color-mix(in_srgb,var(--accent)_60%,black)]',
  secondary:
    'bg-[var(--bg-raised)] text-[var(--text)] border border-[var(--line)] ' +
    'shadow-[0_3px_0_0_var(--line)] hover:border-[var(--accent)] ' +
    'active:translate-y-[2px] active:shadow-none',
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

/** Карточка на «приподнятом» фоне с мягкой тенью. */
export function Card({
  className = '',
  children,
}: {
  className?: string;
  children: ReactNode;
}) {
  return (
    <div
      className={[
        'relative overflow-hidden rounded-3xl border border-[var(--line)]',
        'bg-[var(--bg-raised)] shadow-[var(--shadow-soft)]',
        className,
      ].join(' ')}
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
