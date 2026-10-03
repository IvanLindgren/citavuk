import { lazy, Suspense, useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import {
  LuCheck,
  LuFlame,
  LuInfinity,
  LuKeyboard,
  LuLock,
  LuMic,
  LuMicOff,
  LuRotateCcw,
  LuTimer,
  LuTrophy,
  LuVolume2,
  LuVolumeX,
  LuX,
} from 'react-icons/lu';

import { ApiError } from '../api/client';
import {
  getCaseGameAccess,
  getCaseGameResults,
  saveCaseGameResult,
  type CaseGameAccess,
  type CaseGameResult,
} from '../api/caseGame';
import { Button, ButtonLink, Card, Spinner } from '../components/ui';
import {
  CASES,
  checkAnswer,
  frameTail,
  framed,
  scopeTitle,
  summarize,
  taskSource,
  TENSES,
  type Attempt,
  type CaseGameData,
  type Scope,
  type Task,
  type WordLevel,
} from '../games/cases/data';
import { inputFromKeyboard, textFromInput } from '../games/cases/keyboard';
import { playTypewriter, primeTypewriterSounds, readMuted, saveMuted } from '../games/cases/sounds';
import type { KeyStrike, PrintedLine } from '../games/cases/Typewriter';
import { spokenAnswer, startVoice, voiceSupported, words, type VoiceError } from '../games/cases/voice';
import { activeStorageName } from '../lib/db';
import { acceptStudy } from '../lib/study';
import { useSeo } from '../lib/seo';
import { Link } from '../lib/router';
import { useAuth } from '../state/auth';
import { translateData } from '../lib/i18n';
import { uiLocale } from '../lib/i18n';

const TITLE = 'Уничтожь эти падежи с Читавуком!';
// three.js весит полмегабайта: грузится отдельно и заранее, пока выбирают режим.
const loadTypewriter = () => import('../games/cases/Typewriter3D');
const Typewriter3D = lazy(loadTypewriter);
const LIMITS = [
  { seconds: 60, label: '1 минута' },
  { seconds: 300, label: '5 минут' },
  { seconds: 900, label: '15 минут' },
  { seconds: 0, label: 'Без конца' },
] as const;
const LEVELS: { key: WordLevel; label: string }[] = [
  { key: 'a', label: 'A1–A2' },
  { key: 'b', label: 'до B2' },
  { key: 'all', label: 'Все слова' },
];
const SETTINGS_KEY = 'citavuk-case-game-settings';
/** Сколько раз можно промахнуться голосом, прежде чем слово засчитается ошибкой. */
const VOICE_RETRIES = 3;

interface Settings {
  limit: number;
  scope: Scope;
  level: WordLevel;
  voice: boolean;
}

function readSettings(): Settings {
  const fallback: Settings = { limit: 60, scope: 'all', level: 'b', voice: false };
  try {
    return { ...fallback, ...(JSON.parse(localStorage.getItem(SETTINGS_KEY) ?? '{}') as Partial<Settings>) };
  } catch {
    return fallback;
  }
}

function saveSettings(settings: Settings) {
  try {
    localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings));
  } catch {
    // Выбор проживёт до перезагрузки.
  }
}

let dataPromise: Promise<CaseGameData> | null = null;
function loadData(): Promise<CaseGameData> {
  dataPromise ??= fetch('/games/cases.json').then((response) => {
    if (!response.ok) throw new Error(String(response.status));
    return response.json() as Promise<CaseGameData>;
  }).then((data) => translateData('trainer', data));
  dataPromise.catch(() => {
    dataPromise = null;
  });
  return dataPromise;
}

