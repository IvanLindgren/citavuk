import { useCallback, useEffect, useState } from 'react';

import {
  loadGarden,
  loadLeaderboard,
  plantSeed,
  saveGardenProfile,
  waterPlant,
  type GardenBoardRow,
  type GardenSpecies,
  type GardenState,
} from '../api/garden';
import { ApiError } from '../api/client';
import { GardenBed } from '../components/GardenBed';
import { Button, Card, ErrorNote, Reveal, Spinner } from '../components/ui';
import { GARDEN, coinWord } from '../garden/strings';
import { Link, useRouter } from '../lib/router';
import { useSeo } from '../lib/seo';
import { useAuth } from '../state/auth';

export function Garden() {
  useSeo({
    title: 'Башта Читавука — сад за занятия сербским',
    description:
      'Сажай цветы за цветочные динары: их дают чтение, повторение слов, дуэль переводов, тренажёрка и уроки курса. Сад говорит по-сербски.',
  });

  const { account, loading } = useAuth();
  const [state, setState] = useState<GardenState | null>(null);
  const [board, setBoard] = useState<GardenBoardRow[]>([]);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [picking, setPicking] = useState<number | null>(null);

  useEffect(() => {
    if (!account) return;
    let alive = true;
    loadGarden()
      .then((next) => alive && setState(next))
      .catch((cause) => alive && setError(describe(cause)));
    return () => {
      alive = false;
    };
  }, [account]);

  useEffect(() => {
    let alive = true;
    loadLeaderboard()
      .then((result) => alive && setBoard(result.board))
      .catch(() => undefined);
    return () => {
      alive = false;
    };
  }, [state?.bloomed]);

  const act = useCallback(async (action: () => Promise<GardenState>) => {
    setBusy(true);
    setError('');
    try {
      setState(await action());
    } catch (cause) {
      setError(describe(cause));
    } finally {
      setBusy(false);
    }
  }, []);

  if (loading) {
    return (
      <main className="flex min-h-[60dvh] items-center justify-center">
        <Spinner />
      </main>
    );
  }

  if (!account) return <GardenIntro board={board} />;

  return (
    <main className="paper-grain relative min-h-[calc(100dvh-4rem)] overflow-x-hidden px-4 py-10 sm:px-5 sm:py-14">
      <div className="mx-auto max-w-5xl">
        <Reveal>
          <p className="text-sm font-bold uppercase text-[var(--accent)]">
            {GARDEN.coins.ru}
          </p>
          <h1 className="mt-2 text-4xl sm:text-5xl">{GARDEN.title.sr}</h1>
          <p className="mt-2 text-[var(--text-muted)]">{GARDEN.title.ru}</p>
        </Reveal>

        {error && (
          <div className="mt-6">
            <ErrorNote>{error}</ErrorNote>
          </div>
        )}

        {!state ? (
          <div className="mt-10 flex justify-center">
            <Spinner />
          </div>
        ) : (
          <>
            <Reveal delay={0.05}>
              <Wallet state={state} busy={busy} />
            </Reveal>

            <Reveal delay={0.1}>
              <section className="mt-8">
                <div
                  className="grid gap-3 rounded-3xl border border-[var(--line)] p-3 sm:gap-4 sm:p-5"
                  style={{
                    gridTemplateColumns: 'repeat(auto-fill, minmax(9rem, 1fr))',
                    background:
                      'linear-gradient(180deg, color-mix(in srgb, var(--success) 12%, transparent), transparent 60%), var(--bg-sunken)',
                  }}
                >
                  {Array.from({ length: state.slots }, (_, slot) => (
                    <GardenBed
                      key={slot}
                      slot={slot}
                      plant={state.plants.find((item) => item.slot === slot)}
                      catalog={state.catalog}
                      stages={state.stages}
                      busy={busy}
                      onPlant={() => setPicking(slot)}
                      onWater={() => act(() => waterPlant(slot))}
                    />
                  ))}
                </div>
              </section>
            </Reveal>

            {picking !== null && (
              <Shop
                catalog={state.catalog}
                coins={state.coins}
                busy={busy}
                onClose={() => setPicking(null)}
                onPick={async (species) => {
                  await act(() => plantSeed(picking, species));
                  setPicking(null);
                }}
              />
            )}

            <div className="mt-10 grid gap-6 lg:grid-cols-2">
              <Reveal delay={0.15}>
                <Earnings state={state} />
              </Reveal>
              <Reveal delay={0.2}>
                <GardenerProfile
                  state={state}
                  busy={busy}
                  onSave={(nickname, isPublic) =>
                    act(() => saveGardenProfile(nickname, isPublic))
                  }
                />
              </Reveal>
            </div>
          </>
        )}

        <Reveal delay={0.25}>
          <Leaderboard board={board} />
        </Reveal>

        <Credits />
      </div>
    </main>
  );
}

