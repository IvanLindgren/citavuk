import { AnimatePresence, motion } from 'framer-motion';

import { useAuth } from '../state/auth';
import { useSync } from '../state/sync';

/**
 * Состояние синхронизации одной строкой.
 *
 * Показывается только вошедшим: остальным сообщать не о чем, а пустая плашка
 * лишь занимала бы место.
 */
export function SyncBadge({ className = '' }: { className?: string }) {
  const { account } = useAuth();
  const { status, pending, lastSync, sync } = useSync();

  if (!account) return null;

  const label = (() => {
    switch (status) {
      case 'running':
        return 'Синхронизация…';
      case 'offline':
        return 'Нет связи';
      case 'failed':
        return 'Ошибка синхронизации';
      default:
        if (pending > 0) return `${pending} ждут отправки`;
        return lastSync > 0 ? `Синхронизировано ${formatTime(lastSync)}` : 'Готово к синхронизации';
    }
  })();

  const tone =
    status === 'failed'
      ? 'text-serb-red'
      : status === 'offline'
        ? 'text-[var(--text-muted)]'
        : 'text-[var(--text-muted)]';

  return (
    <button
      type="button"
      onClick={() => void sync()}
      disabled={status === 'running'}
      title="Синхронизировать сейчас"
      className={[
        'inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs',
        'transition-colors hover:bg-[var(--bg-sunken)] disabled:cursor-default',
        tone,
        className,
      ].join(' ')}
    >
      <StatusIcon status={status} />
      <AnimatePresence mode="wait" initial={false}>
        <motion.span
          key={label}
          initial={{ opacity: 0, y: 4 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -4 }}
          transition={{ duration: 0.18 }}
        >
          {label}
        </motion.span>
      </AnimatePresence>
    </button>
  );
}

function StatusIcon({ status }: { status: string }) {
  if (status === 'running') {
    return (
      <motion.svg
        viewBox="0 0 24 24"
        className="size-3.5 fill-current"
        animate={{ rotate: 360 }}
        transition={{ duration: 1.2, repeat: Infinity, ease: 'linear' }}
        aria-hidden="true"
      >
        <path d="M12 4V1L8 5l4 4V6a6 6 0 11-6 6H4a8 8 0 108-8z" />
      </motion.svg>
    );
  }

  return (
    <svg viewBox="0 0 24 24" className="size-3.5 fill-current" aria-hidden="true">
      {status === 'offline' ? (
        <path d="M3.3 2L2 3.3l3 3A6 6 0 006 18h9.7l2 2 1.3-1.3zM19.4 15.6A4 4 0 0018 8h-1.3A6 6 0 008 5.3l1.6 1.6A4 4 0 0114.5 10H16a2.5 2.5 0 011.9 4.1z" />
      ) : status === 'failed' ? (
        <path d="M12 2a10 10 0 100 20 10 10 0 000-20zm1 15h-2v-2h2zm0-4h-2V7h2z" />
      ) : (
        <path d="M18 10h-1.3A6 6 0 005 12a4 4 0 001 7.9V20h12a5 5 0 000-10zm-6.7 7.4l-2.8-2.8 1.4-1.4 1.4 1.4 3.5-3.5 1.4 1.4z" />
      )}
    </svg>
  );
}

function formatTime(millis: number): string {
  const date = new Date(millis);
  const pad = (n: number) => n.toString().padStart(2, '0');

  const today = new Date();
  const sameDay =
    date.getDate() === today.getDate() &&
    date.getMonth() === today.getMonth() &&
    date.getFullYear() === today.getFullYear();

  const time = `${pad(date.getHours())}:${pad(date.getMinutes())}`;
  return sameDay ? `в ${time}` : `${pad(date.getDate())}.${pad(date.getMonth() + 1)}`;
}