export function CaseGame() {
  useSeo({
    title: `${TITLE} — Читавук`,
    description:
      'Игра-тренажёр на сербские падежи и времена: печатная машинка, лапы Читавука и настоящий звук клавиш. Можно печатать или говорить голосом.',
  });
  const { account } = useAuth();
  const [access, setAccess] = useState<CaseGameAccess | null>(null);
  const [data, setData] = useState<CaseGameData | null>(null);
  const [failed, setFailed] = useState(false);
  const [settings, setSettings] = useState(readSettings);
  const [phase, setPhase] = useState<'setup' | 'play' | 'done'>('setup');
  const [finished, setFinished] = useState<{ attempts: Attempt[]; elapsed: number } | null>(null);
  const [history, setHistory] = useState<CaseGameResult[]>([]);
  const [owner,setOwner] = useState<string|null|undefined>(undefined);

  useEffect(() => {
    let cancelled = false;
    const scope=account?.id ?? null;
    setPhase('setup');setFinished(null);setHistory([]);setFailed(false);
    getCaseGameAccess()
      .then((value) => { if(!cancelled){setAccess(value);setOwner(scope);} })
      .catch(() => !cancelled && setFailed(true));
    loadData()
      .then((value) => !cancelled && setData(value))
      .catch(() => !cancelled && setFailed(true));
    return () => {
      cancelled = true;
    };
  }, [account?.id]);

  useEffect(() => {
    if (!account) return;
    let cancelled = false;
    getCaseGameResults()
      .then((items) => !cancelled && setHistory(items))
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [account?.id, phase]);

  // Новый экран игры открывается сверху: машинка должна быть видна целиком.
  useEffect(() => {
    window.scrollTo({ top: 0 });
  }, [phase]);

  const update = (patch: Partial<Settings>) => {
    const next = { ...settings, ...patch };
    setSettings(next);
    saveSettings(next);
  };

  if (failed) {
    return (
      <Shell>
        <Card className="mx-auto max-w-lg p-8 text-center">
          <p className="text-lg">Игра не загрузилась. Проверь связь и обнови страницу.</p>
        </Card>
      </Shell>
    );
  }
  if (owner !== (account?.id ?? null) || !access || !data) {
    return (
      <Shell>
        <div className="flex justify-center py-24"><Spinner className="size-7" /></div>
      </Shell>
    );
  }
  if (!access.open) return <Teaser access={access} />;

  if (phase === 'play') {
    return (
      <Play
        data={data}
        settings={settings}
        onFinish={(attempts, elapsed) => {
          setFinished({ attempts, elapsed });
          setPhase('done');
        }}
        onQuit={() => setPhase('setup')}
      />
    );
  }
  if (phase === 'done' && finished) {
    return (
      <Results
        settings={settings}
        attempts={finished.attempts}
        elapsed={finished.elapsed}
        history={history}
        onAgain={() => setPhase('play')}
        onSetup={() => setPhase('setup')}
      />
    );
  }
  return (
    <Setup
      settings={settings}
      update={update}
      history={history}
      onStart={() => {
        void primeTypewriterSounds();
        setPhase('play');
      }}
    />
  );
}

function Shell({ children }: { children: ReactNode }) {
  return <main className="paper-grain min-h-[calc(100dvh-4rem)] px-3 py-8 sm:px-5 sm:py-12">{children}</main>;
}

function Teaser({ access }: { access: CaseGameAccess }) {
  const date = new Date(access.publicFrom).toLocaleDateString(uiLocale(), { day: 'numeric', month: 'long' });
  return (
    <Shell>
      <Card className="mx-auto max-w-2xl p-7 text-center sm:p-10">
        <img src="/img/citavuk_gram.webp" alt="" width={160} height={160} className="mx-auto w-32 object-contain" />
        <p className="mt-4 inline-flex items-center gap-1.5 rounded-full bg-gold/15 px-3 py-1 text-sm font-bold">
          <LuLock className="size-4" aria-hidden="true" /> Ранний доступ
        </p>
        <h1 className="mt-4 text-balance text-3xl sm:text-4xl">{TITLE}</h1>
        <p className="mx-auto mt-4 max-w-lg text-lg leading-relaxed text-[var(--text-muted)]">
          Печатная машинка, лапы Читавука и настоящий звук клавиш: пиши сербские
          слова в нужном падеже и времени — или говори их голосом.
        </p>
        <p className="mx-auto mt-3 max-w-lg leading-relaxed">
          До {date} игра открыта друзьям Читавука — тем, кто поддержал проект.
          С {date} в неё сможет играть каждый.
        </p>
        <div className="mt-7 flex flex-wrap justify-center gap-3">
          <ButtonLink to="/support" size="lg">Стать другом Читавука</ButtonLink>
          {!access.signedIn && <ButtonLink to="/login" variant="secondary" size="lg">Войти</ButtonLink>}
        </div>
      </Card>
    </Shell>
  );
}

function Chip({ active, onClick, children, disabled }: { active: boolean; onClick: () => void; children: ReactNode; disabled?: boolean }) {
  return (
    <button
      type="button"
      aria-pressed={active}
      disabled={disabled}
      onClick={onClick}
      className={[
        'inline-flex min-h-10 items-center gap-1.5 rounded-xl border px-3.5 text-sm font-semibold transition-colors disabled:cursor-not-allowed disabled:opacity-45',
        active
          ? 'border-[var(--accent)] bg-[var(--accent)] text-parchment'
          : 'border-[var(--line)] bg-[var(--bg-raised)] hover:border-[var(--accent)]',
      ].join(' ')}
    >
      {children}
    </button>
  );
}

function bestFor(history: CaseGameResult[], scope: string, limit: number) {
  return history
    .filter((item) => item.scope === scope && item.limitSeconds === limit && limit > 0)
    .sort((a, b) => b.correct - a.correct || b.accuracy - a.accuracy)[0];
}

function scopeKey(settings: Settings) {
  return `${settings.scope}:${settings.level}`;
}

function Setup({
  settings,
  update,
  history,
  onStart,
}: {
  settings: Settings;
  update: (patch: Partial<Settings>) => void;
  history: CaseGameResult[];
  onStart: () => void;
}) {
  const voiceOk = voiceSupported();
  const best = bestFor(history, scopeKey(settings), settings.limit);
  useEffect(() => {
    void loadTypewriter();
  }, []);
  return (
    <Shell>
      <div className="mx-auto max-w-3xl">
        <div className="flex flex-col items-center gap-5 text-center sm:flex-row sm:text-left">
          <img src="/img/citavuk_gram.webp" alt="" width={140} height={140} className="w-28 object-contain sm:w-32" />
          <div>
            <h1 className="mt-1 text-balance text-3xl leading-tight sm:text-4xl">{TITLE}</h1>
            <p className="mt-3 leading-relaxed text-[var(--text-muted)]">
              Читавук даёт слово и падеж — ты печатаешь форму на машинке или
              говоришь её вслух. Чёрточки над č, ć, š, ž, đ можно не ставить:
              ответ засчитается, но Читавук подскажет, где они нужны.
            </p>
          </div>
        </div>

        <Card className="mt-7 space-y-6 p-5 sm:p-7">
          <Section title="Время">
            {LIMITS.map((item) => (
              <Chip key={item.seconds} active={settings.limit === item.seconds} onClick={() => update({ limit: item.seconds })}>
                {item.seconds ? <LuTimer className="size-4" aria-hidden="true" /> : <LuInfinity className="size-4" aria-hidden="true" />}
                {item.label}
              </Chip>
            ))}
          </Section>

          <Section title="Падежи">
            <Chip active={settings.scope === 'all'} onClick={() => update({ scope: 'all' })}>Все падежи</Chip>
            <Chip active={settings.scope === 'nouns'} onClick={() => update({ scope: 'nouns' })}>Существительные</Chip>
            <Chip active={settings.scope === 'pronouns'} onClick={() => update({ scope: 'pronouns' })}>Местоимения</Chip>
          </Section>
          <Section title="Один падеж">
            {CASES.map((item) => (
              <Chip key={item.key} active={settings.scope === `case:${item.key}`} onClick={() => update({ scope: `case:${item.key}` })}>
                {item.ru}
                <span lang="sr" className="font-normal opacity-70">{item.sr}</span>
              </Chip>
            ))}
          </Section>
          <Section title="Времена глаголов">
            <Chip active={settings.scope === 'verbs'} onClick={() => update({ scope: 'verbs' })}>Все времена</Chip>
            {TENSES.map((item) => (
              <Chip key={item.key} active={settings.scope === `tense:${item.key}`} onClick={() => update({ scope: `tense:${item.key}` })}>
                {item.ru}
                <span lang="sr" className="font-normal opacity-70">{item.sr}</span>
              </Chip>
            ))}
          </Section>
          <Section title="Слова">
            {LEVELS.map((item) => (
              <Chip key={item.key} active={settings.level === item.key} onClick={() => update({ level: item.key })}>{item.label}</Chip>
            ))}
          </Section>
          <Section title="Как отвечать">
            <Chip active={!settings.voice} onClick={() => update({ voice: false })}>
              <LuKeyboard className="size-4" aria-hidden="true" /> Печатать
            </Chip>
            <Chip active={settings.voice && voiceOk} disabled={!voiceOk} onClick={() => update({ voice: true })}>
              <LuMic className="size-4" aria-hidden="true" /> Говорить голосом
            </Chip>
            {!voiceOk && (
              <p className="basis-full text-sm text-[var(--text-muted)]">
                Голосом можно играть в Chrome, Edge и Safari. В этом браузере распознавания речи нет.
              </p>
            )}
            {settings.voice && voiceOk && (
              <p className="basis-full text-sm text-[var(--text-muted)]">
                Скажи форму — Читавук узнает её сразу, как услышит, и напечатает сам. Печатать при этом тоже можно.
              </p>
            )}
          </Section>

          <div className="flex flex-wrap items-center gap-4 border-t border-[var(--line)] pt-5">
            <Button size="lg" onClick={onStart}>Начать</Button>
            <p className="text-sm text-[var(--text-muted)]">
              {scopeTitle(settings.scope)}, {LIMITS.find((item) => item.seconds === settings.limit)?.label.toLowerCase()}
              {best && <>, рекорд: {best.correct} верно, {Math.round(best.accuracy)}%</>}
            </p>
          </div>
        </Card>
      </div>
    </Shell>
  );
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section>
      <h2 className="mb-2 text-sm font-bold uppercase  text-[var(--text-muted)]">{title}</h2>
      <div className="flex flex-wrap gap-2">{children}</div>
    </section>
  );
}

