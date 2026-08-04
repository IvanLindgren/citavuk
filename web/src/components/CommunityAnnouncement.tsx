import { AnimatePresence, motion, useReducedMotion } from 'framer-motion';
import { useEffect, useState } from 'react';
import { useAnnouncements } from '../state/announcements';

const DISMISSED_KEY = 'citavuk-community-announcement-v1';
const CHAT_URL = 'https://t.me/citavukchat';

function wasDismissed(): boolean {
  try {
    return window.localStorage.getItem(DISMISSED_KEY) === 'dismissed';
  } catch {
    return false;
  }
}

/** Одноразовый анонс сообщества. Новому важному объявлению нужен новый ключ. */
export function CommunityAnnouncement() {
  const { activeBanner } = useAnnouncements();
  const [open, setOpen] = useState(() => !wasDismissed());
  const reduceMotion = useReducedMotion();

  useEffect(() => {
    if (!open) return;
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') dismiss();
    };
    window.addEventListener('keydown', closeOnEscape);
    return () => window.removeEventListener('keydown', closeOnEscape);
  }, [open]);

  function dismiss() {
    try {
      window.localStorage.setItem(DISMISSED_KEY, 'dismissed');
    } catch {
      // В приватном режиме хранилище может быть недоступно; закрытие всё равно работает.
    }
    setOpen(false);
  }

  if (activeBanner) return null;

  return (
    <AnimatePresence initial={!reduceMotion}>
      {open && (
        <motion.aside
          role="dialog"
          aria-modal="false"
          aria-labelledby="community-announcement-title"
          initial={reduceMotion ? false : { opacity: 0, y: -18 }}
          animate={{ opacity: 1, y: 0 }}
          exit={reduceMotion ? { opacity: 0 } : { opacity: 0, y: -12 }}
          transition={{ duration: 0.3, ease: [0.22, 1, 0.36, 1] }}
          className="relative z-30 border-y border-[var(--accent)]/25 bg-[var(--bg-raised)] shadow-[var(--shadow-soft)]"
        >
          <div className="mx-auto grid max-w-6xl grid-cols-[64px_1fr_auto] items-center gap-3 px-4 py-4 sm:grid-cols-[88px_1fr_auto] sm:gap-5 sm:px-5">
            <img
              src="/img/citavuk_zdravo.webp"
              srcSet="/img/citavuk_zdravo.webp 1x, /img/citavuk_zdravo@2x.webp 2x"
              alt=""
              width={176}
              height={176}
              className="w-16 object-contain sm:w-22"
            />
            <div className="min-w-0">
              <h2 id="community-announcement-title" className="text-xl sm:text-2xl">
                У Читавука появился чат
              </h2>
              <p className="mt-1.5 text-sm leading-relaxed text-[var(--text-muted)] sm:text-base">
                Привет! Рад объявить, что в Telegram появился чат обсуждения
                Читавука. Там можно поговорить с разработчиком, рассказать о
                багах в приложении — именно в чате я замечу их быстрее всего,
                предложить идеи и в будущем получить доступ к бета-версиям.
              </p>
              <a
                href={CHAT_URL}
                target="_blank"
                rel="noreferrer noopener"
                className="mt-3 inline-flex min-h-11 items-center gap-2 rounded-xl bg-[var(--accent)] px-4 py-2.5 text-sm font-bold text-white transition-colors hover:bg-[var(--accent-hover)]"
              >
                <TelegramIcon />
                Вступить в чат
                <span className="hidden font-normal opacity-85 sm:inline">t.me/citavukchat</span>
              </a>
            </div>
            <button
              type="button"
              onClick={dismiss}
              className="self-start rounded-xl p-2 text-[var(--text-muted)] transition-colors hover:bg-[var(--bg-sunken)] hover:text-[var(--text)]"
              aria-label="Закрыть объявление"
              title="Закрыть"
            >
              <svg viewBox="0 0 24 24" className="size-6 fill-current" aria-hidden="true">
                <path d="M6.4 5L5 6.4 10.6 12 5 17.6 6.4 19 12 13.4 17.6 19 19 17.6 13.4 12 19 6.4 17.6 5 12 10.6z" />
              </svg>
            </button>
          </div>
        </motion.aside>
      )}
    </AnimatePresence>
  );
}

function TelegramIcon() {
  return (
    <svg viewBox="0 0 24 24" className="size-5 fill-current" aria-hidden="true">
      <path d="M21.6 3.4a1.4 1.4 0 00-1.45-.2L3.1 9.8a1.45 1.45 0 00.08 2.74l4.2 1.38 1.62 5.1a1.36 1.36 0 002.38.45l2.32-2.73 4.25 3.13a1.45 1.45 0 002.28-.87l2.07-14.2a1.4 1.4 0 00-.7-1.4zM9.7 13.15l7.98-5.1-6.42 6.12-.62 2.4-.94-3.42z" />
    </svg>
  );
}
