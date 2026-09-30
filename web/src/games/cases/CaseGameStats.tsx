import { useEffect, useState } from 'react';
import { LuKeyboard, LuTrophy } from 'react-icons/lu';

import { getCaseGameResults, type CaseGameResult } from '../../api/caseGame';
import { ButtonLink, Card } from '../../components/ui';
import { scopeTitle, type Scope } from './data';

const LIMIT_LABELS: Record<number, string> = { 60: '1 минута', 300: '5 минут', 900: '15 минут', 0: 'Без конца' };
const DATE = new Intl.DateTimeFormat('ru-RU', { day: 'numeric', month: 'short' });

function titleOf(scope: string) {
  // В scope последним идёт уровень слов: «case:g:b».
  const base = scope.split(':').slice(0, -1).join(':') as Scope;
  return scopeTitle(base || (scope as Scope));
}

/** Результаты игры на падежи в профиле: рекорды по времени и последние партии. */
export function CaseGameStats() {
  const [results, setResults] = useState<CaseGameResult[] | null>(null);

  useEffect(() => {
    let cancelled = false;
    getCaseGameResults()
      .then((items) => !cancelled && setResults(items))
      .catch(() => !cancelled && setResults([]));
    return () => {
      cancelled = true;
    };
  }, []);

  if (!results || results.length === 0) return null;

  const records = [60, 300, 900]
    .map((limit) => results.filter((item) => item.limitSeconds === limit).sort((a, b) => b.correct - a.correct)[0])
    .filter((item): item is CaseGameResult => Boolean(item));

  return (
    <section className="mt-5">
      <div className="mb-3 flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 className="text-2xl">Уничтожь эти падежи</h2>
          <p className="mt-1 text-sm text-[var(--text-muted)]">Рекорды и последние партии на печатной машинке.</p>
        </div>
        <ButtonLink to="/padezi" size="sm" variant="secondary">
          <LuKeyboard className="size-4" aria-hidden="true" /> Играть
        </ButtonLink>
      </div>
      {records.length > 0 && (
        <div className="grid gap-3 sm:grid-cols-3">
          {records.map((item) => (
            <Card key={item.limitSeconds} tone="contour" className="p-4">
              <p className="flex items-center gap-1.5 text-sm font-semibold text-[var(--text-muted)]">
                <LuTrophy className="size-4 text-gold" aria-hidden="true" /> {LIMIT_LABELS[item.limitSeconds]}
              </p>
              <p className="mt-1 font-['Courier_Prime',monospace] text-3xl font-bold">{item.correct}</p>
              <p className="text-sm text-[var(--text-muted)]">
                верно, {Math.round(item.accuracy)}%, {titleOf(item.scope).toLowerCase()}
              </p>
            </Card>
          ))}
        </div>
      )}
      <ul className="mt-3 divide-y divide-[var(--line)] rounded-2xl border border-[var(--line)] bg-[var(--bg-raised)]">
        {results.slice(0, 6).map((item) => (
          <li key={item.id} className="flex flex-wrap items-center gap-x-4 gap-y-1 px-4 py-2.5 text-sm">
            <span className="w-14 text-[var(--text-muted)]">{item.createdAt ? DATE.format(new Date(item.createdAt)) : ''}</span>
            <span className="min-w-0 flex-1 font-semibold">{titleOf(item.scope)}, {LIMIT_LABELS[item.limitSeconds]?.toLowerCase()}</span>
            <span>{item.correct} верно, {item.wrong} ошибок</span>
            <span className="text-[var(--text-muted)]">{Math.round(item.accuracy)}%</span>
            {item.weak[0] && <span className="basis-full text-xs text-[var(--text-muted)]">Слабое место: {item.weak[0].label.toLowerCase()}</span>}
          </li>
        ))}
      </ul>
    </section>
  );
}
