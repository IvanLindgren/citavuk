import { AnimatePresence, motion, useReducedMotion } from 'framer-motion';
import { useState } from 'react';
import {
  LuBell,
  LuCheck,
  LuCopy,
  LuExternalLink,
  LuGift,
  LuMegaphone,
  LuWrench,
  LuShare2,
  LuX,
} from 'react-icons/lu';

import type { Announcement, AnnouncementKind } from '../api/announcements';
import { useAuth } from '../state/auth';
import { useAnnouncements } from '../state/announcements';
import { Button, ErrorNote } from './ui';

const KIND_META: Record<AnnouncementKind, { label: string; icon: typeof LuBell }> = {
  maintenance: { label: 'Сервис', icon: LuWrench },
  campaign: { label: 'Акция', icon: LuGift },
  news: { label: 'Новость', icon: LuMegaphone },
};

function KindChip({ kind, critical }: { kind: AnnouncementKind; critical?: boolean }) {
  const meta = KIND_META[kind] ?? KIND_META.news;
  const Icon = meta.icon;
  return (
    <span
      className={`inline-flex shrink-0 items-center gap-1 rounded-lg border px-2 py-0.5 text-xs font-semibold ${
        critical ? 'border-[var(--error)]/50 text-[var(--error)]' : 'border-[var(--line)] text-[var(--text-muted)]'
      }`}
    >
      <Icon className="size-3.5" aria-hidden="true" />
      {meta.label}
    </span>
  );
}

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

export function ServerAnnouncements({quiet=false}:{quiet?:boolean}) {
  const { activeBanners, selected, centerOpen } = useAnnouncements();
  return (
    <>
      <AnnouncementBanners announcements={quiet?activeBanners.filter(a=>a.kind==='maintenance'):activeBanners} />
      <AnnouncementModal announcement={selected} />
      <NotificationCenter open={centerOpen} />
    </>
  );
}

/**
 * Баннеры над контентом: критический сервисный отдельно + максимум один
 * обычный. Карточка: категория, заголовок, краткое описание, одно основное
 * действие, закрытие. Текст не режется молча: краткое описание пишет
 * администратор (bannerText), иначе виден обрыв с «Подробнее».
 */
function AnnouncementBanners({ announcements }: { announcements: Announcement[] }) {
  const reduceMotion = useReducedMotion();
  return (
    <motion.div layout={reduceMotion ? false : 'position'} className="relative z-30">
      <AnimatePresence initial={false}>
        {announcements.map((announcement) => (
          <AnnouncementBanner key={announcement.id} announcement={announcement} />
        ))}
      </AnimatePresence>
    </motion.div>
  );
}

function AnnouncementBanner({ announcement }: { announcement: Announcement }) {
  const reduceMotion = useReducedMotion();
  const { select, dismiss } = useAnnouncements();
  const critical = announcement.kind === 'maintenance';
  const short = announcement.bannerText ||
    (announcement.body.length > 140
      ? `${announcement.body.slice(0, 140).trimEnd()}…`
      : announcement.body);
  return (
    <motion.aside
      layout={reduceMotion ? false : 'position'}
      initial={reduceMotion ? false : { opacity: 0, y: -8 }}
      animate={{ opacity: 1, y: 0 }}
      exit={reduceMotion ? { opacity: 0 } : { opacity: 0, y: -8 }}
      transition={{ duration: 0.2, ease: [0.22, 1, 0.36, 1] }}
      aria-label={announcement.title}
      className={`border-b bg-[var(--bg-raised)] ${critical ? 'border-[var(--error)]/50' : 'border-[var(--line)]'}`}
    >
      <div className="mx-auto flex max-w-6xl flex-col gap-3 px-4 py-3 sm:px-5 md:flex-row md:items-center">
        <div className="flex min-w-0 flex-1 items-start gap-3">
          {announcement.imageUrl && (
            <img src={announcement.imageUrl} alt="" className="hidden size-12 shrink-0 object-contain sm:block" />
          )}
          <div className="min-w-0 flex-1">
            <span className="flex flex-wrap items-center gap-x-2 gap-y-1">
              <KindChip kind={announcement.kind} critical={critical} />
              <strong className="text-base">{announcement.title}</strong>
            </span>
            {short && <p className="mt-1 text-sm text-[var(--text-muted)]">{short}</p>}
          </div>
        </div>
        <div className="flex shrink-0 items-center gap-1 pl-0 md:pl-2">
          {announcement.actionUrl ? (
            <>
              <a
                href={announcement.actionUrl}
                className="inline-flex min-h-10 items-center gap-1.5 rounded-xl bg-[var(--accent)] px-4 py-2 text-sm font-bold text-white transition-colors hover:bg-[var(--accent-hover)]"
              >
                {announcement.actionLabel || 'Открыть'}
                <LuExternalLink className="size-4" aria-hidden="true" />
              </a>
              <button
                type="button"
                onClick={() => select(announcement)}
                className="inline-flex min-h-10 items-center rounded-xl px-3 py-2 text-sm font-semibold text-[var(--accent)] hover:bg-[var(--bg-sunken)]"
              >
                Подробнее
              </button>
            </>
          ) : (
            <button
              type="button"
              onClick={() => select(announcement)}
              className="inline-flex min-h-10 items-center rounded-xl bg-[var(--accent)]/10 px-4 py-2 text-sm font-bold text-[var(--accent)] transition-colors hover:bg-[var(--accent)]/15"
            >
              Подробнее
            </button>
          )}
          {!critical && (
            <button
              type="button"
              onClick={() => void dismiss(announcement)}
              className="grid size-10 shrink-0 place-items-center rounded-xl text-[var(--text-muted)] hover:bg-[var(--bg-sunken)]"
              aria-label="Закрыть объявление"
              title="Закрыть"
            >
              <LuX className="size-5" aria-hidden="true" />
            </button>
          )}
        </div>
      </div>
    </motion.aside>
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
            <div className="flex items-center gap-2">
              <KindChip kind={announcement.kind} critical={announcement.kind === 'maintenance'} />
            </div>
            <h2 id="announcement-title" className="mt-2 pr-10 text-2xl sm:text-3xl">{announcement.title}</h2>
            {announcement.kind === 'campaign' && (
              <div className="kilim-edge mt-4" aria-hidden="true" />
            )}
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
              <a
                href={announcement.actionUrl}
                className="mt-6 inline-flex min-h-11 items-center gap-2 rounded-xl bg-[var(--accent)] px-5 py-2.5 text-sm font-bold text-white transition-colors hover:bg-[var(--accent-hover)]"
              >
                {announcement.actionLabel || 'Открыть'} <LuExternalLink className="size-4" aria-hidden="true" />
              </a>
            )}
          </motion.section>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