function GameClock({ startedAt, limit }: { startedAt: number; limit: number }) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 500);
    return () => window.clearInterval(timer);
  }, []);
  const elapsed = (now - startedAt) / 1000;
  return <>{formatClock(limit ? limit - elapsed : elapsed)}</>;
}

function formatClock(seconds: number) {
  const s = Math.max(0, Math.ceil(seconds));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}

const VOICE_ERRORS: Record<VoiceError, string> = {
  denied: 'Нет доступа к микрофону. Разреши его в настройках браузера — или играй на клавиатуре.',
  network: 'Распознавание речи не отвечает: браузеру нужен интернет. Можно продолжать на клавиатуре.',
  language: 'Этот браузер не распознаёт сербский. Попробуй Chrome или играй на клавиатуре.',
  other: 'Микрофон не запустился. Можно продолжать на клавиатуре.',
};

function Play({
  data,
  settings,
  onFinish,
  onQuit,
}: {
  data: CaseGameData;
  settings: Settings;
  onFinish: (attempts: Attempt[], elapsed: number) => void;
  onQuit: () => void;
}) {
  const source = useMemo(() => taskSource(data, settings.scope, settings.level), [data, settings.scope, settings.level]);
  const [task, setTask] = useState<Task>(() => source.next());
  const [typed, setTyped] = useState('');
  const [lines, setLines] = useState<PrintedLine[]>([]);
  const [strike, setStrike] = useState<KeyStrike | null>(null);
  const [returning, setReturning] = useState(false);
  const [muted, setMuted] = useState(readMuted);
  const [heard, setHeard] = useState('');
  const [voiceError, setVoiceError] = useState<VoiceError | null>(null);
  const [listening, setListening] = useState(false);
  const [phoneKeyboard, setPhoneKeyboard] = useState(false);

  const startedAt = useRef(Date.now());
  const taskStartedAt = useRef(Date.now());
  const attempts = useRef<Attempt[]>([]);
  const locked = useRef(false);
  const typedRef = useRef('');
  const taskRef = useRef(task);
  const strikeId = useRef(0);
  const misses = useRef(0);
  const consumed = useRef<{ index: string; words: number } | null>(null);
  const done = useRef(false);
  const hiddenInput = useRef<HTMLInputElement>(null);
  taskRef.current = task;


  const finish = useCallback(() => {
    if (done.current) return;
    done.current = true;
    const seconds = Math.max(1, Math.round((Date.now() - startedAt.current) / 1000));
    if (!readMuted()) playTypewriter('bell');
    onFinish(attempts.current, settings.limit ? Math.min(seconds, settings.limit) : seconds);
  }, [onFinish, settings.limit]);

  // Конец партии — один таймер. Часы тикают в своём компоненте: перерисовывать
  // ради цифр всю машинку четыре раза в секунду незачем.
  // Остаток считается от старта, а finish берётся через ссылку: иначе каждая
  // перерисовка родителя перезапускала бы отсчёт с полного времени.
  const finishRef = useRef(finish);
  finishRef.current = finish;
  useEffect(() => {
    if (!settings.limit) return;
    const left = settings.limit * 1000 - (Date.now() - startedAt.current);
    const timer = window.setTimeout(() => finishRef.current(), Math.max(0, left));
    return () => window.clearTimeout(timer);
  }, [settings.limit]);

  const sound = useCallback((kind: Parameters<typeof playTypewriter>[0]) => {
    if (!readMuted()) playTypewriter(kind);
  }, []);

  const pressKey = useCallback((key: string) => {
    strikeId.current += 1;
    setStrike({ key, id: strikeId.current });
    sound(key === ' ' ? 'space' : 'key');
  }, [sound]);

  const setTypedBoth = (value: string) => {
    typedRef.current = value;
    setTyped(value);
  };

  const submit = useCallback((value: string, viaVoice = false) => {
    if (locked.current || done.current) return;
    const current = taskRef.current;
    const verdict = checkAnswer(value, current.answers);
    // Голосом «забыть чёрточку» нельзя: такой ответ засчитывается полностью.
    if (viaVoice && verdict.result === 'diacritics') {
      verdict.result = 'exact';
      verdict.missing = [];
    }
    attempts.current.push({ task: current, typed: value, verdict, ms: Date.now() - taskStartedAt.current });
    setLines((previous) => [
      ...previous,
      {
        id: previous.length,
        before: current.before,
        typed: value.trim(),
        after: current.after,
        status: verdict.result === 'exact' ? 'ok' : verdict.result === 'diacritics' ? 'slip' : 'wrong',
        correct: verdict.matched,
        missing: verdict.missing,
      },
    ]);
    if (verdict.result === 'wrong') {
      sound('thud');
      window.setTimeout(() => sound('thud'), 90);
    } else {
      sound('bell');
    }
    locked.current = true;
    setReturning(true);
    setHeard('');
    misses.current = 0;
    window.setTimeout(() => {
      setTypedBoth('');
      setTask(source.next());
      taskStartedAt.current = Date.now();
      setReturning(false);
      locked.current = false;
    }, verdict.result === 'wrong' ? 700 : 420);
  }, [sound, source]);

  const handleKey = useCallback((key: string) => {
    if (locked.current || done.current) return;
    if (key === 'enter') {
      pressKey('enter');
      if (typedRef.current.trim()) submit(typedRef.current);
      return;
    }
    if (key === 'backspace') {
      pressKey('backspace');
      setTypedBoth(typedRef.current.slice(0, -1));
      return;
    }
    if (typedRef.current.length >= 40) return;
    pressKey(key);
    setTypedBoth(typedRef.current + key);
  }, [pressKey, submit]);

  // Физическая клавиатура.
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.target === hiddenInput.current) return;
      const input = inputFromKeyboard(event);
      if (!input) return;
      event.preventDefault();
      void primeTypewriterSounds();
      if (input.kind === 'enter') handleKey('enter');
      else if (input.kind === 'backspace') handleKey('backspace');
      else for (const ch of input.text) handleKey(ch);
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [handleKey]);

  // Голос: верная форма печатается лапами сама, буква за буквой.
  const typeOut = useCallback((answer: string) => {
    locked.current = true;
    const letters = [...answer];
    let index = 0;
    setTypedBoth('');
    const step = () => {
      if (done.current) return;
      if (index < letters.length) {
        const ch = letters[index]!;
        pressKey(ch);
        typedRef.current += ch;
        setTyped(typedRef.current);
        index += 1;
        window.setTimeout(step, 45);
        return;
      }
      locked.current = false;
      submit(answer, true);
    };
    step();
  }, [pressKey, submit]);

  useEffect(() => {
    if (!settings.voice || !voiceSupported()) return;
    const stop = startVoice({
      onListening: setListening,
      onError: (error) => setVoiceError(error),
      onHeard: (alternatives, final, index) => {
        if (done.current) return;
        // Слова, уже засчитанные в этой фразе, не участвуют в следующем задании.
        const skip = consumed.current?.index === index ? consumed.current.words : 0;
        const fresh = alternatives.map((text) => words(text).slice(skip).join(' '));
        setHeard(fresh[0] ?? '');
        if (locked.current) return;
        const match = spokenAnswer(fresh, taskRef.current.answers);
        if (match) {
          consumed.current = { index, words: skip + words(alternatives[0] ?? '').slice(skip).length };
          typeOut(match);
          return;
        }
        if (final && fresh[0]?.trim()) {
          misses.current += 1;
          if (misses.current >= VOICE_RETRIES) submit(fresh[0], true);
        }
      },
    });
    return stop;
  }, [settings.voice, submit, typeOut]);

  const current = attempts.current;
  const correct = current.filter((item) => item.verdict.result !== 'wrong').length;
  const wrong = current.length - correct;

  return (
    <main className="flex min-h-[calc(100dvh-4rem)] flex-col bg-[radial-gradient(ellipse_at_top,color-mix(in_srgb,var(--color-gold)_16%,var(--bg)),var(--bg)_70%)] px-2 pt-4 sm:px-4">
      <div className="mx-auto flex max-w-3xl flex-wrap items-center gap-2 sm:gap-3">
        <div className="flex items-center gap-2 rounded-xl bg-[#1d1a17] px-3 py-1.5 font-mono text-xl font-bold tabular-nums text-[#f4ead0] shadow-inner" aria-label="Время">
          {settings.limit ? <LuTimer className="size-4 text-[#d9b25f]" aria-hidden="true" /> : <LuInfinity className="size-4 text-[#d9b25f]" aria-hidden="true" />}
          <GameClock startedAt={startedAt.current} limit={settings.limit} />
        </div>
        <span className="inline-flex items-center gap-1 rounded-lg bg-[var(--success-soft)] px-2.5 py-1 text-sm font-bold text-[var(--success)]">
          <LuCheck className="size-4" aria-hidden="true" /> {correct}
        </span>
        <span className="inline-flex items-center gap-1 rounded-lg bg-[var(--error-soft)] px-2.5 py-1 text-sm font-bold text-[var(--error)]">
          <LuX className="size-4" aria-hidden="true" /> {wrong}
        </span>
        <div className="ml-auto flex items-center gap-1.5">
          {settings.voice && (
            <span
              className={[
                'inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1 text-sm font-semibold',
                voiceError ? 'bg-[var(--error-soft)] text-[var(--error)]' : 'bg-[var(--bg-sunken)]',
              ].join(' ')}
              title={voiceError ? VOICE_ERRORS[voiceError] : 'Микрофон слушает'}
            >
              {voiceError ? <LuMicOff className="size-4" aria-hidden="true" /> : <LuMic className={['size-4', listening ? 'animate-pulse text-[var(--accent)]' : ''].join(' ')} aria-hidden="true" />}
              <span className="hidden sm:inline">{voiceError ? 'Без голоса' : 'Слушаю'}</span>
            </span>
          )}
          <button
            type="button"
            onClick={() => {
              setMuted(!muted);
              saveMuted(!muted);
            }}
            className="grid size-9 place-items-center rounded-xl text-[var(--text-muted)] hover:bg-[var(--bg-sunken)]"
            aria-label={muted ? 'Включить звук машинки' : 'Выключить звук машинки'}
          >
            {muted ? <LuVolumeX className="size-5" aria-hidden="true" /> : <LuVolume2 className="size-5" aria-hidden="true" />}
          </button>
          <Button size="sm" variant="secondary" onClick={settings.limit ? onQuit : finish}>
            {settings.limit ? 'Выйти' : 'Закончить'}
          </Button>
        </div>
      </div>

      <div className="mx-auto mt-4 max-w-3xl rounded-2xl border border-[var(--line)] bg-[#fbf6e8] px-4 py-3 text-center text-[#1d1a17] shadow-[var(--shadow-soft)] sm:px-6">
        {/* Фраза с пропуском: набранное появляется прямо в нём. */}
        <p className="font-['Courier_Prime',monospace] text-2xl font-bold leading-snug sm:text-3xl">
          {task.before && `${task.before} `}
          <span className="inline-block min-w-[5ch] border-b-2 border-dashed border-[#9e2b25] px-1 text-left text-[#9e2b25]">
            {typed || '\u00a0'}
          </span>
          {frameTail(task.after)}
        </p>
        <p className="mt-2 text-[15px] leading-snug text-[#3d332a] sm:text-base">
          Напиши правильную форму {KIND_WORD[task.kind]}{' '}
          <b lang="sr" className="font-['Courier_Prime',monospace] text-lg">{task.lemma}</b>{' '}
          <span className="text-[#6b5a48]">({task.translation})</span>
        </p>
        <p className="mt-1 text-sm font-bold text-[#9e2b25] sm:text-base">
          {task.label}
          <span className="ml-2 text-sm font-semibold text-[#6b5a48]">{task.labelSr}</span>
        </p>
        <LastAnswer attempt={current.at(-1)} />
      </div>

      <div className="mx-auto mt-3 flex max-w-3xl flex-wrap items-center justify-center gap-2 text-sm text-[var(--text-muted)]">
        {settings.voice && !voiceError && (
          <p className="basis-full text-center">
            {heard ? <>Слышу: <b className="text-[var(--text)]">{heard}</b></> : 'Скажи форму вслух — или напечатай её.'}
          </p>
        )}
        {voiceError && <p className="basis-full text-center text-[var(--error)]">{VOICE_ERRORS[voiceError]}</p>}
        <span className="hidden sm:inline">Enter — напечатать ответ, Backspace — стереть букву.</span>
        <button type="button" className="font-semibold text-[var(--accent)] underline underline-offset-2" onClick={() => submit(typedRef.current)}>
          Не знаю
        </button>
        <button
          type="button"
          className="font-semibold text-[var(--accent)] underline underline-offset-2 sm:hidden"
          onClick={() => {
            setPhoneKeyboard(true);
            window.setTimeout(() => hiddenInput.current?.focus(), 0);
          }}
        >
          Клавиатура телефона
        </button>
      </div>
      <div className="flex flex-1 flex-col justify-end pt-2">
        <Suspense fallback={<div className="min-h-[380px] w-full flex-1" />}>
        <Typewriter3D
          lines={lines}
          before={task.before}
          typed={typed}
          after={task.after}
          strike={strike}
          returning={returning}
          onKey={(key) => {
            void primeTypewriterSounds();
            handleKey(key);
          }}
        />
        </Suspense>
      </div>
      {/* Экранная клавиатура телефона: машинка остаётся главной, но кому-то
          быстрее на привычной. Поле невидимо, ввод уходит на машинку. */}
      {phoneKeyboard && (
        <input
          ref={hiddenInput}
          aria-label="Ввод ответа"
          autoCapitalize="none"
          autoCorrect="off"
          autoComplete="off"
          spellCheck={false}
          enterKeyHint="send"
          className="fixed bottom-0 left-0 h-px w-px opacity-0"
          defaultValue=""
          onBlur={() => setPhoneKeyboard(false)}
          onKeyDown={(event) => {
            if (event.key === 'Enter') {
              event.preventDefault();
              handleKey('enter');
            }
          }}
          onInput={(event) => {
            const native = event.nativeEvent as InputEvent;
            if (native.inputType === 'deleteContentBackward') handleKey('backspace');
            else for (const ch of textFromInput(native.data ?? '')) handleKey(ch);
            event.currentTarget.value = '';
          }}
        />
      )}
    </main>
  );
}

