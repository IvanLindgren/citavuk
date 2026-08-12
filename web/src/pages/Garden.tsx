import { useCallback, useEffect, useState, type ReactNode } from 'react';
import {
  LuArrowLeft,
  LuBookMarked,
  LuChartNoAxesColumnIncreasing,
  LuCloudRain,
  LuCoins,
  LuDroplet,
  LuFlower2,
  LuLogIn,
  LuSettings2,
  LuSprout,
  LuSun,
  LuTrophy,
  LuUsers,
  LuVolume2,
  LuVolumeX,
} from 'react-icons/lu';

import {
  buyGardenDecoration,
  cutGardenFlower,
  fillGardenCan,
  loadGarden,
  loadLeaderboard,
  plantSeed,
  saveGardenProfile,
  searchGardeners,
  waterPlant,
  type GardenBoardRow,
  type GardenCut,
  type GardenTask,
  type GardenDecoration,
  type GardenPlant,
  type GardenSpecies,
  type GardenState,
} from '../api/garden';
import { ApiError } from '../api/client';
import { GardenScene } from '../components/GardenScene';
import { GardenWindow } from '../components/GardenWindow';
import { HouseRoom } from '../components/HouseRoom';
import { Button, ErrorNote, Spinner } from '../components/ui';
import { isBlooming, projectedGrowth } from '../garden/scene';
import {
  playGardenSound,
  readGardenSoundSetting,
  saveGardenSoundSetting,
  startGardenMusic,
  stopGardenMusic,
  unlockGardenAudio,
} from '../garden/audio';
import { GARDEN, coinWord, plantImage, taskPhrase } from '../garden/strings';
import { Link, useRouter } from '../lib/router';
import { useSeo } from '../lib/seo';
import { useAuth } from '../state/auth';

