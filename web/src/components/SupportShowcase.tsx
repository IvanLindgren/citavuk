import { useEffect, useState } from 'react';
import { LuCrown, LuHeart } from 'react-icons/lu';
import { formatRubles, getSupportShowcase, type Supporter, type SupportShowcase as Showcase } from '../api/donations';
import { Link } from '../lib/router';

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

export function SupportShowcase() {
  const [data, setData] = useState<Showcase | null>(null);
  useEffect(() => { let alive = true; getSupportShowcase().then(d => { if (alive) setData(d); }).catch(() => {}); return () => { alive = false; }; }, []);
  return <section className="px-5 py-8 sm:py-12" aria-label="Поддержка проекта">
    <div className="mx-auto max-w-4xl rounded-3xl border border-gold/45 bg-[var(--bg-raised)] p-5 shadow-[var(--shadow-soft)] sm:p-8">
      <h2 className="text-2xl sm:text-3xl">Друзья Читавука</h2>
      {data && data.supporters.length > 0 ? <SupporterPodium supporters={data.supporters} /> : <p className="mt-4 text-[var(--text-muted)]">Твоя поддержка помогает оплачивать сервер и выпускать новые возможности.</p>}
      {data?.spotlight && <aside className="mt-6 rounded-2xl border border-gold/40 bg-gold/8 p-5">
        <p className="text-xs font-bold uppercase text-[var(--accent)]">Благодарность дня</p>
        <p className="mt-2 font-display text-xl font-bold break-words">{data.spotlight.name}</p>
        {data.spotlight.message && <blockquote className="mt-2 whitespace-pre-wrap break-words leading-relaxed">{data.spotlight.message}</blockquote>}
        {!!data.spotlight.amountKopecks && <p className="mt-2 text-sm text-[var(--text-muted)]">Вклад в проект: {formatRubles(data.spotlight.amountKopecks)}</p>}
      </aside>}
      <p className="mt-5 whitespace-pre-line text-sm leading-relaxed text-[var(--text-muted)]">{'Место дня получает самая большая поддержка за предыдущий день по МСК.\nИмя и сумма показываются с разрешения автора, а сообщение, которое он хотел оставить, после проверки.'}</p>
      <div className="mt-5 flex flex-wrap gap-5 font-semibold text-[var(--accent)]">
        <Link to="/support">Поддержать Читавук</Link><Link to="/supporters">Все друзья</Link>
      </div>
    </div>
  </section>;
}
