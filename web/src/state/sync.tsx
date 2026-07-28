import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';

import { ApiError } from '../api/client';
import { lastSyncAt, pendingCount, resetForAccount, runSync } from '../api/sync';
import { useAuth } from './auth';

export type SyncStatus = 'idle' | 'running' | 'done' | 'offline' | 'failed';

interface SyncValue {
  status: SyncStatus;
  message: string;
  /** Время последней удачной синхронизации, миллисекунды эпохи. */
  lastSync: number;
  /** Сколько записей ждут отправки. */
  pending: number;
  /** Номер завершённой синхронизации: списки книг перечитываются по его смене. */
  revision: number;
  sync: () => Promise<void>;
}

const SyncContext = createContext<SyncValue | null>(null);

export function SyncProvider({ children }: { children: ReactNode }) {
  const { account } = useAuth();
  const [status, setStatus] = useState<SyncStatus>('idle');
  const [message, setMessage] = useState('');
  const [lastSync, setLastSync] = useState(0);
  const [pending, setPending] = useState(0);
  const [revision, setRevision] = useState(0);

  // Две одновременные синхронизации боролись бы за курсор.
  const running = useRef(false);

  const refreshCounters = useCallback(async () => {
    setPending(await pendingCount());
    setLastSync(await lastSyncAt());
  }, []);

  const sync = useCallback(async () => {
    if (running.current || !account) return;
    running.current = true;
    setStatus('running');
    setMessage('Синхронизация…');

    try {
      await resetForAccount(account.id);
      const report = await runSync();

      setStatus('done');
      setMessage(
        report.received > 0 || report.sent > 0
          ? `Отправлено ${report.sent}, получено ${report.received}`
          : 'Всё синхронизировано',
      );
      // Библиотека и читалка перечитывают данные по смене этого счётчика.
      if (report.received > 0 || report.uploaded > 0) {
        setRevision((value) => value + 1);
      }
    } catch (error) {
      if (error instanceof ApiError && error.isOffline) {
        // Офлайн — обычное состояние, а не сбой: изменения останутся
        // помеченными и уйдут при следующей попытке.
        setStatus('offline');
        setMessage('Нет связи — синхронизируем позже');
      } else if (error instanceof ApiError && error.isUnauthorized) {
        setStatus('failed');
        setMessage('Сессия истекла, войдите снова');
      } else {
        setStatus('failed');
        setMessage(
          error instanceof Error ? error.message : 'Не удалось синхронизировать',
        );
      }
    } finally {
      running.current = false;
      await refreshCounters();
    }
  }, [account, refreshCounters]);

  // Первая синхронизация после входа и при открытии сайта с готовой сессией.
  useEffect(() => {
    if (!account) {
      setStatus('idle');
      setMessage('');
      return;
    }
    void sync();
  }, [account, sync]);

  // Возврат связи — повод отправить накопленное, не дожидаясь действий
  // пользователя.
  useEffect(() => {
    if (!account) return;
    const onOnline = () => void sync();
    window.addEventListener('online', onOnline);
    return () => window.removeEventListener('online', onOnline);
  }, [account, sync]);

  // Прогресс чтения меняется постоянно; отправлять его сразу — значит слать
  // запрос на каждое перелистывание. Раз в две минуты достаточно.
  useEffect(() => {
    if (!account) return;
    const timer = setInterval(() => void sync(), 120_000);
    return () => clearInterval(timer);
  }, [account, sync]);

  // Уход со страницы — последняя возможность отправить прочитанное.
  useEffect(() => {
    if (!account) return;
    const onHidden = () => {
      if (document.visibilityState === 'hidden') void sync();
    };
    document.addEventListener('visibilitychange', onHidden);
    return () => document.removeEventListener('visibilitychange', onHidden);
  }, [account, sync]);

  useEffect(() => {
    void refreshCounters();
  }, [refreshCounters]);

  const value = useMemo<SyncValue>(
    () => ({ status, message, lastSync, pending, revision, sync }),
    [status, message, lastSync, pending, revision, sync],
  );

  return <SyncContext.Provider value={value}>{children}</SyncContext.Provider>;
}

export function useSync(): SyncValue {
  const value = useContext(SyncContext);
  if (!value) throw new Error('useSync вызван вне SyncProvider');
  return value;
}