type Panel = 'seeds' | 'earnings' | 'neighbours' | 'profile' | 'herbarium';

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
  const [panel, setPanel] = useState<Panel | null>(null);
  const [selectedSeed, setSelectedSeed] = useState<string | null>(null);
  const [soundEnabled, setSoundEnabled] = useState(readGardenSoundSetting);
  /** Что срезали последним: показывается вместе с фразой цветка. */
  const [harvest, setHarvest] = useState<GardenCut | null>(null);
  const [inHouse, setInHouse] = useState(false);

  const toggleSound = useCallback(() => {
    const next = !soundEnabled;
    setSoundEnabled(next);
    saveGardenSoundSetting(next);
    if (next) {
      unlockGardenAudio();
      playGardenSound('ui');
    }
  }, [soundEnabled]);

  // Музыка ждёт первого касания страницы: до него браузер звук не пустит.
  useEffect(() => {
    startGardenMusic(soundEnabled);
    return () => stopGardenMusic();
  }, [soundEnabled]);

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

  const water = useCallback(
    (slot: number) => {
      setWatering(slot);
      window.setTimeout(() => setWatering(null), 2400);
      return act(() => waterPlant(slot));
    },
    [act],
  );

  // Распустившийся цветок срезается в гербарий: грядка освобождается, а вместе
  // с наградой показывается его фраза и путь в свою тему тренажёрки.
  const cut = useCallback(
    (slot: number) =>
      act(async () => {
        const next = await cutGardenFlower(slot);
        playGardenSound('bloom', soundEnabled);
        if (next.cut) setHarvest(next.cut);
        return next;
      }),
    [act, soundEnabled],
  );

  const fill = useCallback(
    () =>
      act(async () => {
        const next = await fillGardenCan();
        playGardenSound('water', soundEnabled);
        return next;
      }),
    [act, soundEnabled],
  );

  const onBed = useCallback(
    (slot: number, plant?: GardenPlant) => {
      if (busy) return;
      if (!plant) {
        if (selectedSeed) void act(async () => {
          const next = await plantSeed(slot, selectedSeed);
          playGardenSound('plant', soundEnabled);
          return next;
        });
        else setPicking(slot);
        return;
      }
      if (isBlooming(projectedGrowth(plant, Date.now() - fetchedAt))) {
        void cut(slot);
        return;
      }
      void water(slot);
    },
    [act, busy, cut, fetchedAt, selectedSeed, soundEnabled, water],
  );

  if (loading) {
    return (
      <main className="garden-game-shell fixed inset-0 z-[60] grid place-items-center">
        <Spinner />
      </main>
    );
  }

  if (!account) return <GardenDemo board={board} />;

  return (
    <main className="garden-game-shell fixed inset-0 z-[60] overflow-hidden">
      {state ? (
        <GardenScene
          slots={state.slots}
          plants={state.plants}
          catalog={state.catalog}
          fetchedAt={fetchedAt}
          watering={watering}
          decorations={state.decorations}
          soundEnabled={soundEnabled}
          weather={state.weather}
          river={state.river}
          onBed={onBed}
          onRiver={() => void fill()}
          onHouse={() => setInHouse(true)}
        />
      ) : (
        <div className="grid size-full place-items-center"><Spinner /></div>
      )}

      {state && <GardenHud state={state} busy={busy} soundEnabled={soundEnabled} onToggleSound={toggleSound} onExit={() => navigate('/')} />}
      {state?.task && <TaskBadge task={state.task} />}
      {state && (
        <GardenToolbar
          selectedSeed={selectedSeed}
          onOpen={setPanel}
        />
      )}

      {error && (
        <div className="absolute left-1/2 top-20 z-[130] w-[min(92%,42rem)] -translate-x-1/2">
          <ErrorNote>{error}</ErrorNote>
        </div>
      )}

      {state && picking !== null && (
        <SeedWindow
          catalog={state.catalog}
          coins={state.coins}
          busy={busy}
          onClose={() => setPicking(null)}
          onPick={async (species) => {
            await act(async () => {
              const next = await plantSeed(picking, species);
              playGardenSound('plant', soundEnabled);
              return next;
            });
            setPicking(null);
          }}
        />
      )}

      {state && inHouse && (
        <HouseRoom
          decorations={state.decorations ?? []}
          catalog={state.decorationCatalog ?? []}
          coins={state.coins}
          busy={busy}
          soundEnabled={soundEnabled}
          onBuy={(decoration) =>
            void act(async () => {
              const next = await buyGardenDecoration(decoration);
              playGardenSound('bloom', soundEnabled);
              return next;
            })
          }
          onClose={() => setInHouse(false)}
        />
      )}

      {state && harvest && (
        <HarvestWindow
          cut={harvest}
          catalog={state.catalog}
          onClose={() => setHarvest(null)}
          onPractise={(topic) => navigate(`/trainer?topic=${encodeURIComponent(topic)}`)}
        />
      )}

      {state && panel && (
        <GardenWindow title={panelTitle(panel)} onClose={() => setPanel(null)}>
          {panel === 'seeds' && (
            <GardenShop
              state={state}
              busy={busy}
              selectedSeed={selectedSeed}
              onSeed={(species) => {
                setSelectedSeed(species);
                setPanel(null);
              }}
              onDecoration={(decoration) => act(async () => {
                const next = await buyGardenDecoration(decoration);
                playGardenSound('bloom', soundEnabled);
                return next;
              })}
            />
          )}
          {panel === 'earnings' && <Earnings state={state} />}
          {panel === 'herbarium' && <Herbarium state={state} />}
          {panel === 'profile' && (
            <>
              <GardenerProfile
                state={state}
                busy={busy}
                onSave={(nickname, isPublic) => act(() => saveGardenProfile(nickname, isPublic))}
              />
              <Credits />
            </>
          )}
          {panel === 'neighbours' && (
            <Neighbours catalog={state.catalog} board={board} />
          )}
        </GardenWindow>
      )}
    </main>
  );
}

