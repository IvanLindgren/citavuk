import { useEffect, useState } from 'react';

import { getSupporters, type Supporter } from '../api/donations';
import { ButtonLink, Card, Reveal, Spinner } from '../components/ui';
import { useSeo } from '../lib/seo';

const DATE = new Intl.DateTimeFormat('ru-RU', { day: 'numeric', month: 'long', year: 'numeric' });

export function Supporters() {
  useSeo({
    title: 'Друзья Читавука',
    description: 'Люди, благодаря которым Читавук остаётся бесплатным.',
  });
  const [supporters, setSupporters] = useState<Supporter[] | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let cancelled = false;
    getSupporters()
      .then((list) => !cancelled && setSupporters(list))
      .catch(() => !cancelled && setFailed(true));
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <main className="paper-grain min-h-[calc(100dvh-4rem)] px-4 py-10 sm:px-5 sm:py-16">
      <div className="mx-auto max-w-4xl">
        <Reveal className="text-center">
          <img
            src="/img/citavuk_zdravo.webp"
            srcSet="/img/citavuk_zdravo.webp 1x, /img/citavuk_zdravo@2x.webp 2x"
            alt=""
            width={160}
            height={160}
            className="mx-auto w-28 object-contain sm:w-36"
          />
          <h1 className="mt-4 text-4xl sm:text-5xl">Друзья Читавука</h1>
          <p className="mx-auto mt-3 max-w-xl text-lg leading-relaxed text-[var(--text-muted)]">
            Эти люди помогают Читавуку оставаться бесплатным для всех, кто учит
            сербский. Хвала вам!
          </p>
        </Reveal>

        <div className="mt-10">
          {failed ? (
            <p className="text-center text-[var(--text-muted)]">
              Список не загрузился. Обнови страницу чуть позже.
            </p>
          ) : !supporters ? (
            <div className="flex justify-center py-10">
              <Spinner className="size-6" />
            </div>
          ) : supporters.length === 0 ? (
            <Card tone="contour" className="mx-auto max-w-md p-8 text-center">
              <p className="font-display text-xl font-bold">Здесь будет первое имя</p>
              <p className="mt-2 text-[var(--text-muted)]">Может быть, твоё?</p>
            </Card>
          ) : (
            <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {supporters.map((supporter, index) => (
                <li key={supporter.name + supporter.since}>
                  <Reveal delay={Math.min(index, 12) * 0.03} className="relative flex h-full flex-col justify-center overflow-hidden rounded-2xl border border-gold/45 bg-[var(--bg-raised)] px-5 py-4 shadow-[var(--shadow-soft)]">
                    <span
                      className="pointer-events-none absolute -right-3 -top-3 size-14 rounded-full bg-gold/12"
                      aria-hidden="true"
                    />
                    <span className="font-display text-lg font-bold leading-snug break-words">
                      {supporter.name}
                    </span>
                    <span className="mt-0.5 text-sm text-[var(--text-muted)]">
                      с {DATE.format(new Date(supporter.since)).replace(' г.', '')}
                    </span>
                  </Reveal>
                </li>
              ))}
            </ul>
          )}
        </div>

        <Reveal className="mt-12 text-center">
          <ButtonLink to="/support" size="lg">Стать другом Читавука</ButtonLink>
        </Reveal>
      </div>
    </main>
  );
}
