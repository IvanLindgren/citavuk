import { AnimatePresence } from 'framer-motion';
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ButtonHTMLAttributes,
  type ReactNode,
} from 'react';

import {
  getAudioLessons,
  getTranscript,
  playableAudioUrl,
  ttsAudioUrl,
} from '../api/listening';
import { TtsVoicePicker } from '../components/TtsVoicePicker';
import { Mascot } from '../components/Mascot';
import { WordLookupCard } from '../components/WordReader';
import { Button, ErrorNote, Spinner } from '../components/ui';
import { isHardToHear } from '../listening/language';
import type { AudioCue, AudioLesson } from '../listening/types';
import { tokenize, type Token } from '../lib/tokenize';
import { Link, useParams } from '../lib/router';

type LoadState =
  | { kind: 'loading' }
  | { kind: 'error'; message: string }
  | { kind: 'ready'; lesson: AudioLesson };

function waitForMetadata(player: HTMLAudioElement): Promise<void> {
  if (player.readyState >= HTMLMediaElement.HAVE_METADATA) {
    return Promise.resolve();
  }
  return new Promise((resolve, reject) => {
    const timeout = window.setTimeout(() => {
      cleanup();
      reject(new Error('Аудио загружается слишком долго.'));
    }, 12_000);
    const cleanup = () => {
      window.clearTimeout(timeout);
      player.removeEventListener('loadedmetadata', onReady);
      player.removeEventListener('error', onError);
    };
    const onReady = () => {
      cleanup();
      resolve();
    };
    const onError = () => {
      cleanup();
      reject(new Error('Не удалось загрузить аудио.'));
    };
    player.addEventListener('loadedmetadata', onReady, { once: true });
    player.addEventListener('error', onError, { once: true });
  });
}

