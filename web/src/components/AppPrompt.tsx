import { AnimatePresence, motion, useReducedMotion } from 'framer-motion';
import { useEffect, useState } from 'react';

import { Link, useRouter } from '../lib/router';

const DISMISS_KEY = 'citavuk-app-prompt-dismissed';

/** Через сколько после открытия сайта показывать предложение. */
const DELAY_MS = 25_000;

/** Страницы, где предложение только мешает. */
const HIDDEN_ON = ['/reader/', '/course/lesson/', '/listening/', '/downloads', '/login'];

/**
 * Ненавязчивое предложение поставить приложение.
 *
 * Появляется не сразу: человек, который только открыл сайт, ещё не понял, что
 * ему предлагают, и закроет что угодно. Крестик запоминается навсегда — второй
 * раз показывать то, от чего уже отказались, значит раздражать.
 */
export function AppPrompt() {
  const { path } = useRouter();
  const [visible, setVisible] = useState(false);
  const reduceMotion = useReducedMotion();

  useEffect(() => {
    // Мобильным приложение предлагается, десктопным — тоже: сборки есть под
    // Android и Windows. А вот внутри самого приложения (WebView) предлагать
    // его же было бы нелепо.
    if (isInsideApp()) return;
    if (dismissed()) return;

    const timer = window.setTimeout(() => setVisible(true), DELAY_MS);
    return () => window.clearTimeout(timer);
  }, []);

  const hidden = HIDDEN_ON.some((prefix) => path.startsWith(prefix));

  function dismiss() {
    setVisible(false);
    try {
      localStorage.setItem(DISMISS_KEY, '1');
    } catch {
      // Приватный режим: предложение вернётся в следующей сессии. Ничего
      // страшнее этого здесь не случится.
    }
  }

  return (
    <AnimatePresence>
      {visible && !hidden && (
        <motion.aside
          initial={reduceMotion ? { opacity: 0 } : { opacity: 0, y: 24, scale: 0.96 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          exit={reduceMotion ? { opacity: 0 } : { opacity: 0, y: 16, scale: 0.97 }}
          transition={{ duration: 0.32, ease: [0.22, 1, 0.36, 1] }}
          className="fixed bottom-4 right-4 z-50 w-[min(22rem,calc(100vw-2rem))]"
          aria-label="Предложение установить приложение"
        >
          <div className="overflow-hidden rounded-3xl border border-[var(--line)] bg-[var(--bg-raised)] shadow-[var(--shadow-lift)]">
            <div className="flex items-start gap-3 p-4">
              <img
                src="/img/citavuk_icon.webp"
                srcSet="/img/citavuk_icon.webp 1x, /img/citavuk_icon@2x.webp 2x"
                alt=""
                width={44}
                height={44}
                className="size-11 shrink-0 rounded-xl"
              />
              <div className="min-w-0 flex-1">
                <p className="font-display text-lg font-bold leading-tight">
                  Читавук под рукой
                </p>
                <p className="mt-1 text-sm leading-relaxed text-[var(--text-muted)]">
                  Приложение для Android и Windows: офлайн-словарь и чтение без
                  браузера. Книги общие.
                </p>
              </div>
              <button
                type="button"
                onClick={dismiss}
                aria-label="Больше не предлагать"
                title="Больше не предлагать"
                className="-m-1 shrink-0 rounded-full p-1.5 text-[var(--text-muted)] transition-colors hover:bg-[var(--bg-sunken)] hover:text-[var(--text)]"
              >
                <svg viewBox="0 0 20 20" className="size-4 fill-current" aria-hidden="true">
                  <path d="M6.3 5A1 1 0 004.9 6.4L8.5 10l-3.6 3.6a1 1 0 101.4 1.4L10 11.4l3.6 3.6a1 1 0 001.4-1.4L11.4 10l3.6-3.6A1 1 0 0013.6 5L10 8.6 6.4 5z" />
                </svg>
              </button>
            </div>

            <div className="flex gap-2 border-t border-[var(--line)] p-3">
              <Link
                to="/downloads"
                onClick={dismiss}
                className="flex-1 rounded-xl bg-[var(--accent)] px-4 py-2.5 text-center text-sm font-semibold text-parchment transition-colors hover:bg-[var(--accent-hover)]"
              >
                Скачать
              </Link>
              <button
                type="button"
                onClick={dismiss}
                className="rounded-xl px-4 py-2.5 text-sm font-semibold text-[var(--text-muted)] transition-colors hover:bg-[var(--bg-sunken)]"
              >
                Не сейчас
              </button>
            </div>
          </div>
        </motion.aside>
      )}
    </AnimatePresence>
  );
}

function dismissed(): boolean {
  try {
    return localStorage.getItem(DISMISS_KEY) === '1';
  } catch {
    return false;
  }
}

/**
 * Сайт открыт внутри самого приложения.
 *
 * Flutter-обёртка ходит по сети обычным WebView, и предлагать там установку
 * уже установленного приложения бессмысленно.
 */
function isInsideApp(): boolean {
  if (typeof navigator === 'undefined') return false;
  return /citavuk-app|wv\)|; wv/i.test(navigator.userAgent);
}
