import { useEffect } from 'react';
import { LuCalendarDays, LuLockKeyhole, LuShieldCheck } from 'react-icons/lu';

import { odysseyAvailable, syncOdysseyProgress, useOdysseyProgress } from '../events/odyssey';
import { Link } from '../lib/router';
import { useSeo } from '../lib/seo';
import { useAuth } from '../state/auth';

export function Events() {
  const { account } = useAuth();
  const progress = useOdysseyProgress(account?.id);
  const available = odysseyAvailable();
  const percent = Math.round((progress.completedChapters.length / 24) * 100);

  useEffect(() => {
    if (account) void syncOdysseyProgress(account.id).catch(() => {});
  }, [account]);

  useSeo({
    title: 'События — Читавук',
    description: 'Ограниченные по времени книги, уроки и подкасты Читавука с наградами.',
  });

  return (
    <main>
      <section className="relative min-h-[34rem] overflow-hidden bg-[#17130f] text-white sm:min-h-[38rem]">
        <img
          src="/events/odyssey/sirens.webp"
          alt="Одиссей слушает пение сирен. Джон Уильям Уотерхаус, 1891"
          className="absolute inset-0 size-full object-cover object-center opacity-65"
        />
        <div className="absolute inset-0 bg-black/55" aria-hidden="true" />
        <div className="relative mx-auto flex min-h-[34rem] max-w-6xl flex-col justify-end px-5 pb-14 pt-24 sm:min-h-[38rem] sm:pb-20">
          <div className="max-w-3xl">
            <p className="mb-4 flex items-center gap-2 text-sm font-bold uppercase text-[#f2ca81]">
              <LuCalendarDays className="size-4" aria-hidden="true" />
              {available ? 'До 1 сентября 2026' : 'Событие завершено'}
            </p>
            <h1 className="text-5xl sm:text-7xl">Одиссея</h1>
            <p className="mt-5 max-w-2xl text-lg leading-relaxed text-white/85 sm:text-xl">
              Пройдите путь от острова Калипсо до Итаки: 24 песни на сербской
              кириллице, перевод слов по нажатию и семь классических иллюстраций.
            </p>
            <div className="mt-8 flex flex-wrap items-center gap-3">
              {available ? (
                <Link
                  to={account ? '/events/odyssey' : '/login?next=/events/odyssey'}
                  className="inline-flex items-center gap-2 rounded-2xl bg-[#f2ca81] px-6 py-3.5 font-bold text-[#251a12] transition-colors hover:bg-white"
                >
                  {account
                    ? progress.rewardUnlocked
                      ? 'Перечитать'
                      : percent > 0
                        ? `Продолжить · ${percent}%`
                        : 'Начать путешествие'
                    : 'Войти и участвовать'}
                </Link>
              ) : (
                <span className="rounded-2xl border border-white/30 px-5 py-3 font-semibold text-white/80">
                  Приём новых участников закрыт
                </span>
              )}
              {available && !account && (
                <span className="inline-flex items-center gap-2 text-sm text-white/75">
                  <LuLockKeyhole className="size-4" aria-hidden="true" />
                  Только для зарегистрированных пользователей
                </span>
              )}
            </div>
          </div>
        </div>
      </section>

      <section className="border-b border-[var(--line)] px-5 py-12 sm:py-16">
        <div className="mx-auto grid max-w-6xl gap-8 md:grid-cols-[1fr_1.2fr] md:items-center">
          <div>
            <p className="text-sm font-bold uppercase text-[var(--accent)]">Награда события</p>
            <h2 className="mt-2 text-3xl sm:text-4xl">Спартанские шлемы</h2>
            <p className="mt-4 max-w-xl leading-relaxed text-[var(--text-muted)]">
              Завершите все 24 песни, чтобы открыть эксклюзивный фон. После
              получения он появится в настройках любой книги в вашей читалке.
            </p>
            <p className="mt-5 inline-flex items-center gap-2 text-sm font-semibold">
              <LuShieldCheck className="size-5 text-[var(--accent)]" aria-hidden="true" />
              {progress.rewardUnlocked ? 'Награда получена' : `${progress.completedChapters.length} из 24 песен`}
            </p>
          </div>
          <div
            className="min-h-64 border border-[var(--line)] bg-[#efe3cf] shadow-[var(--shadow-soft)]"
            style={{
              backgroundImage: "url('/events/odyssey/spartan-helmets.webp')",
              backgroundRepeat: 'repeat',
              backgroundSize: '320px 258px',
            }}
            role="img"
            aria-label="Фон читалки с античными шлемами"
          />
        </div>
      </section>

      <section className="px-5 py-10 text-sm leading-relaxed text-[var(--text-muted)]">
        <div className="mx-auto max-w-6xl">
          <p>
            Текст: Гомер, «Одиссея», перевод Томо Маретича, издание 1915 года,{' '}
            <a href="https://archive.org/details/homerova_odiseja_1915-t.maretic" target="_blank" rel="noreferrer noopener" className="underline underline-offset-2">Public Domain Mark 1.0</a>. Иллюстрации: Джон Уильям Уотерхаус, Арнольд
            Бёклин, Питер Ластман и Пинтуриккьо; репродукции Wikimedia Commons,
            public domain. Фотография коринфского шлема: The Metropolitan Museum
            of Art,{' '}
            <a href="https://commons.wikimedia.org/wiki/File:Bronze_helmet_of_Corinthian_type_MET_DP105637.jpg" target="_blank" rel="noreferrer noopener" className="underline underline-offset-2">CC0</a>.
          </p>
        </div>
      </section>
    </main>
  );
}