function Wallet({ state, busy }: { state: GardenState; busy: boolean }) {
  return (
    <Card className="mt-8 flex flex-wrap items-center gap-6 p-5 sm:p-7">
      <span
        aria-hidden
        className={`garden-wolf shrink-0 origin-left scale-75 sm:scale-100 ${
          busy ? 'garden-wolf--watering' : ''
        }`}
      />
      <div>
        <p className="font-display text-3xl font-bold">
          {state.coins} <span className="text-xl">{coinWord(state.coins)}</span>
        </p>
        <p className="text-sm text-[var(--text-muted)]">{GARDEN.coins.sr}</p>
      </div>
      <div className="ml-auto text-right">
        <p className="font-display text-2xl font-bold">×{state.speed.toFixed(1)}</p>
        <p className="text-sm text-[var(--text-muted)]">
          {GARDEN.speed.sr} — {GARDEN.speed.ru}
        </p>
      </div>
      <div className="text-right">
        <p className="font-display text-2xl font-bold">{state.bloomed}</p>
        <p className="text-sm text-[var(--text-muted)]">
          {GARDEN.bloomed.sr} — {GARDEN.bloomed.ru}
        </p>
      </div>
    </Card>
  );
}

function Earnings({ state }: { state: GardenState }) {
  return (
    <Card className="h-full p-5 sm:p-7">
      <h2 className="font-display text-xl font-bold">
        {GARDEN.earnings.sr}{' '}
        <span className="text-sm font-normal text-[var(--text-muted)]">
          — {GARDEN.earnings.ru}
        </span>
      </h2>
      <ul className="mt-4 space-y-3">
        {state.earnings.map((line) => (
          <li key={line.source}>
            <div className="flex items-baseline justify-between gap-3 text-sm">
              <span>{line.title}</span>
              <span className="tabular-nums text-[var(--text-muted)]">
                {line.today} / {line.cap}
              </span>
            </div>
            <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-[var(--bg-sunken)]">
              <div
                className="h-full rounded-full bg-[var(--accent)]"
                style={{ width: `${Math.min(100, (line.today / line.cap) * 100)}%` }}
              />
            </div>
          </li>
        ))}
      </ul>
      <p className="mt-4 text-sm text-[var(--text-muted)]">
        Динары начисляет сервер по твоим занятиям. Чем больше заработано за день,
        тем быстрее растут цветы — до двойной скорости.
      </p>
    </Card>
  );
}

function GardenerProfile({
  state,
  busy,
  onSave,
}: {
  state: GardenState;
  busy: boolean;
  onSave: (nickname: string, isPublic: boolean) => void;
}) {
  const [nickname, setNickname] = useState(state.nickname);
  const [isPublic, setPublic] = useState(state.public);

  useEffect(() => {
    setNickname(state.nickname);
    setPublic(state.public);
  }, [state.nickname, state.public]);

  return (
    <Card className="h-full p-5 sm:p-7">
      <h2 className="font-display text-xl font-bold">
        {GARDEN.myName.sr}{' '}
        <span className="text-sm font-normal text-[var(--text-muted)]">
          — {GARDEN.myName.ru}
        </span>
      </h2>
      <form
        className="mt-4 space-y-4"
        onSubmit={(event) => {
          event.preventDefault();
          onSave(nickname.trim(), isPublic);
        }}
      >
        <input
          value={nickname}
          onChange={(event) => setNickname(event.target.value)}
          maxLength={24}
          placeholder="Читавук"
          aria-label={GARDEN.myName.ru}
          className="w-full rounded-xl border border-[var(--line)] bg-[var(--bg-raised)] px-4 py-2.5"
        />
        <label className="flex items-start gap-3 text-sm">
          <input
            type="checkbox"
            checked={isPublic}
            onChange={(event) => setPublic(event.target.checked)}
            className="mt-1"
          />
          <span>
            {GARDEN.openGarden.sr}
            <span className="block text-[var(--text-muted)]">
              Сад появится в таблице садоводов и откроется по ссылке
              citavuk.ru/basta/{nickname.trim() || '…'}. Пока галочка снята, сад
              видишь только ты.
            </span>
          </span>
        </label>
        <Button type="submit" disabled={busy}>
          {GARDEN.save.sr} — {GARDEN.save.ru}
        </Button>
      </form>
      {state.public && state.nickname && (
        <p className="mt-4 text-sm text-[var(--text-muted)]">
          Помог соседям сегодня: {state.helpedToday} из {state.helpLimit}.
        </p>
      )}
    </Card>
  );
}