const KIND_WORD: Record<Task['kind'], string> = {
  noun: 'слова',
  pronoun: 'местоимения',
  verb: 'глагола',
};

/**
 * Итог прошлого ответа под заданием: что было верно и чем отличался ответ.
 * Строка занимает место и пустой — иначе после первого ответа машинка
 * съезжала бы вниз.
 */
function LastAnswer({ attempt }: { attempt: Attempt | undefined }) {
  const base = 'mt-2 min-h-7 border-t border-[#e6dcc4] pt-2 text-sm leading-snug sm:text-[15px]';
  const icon = 'mr-1 inline size-4 align-[-3px]';
  if (!attempt) return <p className={base} aria-hidden="true" />;
  const { task, typed, verdict } = attempt;
  const phrase = <b className="font-['Courier_Prime',monospace] text-base">{framed(task, verdict.matched)}</b>;
  if (verdict.result === 'wrong') {
    return (
      <p className={`${base} text-[#9e2b25]`} role="status">
        <LuX className={icon} aria-hidden="true" />
        Правильно: {phrase}
        {typed.trim() && <span className="text-[#6b5a48]"> (у тебя: {typed.trim()})</span>}
      </p>
    );
  }
  return (
    <p className={`${base} text-[#2f6b35]`} role="status">
      <LuCheck className={icon} aria-hidden="true" />
      {verdict.result === 'exact' ? 'Верно:' : 'Засчитано:'} {phrase}
      {verdict.result === 'diacritics' && (
        <span className="text-[#8a4b12]"> — не хватило чёрточки: {verdict.missing.join(', ')}</span>
      )}
    </p>
  );
}