export function ListeningPlayer() {
  const { id = '' } = useParams();
  const [state, setState] = useState<LoadState>({ kind: 'loading' });
  const [cues, setCues] = useState<AudioCue[]>([]);
  const [loadingTranscript, setLoadingTranscript] = useState(false);
  const [cueIndex, setCueIndex] = useState(0);
  const [activeCharacter, setActiveCharacter] = useState(-1);
  const [playing, setPlaying] = useState(false);
  const [speed, setSpeed] = useState(1);
  const [selected, setSelected] = useState<
    { cue: number; token: Token; anchor: DOMRect } | null
  >(null);
  const audio = useRef<HTMLAudioElement>(null);
  const cueElements = useRef<Array<HTMLElement | null>>([]);
  const started = useRef(false);

  useEffect(() => {
    const controller = new AbortController();
    void getAudioLessons(controller.signal)
      .then((lessons) => {
        const lesson = lessons.find((item) => item.id === id);
        if (!lesson) throw new Error('Аудиоурок не найден.');
        setState({ kind: 'ready', lesson });
        setCues(lesson.cues);
      })
      .catch((error) => {
        if (controller.signal.aborted) return;
        setState({
          kind: 'error',
          message: error instanceof Error ? error.message : 'Не удалось открыть урок.',
        });
      });
    return () => controller.abort();
  }, [id]);

  useEffect(() => {
    if (state.kind !== 'ready' || !state.lesson.transcript_url) return;
    const controller = new AbortController();
    setLoadingTranscript(true);
    void getTranscript(state.lesson, controller.signal)
      .then((full) => {
        if (controller.signal.aborted) return;
        setCues(full);
        setCueIndex(0);
        setActiveCharacter(-1);
      })
      .catch(() => {
        if (controller.signal.aborted) return;
        // Встроенные реплики остаются запасным вариантом для курируемых
        // аудиоуроков. Подкасты с Go-сервера приходят с пустым массивом.
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoadingTranscript(false);
      });
    return () => controller.abort();
  }, [state]);

  const lesson = state.kind === 'ready' ? state.lesson : null;
  const isTts = lesson ? !lesson.audio_url : false;

  const scrollToCue = useCallback((index: number) => {
    cueElements.current[index]?.scrollIntoView({
      block: 'center',
      behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches
        ? 'auto'
        : 'smooth',
    });
  }, []);

  const playCue = useCallback(
    async (index: number) => {
      const player = audio.current;
      const cue = cues[index];
      if (!player || !lesson || !cue) return;
      setCueIndex(index);
      setActiveCharacter(-1);
      scrollToCue(index);

      try {
        if (isTts) {
          player.src = ttsAudioUrl(cue.text);
          player.load();
        } else if (!started.current) {
          player.src = playableAudioUrl(lesson.audio_url!);
          player.load();
          started.current = true;
        }
        if (!isTts && cue.start != null) {
          await waitForMetadata(player);
          player.currentTime = cue.start;
        }
        player.playbackRate = speed;
        await player.play();
        started.current = true;
      } catch {
        setPlaying(false);
      }
    },
    [cues, isTts, lesson, scrollToCue, speed],
  );

  const updatePosition = useCallback(() => {
    const player = audio.current;
    if (!player || cues.length === 0) return;

    if (isTts) {
      const cue = cues[cueIndex];
      if (!cue || !Number.isFinite(player.duration) || player.duration <= 0) return;
      setActiveCharacter(
        Math.round((player.currentTime / player.duration) * cue.text.length),
      );
      return;
    }

    const time = player.currentTime;
    let next = cueIndex;
    for (let index = 0; index < cues.length; index++) {
      const cue = cues[index]!;
      if (
        cue.start != null &&
        time >= cue.start &&
        (cue.end == null || time < cue.end)
      ) {
        next = index;
        break;
      }
    }
    const cue = cues[next]!;
    const character =
      cue.start != null && cue.end != null && cue.end > cue.start
        ? Math.round(((time - cue.start) / (cue.end - cue.start)) * cue.text.length)
        : -1;
    setActiveCharacter(character);
    if (next !== cueIndex) {
      setCueIndex(next);
      scrollToCue(next);
    }
  }, [cueIndex, cues, isTts, scrollToCue]);

  const toggle = async () => {
    const player = audio.current;
    if (!player || !lesson) return;
    if (playing) {
      player.pause();
    } else if (cues.length === 0 && !isTts) {
      if (!started.current) {
        player.src = playableAudioUrl(lesson.audio_url!);
        player.load();
        started.current = true;
      }
      player.playbackRate = speed;
      await player.play().catch(() => setPlaying(false));
    } else if (!started.current || player.ended) {
      await playCue(player.ended ? 0 : cueIndex);
    } else {
      player.playbackRate = speed;
      await player.play().catch(() => setPlaying(false));
    }
  };

  if (state.kind === 'loading') {
    return <div className="flex min-h-[60vh] items-center justify-center"><Spinner className="size-6" /></div>;
  }
  if (state.kind === 'error') {
    return (
      <main className="mx-auto min-h-[60vh] max-w-xl px-5 py-16 text-center">
        <ErrorNote>{state.message}</ErrorNote>
        <Link to="/listening"><Button className="mt-6">К списку</Button></Link>
      </main>
    );
  }

  return (
    <main className="pb-44">
      <audio
        ref={audio}
        preload="metadata"
        onTimeUpdate={updatePosition}
        onPlay={() => setPlaying(true)}
        onPause={() => setPlaying(false)}
        onEnded={() => {
          if (isTts && cueIndex + 1 < cues.length) void playCue(cueIndex + 1);
          else setPlaying(false);
        }}
      />

      <section className="border-b border-[var(--line)] bg-[var(--bg-raised)] px-5 py-5">
        <div className="mx-auto flex max-w-4xl items-center gap-4">
          <div className="hidden w-28 sm:block">
            <Mascot pose="sluhao_slusa" alt="" width={224} />
          </div>
          <div className="min-w-0 flex-1">
            <Link to="/listening" className="text-sm font-semibold text-[var(--accent)]">
              ← Все аудиоуроки
            </Link>
            <h1 className="mt-2 text-2xl sm:text-3xl">{state.lesson.title}</h1>
            <p className="mt-1 text-sm text-[var(--text-muted)]">{state.lesson.subtitle}</p>
          </div>
          <span className="rounded-full bg-[var(--accent)] px-3 py-1 text-xs font-bold text-white">
            БЕТА
          </span>
        </div>
      </section>

      {loadingTranscript && (
        <div className="mx-auto flex max-w-4xl items-center gap-3 px-5 py-4 text-sm text-[var(--text-muted)]">
          <Spinner />
          Загружаю полный транскрипт…
        </div>
      )}

      <section className="mx-auto max-w-4xl px-5 py-7">
        <div className="mb-6 flex items-center gap-3 border-l-4 border-[var(--accent)] bg-[var(--accent)]/7 px-4 py-3 text-sm leading-relaxed text-[var(--text-muted)]">
          <HardWordLegend />
          Красные слова обычно труднее различить на слух. Нажмите слово, чтобы
          перевести его и сохранить в словарь.
        </div>

        <div className="space-y-2">
          {!loadingTranscript && cues.length === 0 && (
            <div className="border-y border-[var(--line)] py-8 text-center">
              <p className="font-bold">Транскрипция этого эпизода готовится</p>
              <p className="mt-2 text-sm leading-relaxed text-[var(--text-muted)]">
                Запись уже можно слушать. Текст появится после проверки
                автоматической расшифровки.
              </p>
            </div>
          )}
          {cues.map((cue, index) => (
            <KaraokeCue
              key={`${index}-${cue.start ?? 'tts'}`}
              cue={cue}
              current={index === cueIndex}
              activeCharacter={index === cueIndex ? activeCharacter : -1}
              onPlay={() => void playCue(index)}
              onWord={(token, rect) => {
                audio.current?.pause();
                setSelected({ cue: index, token, anchor: rect });
              }}
              element={(element) => {
                cueElements.current[index] = element;
              }}
            />
          ))}
        </div>
      </section>

      <PlayerControls
        playing={playing}
        cue={cueIndex}
        count={cues.length}
        speed={speed}
        isTts={isTts}
        onPrevious={() => void playCue(Math.max(0, cueIndex - 1))}
        onNext={() => void playCue(Math.min(cues.length - 1, cueIndex + 1))}
        onToggle={() => void toggle()}
        onSpeed={(value) => {
          setSpeed(value);
          if (audio.current) audio.current.playbackRate = value;
        }}
      />

      <AnimatePresence>
        {selected && (
          <WordLookupCard
            key={`${selected.cue}-${selected.token.start}`}
            sentence={cues[selected.cue]!.text}
            token={selected.token}
            anchor={selected.anchor}
            onClose={() => setSelected(null)}
          />
        )}
      </AnimatePresence>
    </main>
  );
}