function Shop({
  catalog,
  coins,
  busy,
  onPick,
  onClose,
}: {
  catalog: GardenSpecies[];
  coins: number;
  busy: boolean;
  onPick: (species: string) => void;
  onClose: () => void;
}) {
  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-black/50 p-0 sm:items-center sm:p-4"
      role="dialog"
      aria-modal="true"
      aria-label={GARDEN.shop.ru}
      onClick={onClose}
    >
      <div
        className="max-h-[85dvh] w-full max-w-2xl overflow-y-auto rounded-t-3xl bg-[var(--bg-raised)] p-5 sm:rounded-3xl sm:p-7"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="flex items-baseline justify-between gap-4">
          <h2 className="font-display text-2xl font-bold">
            {GARDEN.shop.sr}{' '}
            <span className="text-sm font-normal text-[var(--text-muted)]">
              — {GARDEN.shop.ru}
            </span>
          </h2>
          <span className="tabular-nums text-[var(--text-muted)]">
            {coins} {coinWord(coins)}
          </span>
        </div>
        <ul className="mt-5 grid gap-3 sm:grid-cols-2">
          {catalog.map((species, index) => {
            const affordable = coins >= species.price;
            return (
              <li key={species.id}>
                <button
                  type="button"
                  disabled={busy || !affordable}
                  onClick={() => onPick(species.id)}
                  className="flex w-full items-center gap-4 rounded-2xl border border-[var(--line)] p-4 text-left transition-colors hover:border-[var(--accent)] disabled:opacity-45"
                >
                  <span
                    aria-hidden
                    className="block h-12 w-12 shrink-0 bg-no-repeat"
                    style={{
                      backgroundImage: 'url(/img/garden/garden_seeds.webp)',
                      backgroundSize: `${catalog.length * 3}rem 3rem`,
                      backgroundPosition: `-${index * 3}rem 0`,
                    }}
                  />
                  <span className="min-w-0">
                    <span className="block font-display text-lg font-bold">
                      {species.serbian}
                    </span>
                    <span className="block text-sm text-[var(--text-muted)]">
                      {species.russian} · {species.theme}
                    </span>
                  </span>
                  <span className="ml-auto shrink-0 tabular-nums font-bold">
                    {species.price}
                  </span>
                </button>
              </li>
            );
          })}
        </ul>
        <Button className="mt-5" variant="ghost" onClick={onClose}>
          Закрыть
        </Button>
      </div>
    </div>
  );
}

function Leaderboard({ board }: { board: GardenBoardRow[] }) {
  if (board.length === 0) return null;
  return (
    <Card className="mt-10 p-5 sm:p-7">
      <h2 className="font-display text-xl font-bold">
        {GARDEN.board.sr}{' '}
        <span className="text-sm font-normal text-[var(--text-muted)]">
          — {GARDEN.board.ru}
        </span>
      </h2>
      <ol className="mt-4 space-y-2">
        {board.map((row, index) => (
          <li key={row.nickname} className="flex items-baseline gap-3 text-sm">
            <span className="w-6 shrink-0 tabular-nums text-[var(--text-muted)]">
              {index + 1}
            </span>
            <Link to={`/basta/${encodeURIComponent(row.nickname)}`} className="truncate">
              {row.nickname}
            </Link>
            <span className="ml-auto shrink-0 tabular-nums text-[var(--text-muted)]">
              {row.bloomed} · {row.plants}
            </span>
          </li>
        ))}
      </ol>
    </Card>
  );
}

function GardenIntro({ board }: { board: GardenBoardRow[] }) {
  const { navigate } = useRouter();
  return (
    <main className="paper-grain relative min-h-[calc(100dvh-4rem)] px-4 py-10 sm:px-5 sm:py-16">
      <div className="mx-auto max-w-3xl">
        <Reveal>
          <h1 className="text-4xl sm:text-5xl">{GARDEN.title.sr}</h1>
          <p className="mt-2 text-[var(--text-muted)]">{GARDEN.title.ru}</p>
        </Reveal>
        <Reveal delay={0.06}>
          <Card className="mt-8 p-6 sm:p-9">
            <p className="leading-relaxed">
              Сад растёт от занятий. Чтение книг, повторение слов, дуэль с
              переводчиком, тренажёрка и уроки курса приносят цветочные динары, а
              за них покупаются семена. Чем больше занимаешься за день, тем
              быстрее поднимаются цветы. Распустившийся цветок говорит по-сербски
              и зовёт заняться своей темой.
            </p>
            <p className="mt-4 leading-relaxed">
              Динары считает сервер по твоим занятиям, поэтому сад привязан к
              аккаунту.
            </p>
            <Button className="mt-6" onClick={() => navigate('/login')}>
              Войти и открыть сад
            </Button>
          </Card>
        </Reveal>
        <Leaderboard board={board} />
        <Credits />
      </div>
    </main>
  );
}

function Credits() {
  return (
    <p className="mt-10 text-xs text-[var(--text-muted)]">
      Цветы и грядки нарисованы для Читавука на основе свободных наборов;
      Читавука-садовника нарисовал автор проекта.
    </p>
  );
}

function describe(cause: unknown): string {
  if (cause instanceof ApiError) return cause.message;
  return 'Не удалось открыть сад. Попробуй ещё раз.';
}
