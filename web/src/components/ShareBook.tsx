import { AnimatePresence, motion } from 'framer-motion';
import { useEffect, useRef, useState, type MouseEvent } from 'react';
import {
  FaInstagram,
  FaThreads,
  FaTelegram,
  FaViber,
  FaVk,
  FaWhatsapp,
} from 'react-icons/fa6';
import { HiLink, HiOutlinePaperAirplane } from 'react-icons/hi2';

import { ApiError } from '../api/client';
import { createShare, shareUrl, type SharedBook } from '../api/share';
import type { BookMeta } from '../lib/books';
import { useAuth } from '../state/auth';
import { useSync } from '../state/sync';
import { Spinner } from './ui';

interface ShareBookProps {
  book: BookMeta;
  /** Вызывается только после того, как человек действительно скопировал ссылку. */
  onLinkCopied?: (token: string) => void;
}

interface SocialAction {
  id: string;
  label: string;
  icon: React.ReactNode;
  href?: (url: string, text: string) => string;
  copyThenOpen?: string;
}

const SOCIALS: SocialAction[] = [
  {
    id: 'telegram',
    label: 'Telegram',
    icon: <FaTelegram />,
    href: (url, text) =>
      `https://t.me/share/url?url=${encodeURIComponent(url)}&text=${encodeURIComponent(text)}`,
  },
  {
    id: 'vk',
    label: 'ВКонтакте',
    icon: <FaVk />,
    href: (url, text) =>
      `https://vk.com/share.php?url=${encodeURIComponent(url)}&title=${encodeURIComponent(text)}`,
  },
  {
    id: 'whatsapp',
    label: 'WhatsApp',
    icon: <FaWhatsapp />,
    href: (url, text) =>
      `https://wa.me/?text=${encodeURIComponent(`${text} ${url}`)}`,
  },
  {
    id: 'viber',
    label: 'Viber',
    icon: <FaViber />,
    href: (url, text) =>
      `viber://forward?text=${encodeURIComponent(`${text} ${url}`)}`,
  },
  {
    id: 'threads',
    label: 'Threads',
    icon: <FaThreads />,
    href: (url, text) =>
      `https://www.threads.net/intent/post?text=${encodeURIComponent(`${text} ${url}`)}`,
  },
  {
    id: 'instagram',
    label: 'Instagram',
    icon: <FaInstagram />,
    // У Instagram нет публичного web-intent для произвольной ссылки.
    // Ссылка копируется, после чего открывается сам Instagram.
    copyThenOpen: 'https://www.instagram.com/',
  },
];

/**
 * Непубличная ссылка на книгу.
 *
 * Создание ссылки ещё не включает обсуждение в читалке: человек мог открыть
 * меню случайно. Волк появляется только после явного нажатия на кнопку-цепочку,
 * когда ссылка уже скопирована и её действительно собираются отправить.
 */
