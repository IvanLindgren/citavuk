import { AnimatePresence, motion, useReducedMotion } from 'framer-motion';
import { useEffect, useState, type ReactNode } from 'react';
import { LuBadgeCheck, LuBookOpen, LuKeyboard, LuLightbulb, LuLock, LuUsers } from 'react-icons/lu';

import { getDonation, formatRubles, type DonationState } from '../api/donations';
import { Confetti, Glory } from '../components/Celebration';
import { ButtonLink, Card, Spinner } from '../components/ui';
import { Link, useQuery } from '../lib/router';
import { useSeo } from '../lib/seo';
import { useAuth } from '../state/auth';

/** Уведомление ЮKassa обычно приходит за секунды, но ждём с запасом. */
const POLL_INTERVAL = 3000;
const POLL_LIMIT = 40;
const IDEA_URL = 'https://t.me/ivanlindgren';

export function SupportThanks() {
  useSeo({ title: 'Спасибо за поддержку — Читавук', description: 'Статус поддержки Читавука.' });
  const { d: id = '' } = useQuery();
  const { refreshAccount } = useAuth();
  const [state, setState] = useState<DonationState | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    if (!id) {
      setFailed(true);
      return;
    }
    let cancelled = false;
    let attempts = 0;
    let timer = 0;
    const poll = async () => {
      try {
        const next = await getDonation(id);
        if (cancelled) return;
        setState(next);
        if (next.status === 'pending' && ++attempts < POLL_LIMIT) {
          timer = window.setTimeout(poll, POLL_INTERVAL);
        } else if (next.status === 'succeeded') {
          void refreshAccount();
        }
      } catch {
        if (!cancelled) setFailed(true);
      }
    };
    void poll();
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [id, refreshAccount]);

  if (state?.status === 'succeeded') {
    // Переходы страниц в App идут через AnimatePresence с initial={false}, и
    // при прямом заходе (сюда возвращает ЮKassa) начальные анимации гасятся у
    // всего вложенного. Собственный AnimatePresence возвращает их празднику.
    return (
      <AnimatePresence>
        <Celebrated key="celebrated" state={state} />
      </AnimatePresence>
    );
  }

  return (
    <main className="paper-grain min-h-[calc(100dvh-4rem)] px-4 py-14 sm:py-20">
      <Card className="mx-auto max-w-xl p-7 text-center sm:p-10">
        {failed ? (
          <Result
            image="citavuk_zbunjen"
            title="Не нашёл этот платёж"
            text="Если деньги списались, напиши на denis.kornilov12@yandex.ru — разберусь."
          />
        ) : !state || state.status === 'pending' ? (
          <div className="py-6">
            <Spinner className="mx-auto size-8" />
            <h1 className="mt-5 text-2xl">Проверяю оплату…</h1>
            <p className="mt-2 text-[var(--text-muted)]">
              {state
                ? 'Платёжный сервис ещё подтверждает перевод. Страница обновится сама.'
                : 'Секунду.'}
            </p>
          </div>
        ) : (
          <Result
            image="citavuk_utesi"
            title={state.status === 'refunded' ? 'Платёж возвращён' : 'Оплата не прошла'}
            text={
              state.status === 'refunded'
                ? 'Деньги вернулись тем же способом, которым была оплата.'
                : 'Деньги не списались. Можно попробовать ещё раз — другой картой или через СБП.'
            }
          />
        )}
        <div className="mt-8 flex flex-wrap justify-center gap-3">
          <ButtonLink to="/support">К поддержке</ButtonLink>
          <ButtonLink to="/library" variant="secondary">К чтению</ButtonLink>
        </div>
      </Card>
    </main>
  );
}

