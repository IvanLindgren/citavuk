import { useEffect, useRef, type RefObject } from 'react';

/**
 * Общие механики всплывающих слоёв: блокировка прокрутки и удержание фокуса.
 *
 * Раньше и то и другое писалось на месте в каждом компоненте, и оба раза
 * неполно. Собрано здесь, потому что ошибиться в этом легко, а заметить —
 * трудно: и незакрывшийся замок прокрутки, и убежавший фокус проявляются
 * только у того, кто пользуется клавиатурой или наткнулся на редкий порядок
 * действий.
 */

/**
 * Счётчик замков прокрутки.
 *
 * Именно счётчик, а не флаг. Каждый слой запоминал прежнее значение
 * `body.style.overflow` сам, и два слоя внахлёст ломали друг друга: закрывался
 * верхний, восстанавливал «как было ДО нижнего» — то есть отпускал прокрутку
 * под всё ещё открытым нижним слоем. Обратный порядок оставлял страницу
 * заблокированной насовсем, и починить это можно было только перезагрузкой.
 */
let locks = 0;
let restoreOverflow = '';

function lockScroll() {
  if (locks === 0) {
    restoreOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
  }
  locks += 1;
}

function unlockScroll() {
  locks = Math.max(0, locks - 1);
  if (locks === 0) document.body.style.overflow = restoreOverflow;
}

/** Блокирует прокрутку страницы, пока `active`. */
export function useScrollLock(active: boolean) {
  useEffect(() => {
    if (!active) return;
    lockScroll();
    return unlockScroll;
  }, [active]);
}

/** Что вообще может получить фокус внутри слоя. */
const FOCUSABLE = [
  'a[href]',
  'button:not([disabled])',
  'input:not([disabled])',
  'select:not([disabled])',
  'textarea:not([disabled])',
  '[tabindex]:not([tabindex="-1"])',
].join(',');

export function focusableInside(container: HTMLElement): HTMLElement[] {
  return Array.from(container.querySelectorAll<HTMLElement>(FOCUSABLE))
    // Скрытые элементы в обход попадать не должны: у них нулевой размер, и
    // фокус на них выглядит как «Tab ничего не делает».
    .filter((element) => element.offsetWidth > 0 || element.offsetHeight > 0);
}

/**
 * Удерживает фокус внутри слоя и возвращает его на место при закрытии.
 *
 * Без этого Tab уводил из открытой шторки в ссылки ПОД ней: с клавиатуры
 * человек оказывался в контенте, которого не видит, а скринридер не знал, что
 * поверх страницы вообще что-то открыто.
 */
export function useFocusTrap(
  active: boolean,
  containerRef: RefObject<HTMLElement | null>,
) {
  const returnToRef = useRef<HTMLElement | null>(null);

  useEffect(() => {
    if (!active) return;
    const container = containerRef.current;
    if (!container) return;

    // Куда вернуть фокус после закрытия — почти всегда кнопка, которая слой и
    // открыла. Без возврата фокус уезжает в начало страницы, и обход
    // приходится начинать заново.
    returnToRef.current = document.activeElement as HTMLElement | null;

    const items = focusableInside(container);
    (items[0] ?? container).focus();

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Tab') return;
      const focusable = focusableInside(container);
      if (focusable.length === 0) {
        event.preventDefault();
        return;
      }
      const first = focusable[0]!;
      const last = focusable[focusable.length - 1]!;
      const current = document.activeElement;
      if (event.shiftKey && (current === first || !container.contains(current))) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && current === last) {
        event.preventDefault();
        first.focus();
      }
    };

    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('keydown', onKeyDown);
      returnToRef.current?.focus?.();
    };
  }, [active, containerRef]);
}
