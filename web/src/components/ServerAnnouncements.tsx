import { AnimatePresence, motion, useReducedMotion } from 'framer-motion';
import { useState } from 'react';
import {
  LuBell,
  LuCheck,
  LuCopy,
  LuExternalLink,
  LuGift,
  LuShare2,
  LuX,
} from 'react-icons/lu';

import type { Announcement } from '../api/announcements';
import { useAuth } from '../state/auth';
import { useAnnouncements } from '../state/announcements';
import { Button, ErrorNote } from './ui';

export function NotificationBell() {
  const { account } = useAuth();
  const { unread, centerOpen, setCenterOpen } = useAnnouncements();
  if (!account) return null;
  return (
    <button
      type="button"
      onClick={() => setCenterOpen(!centerOpen)}
      className="relative grid size-10 place-items-center rounded-xl text-[var(--text-muted)] transition-colors hover:bg-[var(--bg-sunken)] hover:text-[var(--text)]"
      aria-label={unread ? `Уведомления: ${unread} непрочитанных` : 'Уведомления'}
      title="Уведомления"
    >
      <LuBell className="size-5" aria-hidden="true" />
      {unread > 0 && (
        <span className="absolute right-0.5 top-0.5 min-w-4 rounded-full bg-[var(--accent)] px-1 text-center text-[10px] font-bold leading-4 text-white">
          {unread > 99 ? '99+' : unread}
        </span>
      )}
    </button>
  );
}

export function ServerAnnouncements() {
  const { activeBanner, selected, centerOpen } = useAnnouncements();
  return (
    <>
      {activeBanner && <AnnouncementBanner announcement={activeBanner} />}
      <AnnouncementModal announcement={selected} />
      <NotificationCenter open={centerOpen} />
    </>
  );
}

function AnnouncementBanner({ announcement }: { announcement: Announcement }) {
  const { select, dismiss } = useAnnouncements();
  return (
    <aside className="relative z-30 border-y border-[var(--accent)]/25 bg-[var(--bg-raised)] shadow-[var(--shadow-soft)]">
      <div className="mx-auto flex max-w-6xl items-center gap-3 px-4 py-3 sm:px-5">
        {announcement.imageUrl && (
          <img src={announcement.imageUrl} alt="" className="size-12 shrink-0 object-contain sm:size-14" />
        )}
        <button type="button" onClick={() => select(announcement)} className="min-w-0 flex-1 text-left">
          <strong className="block text-base sm:text-lg">{announcement.title}</strong>
          <span className="mt-0.5 block text-sm text-[var(--text-muted)]">{announcement.bannerText}</span>
        </button>
        <button
          type="button"
          onClick={() => void dismiss(announcement)}
          className="grid size-10 shrink-0 place-items-center rounded-xl text-[var(--text-muted)] hover:bg-[var(--bg-sunken)]"
          aria-label="Закрыть объявление"
          title="Закрыть"
        >
          <LuX className="size-5" aria-hidden="true" />
        </button>
      </div>
    </aside>
  );
}

