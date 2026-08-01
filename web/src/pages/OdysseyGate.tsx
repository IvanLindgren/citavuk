import { lazy, Suspense } from 'react';
import { LuLockKeyhole } from 'react-icons/lu';

import { Spinner } from '../components/ui';
import { odysseyAvailable } from '../events/odyssey';
import { Link } from '../lib/router';
import { useSeo } from '../lib/seo';
import { useAuth } from '../state/auth';

const OdysseyReader = lazy(() =>
  import('./OdysseyReader').then((module) => ({ default: module.OdysseyReader })),
);

export function OdysseyGate() {
  const { account, loading } = useAuth();
  useSeo({ title: 'Одиссея — событие Читавука', noindex: true });

  if (loading) {
    return <div className="flex min-h-[60vh] items-center justify-center"><Spinner /></div>;
  }

  if (!odysseyAvailable()) {
    return (
      <main className="mx-auto flex min-h-[60vh] max-w-xl flex-col items-center justify-center px-5 text-center">
        <h1 className="text-3xl">Путешествие завершено</h1>
        <p className="mt-4 text-[var(--text-muted)]">«Одиссея» была доступна до 1 сентября 2026 года.</p>
        <Link to="/events" className="mt-7 font-semibold text-[var(--accent)]">Все события</Link>
      </main>
    );
  }

  if (!account) {
    return (
      <main className="relative min-h-[70vh] overflow-hidden bg-[#17130f] text-white">
        <img src="/events/odyssey/calypso.webp" alt="Одиссей на острове Калипсо" className="absolute inset-0 size-full object-cover opacity-45" />
        <div className="absolute inset-0 bg-black/55" aria-hidden="true" />
        <div className="relative mx-auto flex min-h-[70vh] max-w-xl flex-col items-center justify-center px-5 text-center">
          <LuLockKeyhole className="size-10 text-[#f2ca81]" aria-hidden="true" />
          <h1 className="mt-5 text-4xl">Войдите, чтобы начать</h1>
          <p className="mt-4 leading-relaxed text-white/80">
            Событие доступно только зарегистрированным пользователям. Аккаунт
            сохранит прогресс и закрепит награду за вами в этом браузере.
          </p>
          <Link to="/login?next=/events/odyssey" className="mt-7 rounded-2xl bg-[#f2ca81] px-6 py-3 font-bold text-[#251a12]">
            Войти или зарегистрироваться
          </Link>
        </div>
      </main>
    );
  }

  return (
    <Suspense fallback={<div className="flex min-h-[60vh] items-center justify-center"><Spinner /></div>}>
      <OdysseyReader accountId={account.id} />
    </Suspense>
  );
}
