/**
 * Матч «Ты против переводчика» на несколько человек.
 *
 * Живого канала нет: комната опрашивается обычным GET раз в пару секунд, и всё
 * движение на экране считается от часов сервера, а не браузера. Что именно
 * движется и почему — в components/DuelStage.tsx.
 *
 * Черновик переводов уходит на сервер сам, пока человек печатает. Раньше он
 * уходил только по кнопке «Сдать», и тот, кто не успевал нажать до звонка,
 * терял весь раунд — обиднее этого в игре не было ничего.
 */

import {
  useCallback, useEffect, useRef, useState,
  type Dispatch, type ReactNode, type SetStateAction,
} from 'react';
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion';
import {
  LuArrowLeft, LuBot, LuCheck, LuClipboard, LuDoorOpen, LuLink,
  LuSearch, LuSend, LuSwords, LuTrophy, LuUsers, LuVolume2, LuVolumeX,
} from 'react-icons/lu';

import {
  addDuelMachine, createDuelRoom, duelPlayerName, getDuelRoom, joinDuelRoom,
  leaveDuelRoom, readyDuel, saveDuelDraft, sendDuelAnswer, startDuelMatch, voteDuel,
  type DuelRoom,
} from '../api/duel';
import type { TranslationGameDirection, TranslationGameLevel } from '../api/translationGame';
import {
  answered, canStart, everythingAnswered, gatherOver, inviteLink, outcome, pending,
  pollEvery, searchHint, secondsLeft, seated, unvoted, urgency,
} from '../duel/room';
import { duelMuted, playDuel, playDuelKey, preloadDuelSounds, setDuelMuted } from '../lib/duelSounds';
import { useRouter } from '../lib/router';
import { useAuth } from '../state/auth';
import { useDuelSearch } from '../state/duelSearch';
import { Fighter } from './DuelArena';
import {
  Confetti, CURTAIN_MS, DuelClock, DuelTable, DuelWaiting, PhaseCurtain, Podium, ShuffleDeck,
} from './DuelStage';
import { Ornament } from './Ornament';
import { Button, Card, ErrorNote, Spinner } from './ui';

const LEVELS: TranslationGameLevel[] = ['A1', 'A2', 'B1', 'B2', 'C1', 'C2'];
const DIRECTIONS: { id: TranslationGameDirection; title: string }[] = [
  { id: 'sr-ru', title: 'С сербского на русский' },
  { id: 'ru-sr', title: 'С русского на сербский' },
];

/** Через столько молчания черновик уходит на сервер. */
const DRAFT_MS = 2500;

/** Пауза между открытиями переводов в разборе. Меньше — сливается в список. */
const REVEAL_MS = 900;

interface Props { code?: string; onSolo?: () => void }

export function MultiplayerDuel({ code, onSolo }: Props) {
  return code ? <Room code={code.toUpperCase()} /> : <DuelMenu onSolo={onSolo} />;
}

// ─── Выбор игры и подбор ──────────────────────────────────────────────────────