function Celebrated({ state }: { state: DonationState }) {
  const reduceMotion = useReducedMotion();
  const listed = state.showPublic && state.publicName !== '';
  const left = Math.max(0, state.thresholdKopecks - state.totalKopecks);
  const progress = Math.min(100, (state.totalKopecks / state.thresholdKopecks) * 100);

  const rise = (delay: number) =>
    reduceMotion
      ? {}
      : {
          initial: { opacity: 0, y: 16 },
          animate: { opacity: 1, y: 0 },
          transition: { duration: 0.5, delay, ease: [0.22, 1, 0.36, 1] as const },
        };

  return (
    <main className="paper-grain relative min-h-[calc(100dvh-4rem)] overflow-hidden px-4 py-10 sm:py-16">
      <Confetti />
      <div className="glow-warm pointer-events-none absolute inset-0" aria-hidden="true" />

      <div className="relative mx-auto max-w-2xl text-center">
        <Glory>
          <img
            src="/img/citavuk_slavlje.webp"
            alt="Читавук радуется"
            width={180}
            height={180}
            className="w-36 object-contain drop-shadow-[0_10px_18px_rgb(0_0_0/0.18)] sm:w-44"
          />
        </Glory>

        <motion.p {...rise(0.35)} className="mt-2 text-sm font-bold uppercase  text-[var(--accent)]">
          Поддержка {formatRubles(state.amountKopecks)} получена
        </motion.p>
        <motion.h1 {...rise(0.45)} className="mt-2 text-balance text-4xl leading-tight sm:text-5xl">
          {state.publicName ? <>Хвала, <span className="text-[var(--accent)]">{state.publicName}</span>!</> : 'Велико хвала!'}
        </motion.h1>
        <motion.p {...rise(0.55)} className="mx-auto mt-4 max-w-lg text-lg leading-relaxed text-[var(--text-muted)]">
          {state.unlocked
            ? 'Теперь ты друг Читавука. Благодаря тебе он остаётся бесплатным для всех, кто учит сербский.'
            : 'Каждый рубль идёт на сервер, перевод и новые разделы. Спасибо, что ты с нами.'}
        </motion.p>
      </div>

      <motion.section {...rise(0.7)} className="relative mx-auto mt-10 max-w-3xl">
        <h2 className="text-center text-2xl">
          {state.unlocked ? 'Что теперь доступно тебе' : 'Что откроется с 200 ₽'}
        </h2>

        {!state.unlocked && (
          <div className="mx-auto mt-4 max-w-md">
            <div className="h-2.5 overflow-hidden rounded-full bg-[var(--bg-sunken)]">
              <motion.div
                className="h-full rounded-full bg-gradient-to-r from-[var(--accent)] to-gold"
                initial={{ width: 0 }}
                animate={{ width: `${progress}%` }}
                transition={{ duration: reduceMotion ? 0 : 1.1, delay: 0.9, ease: [0.22, 1, 0.36, 1] }}
              />
            </div>
            <p className="mt-2 text-center text-sm text-[var(--text-muted)]">
              {state.hasAccount
                ? <>Уже {formatRubles(state.totalKopecks)} из {formatRubles(state.thresholdKopecks)} — осталось {formatRubles(left)}. Суммы складываются.</>
                : <>Суммы складываются только у платежей из аккаунта. <Link to="/login" className="font-semibold text-[var(--accent)] underline underline-offset-2">Войди</Link> перед следующей поддержкой.</>}
            </p>
          </div>
        )}

        <div className="mt-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          <Perk
            index={0}
            icon={<LuUsers className="size-6" />}
            title="Имя среди друзей"
            unlocked={state.unlocked && listed}
            text={
              !state.unlocked
                ? 'На странице друзей Читавука и на главной сайта.'
                : listed
                  ? 'Уже на странице друзей Читавука и на главной.'
                  : 'Поддержка анонимная — имя в списке не показывается.'
            }
            action={state.unlocked && listed ? { to: '/supporters', label: 'Посмотреть' } : undefined}
          />
          <Perk
            index={1}
            icon={<LuBadgeCheck className="size-6" />}
            title="Значок «Друг Читавука»"
            unlocked={state.unlocked && state.hasAccount}
            text={
              !state.hasAccount
                ? 'Выдаётся аккаунту: войди на сайт перед оплатой.'
                : state.unlocked
                  ? 'Уже в твоём профиле, на сайте и в приложении.'
                  : 'Появится в профиле, когда наберётся 200 ₽.'
            }
            action={state.unlocked && state.hasAccount ? { to: '/account', label: 'В профиль' } : undefined}
          />
          <Perk
            index={2}
            icon={<LuBookOpen className="size-6" />}
            title="Закрытая библиотека"
            unlocked={state.unlocked && state.hasAccount}
            text={state.unlocked && state.hasAccount ? 'Книги и подкасты для друзей Читавука уже открыты.' : 'Книги и подкасты для друзей Читавука.'}
            action={state.unlocked && state.hasAccount ? { to: '/friends-library', label: 'Открыть' } : undefined}
          />
          <Perk
            index={3}
            icon={<LuKeyboard className="size-6" />}
            title="Игры раньше всех"
            unlocked={state.unlocked && state.hasAccount}
            text="«Уничтожь эти падежи» с печатной машинкой и «Говори!» с барабаном тем: новые игры открываются вам первыми."
            action={state.unlocked && state.hasAccount ? { to: '/padezi', label: 'Играть' } : undefined}
          />
          <Perk
            index={4}
            icon={<LuLightbulb className="size-6" />}
            title="Идея вне очереди"
            unlocked={state.unlocked}
            text={
              state.unlocked
                ? 'Напиши, чего не хватает в Читавуке, — рассмотрю первой.'
                : 'Твою идею рассмотрю первой.'
            }
            action={state.unlocked ? { href: IDEA_URL, label: 'Предложить' } : undefined}
          />
        </div>
      </motion.section>

      <motion.div {...rise(1.1)} className="relative mt-10 flex flex-wrap justify-center gap-3">
        <ButtonLink to="/library" size="lg">К чтению</ButtonLink>
        <ButtonLink to="/supporters" variant="secondary" size="lg">Друзья Читавука</ButtonLink>
      </motion.div>
    </main>
  );
}

