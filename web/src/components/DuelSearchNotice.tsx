import { LuSwords, LuX } from 'react-icons/lu';

import { Button } from './ui';
import { useRouter } from '../lib/router';
import { useDuelSearch } from '../state/duelSearch';

/** Зов в найденный матч остаётся виден поверх любого раздела сайта. */
export function DuelSearchNotice() {
  const { room, stop } = useDuelSearch();
  const { navigate } = useRouter();
  if (!room) return null;

  return (
    <aside
      className="fixed inset-x-3 bottom-4 z-[80] mx-auto flex max-w-xl items-center gap-3 rounded-2xl border border-[var(--accent)]/35 bg-[var(--bg-raised)] p-3 shadow-xl"
      aria-live="assertive"
    >
      <span className="grid size-10 shrink-0 place-items-center rounded-full bg-[var(--accent)] text-parchment">
        <LuSwords className="size-5" />
      </span>
      <div className="min-w-0 flex-1">
        <p className="font-bold">Соперники нашлись</p>
        <p className="text-sm text-[var(--text-muted)]">Стол собран и ждёт тебя.</p>
      </div>
      <Button
        size="sm"
        onClick={() => navigate(`/trainer/translation-duel/${room}`)}
      >
        Войти
      </Button>
      <button
        type="button"
        className="grid size-10 shrink-0 place-items-center rounded-full hover:bg-[var(--bg-sunken)]"
        aria-label="Отказаться от матча"
        title="Отказаться от матча"
        onClick={() => void stop()}
      >
        <LuX className="size-5" />
      </button>
    </aside>
  );
}