function DuelMenu({ onSolo }: Pick<Props, 'onSolo'>) {
  const { account } = useAuth();
  const { navigate } = useRouter();
  const search = useDuelSearch();
  const savedLevel = account?.serbianLevel as TranslationGameLevel;
  const [level, setLevel] = useState<TranslationGameLevel>(LEVELS.includes(savedLevel) ? savedLevel : 'A2');
  const [direction, setDirection] = useState<TranslationGameDirection>('sr-ru');
  const [seats, setSeats] = useState(2);
  const [name, setName] = useState(() => account?.displayName || duelPlayerName());
  const [busy, setBusy] = useState('');
  const [error, setError] = useState('');
  const settings = { level, direction, seats, name: account ? undefined : name };

  async function act(kind: 'room' | 'search') {
    if (!account && !name.trim()) { setError('Напиши имя, под которым тебя увидят за столом.'); return; }
    setBusy(kind); setError('');
    try {
      if (kind === 'room') {
        const next = await createDuelRoom(settings);
        navigate(`/trainer/translation-duel/${next.code}`);
      } else {
        const found = await search.start(settings);
        if (found.room) navigate(`/trainer/translation-duel/${found.room}`);
      }
    } catch (cause) { setError(message(cause)); }
    finally { setBusy(''); }
  }

  return (
    <main className="mx-auto w-full max-w-4xl px-4 py-10 sm:px-6 sm:py-14">
      <div className="text-center">
        <motion.div
          className="mx-auto grid size-14 place-items-center rounded-full bg-[var(--accent)] text-parchment shadow-lg"
          initial={{ scale: 0.8, rotate: -12 }}
          animate={{ scale: 1, rotate: 0 }}
          transition={{ type: 'spring', stiffness: 260, damping: 14 }}
        >
          <LuSwords className="size-7" />
        </motion.div>
        <h1 className="mt-5 font-display text-3xl sm:text-5xl">Ты против переводчика</h1>
        <p className="mx-auto mt-3 max-w-2xl text-[var(--text-muted)]">
          Играй один, зови друзей по ссылке или найди соперников своего уровня. За столом помещается
          до шести участников, включая DeepL.
        </p>
      </div>
      <Ornament className="mx-auto my-8 max-w-xl" />

      <Card className="p-5 sm:p-7">
        {!account && (
          <label className="block text-sm font-bold">
            Твоё имя
            <input
              value={name}
              maxLength={24}
              onChange={(event) => setName(event.target.value)}
              className="duel-input mt-2 text-base font-normal"
              placeholder="Например, Маша"
            />
          </label>
        )}
        <div className="mt-5 grid gap-5 sm:grid-cols-[1fr_1fr_160px]">
          <Choice label="Уровень">
            <select value={level} onChange={(event) => setLevel(event.target.value as TranslationGameLevel)} className="duel-select">
              {LEVELS.map((item) => <option key={item}>{item}</option>)}
            </select>
          </Choice>
          <Choice label="Направление">
            <select value={direction} onChange={(event) => setDirection(event.target.value as TranslationGameDirection)} className="duel-select">
              {DIRECTIONS.map((item) => <option key={item.id} value={item.id}>{item.title}</option>)}
            </select>
          </Choice>
          <Choice label="Игроков">
            <select value={seats} onChange={(event) => setSeats(Number(event.target.value))} className="duel-select">
              {[2, 3, 4, 5, 6].map((item) => <option key={item}>{item}</option>)}
            </select>
          </Choice>
        </div>

        {error && <div className="mt-5"><ErrorNote>{error}</ErrorNote></div>}

        <AnimatePresence>
          {search.state?.waiting && (
            <motion.div
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: 'auto' }}
              exit={{ opacity: 0, height: 0 }}
              className="overflow-hidden"
            >
              <div className="mt-5 rounded-2xl border border-[var(--line)] bg-[var(--bg-sunken)] p-4">
                <div className="flex items-center gap-3">
                  <Radar />
                  <div className="min-w-0">
                    <p className="font-bold">Поиск идёт в фоне</p>
                    <p className="mt-0.5 text-sm text-[var(--text-muted)]">{searchHint(search.state)}</p>
                  </div>
                </div>
                <div className="mt-3 flex flex-wrap gap-2">
                  {search.room && (
                    <Button size="sm" onClick={() => navigate(`/trainer/translation-duel/${search.room}`)}>
                      Войти в матч
                    </Button>
                  )}
                  {search.state.ripe && (
                    <Button size="sm" variant="secondary" onClick={onSolo}><LuBot /> Пока сыграть с DeepL</Button>
                  )}
                  <Button size="sm" variant="ghost" onClick={() => void search.stop()}>Остановить поиск</Button>
                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        <div className="mt-7 grid gap-3 sm:grid-cols-3">
          <Button size="lg" onClick={() => void act('room')} disabled={Boolean(busy)}>
            {busy === 'room' ? <Spinner /> : <LuLink />} Позвать друзей
          </Button>
          <Button size="lg" variant="secondary" onClick={() => void act('search')} disabled={Boolean(busy) || search.searching}>
            {busy === 'search' ? <Spinner /> : <LuSearch />} Найти соперников
          </Button>
          <Button size="lg" variant="secondary" onClick={onSolo} disabled={Boolean(busy)}>
            <LuBot /> Играть с DeepL
          </Button>
        </div>
      </Card>
    </main>
  );
}

function Choice({ label, children }: { label: string; children: ReactNode }) {
  return <label className="text-sm font-bold">{label}{children}</label>;
}

/** Круги поиска: видно, что подбор жив, даже когда рядом никого нет. */
function Radar() {
  const reduced = useReducedMotion() ?? false;
  return (
    <span className="relative grid size-10 shrink-0 place-items-center">
      {[0, 1].map((ring) => (
        <motion.span
          key={ring}
          className="absolute inset-0 rounded-full border border-[var(--accent)]"
          animate={reduced ? undefined : { scale: [0.6, 1.35], opacity: [0.7, 0] }}
          transition={{ duration: 2, repeat: Infinity, delay: ring * 1 }}
        />
      ))}
      <LuSearch className="size-4 text-[var(--accent)]" />
    </span>
  );
}

// ─── Комната ─────────────────────────────────────────────────────────────────

