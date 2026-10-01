import { useEffect, useRef, useState } from 'react';
import { useReducedMotion } from 'framer-motion';
import type { SpeakingGenre, SpeakingTopic } from '../../api/speaking';
import { SLOT_ASSETS } from './slotAssets';
import type { SlotScene } from './slotScene';

export interface SlotMachineProps {
  pool: SpeakingTopic[];
  genres: SpeakingGenre[];
  spinId: number;
  target: SpeakingTopic | null;
  /** Надпись на вывеске. */
  title: string;
  muted: boolean;
  onLanded: () => void;
  /** Игрок дёрнул рычаг рукой: экран выбирает тему и поднимает spinId. */
  onPull: () => void;
}

/**
 * Игровой автомат тем с Читавуком-фокусником. Канвас рисует общая сцена
 * (`slotScene`, её же берёт приложение); компонент только передаёт ей пул тем
 * и запускает вращение, когда экран уже выбрал тему. Пропорции совпадают с
 * `SLOT_ASPECT`: узкий экран — 600 × 824, широкий — 1200 × 700.
 */
export function SlotMachine(props: SlotMachineProps) {
  const canvas = useRef<HTMLCanvasElement>(null);
  const scene = useRef<SlotScene | null>(null);
  const live = useRef(props);
  const lastSpin = useRef(0);
  const landedSpin = useRef(0);
  live.current = props;
  const reduced = useReducedMotion();
  const reducedRef = useRef(reduced);
  reducedRef.current = reduced;
  const [ready, setReady] = useState(false);
  const [failed, setFailed] = useState(false);

  const landed = () => {
    if (live.current.spinId > landedSpin.current) {
      landedSpin.current = live.current.spinId;
      live.current.onLanded();
    }
  };

  useEffect(() => {
    let alive = true;
    void Promise.all([import('./slotScene'), import('./slotSound')])
      .then(([{ createSlotScene }, { playSlotSound }]) => {
        if (!alive || !canvas.current) return;
        try {
          scene.current = createSlotScene(
            canvas.current,
            {
              landed,
              pull: () => live.current.onPull(),
              failed: () => {
                if (alive) setFailed(true);
                landed();
              },
              sound: (kind, detail) => {
                if (!live.current.muted) playSlotSound(kind, detail);
              },
            },
            SLOT_ASSETS,
          );
          setReady(true);
        } catch {
          if (alive) setFailed(true);
        }
      })
      .catch(() => {
        if (alive) setFailed(true);
      });
    return () => {
      alive = false;
      scene.current?.dispose();
      scene.current = null;
    };
    // Сцена создаётся один раз; свежие значения она берёт из live.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!ready || !scene.current) return;
    const inPlay = new Set(props.pool.map((topic) => topic.genre));
    scene.current.setData(
      props.genres.filter((genre) => inPlay.has(genre.id)).map(({ id, ru, art }) => ({ id, ru, art })),
      props.pool.map(({ id, genre, ru }) => ({ id, genre, ru })),
    );
  }, [ready, props.pool, props.genres]);

  useEffect(() => {
    if (ready) scene.current?.setTitle(props.title);
  }, [ready, props.title]);

  useEffect(() => {
    if (!props.spinId || !props.target || props.spinId === lastSpin.current) return;
    if (!ready && !failed) return;
    lastSpin.current = props.spinId;
    if (failed) {
      landed();
      return;
    }
    const { id, genre, ru } = props.target;
    scene.current?.spin({ id, genre, ru }, Boolean(reducedRef.current));
    // landed берёт актуальные значения из live
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ready, failed, props.spinId, props.target]);

  return (
    <div
      className="relative mx-auto aspect-[0.728] w-full min-[560px]:aspect-[1.714]"
      role="img"
      aria-label="Игровой автомат тем"
    >
      {!failed && <canvas ref={canvas} className="size-full" aria-hidden="true" />}
      {failed && (
        <div className="grid h-full place-content-center rounded-3xl border-[12px] border-gold/50 bg-[var(--bg-sunken)] p-8 text-center">
          <span className="font-display text-2xl">{props.target?.ru ?? 'Случайная тема'}</span>
        </div>
      )}
    </div>
  );
}
