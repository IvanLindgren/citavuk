import { AnimatePresence, motion } from 'framer-motion';
import { useEffect, useRef, useState } from 'react';

import { ApiError } from '../api/client';
import {
  createShare,
  shareUrl,
  SOCIALS,
  type SharedBook,
} from '../api/share';
import type { BookMeta } from '../lib/books';
import { useAuth } from '../state/auth';
import { useSync } from '../state/sync';
import { Spinner } from './ui';

/**
 * Кнопка «поделиться книгой».
 *
 * Ссылка непубличная: каталога таких книг нет и в поиске они не появляются.
 * Причина не в приватности, а в праве — текст загрузил человек, и мы не знаем,
 * вправе ли он его распространять. Ссылка равносильна пересылке файла знакомому.
 *
 * Поделиться можно только тем, что успело выгрузиться на сервер: получатель
 * читает тот же текст, а не копию, поэтому без выгрузки ссылка вела бы в пустоту.
 */
export function ShareBook({ book }: { book: BookMeta }) {
  const { account } = useAuth();
  const { sync } = useSync();
  const [open, setOpen] = useState(false);
  const [share, setShare] = useState<SharedBook | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [copied, setCopied] = useState(false);
  const box = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onOutside = (event: MouseEvent) => {
      if (!box.current?.contains(event.target as Node)) setOpen(false);
    };
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setOpen(false);
    };
    document.addEventListener('mousedown', onOutside);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onOutside);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  async function prepare() {
    setOpen(true);
    if (share || busy) return;
    setError('');
    setBusy(true);
    try {
      if (!book.contentSha) {
        // Текста на сервере ещё нет — просим синхронизацию и говорим об этом.
        await sync();
        throw new ApiError(
          'Книга ещё не выгружена на сервер. Подождите синхронизации и попробуйте снова.',
          409,
        );
      }
      setShare(await createShare(book.contentSha, book.title, book.paragraphCount));
    } catch (caught) {
      setError(
        caught instanceof Error ? caught.message : 'Не удалось создать ссылку.',
      );
    } finally {
      setBusy(false);
    }
  }

  const url = share ? shareUrl(share.token) : '';
  const text = `«${book.title}» — читаю в Читавуке`;

  async function copy() {
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2000);
    } catch {
      setError('Браузер не дал скопировать. Выделите ссылку и скопируйте вручную.');
    }
  }

  return (
    <div className="relative" ref={box}>
      <button
        type="button"
        onClick={() => void prepare()}
        aria-label="Поделиться книгой"
        title="Поделиться книгой"
        className="flex items-center gap-2 rounded-2xl border border-[var(--line)] bg-[var(--bg-raised)] px-3.5 py-2.5 text-sm font-semibold text-[var(--text-muted)] transition-colors hover:border-[var(--accent)] hover:text-[var(--accent)]"
      >
        {/* Самолётик — привычный знак «отправить». */}
        <svg viewBox="0 0 24 24" className="size-4 fill-current" aria-hidden="true">
          <path d="M2.3 11.3 21 3.2c.8-.3 1.6.5 1.3 1.3l-8.1 18.7c-.3.8-1.5.8-1.8 0l-2.7-6.6-6.6-2.7c-.8-.3-.8-1.5 0-1.8zm7.9 3.1 1.9 4.6 5.8-13.4-7.7 8.8z" />
        </svg>
        Поделиться
      </button>

      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity: 0, y: -6 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -6 }}
            transition={{ duration: 0.18 }}
            className="absolute right-0 z-40 mt-2 w-[min(20rem,calc(100vw-2rem))] rounded-2xl border border-[var(--line)] bg-[var(--bg-raised)] p-4 shadow-[var(--shadow-lift)]"
            role="dialog"
            aria-label="Поделиться книгой"
          >
            {!account ? (
              <p className="text-sm text-[var(--text-muted)]">
                Чтобы поделиться книгой, войдите в аккаунт: ссылка ведёт на текст,
                выгруженный в ваш аккаунт.
              </p>
            ) : busy ? (
              <div className="flex items-center gap-2 text-sm text-[var(--text-muted)]">
                <Spinner /> Готовим ссылку…
              </div>
            ) : error ? (
              <p className="text-sm text-[var(--text)]">{error}</p>
            ) : (
              <>
                <p className="text-xs text-[var(--text-muted)]">
                  Ссылка открывает книгу и даёт добавить её себе. В каталог она не
                  попадает — только тот, кому вы её отправите.
                </p>

                <div className="mt-3 grid grid-cols-2 gap-2">
                  {SOCIALS.map((social) => (
                    <a
                      key={social.id}
                      href={social.href(url, text)}
                      target="_blank"
                      rel="noreferrer noopener"
                      className="rounded-xl border border-[var(--line)] bg-[var(--bg-sunken)] px-3 py-2 text-center text-sm font-semibold transition-colors hover:border-[var(--accent)] hover:text-[var(--accent)]"
                    >
                      {social.label}
                    </a>
                  ))}
                </div>

                <div className="mt-3 flex items-center gap-2">
                  <input
                    readOnly
                    value={url}
                    onFocus={(event) => event.currentTarget.select()}
                    className="min-w-0 flex-1 rounded-xl border border-[var(--line)] bg-[var(--bg-sunken)] px-3 py-2 text-xs text-[var(--text-muted)]"
                  />
                  <button
                    type="button"
                    onClick={() => void copy()}
                    aria-label="Скопировать ссылку"
                    title="Скопировать ссылку"
                    className="shrink-0 rounded-xl border border-[var(--line)] bg-[var(--bg-sunken)] p-2.5 text-[var(--text-muted)] transition-colors hover:border-[var(--accent)] hover:text-[var(--accent)]"
                  >
                    {/* Цепь — «просто ссылка», без соцсетей. */}
                    <svg viewBox="0 0 24 24" className="size-4 fill-current" aria-hidden="true">
                      <path d="M10.6 13.4a1 1 0 0 1 0-1.4l1.4-1.4a1 1 0 0 1 1.4 1.4l-1.4 1.4a1 1 0 0 1-1.4 0zm-2.1 4.9-1.4 1.4a3 3 0 0 1-4.2-4.2l3.5-3.6a3 3 0 0 1 4.3 0 1 1 0 0 1-1.5 1.4 1 1 0 0 0-1.4 0l-3.5 3.6a1 1 0 0 0 1.4 1.4l1.4-1.5a1 1 0 0 1 1.4 1.5zm12.6-12.6a3 3 0 0 1 0 4.2l-3.5 3.6a3 3 0 0 1-4.3 0 1 1 0 0 1 1.5-1.4 1 1 0 0 0 1.4 0l3.5-3.6a1 1 0 0 0-1.4-1.4l-1.4 1.5a1 1 0 0 1-1.4-1.5l1.4-1.4a3 3 0 0 1 4.2 0z" />
                    </svg>
                  </button>
                </div>
                {copied && (
                  <p className="mt-2 text-xs font-semibold text-emerald-600 dark:text-emerald-400">
                    Ссылка скопирована
                  </p>
                )}
              </>
            )}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