function Room({ code }: { code: string }) {
  const { account } = useAuth();
  const { navigate } = useRouter();
  const search = useDuelSearch();
  const [room, setRoom] = useState<DuelRoom | null>(null);
  const [received, setReceived] = useState(Date.now());
  const [clock, setClock] = useState(Date.now());
  const [name, setName] = useState(() => account?.displayName || duelPlayerName());
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState('');
  // Ошибка действия живёт до следующего действия, потеря связи — до
  // следующего удачного опроса. Раньше это была одна строка, и ответ сервера,
  // пришедший через секунду, стирал «не удалось сдать перевод» с экрана: кнопка
  // выглядела просто сломанной.
  const [error, setError] = useState('');
  const [offline, setOffline] = useState(false);
  const [muted, setMuted] = useState(duelMuted);
  const [curtain, setCurtain] = useState('');

  const accept = useCallback((next: DuelRoom) => {
    setRoom(next); setReceived(Date.now()); setOffline(false);
    setAnswers((current) => ({ ...(next.answers ?? {}), ...current }));
  }, []);
  const refresh = useCallback(async () => accept(await getDuelRoom(code)), [accept, code]);

  useEffect(() => { void preloadDuelSounds(); }, []);

  useEffect(() => {
    let alive = true;
    getDuelRoom(code).then((next) => {
      if (!alive) return;
      accept(next);
      const me = next.players.find((player) => player.you);
      if (me && !me.joined) {
        joinDuelRoom(code, account ? undefined : duelPlayerName())
          .then((joined) => alive && accept(joined))
          .catch(() => undefined);
      }
    }).catch((cause) => alive && setError(message(cause)));
    return () => { alive = false; };
  }, [accept, account, code]);

  useEffect(() => {
    if (!room) return;
    const delay = pollEvery(room.phase);
    if (!delay) return;
    const timer = window.setTimeout(() => void refresh().catch(() => setOffline(true)), delay);
    return () => window.clearTimeout(timer);
  }, [refresh, room]);

  useEffect(() => {
    const timer = window.setInterval(() => setClock(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, []);

  useEffect(() => { if (search.room === code) void search.stop(); }, [code, search]);

  // Занавес и звук на смене фазы: без них раунд «просто меняет текст».
  // На первой отрисовке занавеса нет: человек только что открыл комнату и уже
  // видит, где он оказался.
  const stage = room ? `${room.phase}-${room.round}` : '';
  const seen = useRef('');
  useEffect(() => {
    if (!room || !stage) return;
    const first = !seen.current;
    seen.current = stage;
    if (first || room.phase === 'lobby') return;
    setCurtain(stage);
    if (room.phase === 'translate') playDuel('start');
    if (room.phase === 'vote') playDuel('charge');
    if (room.phase === 'result') playDuel('hit');
    if (room.phase === 'finished') playDuel(outcome(room) === 'lost' ? 'defeat' : 'victory');
    const timer = window.setTimeout(() => setCurtain(''), CURTAIN_MS);
    return () => window.clearTimeout(timer);
    // Занавес привязан к фазе и раунду, а не к каждому ответу сервера: комнату
    // опрашивают каждые пару секунд, и room в зависимостях гонял бы его вечно.
  }, [stage]); // eslint-disable-line react-hooks/exhaustive-deps

  async function run(label: string, action: () => Promise<DuelRoom>) {
    setBusy(label); setError('');
    try { accept(await action()); } catch (cause) { setError(message(cause)); }
    finally { setBusy(''); }
  }

  function leave() {
    if (room?.you) void leaveDuelRoom(code).catch(() => undefined);
    navigate('/trainer/translation-duel');
  }

  if (!room && !error) return <main className="grid min-h-[55vh] place-items-center"><Spinner className="size-8" /></main>;
  if (!room) return <PageError error={error} onBack={() => navigate('/trainer/translation-duel')} />;
  if (!room.you) return <JoinRoom room={room} name={name} setName={setName} account={Boolean(account)} busy={busy} error={error} run={run} />;

  const left = secondsLeft(room, received, clock);
  const sentences = room.sentences?.length ?? 5;

  return (
    <main className="mx-auto w-full max-w-5xl px-4 py-8 sm:px-6 sm:py-12">
      {curtain && <PhaseCurtain key={curtain} label={curtainLabel(room)} title={phaseTitle(room)} />}

      <header className="flex flex-wrap items-center gap-3">
        <button
          type="button"
          onClick={leave}
          className="grid size-11 place-items-center rounded-full border border-[var(--line)] bg-[var(--bg-raised)] transition-colors hover:border-[var(--accent)]"
          aria-label="Выйти из комнаты"
        >
          <LuArrowLeft />
        </button>
        <div className="min-w-0 flex-1">
          <p className="text-xs font-bold uppercase tracking-wide text-[var(--accent)]">Комната {room.code}</p>
          <h1 className="font-display text-2xl sm:text-3xl">{phaseTitle(room)}</h1>
        </div>
        <button
          type="button"
          onClick={() => { setDuelMuted(!muted); setMuted(!muted); }}
          className="grid size-11 place-items-center rounded-full border border-[var(--line)] bg-[var(--bg-raised)] text-[var(--text-muted)]"
          aria-label={muted ? 'Включить звук' : 'Выключить звук'}
        >
          {muted ? <LuVolumeX /> : <LuVolume2 />}
        </button>
        {room.deadline && <DuelClock seconds={left} phase={room.phase} />}
      </header>

      {/* Полоса времени во всю ширину: её видно, даже когда глаза в поле ввода. */}
      {room.deadline && <TimeRail seconds={left} phase={room.phase} />}

      {error && <div className="mt-5"><ErrorNote>{error}</ErrorNote></div>}
      {offline && !error && (
        <p className="mt-4 text-center text-sm text-[var(--text-muted)]">
          Связь пропала — комната обновится сама, как только вернётся.
        </p>
      )}

      <div className="mt-6 grid gap-5 lg:grid-cols-[minmax(0,1fr)_280px]">
        {/*
          Смена ключа сама снимает старую фазу и вводит новую. Анимации ухода
          здесь намеренно нет: с ней панель ждала бы конца анимации, а в
          свёрнутой вкладке браузер останавливает кадры — и раунд не появился бы
          вовсе, пока человек не вернётся.
        */}
        <motion.section
          key={stage}
          initial={{ opacity: 0, y: 22, scale: 0.985 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          transition={{ duration: 0.32, ease: [0.22, 1, 0.36, 1] }}
        >
          {room.phase === 'lobby' && <Lobby room={room} left={left} busy={busy} run={run} />}
          {room.phase === 'translate' && (
            <Translate room={room} answers={answers} setAnswers={setAnswers} left={left} busy={busy} run={run} muted={muted} />
          )}
          {room.phase === 'judging' && <Judging room={room} />}
          {room.phase === 'vote' && <Vote room={room} busy={busy} run={run} />}
          {room.phase === 'result' && <Result room={room} />}
          {room.phase === 'finished' && <FinishedRoom room={room} onBack={leave} />}
        </motion.section>

        <Card className="h-fit p-4 sm:p-5">
          <div className="flex items-center gap-2">
            <LuUsers className="text-[var(--text-muted)]" />
            <h2 className="font-display text-lg">За столом</h2>
            <span className="ml-auto text-sm tabular-nums text-[var(--text-muted)]">
              {seated(room).length}/{room.seats}
            </span>
          </div>
          <div className="mt-4"><DuelTable room={room} sentences={sentences} /></div>
          <WaitingFor room={room} />
        </Card>
      </div>
    </main>
  );
}

/** Тонкая полоса времени под шапкой. */
function TimeRail({ seconds, phase }: { seconds: number; phase: DuelRoom['phase'] }) {
  const heat = urgency(seconds);
  const total = phase === 'translate' ? 200 : phase === 'vote' ? 90 : 45;
  return (
    <div className="mt-4 h-1 overflow-hidden rounded-full bg-[var(--bg-sunken)]">
      <div
        className="h-full rounded-full"
        style={{
          width: `${Math.max(0, Math.min(100, (seconds / total) * 100))}%`,
          background: heat === 'hot' ? 'var(--accent)' : heat === 'warm' ? 'var(--color-gold)' : 'var(--line)',
          transition: 'width 1s linear, background-color 400ms ease',
        }}
      />
    </div>
  );
}

function WaitingFor({ room }: { room: DuelRoom }) {
  const waiting = pending(room);
  if (waiting.length === 0) return null;
  return (
    <p className="mt-4 border-t border-[var(--line)] pt-3 text-sm text-[var(--text-muted)]">
      Ждём: {waiting.map((player) => (player.you ? 'тебя' : player.name)).join(', ')}
    </p>
  );
}

type Run = (label: string, action: () => Promise<DuelRoom>) => Promise<void>;
interface RoomActionProps { room: DuelRoom; busy: string; run: Run }

function JoinRoom({ room, name, setName, account, busy, error, run }: {
  room: DuelRoom; name: string; setName: Dispatch<SetStateAction<string>>;
  account: boolean; busy: string; error: string; run: Run;
}) {
  return (
    <main className="mx-auto w-full max-w-lg px-4 py-14">
      <Card className="p-6 sm:p-8">
        <p className="text-sm font-bold text-[var(--accent)]">Приглашение в комнату {room.code}</p>
        <h1 className="mt-2 font-display text-3xl">Занять место</h1>
        <p className="mt-2 text-[var(--text-muted)]">
          Уровень {room.level}, {directionLabel(room.direction)}. Свободно{' '}
          {Math.max(0, room.seats - seated(room).length)} из {room.seats} мест.
        </p>
        {!account && (
          <input value={name} maxLength={24} onChange={(event) => setName(event.target.value)}
            className="duel-input mt-6" placeholder="Твоё имя" />
        )}
        {error && <div className="mt-4"><ErrorNote>{error}</ErrorNote></div>}
        <Button className="mt-6 w-full" size="lg" disabled={Boolean(busy)}
          onClick={() => void run('join', () => joinDuelRoom(room.code, account ? undefined : name))}>
          {busy ? <Spinner /> : <LuDoorOpen />} Войти
        </Button>
      </Card>
    </main>
  );
}

// ─── Лобби ───────────────────────────────────────────────────────────────────

function Lobby({ room, left, busy, run }: RoomActionProps & { left: number }) {
  const reduced = useReducedMotion() ?? false;
  const link = inviteLink(room.code);
  const [copied, setCopied] = useState(false);
  const free = room.seats - seated(room).length;
  const over = gatherOver(room, left);
  const machines = ['deepl', 'google'] as const;

  async function copy() {
    try {
      await navigator.clipboard.writeText(link);
      setCopied(true);
      playDuel('guard');
      window.setTimeout(() => setCopied(false), 2000);
    } catch { setCopied(false); }
  }

  return (
    <Card className="p-5 sm:p-7">
      <div className="grid items-center gap-4 sm:grid-cols-[1fr_110px]">
        <div>
          <h2 className="font-display text-2xl">
            {over ? 'Соперники не дошли' : 'Стол собирается'}
          </h2>
          <p className="mt-2 text-[var(--text-muted)]">
            {over
              ? 'Кто-то из позванных не открыл комнату. Можно позвать друга по ссылке, посадить переводчик или начать с теми, кто здесь.'
              : room.matched
                ? 'Подтверди участие. Матч начнётся, как только соберутся игроки.'
                : `Осталось мест: ${free}. Отправь ссылку друзьям или добавь переводчик.`}
          </p>
        </div>
        <motion.div
          animate={reduced ? undefined : { y: [0, -6, 0] }}
          transition={{ duration: 2.4, repeat: Infinity, ease: 'easeInOut' }}
        >
          <Fighter pose={seated(room).length > 1 ? 'cheer' : 'hush'} className="mx-auto w-20 sm:w-24" />
        </motion.div>
      </div>

      <div className="mt-5 flex gap-2">
        <input readOnly value={link} className="duel-input min-w-0 flex-1" aria-label="Ссылка-приглашение" />
        <Button variant="secondary" onClick={() => void copy()} title="Копировать ссылку">
          <motion.span key={String(copied)} initial={{ scale: 0.6 }} animate={{ scale: 1 }} className="grid place-items-center">
            {copied ? <LuCheck className="text-[var(--success)]" /> : <LuClipboard />}
          </motion.span>
          <span className="hidden sm:inline">{copied ? 'Готово' : 'Копировать'}</span>
        </Button>
      </div>

      {room.host && free > 0 && (
        <div className="mt-5 flex flex-wrap gap-2">
          {machines.map((provider) => !room.players.some((p) => p.machine === provider && !p.left) && (
            <Button key={provider} variant="secondary" size="sm" disabled={Boolean(busy)}
              onClick={() => void run(provider, () => addDuelMachine(room.code, provider))}>
              <LuBot /> Посадить {provider === 'deepl' ? 'DeepL' : 'Google'}
            </Button>
          ))}
        </div>
      )}

      {room.host && (
        <Button className="mt-6 w-full" size="lg" disabled={!canStart(room, left) || Boolean(busy)}
          onClick={() => void run('start', () => startDuelMatch(room.code))}>
          {busy === 'start' ? <Spinner /> : <LuSwords />} Начать матч
        </Button>
      )}
    </Card>
  );
}

// ─── Раунд ───────────────────────────────────────────────────────────────────

function Translate({ room, answers, setAnswers, left, busy, run, muted }: RoomActionProps & {
  answers: Record<string, string>;
  setAnswers: Dispatch<SetStateAction<Record<string, string>>>;
  left: number;
  muted: boolean;
}) {
  const reduced = useReducedMotion() ?? false;
  const sentences = room.sentences ?? [];
  const done = answered({ ...room, answers });
  const ready = everythingAnswered({ ...room, answers });
  const heat = urgency(left);
  const code = room.code;

  // Черновик уходит сам: раунд может кончиться в любую секунду.
  const draft = useRef(answers);
  draft.current = answers;
  const saved = useRef('');
  useEffect(() => {
    const timer = window.setTimeout(() => {
      const body = JSON.stringify(draft.current);
      // Пустой черновик отправлять незачем: пока человек читает фразы, комнату
      // и так опрашивают все за столом.
      if (body === saved.current || !Object.values(draft.current).some((text) => text.trim())) return;
      saved.current = body;
      void saveDuelDraft(code, draft.current).catch(() => { saved.current = ''; });
    }, DRAFT_MS);
    return () => window.clearTimeout(timer);
  }, [answers, code]);

  // Тревога за десять секунд до звонка — один раз, а не каждую секунду.
  const alarmed = useRef(false);
  useEffect(() => {
    if (left <= 10 && left > 0 && !alarmed.current) { alarmed.current = true; playDuel('alarm'); }
  }, [left]);

  function type(id: string, value: string) {
    // Щелчок только на набор: на возврате он звучал бы как ошибка.
    const grew = value.length > (answers[id] ?? '').length;
    setAnswers((current) => ({ ...current, [id]: value }));
    if (grew && !muted) playDuelKey(value.length % 8);
  }

  return (
    <Card className={`p-5 transition-shadow sm:p-7 ${heat === 'hot' ? 'shadow-[0_0_0_2px_var(--accent)]' : ''}`}>
      <div className="flex items-center justify-between gap-3">
        <div>
          <p className="text-sm font-bold text-[var(--accent)]">Раунд {room.round} из {room.rounds}</p>
          <h2 className="mt-1 font-display text-2xl">Переведи пять фраз</h2>
        </div>
        <span className="font-display text-lg tabular-nums text-[var(--text-muted)]">{done}/{sentences.length}</span>
      </div>

      <div className="mt-4 flex gap-1.5" aria-label={`Переведено ${done} из ${sentences.length}`}>
        {sentences.map((sentence, index) => (
          <motion.span
            key={sentence.id}
            className={`h-2 flex-1 rounded-full ${index < done ? 'bg-[var(--accent)]' : 'bg-[var(--bg-sunken)]'}`}
            animate={reduced ? undefined : { scaleY: index < done ? [1, 1.9, 1] : 1 }}
            transition={{ duration: 0.35 }}
          />
        ))}
      </div>

      <div className="mt-6 space-y-5">
        {sentences.map((sentence, index) => {
          const value = answers[sentence.id] ?? '';
          return (
            <motion.label
              key={sentence.id}
              initial={reduced ? false : { opacity: 0, x: -12 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ delay: index * 0.06, ease: [0.22, 1, 0.36, 1] }}
              className="block"
            >
              <span className="flex items-start gap-2 font-display text-lg">
                <b className="mt-0.5 grid size-6 shrink-0 place-items-center rounded-full bg-[var(--bg-sunken)] text-xs text-[var(--accent)]">
                  {index + 1}
                </b>
                <span className="min-w-0 break-words [overflow-wrap:anywhere]">{sentence.text}</span>
                <AnimatePresence>
                  {value.trim() && (
                    <motion.span
                      initial={{ scale: 0 }} animate={{ scale: 1 }} exit={{ scale: 0 }}
                      className="ml-auto mt-0.5 shrink-0 text-[var(--success)]"
                    >
                      <LuCheck className="size-4" />
                    </motion.span>
                  )}
                </AnimatePresence>
              </span>
              <textarea
                value={value}
                onChange={(event) => type(sentence.id, event.target.value)}
                maxLength={600}
                rows={2}
                className="duel-input mt-2 min-h-20 resize-y"
                placeholder={room.direction === 'sr-ru' ? 'Перевод на русский' : 'Prevod na srpski'}
              />
            </motion.label>
          );
        })}
      </div>

      <Button className="mt-6 w-full" size="lg" disabled={!ready || Boolean(busy)}
        onClick={() => void run('ready', async () => {
          try {
            await saveDuelDraft(room.code, draft.current);
          } catch {
            // Пакетная запись не доехала — сдаём по фразе, как делали раньше.
            // Молча не сдать раунд хуже, чем сдать его пятью запросами.
            for (const sentence of sentences) {
              await sendDuelAnswer(room.code, sentence.id, draft.current[sentence.id] ?? '');
            }
          }
          playDuel('crit');
          return readyDuel(room.code);
        })}>
        {busy === 'ready' ? <Spinner /> : <LuSend />} Сдать переводы
      </Button>
      <p className="mt-3 text-center text-xs text-[var(--text-muted)]">
        Написанное сохраняется само — звонок не отнимет перевод.
      </p>
    </Card>
  );
}

// ─── Разбор судьи ────────────────────────────────────────────────────────────

function Judging({ room }: { room: DuelRoom }) {
  const reduced = useReducedMotion() ?? false;
  return (
    <Card>
      <DuelWaiting
        title="Gemma сравнивает переводы"
        text="Авторы скрыты даже от судьи: он видит только тексты под метками. Если судья промолчит, победителя выберете вы сами."
      >
        <motion.div
          animate={reduced ? undefined : { y: [0, -7, 0], rotate: [-1.5, 1.5, -1.5] }}
          transition={{ duration: 2, repeat: Infinity, ease: 'easeInOut' }}
        >
          <Fighter pose="judge" className="mx-auto w-24" />
        </motion.div>
        <ShuffleDeck count={seated(room).length} />
      </DuelWaiting>
    </Card>
  );
}

// ─── Голосование ─────────────────────────────────────────────────────────────

function Vote({ room, busy, run }: RoomActionProps) {
  const reduced = useReducedMotion() ?? false;
  const rest = unvoted(room);

  return (
    <div className="min-w-0 space-y-4">
      <div>
        <h2 className="font-display text-2xl">Выбери лучший перевод</h2>
        <p className="mt-1 text-[var(--text-muted)]">
          Судья не ответил, поэтому решаете вы. Авторы откроются после голосования.
        </p>
      </div>

      {(room.ballot ?? []).map((item, order) => {
        const choice = room.votes?.[item.sentenceId];
        return (
          <motion.div
            key={item.sentenceId}
            initial={reduced ? false : { opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: order * 0.08, ease: [0.22, 1, 0.36, 1] }}
          >
            <Card className="min-w-0 p-5">
              <p className="break-words font-display text-lg [overflow-wrap:anywhere]">{item.text}</p>
              <div className="mt-4 grid min-w-0 gap-2">
                {item.options.map((option, index) => {
                  const mine = choice === option.alias;
                  return (
                    <motion.button
                      key={option.alias}
                      type="button"
                      disabled={Boolean(choice) || Boolean(busy)}
                      onClick={() => void run(`vote-${item.sentenceId}`, () => {
                        playDuel('hit');
                        return voteDuel(room.code, item.sentenceId, option.alias);
                      })}
                      initial={reduced ? false : { rotateX: -70, opacity: 0 }}
                      animate={{ rotateX: 0, opacity: choice && !mine ? 0.45 : 1 }}
                      transition={{ delay: order * 0.08 + index * 0.09, duration: 0.4 }}
                      whileHover={choice || reduced ? undefined : { y: -3 }}
                      className={[
                        'relative min-w-0 whitespace-pre-wrap break-words rounded-xl border p-4 text-left',
                        '[overflow-wrap:anywhere] transition-colors',
                        mine
                          ? 'border-[var(--accent)] bg-[var(--accent)]/10'
                          : 'border-[var(--line)] hover:border-[var(--accent)]',
                      ].join(' ')}
                    >
                      {option.text}
                      <AnimatePresence>
                        {mine && (
                          <motion.span
                            className="absolute -right-2 -top-2 grid size-8 place-items-center rounded-full border-2 border-[var(--accent)] bg-[var(--bg-raised)] text-[var(--accent)]"
                            initial={reduced ? false : { scale: 2.4, rotate: -30, opacity: 0 }}
                            animate={{ scale: 1, rotate: -12, opacity: 1 }}
                            transition={{ type: 'spring', stiffness: 500, damping: 18 }}
                          >
                            <LuCheck className="size-4" />
                          </motion.span>
                        )}
                      </AnimatePresence>
                    </motion.button>
                  );
                })}
              </div>
            </Card>
          </motion.div>
        );
      })}

      <p className="text-center text-sm text-[var(--text-muted)]">
        {rest > 0 ? `Осталось голосов: ${rest}` : 'Голоса отданы — ждём остальных.'}
      </p>
    </div>
  );
}

// ─── Разбор раунда ───────────────────────────────────────────────────────────

function Result({ room }: { room: DuelRoom }) {
  const reduced = useReducedMotion() ?? false;
  const items = room.reveal ?? [];
  const [open, setOpen] = useState(reduced ? items.length : 0);

  useEffect(() => {
    if (reduced || open >= items.length) return;
    const timer = window.setTimeout(() => {
      setOpen((value) => value + 1);
      playDuel('guard');
    }, REVEAL_MS);
    return () => window.clearTimeout(timer);
  }, [items.length, open, reduced]);

  return (
    <div className="min-w-0 space-y-4">
      <div>
        <p className="text-sm font-bold text-[var(--accent)]">Раунд {room.round} завершён</p>
        <h2 className="font-display text-2xl">Разбор переводов</h2>
        {room.summary && (
          <p className="mt-2 break-words text-[var(--text-muted)] [overflow-wrap:anywhere]">{room.summary}</p>
        )}
      </div>

      {items.slice(0, open).map((item) => (
        <motion.div
          key={item.sentenceId}
          initial={reduced ? false : { opacity: 0, y: 24 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.45, ease: [0.22, 1, 0.36, 1] }}
        >
          <Card className="min-w-0 p-5">
            <p className="break-words font-display text-lg [overflow-wrap:anywhere]">{item.text}</p>
            <div className="mt-4 min-w-0 space-y-2">
              {item.answers.map((answer, index) => (
                <motion.div
                  key={answer.playerId}
                  initial={reduced ? false : { opacity: 0, x: -14 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ delay: 0.12 + index * 0.08 }}
                  className={[
                    'relative min-w-0 rounded-xl border p-3',
                    answer.won
                      ? 'border-[var(--color-gold)] bg-[var(--color-gold)]/10'
                      : 'border-[var(--line)]',
                  ].join(' ')}
                >
                  <div className="flex min-w-0 items-center justify-between gap-3">
                    <b className="min-w-0 break-words [overflow-wrap:anywhere]">
                      {answer.name}{answer.you ? ' · ты' : ''}
                    </b>
                    <span className="flex shrink-0 items-center gap-2">
                      {typeof answer.score === 'number' && answer.score > 0 && (
                        <span className="text-sm tabular-nums text-[var(--text-muted)]">{answer.score}</span>
                      )}
                      {answer.won && (
                        <motion.span
                          initial={reduced ? false : { scale: 0, rotate: -30 }}
                          animate={{ scale: 1, rotate: 0 }}
                          transition={{ type: 'spring', stiffness: 420, damping: 15, delay: 0.3 }}
                          className="text-[var(--color-gold)]"
                        >
                          <LuTrophy className="size-4" />
                        </motion.span>
                      )}
                    </span>
                  </div>
                  <p className="mt-1 whitespace-pre-wrap break-words [overflow-wrap:anywhere]">{answer.text}</p>
                </motion.div>
              ))}
            </div>
            {item.feedback && (
              <p className="mt-3 break-words text-sm text-[var(--text-muted)] [overflow-wrap:anywhere]">
                {item.feedback}
              </p>
            )}
          </Card>
        </motion.div>
      ))}

      {open < items.length && (
        <p className="text-center text-sm text-[var(--text-muted)]">Судья читает дальше…</p>
      )}
      {open >= items.length && (
        <p className="text-center text-sm text-[var(--text-muted)]">
          {room.round < room.rounds ? 'Следующий раунд начнётся сам.' : 'Скоро откроется итог матча.'}
        </p>
      )}
    </div>
  );
}

// ─── Итог ────────────────────────────────────────────────────────────────────

function FinishedRoom({ room, onBack }: { room: DuelRoom; onBack: () => void }) {
  const result = outcome(room);
  const rows = room.standings ?? [];
  return (
    <Card className="relative overflow-hidden p-6 text-center sm:p-8">
      {result !== 'lost' && <Confetti />}
      <div className="relative">
        <Fighter pose={result === 'lost' ? 'hurt' : 'trophy'} className="mx-auto w-24" />
        <p className="mt-3 text-sm font-bold uppercase tracking-wide text-[var(--accent)]">Матч завершён</p>
        <h2 className="mt-1 font-display text-3xl">
          {result === 'won' ? 'Ты победил' : result === 'tie' ? 'Ничья' : 'В следующий раз получится'}
        </h2>
        <Ornament className="mx-auto my-5 w-48" count={7} />
        <Podium room={room} />
        {rows.length > 3 && (
          <div className="mx-auto mt-6 max-w-md space-y-2">
            {rows.slice(3).map((row) => (
              <div key={row.id} className="flex rounded-xl bg-[var(--bg-sunken)] px-4 py-2.5 text-sm">
                <b>{row.place}. {row.name}</b>
                <b className="ml-auto tabular-nums">{row.score}</b>
              </div>
            ))}
          </div>
        )}
        <Button className="mt-7" onClick={onBack}>Сыграть ещё</Button>
      </div>
    </Card>
  );
}

// ─── Мелочи ──────────────────────────────────────────────────────────────────

function PageError({ error, onBack }: { error: string; onBack: () => void }) {
  return (
    <main className="mx-auto max-w-lg px-4 py-16">
      <ErrorNote>{error}</ErrorNote>
      <Button className="mt-5" variant="secondary" onClick={onBack}><LuArrowLeft /> К игре</Button>
    </main>
  );
}

function phaseTitle(room: DuelRoom): string {
  if (room.phase === 'lobby') return 'Собираем игроков';
  if (room.phase === 'translate') return `Раунд ${room.round} из ${room.rounds}`;
  if (room.phase === 'judging') return 'Судья читает';
  if (room.phase === 'vote') return 'Голосование';
  if (room.phase === 'result') return 'Результат раунда';
  return 'Итог матча';
}

function curtainLabel(room: DuelRoom): string {
  if (room.phase === 'translate') return 'Поехали';
  if (room.phase === 'vote') return 'Судья промолчал';
  if (room.phase === 'result') return 'Разбор';
  if (room.phase === 'finished') return 'Финал';
  return 'Комната';
}

function directionLabel(direction: string): string {
  return direction === 'ru-sr' ? 'с русского на сербский' : 'с сербского на русский';
}

function message(cause: unknown): string {
  return cause instanceof Error ? cause.message : 'Что-то пошло не так. Попробуй ещё раз.';
}