function NotificationCenter({ open }: { open: boolean }) {
  const reduceMotion = useReducedMotion();
  const {
    announcements, notifications, unread, activeBanners,
    notifLoading, notifError, refresh,
    setCenterOpen, openNotification, readAll, select,
  } = useAnnouncements();
  const bannerIds = new Set(activeBanners.map((item) => item.id));
  // Объявления, не попавшие в баннер: баннер показывает не всё.
  const moreAnnouncements = announcements.filter((item) =>
    !item.dismissedAt && !bannerIds.has(item.id));
  return (
    <AnimatePresence>
      {open && (
        <motion.aside role="dialog" aria-label="Уведомления"
          initial={reduceMotion ? false : { opacity: 0, x: 24 }} animate={{ opacity: 1, x: 0 }} exit={reduceMotion ? { opacity: 0 } : { opacity: 0, x: 20 }}
          className="fixed bottom-4 right-4 top-20 z-[65] flex w-[min(390px,calc(100vw-2rem))] flex-col overflow-hidden rounded-2xl border border-[var(--line)] bg-[var(--bg-raised)] shadow-[var(--shadow-lift)]">
          <div className="flex items-center justify-between border-b border-[var(--line)] px-4 py-3">
            <div><h2 className="text-xl">Уведомления</h2><p className="text-xs text-[var(--text-muted)]">Непрочитанных: {unread}</p></div>
            <div className="flex items-center gap-1">
              {unread > 0 && <button type="button" onClick={() => void readAll()} className="rounded-lg px-2 py-1.5 text-xs font-semibold text-[var(--accent)] hover:bg-[var(--bg-sunken)]">Прочитать все</button>}
              <button type="button" onClick={() => setCenterOpen(false)} className="grid size-9 place-items-center rounded-lg hover:bg-[var(--bg-sunken)]" aria-label="Закрыть" title="Закрыть"><LuX className="size-5" /></button>
            </div>
          </div>
          <div className="flex-1 overflow-y-auto">
            {notifLoading && notifications.length === 0 && (
              <p className="p-6 text-center text-sm text-[var(--text-muted)]" role="status">Загружаем уведомления…</p>
            )}
            {notifError && notifications.length === 0 && (
              <div className="p-4"><ErrorNote>{notifError} <button type="button" onClick={() => void refresh()} className="font-bold underline underline-offset-2">Повторить</button></ErrorNote></div>
            )}
            {notifications.map((item) => (
              <button key={item.id} type="button" onClick={() => void openNotification(item)}
                className={`block w-full border-b border-[var(--line)] px-4 py-3 text-left hover:bg-[var(--bg-sunken)] ${item.readAt ? '' : 'bg-[var(--accent)]/5'}`}>
                <span className="flex items-start gap-2"><span className={`mt-1.5 size-2 shrink-0 rounded-full ${item.readAt ? 'bg-transparent' : 'bg-[var(--accent)]'}`} />
                  <span><strong className="block text-sm">{item.title}</strong><span className="mt-1 block text-sm text-[var(--text-muted)]">{item.body}</span><time className="mt-1.5 block text-xs text-[var(--text-muted)]">{new Date(item.createdAt).toLocaleString('ru-RU')}</time></span>
                </span>
              </button>
            ))}
            {moreAnnouncements.length > 0 && (
              <div className="border-t border-[var(--line)]">
                <p className="px-4 pb-1 pt-3 text-xs font-semibold uppercase tracking-wide text-[var(--text-muted)]">Объявления</p>
                {moreAnnouncements.map((item) => (
                  <button key={item.id} type="button" onClick={() => select(item)}
                    className="block w-full border-b border-[var(--line)] px-4 py-3 text-left last:border-b-0 hover:bg-[var(--bg-sunken)]">
                    <span className="flex items-center gap-2">
                      <KindChip kind={item.kind} critical={item.kind === 'maintenance'} />
                      <strong className="min-w-0 flex-1 truncate text-sm">{item.title}</strong>
                    </span>
                    {(item.bannerText || item.body) && (
                      <span className="mt-1 line-clamp-2 block text-sm text-[var(--text-muted)]">
                        {item.bannerText || item.body}
                      </span>
                    )}
                  </button>
                ))}
              </div>
            )}
            {!notifLoading && !notifError && notifications.length === 0 && moreAnnouncements.length === 0 && (
              <p className="p-6 text-center text-sm text-[var(--text-muted)]">Новых уведомлений пока нет.</p>
            )}
          </div>
        </motion.aside>
      )}
    </AnimatePresence>
  );
}