function KaraokeCue({
  cue,
  current,
  activeCharacter,
  onPlay,
  onWord,
  element,
}: {
  cue: AudioCue;
  current: boolean;
  activeCharacter: number;
  onPlay: () => void;
  onWord: (token: Token, anchor: DOMRect) => void;
  element: (element: HTMLElement | null) => void;
}) {
  const tokens = useMemo(() => tokenize(cue.text), [cue.text]);
  return (
    <article
      ref={element}
      onClick={onPlay}
      style={{ contentVisibility: 'auto', containIntrinsicSize: '0 76px' }}
      className={[
        'flex cursor-pointer items-start gap-2 rounded-xl border py-3 pl-2 pr-4 transition-colors',
        current
          ? 'border-[var(--accent)]/35 bg-[var(--accent)]/7'
          : 'border-transparent hover:bg-[var(--bg-raised)]',
      ].join(' ')}
    >
      {/*
        Отдельная кнопка воспроизведения, а не нажатие по всей строке.
        Слова ниже — тоже кнопки, и они закрывают почти всю площадь строки:
        на телефоне палец практически всегда попадал в слово, открывался
        перевод, и начать слушать с нужной фразы было нельзя вовсе. Мышью на
        компьютере получалось попасть в промежуток между словами, поэтому
        поломка выглядела как «работает».
      */}
      <button
        type="button"
        onClick={(event) => {
          event.stopPropagation();
          onPlay();
        }}
        aria-label="Слушать с этой фразы"
        className={[
          'mt-0.5 flex size-9 shrink-0 items-center justify-center rounded-full transition-colors',
          current
            ? 'bg-[var(--accent)] text-white'
            : 'text-[var(--text-muted)] hover:bg-[var(--accent)]/15 hover:text-[var(--accent)]',
        ].join(' ')}
      >
        <svg viewBox="0 0 24 24" className="ml-0.5 size-4 fill-current" aria-hidden="true">
          <path d="M8 5v14l11-7z" />
        </svg>
      </button>

      <p className={`font-display text-lg leading-relaxed ${current ? '' : 'text-[var(--text-muted)]'}`}>
        {tokens.map((token, index) => {
          if (!token.isWord) return <span key={index}>{token.text}</span>;
          const active =
            current &&
            activeCharacter >= token.start &&
            activeCharacter < token.end;
          const hard = isHardToHear(token.text);
          return (
            <button
              key={index}
              type="button"
              onClick={(event) => {
                event.stopPropagation();
                onWord(token, event.currentTarget.getBoundingClientRect());
              }}
              className={[
                'rounded px-0.5 transition-colors',
                hard ? 'font-bold text-[var(--accent)] underline decoration-[var(--accent)]/35 decoration-2 underline-offset-4' : '',
                active ? 'bg-[var(--accent)] text-white no-underline' : 'hover:bg-gold/30',
              ].join(' ')}
            >
              {token.text}
            </button>
          );
        })}
      </p>
    </article>
  );
}