function Perk({
  index,
  icon,
  title,
  text,
  unlocked,
  action,
}: {
  index: number;
  icon: ReactNode;
  title: string;
  text: string;
  unlocked: boolean;
  action?: { to: string; label: string } | { href: string; label: string };
}) {
  const reduceMotion = useReducedMotion();

  return (
    <motion.div
      initial={reduceMotion ? false : { opacity: 0, y: 24, rotateX: -35 }}
      animate={{ opacity: 1, y: 0, rotateX: 0 }}
      transition={{ duration: 0.55, delay: 0.85 + index * 0.12, ease: [0.22, 1, 0.36, 1] }}
      className={[
        'relative flex flex-col overflow-hidden rounded-3xl border p-5 text-left',
        unlocked
          ? 'border-gold/60 bg-[var(--bg-raised)] shadow-[0_8px_30px_-12px_color-mix(in_srgb,var(--color-gold)_70%,transparent)]'
          : 'border-[var(--line)] bg-[var(--bg-raised)]/60',
      ].join(' ')}
    >
      {unlocked && !reduceMotion && (
        <motion.span
          className="pointer-events-none absolute inset-y-0 -left-1/2 w-1/2 -skew-x-12 bg-gradient-to-r from-transparent via-white/50 to-transparent"
          initial={{ x: '-100%' }}
          animate={{ x: '400%' }}
          transition={{ duration: 1.2, delay: 1.4 + index * 0.15, ease: 'easeInOut' }}
          aria-hidden="true"
        />
      )}
      <div className="flex items-center justify-between">
        <span
          className={[
            'grid size-11 place-items-center rounded-2xl',
            unlocked ? 'bg-gold/20 text-[var(--accent)]' : 'bg-[var(--bg-sunken)] text-[var(--text-muted)]',
          ].join(' ')}
          aria-hidden="true"
        >
          {icon}
        </span>
        <span
          className={[
            'rounded-full px-2.5 py-1 text-xs font-bold',
            unlocked ? 'bg-[var(--success-soft)] text-[var(--success)]' : 'bg-[var(--bg-sunken)] text-[var(--text-muted)]',
          ].join(' ')}
        >
          {unlocked ? 'Открыто' : <span className="inline-flex items-center gap-1"><LuLock className="size-3" aria-hidden="true" /> с 200&nbsp;₽</span>}
        </span>
      </div>
      <h3 className="mt-3 text-lg leading-snug">{title}</h3>
      <p className="mt-1.5 flex-1 text-sm leading-relaxed text-[var(--text-muted)]">{text}</p>
      {action && (
        'to' in action ? (
          <Link to={action.to} className="mt-3 text-sm font-semibold text-[var(--accent)] underline underline-offset-2">
            {action.label}
          </Link>
        ) : (
          <a href={action.href} target="_blank" rel="noreferrer noopener" className="mt-3 text-sm font-semibold text-[var(--accent)] underline underline-offset-2">
            {action.label}
          </a>
        )
      )}
    </motion.div>
  );
}

function Result({ image, title, text }: { image: string; title: string; text: string }) {
  return (
    <>
      <img src={`/img/${image}.webp`} alt="" width={160} height={160} className="mx-auto w-32 object-contain" />
      <h1 className="mt-5 text-3xl">{title}</h1>
      <p className="mx-auto mt-3 max-w-md leading-relaxed text-[var(--text-muted)]">{text}</p>
    </>
  );
}
