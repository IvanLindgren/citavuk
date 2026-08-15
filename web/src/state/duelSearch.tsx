/**
 * Поиск соперников, который переживает уход со страницы.
 *
 * Онлайн у Читавука небольшой, и держать человека на экране ожидания нечестно:
 * он вправе пойти играть с DeepL, читать книгу или уйти в сад. Поэтому поиск
 * живёт не на странице матча, а здесь: очередь опрашивается фоном, и когда
 * соперники находятся, зов приходит поверх любого раздела.
 *
 * Вошедшему сервер вдобавок кладёт уведомление в колокольчик — оно переживёт и
 * закрытую вкладку. Гостю положить его некуда, и на экране ожидания об этом
 * сказано прямо.
 */

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

import {
  enterDuelQueue,
  getDuelQueue,
  leaveDuelQueue,
  type DuelQueueState,
  type DuelSearchSettings,
} from '../api/duel';

const SEARCH_KEY = 'citavuk-duel-search';

/** Как часто спрашивать очередь. Реже, чем комнату: тут ждут минутами. */
const POLL_MS = 5000;

interface DuelSearchValue {
  state: DuelQueueState | null;
  searching: boolean;
  /** Код найденной комнаты. */
  room: string;
  start: (settings: DuelSearchSettings) => Promise<DuelQueueState>;
  stop: () => Promise<void>;
}

const DuelSearchContext = createContext<DuelSearchValue | null>(null);

function remembered(): boolean {
  try {
    return localStorage.getItem(SEARCH_KEY) === '1';
  } catch {
    return false;
  }
}

function remember(active: boolean): void {
  try {
    if (active) localStorage.setItem(SEARCH_KEY, '1');
    else localStorage.removeItem(SEARCH_KEY);
  } catch {
    // Приватный режим: поиск не переживёт перезагрузку, и это не страшно.
  }
}

export function DuelSearchProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<DuelQueueState | null>(null);
  const [active, setActive] = useState(remembered);
  const timer = useRef(0);

  const stop = useCallback(async () => {
    setActive(false);
    remember(false);
    setState(null);
    await leaveDuelQueue().catch(() => undefined);
  }, []);

  const start = useCallback(async (settings: DuelSearchSettings) => {
    const next = await enterDuelQueue(settings);
    setState(next);
    setActive(true);
    remember(true);
    return next;
  }, []);

  useEffect(() => {
    if (!active) return;
    let alive = true;

    const ask = async () => {
      try {
        const next = await getDuelQueue();
        if (!alive) return;
        setState(next);
        // Очередь потерялась (сервер перезапустился, запись убрали) — искать
        // больше нечего, иначе опрос крутился бы вечно.
        if (!next.waiting) {
          setActive(false);
          remember(false);
          return;
        }
        if (next.room) return; // Нашли: зов висит, пока человек не откроет комнату.
      } catch {
        // Связь пропала: следующий круг попробует снова.
      }
      if (alive) timer.current = window.setTimeout(() => void ask(), POLL_MS);
    };

    void ask();
    return () => {
      alive = false;
      window.clearTimeout(timer.current);
    };
  }, [active]);

  const value = useMemo<DuelSearchValue>(() => ({
    state,
    searching: active && !state?.room,
    room: state?.room ?? '',
    start,
    stop,
  }), [active, state, start, stop]);

  return <DuelSearchContext.Provider value={value}>{children}</DuelSearchContext.Provider>;
}

export function useDuelSearch(): DuelSearchValue {
  const value = useContext(DuelSearchContext);
  if (!value) throw new Error('useDuelSearch вызван вне DuelSearchProvider');
  return value;
}