function PlayerControls({
  playing,
  cue,
  count,
  speed,
  isTts,
  onPrevious,
  onNext,
  onToggle,
  onSpeed,
}: {
  playing: boolean;
  cue: number;
  count: number;
  speed: number;
  isTts: boolean;
  onPrevious: () => void;
  onNext: () => void;
  onToggle: () => void;
  onSpeed: (value: number) => void;
}) {
  return (
    <div className="fixed inset-x-0 bottom-0 z-40 border-t border-[var(--line)] bg-[var(--bg-raised)]/95 px-4 py-3 shadow-[0_-10px_30px_rgb(0_0_0/0.08)] backdrop-blur">
      <div className="mx-auto flex max-w-4xl flex-col items-center gap-3 sm:flex-row">
        <div className="flex items-center gap-2">
          <IconButton label="Предыдущая фраза" disabled={cue <= 0} onClick={onPrevious}>
            <SkipPreviousIcon />
          </IconButton>
          <button
            type="button"
            onClick={onToggle}
            aria-label={playing ? 'Пауза' : 'Слушать'}
            className="flex size-14 items-center justify-center rounded-full bg-[var(--accent)] text-white shadow-[0_4px_0_0_color-mix(in_srgb,var(--accent)_55%,black)] active:translate-y-1 active:shadow-none"
          >
            {playing ? <PauseIcon /> : <PlayIcon />}
          </button>
          <IconButton label="Следующая фраза" disabled={cue + 1 >= count} onClick={onNext}>
            <SkipNextIcon />
          </IconButton>
          <span className="ml-2 min-w-16 text-sm font-bold text-[var(--text-muted)]">
            {count > 0 ? `${cue + 1}/${count}` : 'без текста'}
          </span>
        </div>
        <div className="flex flex-wrap items-center justify-center gap-1 sm:ml-auto" aria-label="Настройки воспроизведения">
          {isTts && <TtsVoicePicker />}
          {[0.5, 1, 1.5, 2].map((value) => (
            <button
              key={value}
              type="button"
              aria-pressed={speed === value}
              onClick={() => onSpeed(value)}
              className={[
                'min-w-12 rounded-lg px-2.5 py-2 text-sm font-bold transition-colors',
                speed === value
                  ? 'bg-[var(--accent)] text-white'
                  : 'text-[var(--text-muted)] hover:bg-[var(--bg-sunken)]',
              ].join(' ')}
            >
              {value}x
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}

function IconButton({
  label,
  children,
  ...props
}: { label: string; children: ReactNode } & ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      className="flex size-10 items-center justify-center rounded-full bg-[var(--bg-sunken)] text-[var(--text-muted)] disabled:opacity-35"
      {...props}
    >
      {children}
    </button>
  );
}

function HardWordLegend() {
  return <span className="size-3 shrink-0 rounded-full bg-[var(--accent)]" aria-hidden="true" />;
}

function PlayIcon() {
  return <svg viewBox="0 0 24 24" className="ml-0.5 size-7 fill-current"><path d="M8 5v14l11-7z" /></svg>;
}
function PauseIcon() {
  return <svg viewBox="0 0 24 24" className="size-7 fill-current"><path d="M7 5h4v14H7zm6 0h4v14h-4z" /></svg>;
}
function SkipPreviousIcon() {
  return <svg viewBox="0 0 24 24" className="size-5 fill-current"><path d="M6 6h2v12H6zm3 6l9-6v12z" /></svg>;
}
function SkipNextIcon() {
  return <svg viewBox="0 0 24 24" className="size-5 fill-current"><path d="M16 6h2v12h-2zM6 6l9 6-9 6z" /></svg>;
}
