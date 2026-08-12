import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { LuCoins, LuDoorOpen, LuPower, LuSofa, LuX } from 'react-icons/lu';

import type { GardenDecoration } from '../api/garden';
import { useRouter } from '../lib/router';
import { gardenArt } from '../garden/art';
import { playGardenSound, unlockGardenAudio } from '../garden/audio';
import { STATIONS, readRadioSetting, saveRadioSetting, stationById } from '../garden/radio';
import {
  FLOOR,
  ROOM,
  SPAWN,
  blockedRects,
  spriteOf,
  visibleThings,
  type RoomThing,
} from '../garden/room';
import { ALPHABET, FRIDGE, GARDEN, HOUSE, coinWord } from '../garden/strings';
import { useWalker } from '../garden/walk';
import { GardenWindow } from './GardenWindow';
import { Notebook } from './Notebook';

interface Props {
  decorations: string[];
  catalog: GardenDecoration[];
  coins: number;
  busy?: boolean;
  soundEnabled?: boolean;
  onBuy?: (decoration: string) => void;
  onClose: () => void;
}

type Panel = 'radio' | 'notebook' | 'fridge' | 'letters' | 'shop' | null;

/**
 * Квартира Читавука.
 *
 * Дом на карте был нарисованной коробкой: мимо него ходили, а внутрь не
 * заходили. Теперь внутри две комнаты и мебель, мимо которой ходят, а не
 * сквозь неё. Каждая вещь называет себя по-сербски, когда Читавук до неё
 * дошёл, — ради этого дом и открывали.
 */
