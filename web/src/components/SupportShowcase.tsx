import { LuCrown, LuHeart } from 'react-icons/lu';
import { formatRubles, type Supporter } from '../api/donations';

export function SupporterPodium({ supporters }: { supporters: Supporter[] }) {
  const top = supporters.slice(0, 3);
  const max = Math.max(1, ...top.map(p => p.amountKopecks ?? 0));
  return <ol aria-label="Друзья, поддержавшие больше всего" className="mx-auto mt-6 flex max-w-2xl items-end justify-center gap-2 sm:gap-4">
    {top.map((p, i) => <li key={p.name + p.since} className={`flex min-w-0 flex-1 flex-col text-center ${top.length === 3 ? ['order-2', 'order-1', 'order-3'][i] : ''}`}>
      <div className="px-1 pb-3">
        {i === 0 ? <LuCrown aria-hidden className="mx-auto mb-2 size-7 text-[var(--accent)]" /> : <LuHeart aria-hidden className="mx-auto mb-2 size-5 text-[var(--text-muted)]" />}
        <p className="break-words font-display text-base font-bold sm:text-xl">{p.name}</p>
        {(p.amountKopecks ?? 0) > 0 && <p className="mt-1 text-sm font-semibold text-[var(--accent)]">{formatRubles(p.amountKopecks!)}</p>}
      </div>
      <div style={{ height: `${68 + 76 * ((p.amountKopecks ?? 0) / max)}px` }} className={`flex items-center justify-center rounded-t-2xl border border-gold/50 bg-gradient-to-t from-gold/10 to-gold/25 font-display text-3xl font-bold shadow-[var(--shadow-soft)] ${i === 0 ? 'text-[var(--accent)]' : 'text-[var(--text-muted)]'}`}>
        <span aria-label={`Место ${i + 1}`}>{i + 1}</span>
      </div>
    </li>)}
  </ol>;
}