function GardenHud({
  state,
  busy,
  soundEnabled,
  onToggleSound,
  onExit,
}: {
  state: GardenState;
  busy: boolean;
  soundEnabled: boolean;
  onToggleSound: () => void;
  onExit: () => void;
}) {
  return (
    <div className="pointer-events-none absolute inset-x-0 top-0 z-[120] flex items-start justify-between gap-3 p-3 sm:p-4">
      <div className="garden-game-plaque pointer-events-auto flex min-w-0 max-w-[56vw] items-center gap-2 px-2 py-2 sm:px-3">
        <button type="button" onClick={onExit} className="grid size-9 shrink-0 place-items-center border-2 border-[#8c5b37] bg-[#f5dfaa]" aria-label="Выйти из сада" title="Выйти из сада"><LuArrowLeft /></button>
        <span className="min-w-0">
          <span className="block whitespace-nowrap font-display text-base font-bold leading-tight sm:text-xl">{GARDEN.title.sr}</span>
          <span className="hidden text-[11px] text-[#5e4635] sm:block">{GARDEN.title.ru}</span>
        </span>
      </div>
      <div className="garden-game-plaque pointer-events-auto flex items-center gap-2 px-2 py-2 sm:gap-5 sm:px-4">
        <HudValue icon={<LuCoins />} value={state.coins} label={coinWord(state.coins)} busy={busy} />
        <HudValue icon={<LuFlower2 />} value={state.bloomed} label={GARDEN.bloomed.sr} />
        {/* Вода — главный дефицит дня, поэтому она в HUD рядом с динарами. */}
        <HudValue
          icon={<LuDroplet className={state.water > 0 ? 'text-sky-600' : 'text-[#9c8a7a]'} />}
          value={`${state.water}/${state.waterCap}`}
          label={GARDEN.can.sr}
        />
        <span className="hidden sm:contents">
          <HudValue icon={<LuChartNoAxesColumnIncreasing />} value={`×${state.speed.toFixed(1)}`} label={GARDEN.speed.sr} />
          <HudValue
            icon={state.weather === 'rain' ? <LuCloudRain /> : <LuSun />}
            value=""
            label={state.weather === 'rain' ? GARDEN.rain.sr : GARDEN.clear.sr}
          />
        </span>
        <button type="button" onClick={onToggleSound} className="grid size-8 place-items-center border-2 border-[#8c5b37] bg-[#f5dfaa]" aria-label={soundEnabled ? 'Выключить звуки сада' : 'Включить звуки сада'} title={soundEnabled ? 'Выключить звуки сада' : 'Включить звуки сада'}>
          {soundEnabled ? <LuVolume2 /> : <LuVolumeX />}
        </button>
      </div>
    </div>
  );
}

function HudValue({
  icon,
  value,
  label,
  busy = false,
}: {
  icon: ReactNode;
  value: ReactNode;
  label: string;
  busy?: boolean;
}) {
  return (
    <span className={`flex items-center gap-1.5 ${busy ? 'animate-pulse' : ''}`} title={label}>
      <span className="text-[#8a4d27]">{icon}</span>
      <span className="font-bold tabular-nums">{value}</span>
      <span className="hidden text-xs text-[#5e4635] lg:inline">{label}</span>
    </span>
  );
}

/**
 * Задание дня. Висит на карте, а не в окне: смысл в том, чтобы дать причину
 * зайти сегодня, и незамеченное задание такой причиной не станет.
 */
