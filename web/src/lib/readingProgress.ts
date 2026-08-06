import { useSyncExternalStore } from 'react';

/**
 * Прогресс чтения книги — для полосы в шапке сайта.
 *
 * Считает его читалка, а рисует шапка: они в разных ветках дерева. Полоса
 * раньше рисовалась в самой читалке через `position: fixed`, но на странице
 * есть анимированная обёртка перехода (`PageTransition`), а трансформация у
 * предка делает его containing block для фиксированных потомков — полоса
 * переставала держаться за экран и уезжала вместе с текстом. Внутри
 * `sticky`-шапки этой проблемы нет в принципе: полоса просто последняя строка
 * шапки, как и полоса поддержки.
 *
 * Стор отдельный, а не контекст: провайдер поверх всего приложения
 * перерисовывал бы его на каждой перелистнутой странице книги.
 */
let progress: number | null = null;
const listeners = new Set<() => void>();

/** Доля прочитанного в процентах; `null` — книгу не читают, полосы нет. */
export function setReadingProgress(percent: number | null): void {
  const next = percent == null ? null : Math.min(100, Math.max(0, percent));
  if (next === progress) return;
  progress = next;
  for (const listener of listeners) listener();
}

export function useReadingProgress(): number | null {
  return useSyncExternalStore(subscribe, () => progress, () => null);
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}