export function ShareBook({ book, onLinkCopied }: ShareBookProps) {
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
    const onOutside = (event: globalThis.MouseEvent) => {
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
    if (share || busy || !account) return;
    setError('');
    setBusy(true);
    try {
      if (!book.contentSha) {
        await sync();
        throw new ApiError(
          'Книга ещё не выгружена на сервер. Дождитесь синхронизации и попробуйте снова.',
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

  async function copy(markAsShared = true): Promise<boolean> {
    if (!share) return false;
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      if (markAsShared) onLinkCopied?.(share.token);
      window.setTimeout(() => setCopied(false), 2000);
      return true;
    } catch {
      setError(
        'Браузер не дал скопировать ссылку. Выделите её и скопируйте вручную.',
      );
      return false;
    }
  }

  async function openSocial(
    event: MouseEvent<HTMLButtonElement>,
    social: SocialAction,
  ) {
    event.preventDefault();
    if (!social.copyThenOpen) return;
    if (await copy(false)) {
      window.open(social.copyThenOpen, '_blank', 'noopener,noreferrer');
    }
  }

  return (
    <div className="relative" ref={box}>
      <button
        type="button"
        onClick={() => void prepare()}
        aria-label="Поделиться книгой"
        title="Поделиться книгой"
        className="flex min-h-11 items-center gap-2 rounded-2xl border border-[var(--line)] bg-[var(--bg-raised)] px-4 py-2.5 text-sm font-semibold text-[var(--text-muted)] transition-colors hover:border-[var(--accent)] hover:text-[var(--accent)]"
      >
        <HiOutlinePaperAirplane className="size-5 -rotate-12" aria-hidden="true" />
        <span className="hidden sm:inline">Поделиться</span>
      </button>

      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity: 0, y: -6 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -6 }}
            transition={{ duration: 0.18 }}
            className="absolute right-0 z-40 mt-2 w-[min(22rem,calc(100vw-2rem))] rounded-2xl border border-[var(--line)] bg-[var(--bg-raised)] p-4 shadow-[var(--shadow-lift)]"
            role="dialog"
            aria-label="Поделиться книгой"
          >
            {!account ? (
              <p className="text-sm text-[var(--text-muted)]">
                Чтобы поделиться книгой, войдите в аккаунт. Ссылка ведёт на
                текст, выгруженный в ваш аккаунт.
              </p>
            ) : busy ? (
              <div className="flex items-center gap-2 text-sm text-[var(--text-muted)]">
                <Spinner /> Готовим ссылку…
              </div>
            ) : error ? (
              <p className="text-sm text-[var(--text)]">{error}</p>
            ) : share ? (
              <>
                <p className="text-sm leading-relaxed text-[var(--text-muted)]">
                  В каталог она не попадает, она будет только у вас и тому кому
                  вы скинете
                </p>

                <div className="mt-4 grid grid-cols-6 gap-2">
                  {SOCIALS.map((social) =>
                    social.href ? (
                      <a
                        key={social.id}
                        href={social.href(url, text)}
                        target="_blank"
                        rel="noreferrer noopener"
                        aria-label={`Поделиться через ${social.label}`}
                        title={social.label}
                        className="flex aspect-square items-center justify-center rounded-xl border border-[var(--line)] bg-[var(--bg-sunken)] text-xl text-[var(--text-muted)] transition-all hover:-translate-y-0.5 hover:border-[var(--accent)] hover:text-[var(--accent)]"
                      >
                        {social.icon}
                      </a>
                    ) : (
                      <button
                        key={social.id}
                        type="button"
                        onClick={(event) => void openSocial(event, social)}
                        aria-label={`Скопировать ссылку и открыть ${social.label}`}
                        title={`${social.label}: ссылка будет скопирована`}
                        className="flex aspect-square items-center justify-center rounded-xl border border-[var(--line)] bg-[var(--bg-sunken)] text-xl text-[var(--text-muted)] transition-all hover:-translate-y-0.5 hover:border-[var(--accent)] hover:text-[var(--accent)]"
                      >
                        {social.icon}
                      </button>
                    ),
                  )}
                </div>

                <div className="mt-3 flex items-center gap-2">
                  <input
                    readOnly
                    value={url}
                    onFocus={(event) => event.currentTarget.select()}
                    className="min-w-0 flex-1 rounded-xl border border-[var(--line)] bg-[var(--bg-sunken)] px-3 py-2.5 text-xs text-[var(--text-muted)]"
                  />
                  <button
                    type="button"
                    onClick={() => void copy()}
                    aria-label="Скопировать ссылку и открыть обсуждение страниц"
                    title="Скопировать ссылку"
                    className="flex size-11 shrink-0 items-center justify-center rounded-xl border border-[var(--line)] bg-[var(--bg-sunken)] text-lg text-[var(--text-muted)] transition-colors hover:border-[var(--accent)] hover:text-[var(--accent)]"
                  >
                    <HiLink aria-hidden="true" />
                  </button>
                </div>
                {copied && (
                  <p className="mt-2 text-xs font-semibold text-emerald-600 dark:text-emerald-400">
                    Ссылка скопирована. Волк ждёт рядом со страницей.
                  </p>
                )}
              </>
            ) : null}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