function TaskBadge({ task }: { task: GardenTask }) {
  const phrase = taskPhrase(task.kind, task.target);
  return (
    <div className="garden-game-plaque pointer-events-none absolute left-3 top-20 z-[118] max-w-[15rem] px-3 py-2 sm:left-4 sm:top-24">
      <p className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-wide text-[#7a5b43]">
        {GARDEN.task.sr}
      </p>
      <p className="font-display text-base font-bold leading-tight">{phrase.sr}</p>
      <p className="text-[11px] text-[#6b4d38]">{phrase.ru}</p>
      <p className="mt-1 text-xs tabular-nums">
        {task.done ? `${GARDEN.done.sr} · +${task.reward}` : `${task.progress} / ${task.target}`}
      </p>
    </div>
  );
}

/** Гербарий: срезанные цветы остаются здесь навсегда. */
function Herbarium({ state }: { state: GardenState }) {
  const collected = state.herbarium ?? [];
  return (
    <div>
      <p className="text-sm text-[#6b4d38]">
        Срезанный цветок освобождает грядку и остаётся здесь. За первый цветок вида
        платят больше: собери все четыре.
      </p>
      <ul className="mt-4 grid gap-3 sm:grid-cols-2">
        {state.catalog.map((species) => {
          const item = collected.find((entry) => entry.species === species.id);
          return (
            <li
              key={species.id}
              className={`flex items-center gap-3 border-2 p-3 ${
                item ? 'border-[#b7844e] bg-[#fff0c7]' : 'border-[#c9ad84] bg-[#f1e3c2] opacity-60'
              }`}
            >
              <img
                src={plantImage(species.id, 4)}
                alt=""
                className="garden-pixel-art h-12 w-9 object-contain object-bottom"
                style={{ imageRendering: 'pixelated' }}
              />
              <span className="min-w-0">
                <span className="block font-display text-lg font-bold">{species.serbian}</span>
                <span className="block text-sm text-[#6b4d38]">{species.russian} · {species.theme}</span>
              </span>
              <span className="ml-auto shrink-0 font-bold tabular-nums">
                {item ? `×${item.count}` : '—'}
              </span>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

/**
 * Окно среза. Здесь цветок и говорит свою фразу: раньше распустившийся цветок
 * молча уводил в тренажёрку, и связь темы с цветком нигде не проговаривалась.
 */
function HarvestWindow({
  cut,
  catalog,
  onClose,
  onPractise,
}: {
  cut: GardenCut;
  catalog: GardenSpecies[];
  onClose: () => void;
  onPractise: (topic: string) => void;
}) {
  const species = catalog.find((item) => item.id === cut.species);
  if (!species) return null;
  return (
    <GardenWindow title={`${GARDEN.cut.sr} — ${GARDEN.cut.ru}`} onClose={onClose}>
      <div className="flex items-start gap-4">
        <img
          src={plantImage(species.id, 4)}
          alt=""
          className="garden-pixel-art h-24 w-16 shrink-0 object-contain object-bottom"
          style={{ imageRendering: 'pixelated' }}
        />
        <div className="min-w-0">
          <p className="font-display text-xl font-bold">{species.serbian}</p>
          <p className="text-sm text-[#6b4d38]">{species.russian}</p>
          <p className="mt-3 text-lg leading-7">{species.phrase}</p>
          <p className="mt-3 font-semibold tabular-nums">
            +{cut.coins} {coinWord(cut.coins)}
            {cut.first && <span className="ml-2 text-[#6b4d38]">первый в гербарии</span>}
          </p>
        </div>
      </div>
      <Button className="mt-5" onClick={() => onPractise(species.topic)}>
        {GARDEN.practise.sr} — {species.theme}
      </Button>
    </GardenWindow>
  );
}

function GardenToolbar({
  selectedSeed,
  onOpen,
}: {
  selectedSeed: string | null;
  onOpen: (panel: Panel) => void;
}) {
  return (
    <div className="garden-toolbelt absolute bottom-3 left-1/2 z-[120] flex -translate-x-1/2 items-center gap-1 p-1.5 sm:bottom-4 sm:gap-2">
      <ToolButton active={Boolean(selectedSeed)} label="Семена" onClick={() => onOpen('seeds')}>
        <LuSprout />
      </ToolButton>
      <ToolButton label="Гербарий" onClick={() => onOpen('herbarium')}>
        <LuBookMarked />
      </ToolButton>
      <ToolButton label="Заработок" onClick={() => onOpen('earnings')}>
        <LuChartNoAxesColumnIncreasing />
      </ToolButton>
      <ToolButton label="Соседи" onClick={() => onOpen('neighbours')}>
        <LuUsers />
      </ToolButton>
      <ToolButton label="Садовод" onClick={() => onOpen('profile')}>
        <LuSettings2 />
      </ToolButton>
    </div>
  );
}

function ToolButton({
  children,
  label,
  active = false,
  onClick,
}: {
  children: ReactNode;
  label: string;
  active?: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      title={label}
      aria-label={label}
      aria-pressed={active}
      onClick={() => {
        unlockGardenAudio();
        onClick();
      }}
      className={`grid size-12 place-items-center border-2 text-xl transition-transform hover:-translate-y-0.5 sm:size-14 ${
        active
          ? 'border-[#ffe69a] bg-[#a85032] text-white'
          : 'border-[#8c5b37] bg-[#f5dfaa] text-[#4b3025] hover:bg-[#ffeabb]'
      }`}
    >
      {children}
    </button>
  );
}

function SeedWindow({
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
    <GardenWindow title={`${GARDEN.shop.sr} — ${GARDEN.shop.ru}`} onClose={onClose}>
      <SeedShelf catalog={catalog} coins={coins} busy={busy} onPick={onPick} />
    </GardenWindow>
  );
}

function GardenShop({
  state,
  busy,
  selectedSeed,
  onSeed,
  onDecoration,
}: {
  state: GardenState;
  busy: boolean;
  selectedSeed: string | null;
  onSeed: (species: string) => void;
  onDecoration: (decoration: string) => Promise<void>;
}) {
  return (
    <div className="space-y-7">
      <SeedShelf
        catalog={state.catalog}
        coins={state.coins}
        busy={busy}
        selected={selectedSeed}
        onPick={onSeed}
      />
      {/* В магазине — только двор: обстановку комнаты покупают в самой комнате. */}
      <DecorationShelf
        catalog={(state.decorationCatalog ?? []).filter((item) => item.place !== 'house')}
        owned={state.decorations ?? []}
        coins={state.coins}
        busy={busy}
        onBuy={onDecoration}
      />
    </div>
  );
}

function DecorationShelf({
  catalog,
  owned,
  coins,
  busy,
  onBuy,
}: {
  catalog: GardenDecoration[];
  owned: string[];
  coins: number;
  busy: boolean;
  onBuy: (decoration: string) => Promise<void>;
}) {
  if (catalog.length === 0) return null;
  return (
    <section className="border-t-2 border-[#b7844e] pt-5">
      <h3 className="font-display text-lg font-bold">Украшения сада</h3>
      <ul className="mt-3 grid gap-3 sm:grid-cols-2">
        {catalog.map((decoration) => {
          const purchased = owned.includes(decoration.id);
          return (
            <li key={decoration.id}>
              <button
                type="button"
                disabled={busy || purchased || coins < decoration.price}
                onClick={() => {
                  unlockGardenAudio();
                  void onBuy(decoration.id);
                }}
                className="flex w-full items-center gap-3 border-2 border-[#b7844e] bg-[#fff0c7] p-3 text-left hover:bg-[#ffe5a4] disabled:opacity-55"
              >
                <img src="/img/garden/world/bushes.webp" alt="" className="garden-pixel-art h-12 w-24 object-contain" />
                <span className="min-w-0">
                  <span className="block font-display text-lg font-bold">{decoration.serbian}</span>
                  <span className="block text-sm text-[#6b4d38]">{decoration.russian}</span>
                </span>
                <span className="ml-auto shrink-0 font-bold tabular-nums">
                  {purchased ? 'Куплено' : decoration.price}
                </span>
              </button>
            </li>
          );
        })}
      </ul>
    </section>
  );
}

function SeedShelf({
  catalog,
  coins,
  busy,
  selected,
  onPick,
}: {
  catalog: GardenSpecies[];
  coins: number;
  busy: boolean;
  selected?: string | null;
  onPick: (species: string) => void;
}) {
  return (
    <div>
      <p className="mb-4 flex items-center gap-2 font-semibold tabular-nums"><LuCoins /> {coins} {coinWord(coins)}</p>
      <ul className="grid gap-3 sm:grid-cols-2">
        {catalog.map((species, index) => {
          const affordable = coins >= species.price;
          return (
            <li key={species.id}>
              <button
                type="button"
                disabled={busy || !affordable}
                onClick={() => {
                  unlockGardenAudio();
                  onPick(species.id);
                }}
                className={`flex w-full items-center gap-3 border-2 p-3 text-left transition-colors disabled:opacity-45 ${
                  selected === species.id ? 'border-[#a85032] bg-[#f1c982]' : 'border-[#b7844e] bg-[#fff0c7] hover:bg-[#ffe5a4]'
                }`}
              >
                <span aria-hidden className="block size-12 shrink-0 bg-no-repeat" style={{ backgroundImage: 'url(/img/garden/garden_seeds.webp)', backgroundSize: `${catalog.length * 3}rem 3rem`, backgroundPosition: `-${index * 3}rem 0` }} />
                <span className="min-w-0">
                  <span className="block font-display text-lg font-bold">{species.serbian}</span>
                  <span className="block text-sm text-[#6b4d38]">{species.russian} · {species.theme}</span>
                </span>
                <span className="ml-auto shrink-0 font-bold tabular-nums">{species.price}</span>
              </button>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

function Earnings({ state }: { state: GardenState }) {
  return (
    <div>
      <div className="mb-5 flex flex-wrap gap-5">
        <HudValue icon={<LuCoins />} value={state.todayCoins} label="сегодня" />
        <HudValue icon={<LuCoins />} value={state.earnedTotal} label="за всё время" />
      </div>
      <ul className="space-y-4">
        {state.earnings.map((line) => (
          <li key={line.source}>
            <div className="flex items-baseline justify-between gap-3 text-sm">
              <span>{line.title}</span>
              <span className="tabular-nums text-[#6b4d38]">{line.today} / {line.cap}</span>
            </div>
            <div className="mt-1 h-3 overflow-hidden border border-[#8c5b37] bg-[#ead5a6]">
              <div className="h-full bg-[#65a654]" style={{ width: `${Math.min(100, (line.today / line.cap) * 100)}%` }} />
            </div>
          </li>
        ))}
      </ul>
    </div>
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
    <form className="space-y-4" onSubmit={(event) => { event.preventDefault(); onSave(nickname.trim(), isPublic); }}>
      <label className="block text-sm font-semibold">
        {GARDEN.myName.sr} — {GARDEN.myName.ru}
        <input value={nickname} onChange={(event) => setNickname(event.target.value)} maxLength={24} placeholder="Читавук" className="mt-2 w-full border-2 border-[#b7844e] bg-[#fff5d9] px-4 py-2.5" />
      </label>
      <label className="flex items-start gap-3 text-sm">
        <input type="checkbox" checked={isPublic} onChange={(event) => setPublic(event.target.checked)} className="mt-1" />
        <span>{GARDEN.openGarden.sr}<span className="block text-[#6b4d38]">Сад появится у соседей под выбранным именем.</span></span>
      </label>
      <Button type="submit" disabled={busy}>{GARDEN.save.sr} — {GARDEN.save.ru}</Button>
      {state.public && state.nickname && <p className="text-sm text-[#6b4d38]">Помог соседям сегодня: {state.helpedToday} из {state.helpLimit}.</p>}
    </form>
  );
}

function Neighbours({ catalog, board }: { catalog: GardenSpecies[]; board: GardenBoardRow[] }) {
  return (
    <div className="grid gap-8 lg:grid-cols-[1.15fr_0.85fr]">
      <Gardeners catalog={catalog} />
      <Leaderboard board={board} />
    </div>
  );
}

function Gardeners({ catalog }: { catalog: GardenSpecies[] }) {
  const [query, setQuery] = useState('');
  const [species, setSpecies] = useState('');
  const [found, setFound] = useState<GardenBoardRow[] | null>(null);
  const [searching, setSearching] = useState(false);

  useEffect(() => {
    let alive = true;
    setSearching(true);
    const timer = window.setTimeout(() => {
      searchGardeners(query.trim(), species)
        .then((result) => alive && setFound(result.gardeners))
        .catch(() => alive && setFound([]))
        .finally(() => alive && setSearching(false));
    }, 320);
    return () => { alive = false; window.clearTimeout(timer); };
  }, [query, species]);

  return (
    <section>
      <h3 className="font-display text-lg font-bold">{GARDEN.find.sr} — {GARDEN.find.ru}</h3>
      <div className="mt-3 grid gap-2 sm:grid-cols-2 lg:grid-cols-1">
        <input value={query} onChange={(event) => setQuery(event.target.value)} maxLength={24} type="search" placeholder="имя садовода" aria-label={GARDEN.find.ru} className="min-w-0 border-2 border-[#b7844e] bg-[#fff5d9] px-3 py-2" />
        <select value={species} onChange={(event) => setSpecies(event.target.value)} aria-label="что растёт в саду" className="border-2 border-[#b7844e] bg-[#fff5d9] px-3 py-2">
          <option value="">что угодно</option>
          {catalog.map((item) => <option key={item.id} value={item.id}>{item.serbian} — {item.russian}</option>)}
        </select>
      </div>
      {found && found.length === 0 && !searching && <p className="mt-4 text-sm text-[#6b4d38]">{GARDEN.nobody.sr} — {GARDEN.nobody.ru}.</p>}
      <ul className="mt-4 divide-y divide-[#c99b61]">
        {(found ?? []).map((row) => (
          <li key={row.nickname}>
            <Link to={`/basta/${encodeURIComponent(row.nickname)}`} className="flex items-baseline gap-3 px-1 py-2 text-sm hover:bg-[#f3dca8]">
              <span className="font-semibold">{row.nickname}</span>
              <span className="truncate text-[#6b4d38]">{(row.growing ?? []).map((id) => catalog.find((item) => item.id === id)?.serbian ?? id).join(', ')}</span>
              <span className="ml-auto shrink-0 tabular-nums">{row.bloomed} / {row.plants}</span>
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
}

function Leaderboard({ board }: { board: GardenBoardRow[] }) {
  return (
    <section>
      <h3 className="flex items-center gap-2 font-display text-lg font-bold"><LuTrophy /> {GARDEN.board.sr}</h3>
      {board.length === 0 ? <p className="mt-3 text-sm text-[#6b4d38]">Пока никто не открыл сад соседям.</p> : (
        <ol className="mt-3 divide-y divide-[#c99b61]">
          {board.map((row, index) => (
            <li key={row.nickname} className="flex items-baseline gap-3 py-2 text-sm">
              <span className="w-6 tabular-nums text-[#6b4d38]">{index + 1}</span>
              <Link to={`/basta/${encodeURIComponent(row.nickname)}`} className="truncate font-semibold">{row.nickname}</Link>
              <span className="ml-auto tabular-nums">{row.bloomed} · {row.plants}</span>
            </li>
          ))}
        </ol>
      )}
    </section>
  );
}

function GardenDemo({ board }: { board: GardenBoardRow[] }) {
  const { navigate } = useRouter();
  const [prompt, setPrompt] = useState(false);
  const [inHouse, setInHouse] = useState(false);
  const [soundEnabled, setSoundEnabled] = useState(readGardenSoundSetting);
  const toggleSound = () => {
    const next = !soundEnabled;
    setSoundEnabled(next);
    saveGardenSoundSetting(next);
    if (next) unlockGardenAudio();
  };
  return (
    <main className="garden-game-shell fixed inset-0 z-[60] overflow-hidden">
      <GardenScene slots={12} plants={DEMO_PLANTS} catalog={DEMO_CATALOG} fetchedAt={Date.now()} decorations={['berry-bushes']} soundEnabled={soundEnabled} river onBed={() => setPrompt(true)} onRiver={() => setPrompt(true)} onHouse={() => setInHouse(true)} />
      {/* В дом гостя пускают: радио слушают без аккаунта, покупки — нет. */}
      {inHouse && (
        <HouseRoom
          decorations={['rug', 'lamp', 'picture', 'cat']}
          catalog={[]}
          coins={0}
          soundEnabled={soundEnabled}
          onClose={() => setInHouse(false)}
        />
      )}
      <div className="pointer-events-none absolute inset-x-0 top-0 z-[120] flex items-start justify-between gap-3 p-3 sm:p-4">
        <div className="garden-game-plaque pointer-events-auto flex min-w-0 max-w-[56vw] items-center gap-2 px-2 py-2 sm:px-3">
          <button type="button" onClick={() => navigate('/')} className="grid size-9 shrink-0 place-items-center border-2 border-[#8c5b37] bg-[#f5dfaa]" aria-label="Выйти из сада" title="Выйти из сада"><LuArrowLeft /></button>
          <span className="min-w-0"><span className="block whitespace-nowrap font-display text-base font-bold sm:text-lg">{GARDEN.title.sr}</span><span className="hidden text-[11px] text-[#5e4635] sm:block">{GARDEN.title.ru}</span></span>
        </div>
        <div className="pointer-events-auto flex items-center gap-2">
          <button type="button" onClick={toggleSound} className="garden-game-plaque grid size-11 place-items-center" aria-label={soundEnabled ? 'Выключить звуки сада' : 'Включить звуки сада'} title={soundEnabled ? 'Выключить звуки сада' : 'Включить звуки сада'}>{soundEnabled ? <LuVolume2 /> : <LuVolumeX />}</button>
          <button type="button" onClick={() => navigate('/login')} className="garden-game-plaque flex items-center gap-2 px-4 py-3 font-bold"><LuLogIn /> Войти</button>
        </div>
      </div>
      <div className="garden-toolbelt absolute bottom-3 left-1/2 z-[120] flex -translate-x-1/2 items-center gap-1 p-1.5 sm:bottom-4 sm:gap-2">
        <ToolButton label="Семена" onClick={() => setPrompt(true)}><LuSprout /></ToolButton>
        <ToolButton label="Соседи" onClick={() => setPrompt(true)}><LuUsers /></ToolButton>
        <ToolButton label="Таблица садоводов" onClick={() => setPrompt(true)}><LuTrophy /></ToolButton>
      </div>
      {prompt && (
        <GardenWindow title="Твоя башта ждёт" onClose={() => setPrompt(false)}>
          <p className="leading-7">Сад и цветочные динары привязаны к занятиям, поэтому для посадки и полива нужен аккаунт.</p>
          {board.length > 0 && <p className="mt-3 text-sm text-[#6b4d38]">Открытых садов сегодня: {board.length}.</p>}
          <Button className="mt-5" onClick={() => navigate('/login')}>Войти и играть</Button>
        </GardenWindow>
      )}
    </main>
  );
}

const DEMO_CATALOG: GardenSpecies[] = [
  { id: 'suncokret', serbian: 'сунцокрет', russian: 'подсолнух', price: 20, topic: 'grammar-a1-08', theme: 'винительный падеж', phrase: 'Волим сунцокрет.' },
  { id: 'krasuljak', serbian: 'красуљак', russian: 'ромашка', price: 30, topic: 'grammar-a1-04', theme: 'настоящее время', phrase: 'Ја растем.' },
  { id: 'koleus', serbian: 'колеус', russian: 'колеус', price: 45, topic: 'grammar-a1-10', theme: 'родительный падеж', phrase: 'Лист колеуса.' },
  { id: 'cuvarkuca', serbian: 'чуваркућа', russian: 'молодило', price: 60, topic: 'grammar-a1-15', theme: 'числительные', phrase: 'Један лист.' },
];

const DEMO_PLANTS: GardenPlant[] = [
  demoPlant(0, 'suncokret', 5), demoPlant(2, 'krasuljak', 3.5), demoPlant(5, 'koleus', 2.4),
  demoPlant(7, 'cuvarkuca', 1.3), demoPlant(9, 'krasuljak', 5), demoPlant(10, 'suncokret', 4.2),
];

function demoPlant(slot: number, species: string, growth: number): GardenPlant {
  return { slot, species, stage: Math.min(4, Math.floor(growth)), growth, blooming: growth >= 5, speed: 1, plantedAt: '2026-01-01T00:00:00Z' };
}

function panelTitle(panel: Panel): string {
  switch (panel) {
    case 'seeds': return `${GARDEN.shop.sr} — ${GARDEN.shop.ru}`;
    case 'earnings': return `${GARDEN.earnings.sr} — ${GARDEN.earnings.ru}`;
    case 'neighbours': return `${GARDEN.neighbours.sr} — ${GARDEN.neighbours.ru}`;
    case 'profile': return `${GARDEN.myName.sr} — ${GARDEN.myName.ru}`;
    case 'herbarium': return `${GARDEN.herbarium.sr} — ${GARDEN.herbarium.ru}`;
  }
}

function Credits() {
  return (
    <p className="mt-8 border-t border-[#c99b61] pt-4 text-xs text-[#6b4d38]">
      Растения и мир — Cozyland Exterior Tilesets, RoleyMoth; используется по лицензии автора. Читавука-садовника, комнату и мебель нарисовал автор проекта. Звуки сада синтезируются в браузере, фоновая музыка — «Heavenly Loop» isaiah658 (CC0). Радио в доме — прямые эфиры сербских станций, они вещают сами по себе.
    </p>
  );
}

function describe(cause: unknown): string {
  if (cause instanceof ApiError) return cause.message;
  return 'Не удалось открыть сад. Попробуй ещё раз.';
}