function AnnouncementModal({ announcement }: { announcement: Announcement | null }) {
  const reduceMotion = useReducedMotion();
  const { account } = useAuth();
  const { select, claim } = useAnnouncements();
  const [network, setNetwork] = useState('telegram');
  const [proofUrl, setProofUrl] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [copied, setCopied] = useState(false);

  const share = async () => {
    if (!announcement) return;
    const data = { title: announcement.title, text: announcement.shareText, url: 'https://citavuk.ru' };
    if (navigator.share) {
      await navigator.share(data).catch(() => undefined);
      return;
    }
    await navigator.clipboard.writeText(`${announcement.shareText}\nhttps://citavuk.ru`);
    setCopied(true);
  };

  const submitClaim = async () => {
    if (!announcement) return;
    setBusy(true); setError('');
    try {
      await claim(announcement, network, proofUrl);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Не удалось получить награду.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <AnimatePresence>
      {announcement && (
        <motion.div
          className="fixed inset-0 z-[70] grid place-items-center overflow-y-auto bg-black/45 p-4"
          initial={reduceMotion ? false : { opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
          onClick={() => select(null)}
        >
          <motion.section
            role="dialog" aria-modal="true" aria-labelledby="announcement-title"
            initial={reduceMotion ? false : { opacity: 0, y: 18, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }} exit={{ opacity: 0, y: 10 }}
            className="relative my-auto w-full max-w-2xl rounded-2xl border border-[var(--line)] bg-[var(--bg-raised)] p-5 shadow-[var(--shadow-lift)] sm:p-7"
            onClick={(event) => event.stopPropagation()}
          >
            <button type="button" onClick={() => select(null)} aria-label="Закрыть" title="Закрыть"
              className="absolute right-3 top-3 grid size-10 place-items-center rounded-xl text-[var(--text-muted)] hover:bg-[var(--bg-sunken)]">
              <LuX className="size-5" aria-hidden="true" />
            </button>
            {announcement.imageUrl && (
              <img src={announcement.imageUrl} alt="" className="mb-4 max-h-56 w-full object-contain" />
            )}
            <h2 id="announcement-title" className="pr-10 text-2xl sm:text-3xl">{announcement.title}</h2>
            <p className="mt-4 whitespace-pre-wrap leading-relaxed text-[var(--text-muted)]">{announcement.body}</p>

            {announcement.shareRequired && !announcement.claimedAt && (
              <div className="mt-6 border-t border-[var(--line)] pt-5">
                <label className="text-sm font-semibold" htmlFor="announcement-share-text">Текст для публикации</label>
                <textarea id="announcement-share-text" readOnly value={announcement.shareText} rows={4}
                  className="mt-2 w-full resize-y rounded-xl border border-[var(--line)] bg-[var(--bg-sunken)] px-3 py-2.5 text-sm" />
                <div className="mt-3 flex flex-wrap gap-2">
                  <Button size="sm" onClick={() => void share()}>
                    <LuShare2 className="size-4" /> Поделиться
                  </Button>
                  <Button size="sm" variant="secondary" onClick={async () => {
                    await navigator.clipboard.writeText(`${announcement.shareText}\nhttps://citavuk.ru`);
                    setCopied(true);
                  }}>
                    {copied ? <LuCheck className="size-4" /> : <LuCopy className="size-4" />}
                    {copied ? 'Скопировано' : 'Скопировать'}
                  </Button>
                </div>
                {account ? (
                  <div className="mt-5 grid gap-3 sm:grid-cols-[160px_1fr_auto] sm:items-end">
                    <label className="text-sm font-semibold">Соцсеть
                      <select value={network} onChange={(event) => setNetwork(event.target.value)}
                        className="mt-1.5 w-full rounded-xl border border-[var(--line)] bg-[var(--bg)] px-3 py-2.5 font-normal">
                        <option value="instagram">Instagram</option><option value="threads">Threads</option>
                        <option value="facebook">Facebook</option><option value="twitter">X / Twitter</option>
                        <option value="vk">ВКонтакте</option><option value="telegram">Telegram</option>
                      </select>
                    </label>
                    <label className="text-sm font-semibold">Ссылка на пост
                      <input type="url" value={proofUrl} onChange={(event) => setProofUrl(event.target.value)}
                        placeholder="https://…" className="mt-1.5 w-full rounded-xl border border-[var(--line)] bg-[var(--bg)] px-3 py-2.5 font-normal" />
                    </label>
                    <Button size="sm" disabled={busy || !proofUrl.trim()} onClick={() => void submitClaim()}>
                      <LuGift className="size-4" /> Получить фон
                    </Button>
                  </div>
                ) : <p className="mt-4 text-sm font-semibold text-[var(--accent)]">Войдите в аккаунт, чтобы награда сохранилась на всех устройствах.</p>}
                {error && <div className="mt-3"><ErrorNote>{error}</ErrorNote></div>}
              </div>
            )}

            {announcement.claimedAt && (
              <div className="mt-6 flex items-center gap-3 rounded-xl bg-emerald-600/10 px-4 py-3 text-sm font-semibold text-emerald-700 dark:text-emerald-300">
                <LuGift className="size-5" /> Фон открыт и доступен в настройках читалки.
              </div>
            )}
            {announcement.actionUrl && !announcement.shareRequired && (
              <a href={announcement.actionUrl} className="mt-6 inline-flex items-center gap-2 font-semibold text-[var(--accent)]">
                {announcement.actionLabel || 'Открыть'} <LuExternalLink className="size-4" />
              </a>
            )}
          </motion.section>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

function NotificationCenter({ open }: { open: boolean }) {
  const { notifications, unread, setCenterOpen, openNotification, readAll } = useAnnouncements();
  return (
    <AnimatePresence>
      {open && (
        <motion.aside role="dialog" aria-label="Уведомления"
          initial={{ opacity: 0, x: 24 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: 20 }}
          className="fixed bottom-4 right-4 top-20 z-[65] flex w-[min(390px,calc(100vw-2rem))] flex-col overflow-hidden rounded-2xl border border-[var(--line)] bg-[var(--bg-raised)] shadow-[var(--shadow-lift)]">
          <div className="flex items-center justify-between border-b border-[var(--line)] px-4 py-3">
            <div><h2 className="text-xl">Уведомления</h2><p className="text-xs text-[var(--text-muted)]">Непрочитанных: {unread}</p></div>
            <div className="flex items-center gap-1">
              {unread > 0 && <button type="button" onClick={() => void readAll()} className="rounded-lg px-2 py-1.5 text-xs font-semibold text-[var(--accent)] hover:bg-[var(--bg-sunken)]">Прочитать все</button>}
              <button type="button" onClick={() => setCenterOpen(false)} className="grid size-9 place-items-center rounded-lg hover:bg-[var(--bg-sunken)]" aria-label="Закрыть" title="Закрыть"><LuX className="size-5" /></button>
            </div>
          </div>
          <div className="flex-1 overflow-y-auto">
            {notifications.length === 0 ? <p className="p-6 text-center text-sm text-[var(--text-muted)]">Новых уведомлений пока нет.</p> : notifications.map((item) => (
              <button key={item.id} type="button" onClick={() => void openNotification(item)}
                className={`block w-full border-b border-[var(--line)] px-4 py-3 text-left hover:bg-[var(--bg-sunken)] ${item.readAt ? '' : 'bg-[var(--accent)]/5'}`}>
                <span className="flex items-start gap-2"><span className={`mt-1.5 size-2 shrink-0 rounded-full ${item.readAt ? 'bg-transparent' : 'bg-[var(--accent)]'}`} />
                  <span><strong className="block text-sm">{item.title}</strong><span className="mt-1 block text-sm text-[var(--text-muted)]">{item.body}</span><time className="mt-1.5 block text-xs text-[var(--text-muted)]">{new Date(item.createdAt).toLocaleString('ru-RU')}</time></span>
                </span>
              </button>
            ))}
          </div>
        </motion.aside>
      )}
    </AnimatePresence>
  );
}