export function HouseRoom({
  decorations,
  catalog,
  coins,
  busy = false,
  soundEnabled = true,
  onBuy,
  onClose,
}: Props) {
  const { navigate } = useRouter();
  const sceneRef = useRef<HTMLDivElement>(null);
  const scale = useRoomScale(sceneRef);
  const radio = useRadio(soundEnabled);
  const [panel, setPanel] = useState<Panel>(null);
  const [fire, setFire] = useState(false);
  /** Слово вещи, до которой дошли: висит, пока не пошли к следующей. */
  const [word, setWord] = useState<RoomThing | null>(null);

  const things = useMemo(() => visibleThings(decorations), [decorations]);
  const area = useMemo(
    () => ({
      minX: FLOOR.left,
      maxX: FLOOR.right,
      minY: FLOOR.top,
      maxY: FLOOR.bottom,
      speed: 66,
      blocked: blockedRects(decorations),
    }),
    [decorations],
  );
  const { point, moving, facing, moveTo } = useWalker(area, SPAWN);

  useEffect(() => {
    if (!moving || !soundEnabled) return;
    playGardenSound('step');
    const timer = window.setInterval(() => playGardenSound('step'), 310);
    return () => window.clearInterval(timer);
  }, [moving, soundEnabled]);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return;
      if (panel) setPanel(null);
      else onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose, panel]);

  const touch = useCallback(
    (thing: RoomThing) => {
      unlockGardenAudio();
      setWord(null);
      moveTo({
        ...thing.stand,
        action: () => {
          setWord(thing);
          playGardenSound('ui', soundEnabled);
          switch (thing.action) {
            case 'radio':
              setPanel('radio');
              break;
            case 'notebook':
              setPanel('notebook');
              break;
            case 'fridge':
              setPanel('fridge');
              break;
            case 'letters':
              setPanel('letters');
              break;
            case 'fire':
              setFire((on) => !on);
              playGardenSound('plant', soundEnabled);
              break;
            case 'books':
              navigate('/books');
              break;
            case 'leave':
              onClose();
              break;
          }
        },
      });
    },
    [moveTo, navigate, onClose, soundEnabled],
  );

  const forSale = useMemo(() => catalog.filter((item) => item.place === 'house'), [catalog]);
  const playing = radio.status === 'playing' || radio.status === 'loading';
  const station = stationById(radio.station);

  return (
    <div
      className={`garden-house fixed inset-0 z-[210] flex flex-col ${fire ? 'garden-house--fire' : ''}`}
      role="dialog"
      aria-modal="true"
      aria-label={`${GARDEN.home.sr} — ${GARDEN.home.ru}`}
    >
      <header className="pointer-events-none absolute inset-x-0 top-0 z-20 flex items-start justify-between gap-3 p-3 sm:p-4">
        <span className="garden-game-plaque pointer-events-auto px-3 py-2">
          <span className="block font-display text-base font-bold leading-tight sm:text-xl">
            {GARDEN.home.sr}
          </span>
          <span className="block text-[11px] text-[#5e4635]">{GARDEN.home.ru}</span>
          {playing && station && (
            <span className="mt-1 block text-[11px] font-semibold text-[#8a4d27]">
              {radio.status === 'loading' ? GARDEN.tuning.sr : '● уживо'} · {station.name}
            </span>
          )}
        </span>
        <span className="garden-game-plaque pointer-events-auto flex items-center gap-3 px-3 py-2">
          {onBuy && (
            <span className="flex items-center gap-1.5 font-bold tabular-nums">
              <LuCoins className="text-[#8a4d27]" /> {coins}
            </span>
          )}
          <button
            type="button"
            onClick={onClose}
            className="grid size-9 place-items-center border-2 border-[#8c5b37] bg-[#f5dfaa]"
            aria-label={`${GARDEN.leave.sr} — ${GARDEN.leave.ru}`}
            title={`${GARDEN.leave.sr} — ${GARDEN.leave.ru}`}
          >
            <LuX />
          </button>
        </span>
      </header>

      <div
        ref={sceneRef}
        tabIndex={0}
        role="application"
        aria-label="Квартира Читавука. Нажмите на вещь или на пол, куда он должен подойти; работают стрелки и WASD."
        className="garden-house__scene grid flex-1 place-items-center overflow-hidden focus:outline-none"
      >
        <div
          className="garden-house__room"
          style={{ width: ROOM.w * scale, height: ROOM.h * scale, '--gs': scale } as React.CSSProperties}
          onPointerDown={(event) => {
            unlockGardenAudio();
            if ((event.target as HTMLElement).closest('button')) return;
            const bounds = event.currentTarget.getBoundingClientRect();
            setWord(null);
            moveTo({
              x: (event.clientX - bounds.left) / scale,
              y: (event.clientY - bounds.top) / scale,
            });
          }}
        >
          <img
            src={gardenArt('/img/garden/house/room.webp')}
            alt=""
            draggable={false}
            className="garden-pixel-art absolute inset-0 size-full"
          />

          {things.map((thing) => (
            <RoomButton
              key={thing.id}
              thing={thing}
              scale={scale}
              lit={(thing.id === 'radio' && playing) || (thing.id === 'fireplace' && fire)}
              onClick={() => touch(thing)}
            />
          ))}

          <span
            aria-hidden
            className="garden-game-player pointer-events-none absolute"
            style={{ left: point.x * scale, top: point.y * scale, zIndex: Math.round(point.y) + 2 }}
          >
            <span
              className={`garden-game-player__sprite ${moving ? 'garden-game-player__sprite--walking' : ''}`}
              style={{ '--garden-facing': facing } as React.CSSProperties}
            />
          </span>

          {word && !moving && (
            <span
              className="garden-house__word"
              style={{
                left: word.x * scale,
                top: (word.y - word.h) * scale,
                zIndex: Math.round(word.y) + 3,
              }}
            >
              <b>{HOUSE[word.id]?.sr}</b>
              <i>{HOUSE[word.id]?.ru}</i>
            </span>
          )}
        </div>
      </div>

      <div className="garden-house__belt relative z-20 flex items-center justify-center gap-2 p-3">
        {forSale.length > 0 && (
          <button
            type="button"
            onClick={() => setPanel('shop')}
            className="garden-game-plaque flex items-center gap-2 px-4 py-3 font-bold"
          >
            <LuSofa /> {GARDEN.furnish.sr}
            <span className="hidden text-sm font-normal text-[#6b4d38] sm:inline">
              {GARDEN.furnish.ru}
            </span>
          </button>
        )}
        <button
          type="button"
          onClick={onClose}
          className="garden-game-plaque flex items-center gap-2 px-4 py-3 font-bold"
        >
          <LuDoorOpen /> {GARDEN.leave.sr}
        </button>
      </div>

      {panel === 'radio' && (
        <GardenWindow title={`${GARDEN.radio.sr} — ${GARDEN.radio.ru}`} onClose={() => setPanel(null)}>
          <RadioPanel radio={radio} />
        </GardenWindow>
      )}

      {panel === 'notebook' && (
        <GardenWindow
          title={`${GARDEN.notebook.sr} — ${GARDEN.notebook.ru}`}
          onClose={() => setPanel(null)}
        >
          <Notebook />
        </GardenWindow>
      )}

      {panel === 'fridge' && (
        <GardenWindow
          title={`${GARDEN.fridgeOpen.sr} — ${GARDEN.fridgeOpen.ru}`}
          onClose={() => setPanel(null)}
        >
          <ul className="grid grid-cols-2 gap-2 sm:grid-cols-4">
            {FRIDGE.map((item) => (
              <li key={item.sr} className="border-2 border-[#b7844e] bg-[#fff0c7] p-2.5">
                <span className="block font-display font-bold">{item.sr}</span>
                <span className="block text-xs text-[#6b4d38]">{item.ru}</span>
              </li>
            ))}
          </ul>
        </GardenWindow>
      )}

      {panel === 'letters' && (
        <GardenWindow
          title={`${GARDEN.letters.sr} — ${GARDEN.letters.ru}`}
          onClose={() => setPanel(null)}
        >
          <p className="text-sm text-[#6b4d38]">
            В Сербии пишут двумя азбуками сразу: вывеска, книга и чек могут быть
            любой. Буквы совпадают одна в одну.
          </p>
          <ul className="mt-4 grid grid-cols-3 gap-1.5 sm:grid-cols-5">
            {ALPHABET.map(([cyrillic, latin]) => (
              <li
                key={cyrillic}
                className="border-2 border-[#b7844e] bg-[#fff0c7] px-2 py-1.5 text-center"
              >
                <span className="block font-display font-bold">{cyrillic}</span>
                <span className="block text-xs text-[#6b4d38]">{latin}</span>
              </li>
            ))}
          </ul>
        </GardenWindow>
      )}

      {panel === 'shop' && (
        <GardenWindow
          title={`${GARDEN.furnish.sr} — ${GARDEN.furnish.ru}`}
          onClose={() => setPanel(null)}
        >
          <ul className="grid gap-2 sm:grid-cols-2">
            {forSale.map((item) => {
              const purchased = decorations.includes(item.id);
              return (
                <li key={item.id}>
                  <button
                    type="button"
                    disabled={busy || purchased || coins < item.price || !onBuy}
                    onClick={() => {
                      unlockGardenAudio();
                      playGardenSound('ui', soundEnabled);
                      onBuy?.(item.id);
                    }}
                    className="flex w-full items-center gap-3 border-2 border-[#b7844e] bg-[#fff0c7] p-2.5 text-left hover:bg-[#ffe5a4] disabled:opacity-55"
                  >
                    <img
                      src={gardenArt(`/img/garden/house/${item.id}.webp`)}
                      alt=""
                      className="garden-pixel-art h-10 w-12 object-contain object-bottom"
                    />
                    <span className="min-w-0">
                      <span className="block font-display font-bold">{item.serbian}</span>
                      <span className="block text-xs text-[#6b4d38]">{item.russian}</span>
                    </span>
                    <span className="ml-auto shrink-0 text-sm font-bold tabular-nums">
                      {purchased ? GARDEN.owned.sr : `${item.price} ${coinWord(item.price)}`}
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>
        </GardenWindow>
      )}
    </div>
  );
}

/** Вещь в комнате: на неё нажимают, к ней подходят, она называет себя. */
function RoomButton({
  thing,
  scale,
  lit,
  onClick,
}: {
  thing: RoomThing;
  scale: number;
  lit: boolean;
  onClick: () => void;
}) {
  const phrase = HOUSE[thing.id];
  const label = phrase ? `${phrase.sr} — ${phrase.ru}` : thing.id;
  return (
    <button
      type="button"
      onClick={onClick}
      className={`garden-house__pick ${lit ? 'garden-house__pick--on' : ''}`}
      style={{ left: thing.x * scale, top: thing.y * scale, zIndex: Math.round(thing.y) }}
      aria-label={label}
      title={label}
    >
      <img
        src={gardenArt(`/img/garden/house/${spriteOf(thing)}.webp`)}
        alt=""
        draggable={false}
        className="garden-pixel-art block"
        style={{ transform: `scale(${scale})`, transformOrigin: 'bottom center' }}
      />
    </button>
  );
}

function RadioPanel({ radio }: { radio: ReturnType<typeof useRadio> }) {
  const station = stationById(radio.station);
  return (
    <div>
      <p className="text-sm text-[#6b4d38]">
        Живой эфир из Белграда. Речь и песни звучат там прямо сейчас — это чужие
        станции, мы их только включаем.
      </p>
      <ul className="mt-4 grid gap-2 sm:grid-cols-2">
        {STATIONS.map((item) => {
          const active = radio.station === item.id && radio.status !== 'idle';
          return (
            <li key={item.id}>
              <button
                type="button"
                onClick={() => radio.tune(item.id)}
                aria-pressed={active}
                className={`flex w-full items-center gap-3 border-2 p-3 text-left ${
                  active
                    ? 'border-[#a85032] bg-[#f1c982]'
                    : 'border-[#b7844e] bg-[#fff0c7] hover:bg-[#ffe5a4]'
                }`}
              >
                <span className="min-w-0">
                  <span className="block font-display font-bold">{item.name}</span>
                  <span className="block text-xs text-[#6b4d38]">
                    {item.city} · {item.sr} — {item.ru}
                  </span>
                </span>
                {active && (
                  <span className="ml-auto shrink-0 text-xs font-semibold uppercase tracking-wide text-[#8a4d27]">
                    {radio.status === 'loading'
                      ? GARDEN.tuning.sr
                      : radio.status === 'error'
                        ? GARDEN.noSignal.sr
                        : 'уживо'}
                  </span>
                )}
              </button>
            </li>
          );
        })}
      </ul>

      {radio.status === 'error' && (
        <p className="mt-3 text-sm text-[#8a3b2a]">
          {GARDEN.noSignal.sr} — {GARDEN.noSignal.ru}. Попробуй другую станцию.
        </p>
      )}

      {radio.status !== 'idle' && (
        <button
          type="button"
          onClick={radio.stop}
          className="mt-4 flex items-center gap-2 border-2 border-[#8c5b37] bg-[#f5dfaa] px-3 py-2 font-semibold"
        >
          <LuPower /> {GARDEN.radioOff.sr} — {GARDEN.radioOff.ru}
          {station && <span className="text-sm font-normal text-[#6b4d38]">{station.name}</span>}
        </button>
      )}
    </div>
  );
}

type RadioStatus = 'idle' | 'loading' | 'playing' | 'error';

/**
 * Приёмник.
 *
 * Поток чужой и живой, поэтому у него ровно три исхода: заиграл, ещё ищет,
 * не отвечает. Автозапуска нет — звук в браузере включает человек.
 */
function useRadio(soundEnabled: boolean) {
  const [station, setStation] = useState(readRadioSetting);
  const [status, setStatus] = useState<RadioStatus>('idle');
  const audioRef = useRef<HTMLAudioElement | null>(null);

  useEffect(
    () => () => {
      audioRef.current?.pause();
      audioRef.current = null;
    },
    [],
  );

  const stop = useCallback(() => {
    audioRef.current?.pause();
    audioRef.current = null;
    setStatus('idle');
  }, []);

  const tune = useCallback(
    (id: string) => {
      const next = stationById(id);
      if (!next) return;
      setStation(id);
      saveRadioSetting(id);
      audioRef.current?.pause();

      const audio = new Audio(next.url);
      audio.preload = 'none';
      audio.volume = soundEnabled ? 0.7 : 0.35;
      audio.addEventListener('playing', () => setStatus('playing'));
      audio.addEventListener('error', () => setStatus('error'));
      audioRef.current = audio;
      setStatus('loading');
      audio.play().catch(() => setStatus('error'));
    },
    [soundEnabled],
  );

  return { station, status, tune, stop };
}

/** Квартира вписывается в экран так же, как мир: половинками масштаба. */
function useRoomScale(ref: React.RefObject<HTMLDivElement | null>): number {
  const [scale, setScale] = useState(3);

  useEffect(() => {
    const node = ref.current;
    if (!node || typeof ResizeObserver === 'undefined') return;
    const measure = () => {
      const fit = Math.min((node.clientWidth || 640) / ROOM.w, (node.clientHeight || 400) / ROOM.h);
      setScale(fit >= 2 ? Math.min(7, Math.floor(fit * 2) / 2) : Math.max(1, Math.floor(fit * 100) / 100));
    };
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(node);
    return () => observer.disconnect();
  }, [ref]);

  return scale;
}