function Results({
  settings,
  attempts,
  elapsed,
  history,
  onAgain,
  onSetup,
}: {
  settings: Settings;
  attempts: Attempt[];
  elapsed: number;
  history: CaseGameResult[];
  onAgain: () => void;
  onSetup: () => void;
}) {
  const { account } = useAuth();
  const summary = useMemo(() => summarize(attempts, elapsed), [attempts, elapsed]);
  const [saved, setSaved] = useState<'idle' | 'saving' | 'saved' | 'streak' | 'error' | 'guest'>(account ? 'saving' : 'guest');
  // Рекорд берётся до сохранения этой партии, иначе она сравнивалась бы сама с собой.
  const [previousBest] = useState(() => bestFor(history, scopeKey(settings), settings.limit));
  const record = settings.limit > 0 && summary.correct > 0 && (!previousBest || summary.correct > previousBest.correct);
  const once = useRef(false);

  useEffect(() => {
    if (!account || once.current || summary.words === 0) {
      if (summary.words === 0) setSaved('idle');
      return;
    }
    once.current = true;
    const result: CaseGameResult = {
      id: crypto.randomUUID(),
      scope: scopeKey(settings),
      limitSeconds: settings.limit,
      elapsedSeconds: elapsed,
      words: summary.words,
      correct: summary.correct,
      wrong: summary.wrong,
      diacriticSlips: summary.diacriticSlips,
      chars: summary.chars,
      cpm: summary.cpm,
      accuracy: summary.accuracy,
      weak: summary.weak,
    };
    saveCaseGameResult(result)
      .then((response) => {
        if (response.study) {
          acceptStudy(response.study, activeStorageName(), true);
          setSaved('streak');
        } else {
          setSaved('saved');
        }
      })
      .catch((error: unknown) => {
        console.warn(error instanceof ApiError ? error.message : error);
        setSaved('error');
      });
  }, [account, elapsed, settings, summary]);

  const mistakes = attempts.filter((item) => item.verdict.result === 'wrong').slice(-12);
  const slips = attempts.filter((item) => item.verdict.result === 'diacritics').slice(-6);

  return (
    <Shell>
      <div className="mx-auto max-w-3xl">
        <Card className="overflow-hidden p-0">
          <div className="bg-[#1d1a17] px-6 py-5 text-[#f4ead0] sm:px-8">
            <h1 className="mt-1 font-['Courier_Prime',monospace] text-3xl font-bold sm:text-4xl">
              {summary.correct > 0 ? 'Падежи уничтожены!' : 'Падежи устояли'}
            </h1>
            <p className="mt-1 text-sm text-[#f4ead0]/75">
              {scopeTitle(settings.scope)}, {formatClock(elapsed)}
              {record && <span className="ml-2 inline-flex items-center gap-1 font-bold text-[#d9b25f]"><LuTrophy className="size-4" aria-hidden="true" /> новый рекорд</span>}
            </p>
          </div>
          <div className="grid grid-cols-2 gap-px bg-[var(--line)] sm:grid-cols-4">
            <Stat value={summary.correct} label="верно" />
            <Stat value={summary.wrong} label="ошибок" />
            <Stat value={`${summary.accuracy}%`} label="точность" />
            <Stat value={summary.wpm} label="слов в минуту" />
          </div>
          <div className="space-y-6 p-6 sm:p-8">
            <p className="text-[var(--text-muted)]">
              {summary.cpm} знаков в минуту, без чёрточек: {summary.diacriticSlips}
              {previousBest && settings.limit > 0 && <>, прежний рекорд: {previousBest.correct} верно</>}
            </p>

            {summary.weak.length > 0 && (
              <section>
                <h2 className="text-xl">Где падежи пока сильнее</h2>
                <ul className="mt-3 space-y-2">
                  {summary.weak.map((item) => (
                    <li key={item.label}>
                      <div className="flex justify-between text-sm">
                        <span className="font-semibold">{item.label}</span>
                        <span className="text-[var(--text-muted)]">{item.wrong} из {item.total}</span>
                      </div>
                      <div className="mt-1 h-2 overflow-hidden rounded-full bg-[var(--bg-sunken)]">
                        <div className="h-full rounded-full bg-[var(--accent)]" style={{ width: `${(item.wrong / item.total) * 100}%` }} />
                      </div>
                    </li>
                  ))}
                </ul>
              </section>
            )}

            {mistakes.length > 0 && (
              <section>
                <h2 className="text-xl">Ошибки</h2>
                <ul className="mt-3 grid gap-2 font-['Courier_Prime',monospace] sm:grid-cols-2">
                  {mistakes.map((item, index) => (
                    <li key={index} className="rounded-xl bg-[var(--bg-sunken)] px-3 py-2">
                      <span className="text-xs font-sans text-[var(--text-muted)]">{item.task.lemma}, {item.task.label}</span>
                      <span className="block">
                        {item.task.before} <s className="opacity-60">{item.typed || '…'}</s>{' '}
                        <b className="text-[var(--accent)]">{item.verdict.matched}</b>
                      </span>
                    </li>
                  ))}
                </ul>
              </section>
            )}

            {slips.length > 0 && (
              <section>
                <h2 className="text-xl">Чёрточки</h2>
                <p className="mt-1 text-sm text-[var(--text-muted)]">Засчитано, но в этих словах буквы с чёрточкой:</p>
                <p className="mt-2 font-['Courier_Prime',monospace]">
                  {slips.map((item) => item.verdict.matched).join(', ')}
                </p>
              </section>
            )}

            <p className="text-sm">
              {saved === 'saving' && 'Сохраняю результат…'}
              {saved === 'saved' && 'Результат сохранён в профиле.'}
              {saved === 'streak' && (
                <span className="inline-flex items-center gap-1.5 font-semibold text-[var(--accent)]">
                  <LuFlame className="size-4" aria-hidden="true" /> Результат в профиле, серия продлена.
                </span>
              )}
              {saved === 'error' && 'Результат не сохранился — нет связи с сервером.'}
              {saved === 'guest' && (
                <><Link to="/login" className="font-semibold text-[var(--accent)] underline underline-offset-2">Войди</Link>, чтобы результаты сохранялись в профиле и продлевали серию.</>
              )}
            </p>

            <div className="flex flex-wrap gap-3">
              <Button size="lg" onClick={onAgain}><LuRotateCcw className="size-5" aria-hidden="true" /> Ещё раз</Button>
              <Button size="lg" variant="secondary" onClick={onSetup}>Другой режим</Button>
            </div>
          </div>
        </Card>
      </div>
    </Shell>
  );
}

function Stat({ value, label }: { value: ReactNode; label: string }) {
  return (
    <div className="bg-[var(--bg-raised)] px-4 py-4 text-center">
      <div className="font-['Courier_Prime',monospace] text-3xl font-bold">{value}</div>
      <div className="text-sm text-[var(--text-muted)]">{label}</div>
    </div>
  );
}
