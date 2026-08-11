import { useCallback, useEffect, useState } from 'react';

import {
  loadGarden,
  loadLeaderboard,
  plantSeed,
  saveGardenProfile,
  searchGardeners,
  waterPlant,
  type GardenBoardRow,
  type GardenPlant,
  type GardenSpecies,
  type GardenState,
} from '../api/garden';
import { ApiError } from '../api/client';
import { GardenScene } from '../components/GardenScene';
import { Button, Card, ErrorNote, Reveal, Spinner } from '../components/ui';
import { isBlooming, projectedGrowth } from '../garden/scene';
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

  const { navigate } = useRouter();
  const { account, loading } = useAuth();
  const [state, setState] = useState<GardenState | null>(null);
  const [fetchedAt, setFetchedAt] = useState(() => Date.now());
  const [board, setBoard] = useState<GardenBoardRow[]>([]);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [picking, setPicking] = useState<number | null>(null);
  const [watering, setWatering] = useState<number | null>(null);

  const apply = useCallback((next: GardenState) => {
    setState(next);
    setFetchedAt(Date.now());
  }, []);

  useEffect(() => {
    if (!account) return;
    let alive = true;
    const pull = () =>
      loadGarden()
        .then((next) => alive && apply(next))
        .catch((cause) => alive && setError(describe(cause)));
    pull();
    // Клиент досчитывает рост сам, но раз в минуту сверяется с сервером: иначе
    // разойдутся часы и заработок, начисленный за это время.
    const timer = window.setInterval(pull, 60_000);
    return () => {
      alive = false;
      window.clearInterval(timer);
    };
  }, [account, apply]);

  useEffect(() => {
    let alive = true;
    loadLeaderboard()
      .then((result) => alive && setBoard(result.board))
      .catch(() => undefined);
    return () => {
      alive = false;
    };
  }, [state?.bloomed]);

  const act = useCallback(
    async (action: () => Promise<GardenState>) => {
      setBusy(true);
      setError('');
      try {
        apply(await action());
      } catch (cause) {
        setError(describe(cause));
      } finally {
        setBusy(false);
      }
    },
    [apply],
  );

  // Садовник доходит до грядки и поливает; результат приходит раньше, чем
  // кончается анимация, поэтому она живёт своим таймером.
  const water = useCallback(
    (slot: number) => {
      setWatering(slot);
      window.setTimeout(() => setWatering(null), 2400);
      return act(() => waterPlant(slot));
    },
    [act],
  );

  const onBed = useCallback(
    (slot: number, plant?: GardenPlant) => {
      if (busy) return;
      if (!plant) {
        setPicking(slot);
        return;
      }
      const growth = projectedGrowth(plant, Date.now() - fetchedAt);
      const species = state?.catalog.find((item) => item.id === plant.species);
      if (isBlooming(growth) && species) {
        navigate(`/trainer?topic=${encodeURIComponent(species.topic)}`);
        return;
      }
      void water(slot);
    },
    [busy, fetchedAt, navigate, state?.catalog, water],
  );

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
                <GardenScene
                  slots={state.slots}
                  plants={state.plants}
                  catalog={state.catalog}
                  fetchedAt={fetchedAt}
                  watering={watering}
                  onBed={onBed}
                />
                <p className="mt-3 text-sm text-[var(--text-muted)]">
                  Нажми на пустую лунку, чтобы посадить, на росток — чтобы
                  полить, на распустившийся цветок — чтобы заняться его темой.
                </p>
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
          <Gardeners catalog={state?.catalog ?? []} />
        </Reveal>

        <Reveal delay={0.3}>
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

/**
 * Поиск садоводов.
 *
 * Ищет по части имени садовода и по тому, что растёт в саду. Имя аккаунта не
 * ищется намеренно: человек соглашался показать сад под выбранным именем, а не
 * связать его со своим настоящим.
 */
function Gardeners({ catalog }: { catalog: GardenSpecies[] }) {
  const [query, setQuery] = useState('');
  const [species, setSpecies] = useState('');
  const [found, setFound] = useState<GardenBoardRow[] | null>(null);
  const [searching, setSearching] = useState(false);

  useEffect(() => {
    let alive = true;
    setSearching(true);
    // Запрос на каждую букву не нужен: пауза в треть секунды снимает почти все
    // промежуточные обращения.
    const timer = window.setTimeout(() => {
      searchGardeners(query.trim(), species)
        .then((result) => alive && setFound(result.gardeners))
        .catch(() => alive && setFound([]))
        .finally(() => alive && setSearching(false));
    }, 320);
    return () => {
      alive = false;
      window.clearTimeout(timer);
    };
  }, [query, species]);

  return (
    <Card className="mt-10 p-5 sm:p-7">
      <h2 className="font-display text-xl font-bold">
        {GARDEN.find.sr}{' '}
        <span className="text-sm font-normal text-[var(--text-muted)]">
          — {GARDEN.find.ru}
        </span>
      </h2>

      <div className="mt-4 flex flex-wrap gap-3">
        <input
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          maxLength={24}
          type="search"
          placeholder="имя садовода"
          aria-label={GARDEN.find.ru}
          className="min-w-0 flex-1 rounded-xl border border-[var(--line)] bg-[var(--bg-raised)] px-4 py-2.5"
        />
        <select
          value={species}
          onChange={(event) => setSpecies(event.target.value)}
          aria-label="что растёт в саду"
          className="rounded-xl border border-[var(--line)] bg-[var(--bg-raised)] px-4 py-2.5"
        >
          <option value="">что угодно</option>
          {catalog.map((item) => (
            <option key={item.id} value={item.id}>
              {item.serbian} — {item.russian}
            </option>
          ))}
        </select>
      </div>

      {found && found.length === 0 && !searching && (
        <p className="mt-4 text-sm text-[var(--text-muted)]">
          {GARDEN.nobody.sr} — {GARDEN.nobody.ru}.
        </p>
      )}

      <ul className="mt-4 space-y-2">
        {(found ?? []).map((row) => (
          <li key={row.nickname}>
            <Link
              to={`/basta/${encodeURIComponent(row.nickname)}`}
              className="flex items-baseline gap-3 rounded-xl px-2 py-1.5 text-sm hover:bg-[var(--bg-sunken)]"
            >
              <span className="font-semibold">{row.nickname}</span>
              <span className="truncate text-[var(--text-muted)]">
                {(row.growing ?? [])
                  .map((id) => catalog.find((item) => item.id === id)?.serbian ?? id)
                  .join(', ')}
              </span>
              <span className="ml-auto shrink-0 tabular-nums text-[var(--text-muted)]">
                {row.bloomed} / {row.plants}
              </span>
            </Link>
          </li>
        ))}
      </ul>
    </Card>
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
      Цветы — из набора FlowerAssets под лицензией CC0; Читавука-садовника
      нарисовал автор проекта.
    </p>
  );
}

function describe(cause: unknown): string {
  if (cause instanceof ApiError) return cause.message;
  return 'Не удалось открыть сад. Попробуй ещё раз.';
}
