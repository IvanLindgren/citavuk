/**
 * «Ты против переводчика» — матч из трёх раундов по пять предложений.
 *
 * Игра была списком из пяти полей ввода. Стало: фразы идут по одной под часы,
 * а разбор пяти переводов открывается по одному, с паузой — пять сравнений,
 * показанных разом, читатель не читает, он их пролистывает.
 *
 * Обстановка общая с матчем на несколько человек: те же часы-кольцо, занавес
 * раунда, тасуемая колода судьи и пьедестал в конце (components/DuelStage.tsx).
 * Сначала это было сделано только за столом, и человек, зашедший играть с
 * DeepL, изменений не видел вовсе — он до стола просто не доходил.
 *
 * Оформление — обычные панели Читавука: пергамент, Lora, акцент сайта на
 * стороне человека и индиго палитры на стороне машины. Была попытка сделать
 * из этого тёмную арену с неоном и искрами; выглядело как чужая игра,
 * вставленная в сайт, и было выброшено. Азарт держат темп и звук, а не
 * подсветка.
 *
 * Счёт бой не трогает. Кто выиграл предложение, по-прежнему решает Gemma или
 * сам человек; полосы показывают ровно это (правила — lib/duelScore.ts).
 */

import { useEffect, useMemo, useRef, useState } from 'react';
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion';
import {
  LuArrowRight,
  LuBot,
  LuChevronLeft,
  LuChevronRight,
  LuCrown,
  LuLanguages,
  LuRotateCcw,
  LuSwords,
  LuUser,
  LuUsers,
  LuVolume2,
  LuVolumeX,
} from 'react-icons/lu';

import {
  judgeTranslationGameRound,
  loadTranslationGameRound,
  type TranslationGameEntry,
  type TranslationGameJudgement,
  type TranslationGameLevel,
  type TranslationGameProvider,
  type TranslationGameVerdict,
  type TranslationGameWinner,
  type TranslationGameDirection,
} from '../api/translationGame';
import type { DuelStanding } from '../api/duel';
import { Fighter, ScoreBar, type Pose } from '../components/DuelArena';
import {
  Confetti, CURTAIN_MS, DuelClock, DuelWaiting, PhaseCurtain, Podium, ShuffleDeck,
} from '../components/DuelStage';
import { Ornament } from '../components/Ornament';
import { Button, Card, Spinner } from '../components/ui';
import {
  blowFor,
  comboStep,
  isComboMilestone,
  rankOf,
  roundOutcome,
  CLOCK_DRAIN,
  ROUND_HP,
  SENTENCE_SECONDS,
} from '../lib/duelScore';
import { duelMuted, playDuel, playDuelKey, preloadDuelSounds, setDuelMuted } from '../lib/duelSounds';
import { useParams } from '../lib/router';
import { useSeo } from '../lib/seo';
import { MultiplayerDuel } from '../components/MultiplayerDuel';

const LEVELS: TranslationGameLevel[] = ['A1', 'A2', 'B1', 'B2', 'C1', 'C2'];
const TOTAL_ROUNDS = 3;

/** Пауза, после которой темп считается сброшенным. */
const IDLE_MS = 950;
const TEMPO_DECAY = 24;
const TEMPO_PER_CHAR = 1.5;
const TEMPO_PER_WORD = 8;

/** Пауза между открытиями пар в разборе. Меньше — сливается. */
const REVEAL_MS = 950;

type Phase = 'setup' | 'translate' | 'choose' | 'resolve' | 'result' | 'finished';

const STAGE_LABEL: Partial<Record<Phase, string>> = {
  choose: 'Чей перевод лучше',
  resolve: 'Разбор раунда',
  result: 'Раунд окончен',
};

/** Направления матча. Сербский→русский стоит первым: это исходная игра. */
const DIRECTIONS: { id: TranslationGameDirection; title: string; hint: string }[] = [
  { id: 'sr-ru', title: 'С сербского на русский', hint: 'Понимание: читаете сербскую фразу' },
  { id: 'ru-sr', title: 'С русского на сербский', hint: 'Порождение: сами строите сербскую фразу' },
];

interface MatchScore {
  user: number;
  translator: number;
  ties: number;
}

interface SoloStart {
  level: TranslationGameLevel;
  direction: TranslationGameDirection;
}

export function TranslationDuel() {
  const { code = '' } = useParams();
  const [solo, setSolo] = useState<SoloStart | null>(null);
  if (code) return <MultiplayerDuel code={code} />;
  if (!solo) return <MultiplayerDuel onSolo={(level, direction) => setSolo({ level, direction })} />;
  return <SoloTranslationDuel start={solo} onLeave={() => setSolo(null)} />;
}

function SoloTranslationDuel({ start, onLeave }: { start: SoloStart; onLeave: () => void }) {
  useSeo({
    title: 'Ты против переводчика — игра с DeepL и Google Translate',
    description: 'Переведите сербские фразы лучше DeepL или Google Translate и попросите Gemma 4 рассудить спор.',
  });

  const reduced = useReducedMotion() ?? false;

  const [level, setLevel] = useState<TranslationGameLevel>(start.level);
  const [provider, setProvider] = useState<TranslationGameProvider>('deepl');
  const [direction, setDirection] = useState<TranslationGameDirection>(start.direction);
  const [roundNumber, setRoundNumber] = useState(1);
  const [round, setRound] = useState<Awaited<ReturnType<typeof loadTranslationGameRound>> | null>(null);
  const [answers, setAnswers] = useState<string[]>([]);
  const [index, setIndex] = useState(0);
  const [phase, setPhase] = useState<Phase>('setup');
  const [verdicts, setVerdicts] = useState<TranslationGameVerdict[]>([]);
  const [summary, setSummary] = useState('');
  const [score, setScore] = useState<MatchScore>({ user: 0, translator: 0, ties: 0 });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const [heroScore, setHeroScore] = useState(ROUND_HP);
  const [foeScore, setFoeScore] = useState(ROUND_HP);
  const [tempo, setTempo] = useState(0);
  const [streak, setStreak] = useState(0);
  const [best, setBest] = useState(0);
  const [timeLeft, setTimeLeft] = useState(SENTENCE_SECONDS);
  const [pose, setPose] = useState<Pose>('smug');
  const [shown, setShown] = useState(0);
  /** Очки стиля за раунд: темп уходит сюда, а не в счёт. */
  const [style, setStyle] = useState(0);
  const [muted, setMuted] = useState(() => duelMuted());
  /** Занавес фазы: держится CURTAIN_MS и уходит сам. */
  const [curtain, setCurtain] = useState<{ label: string; title: string } | null>(null);

  const inputRef = useRef<HTMLInputElement>(null);
  const lastKeyRef = useRef(0);
  const alarmedRef = useRef(false);
  /** Темп на момент разбора: после набора он остывает, а стиль считается по нему. */
  const lockedTempoRef = useRef(0);
  const timers = useRef<number[]>([]);

  const later = (ms: number, run: () => void) => {
    timers.current.push(window.setTimeout(run, ms));
  };
  const clearTimers = () => {
    for (const id of timers.current) window.clearTimeout(id);
    timers.current = [];
  };
  useEffect(() => clearTimers, []);

  const announce = (label: string, title: string) => {
    setCurtain({ label, title });
    later(CURTAIN_MS, () => setCurtain(null));
  };

  const translatorName = provider === 'deepl' ? 'DeepL' : 'Google Translate';
  // Направление матча берётся из ответа сервера, а не из состояния формы:
  // переключи его во время раунда — и подписи разошлись бы с фразами.
  const activeDirection = round?.direction ?? direction;
  const toSerbian = activeDirection === 'ru-sr';
  const targetLabel = toSerbian ? 'Ваш перевод на сербский' : 'Ваш перевод на русский';
  const stageLabel = toSerbian ? 'Переведите на сербский' : 'Переведите на русский';
  const sentences = round?.sentences ?? [];
  const allFilled =
    sentences.length > 0 && answers.length === sentences.length && answers.every((answer) => answer.trim().length > 0);
  const manualComplete = verdicts.length === sentences.length && sentences.length > 0;
  const roundScore = useMemo(() => countVerdicts(verdicts), [verdicts]);

  useEffect(() => {
    if (phase !== 'translate') return;
    const id = window.setInterval(() => {
      if (performance.now() - lastKeyRef.current > IDLE_MS) {
        setTempo((current) => Math.max(0, current - TEMPO_DECAY / 10));
        setStreak(0);
      }
      setTimeLeft((left) => Math.max(0, left - 0.1));
    }, 100);
    return () => window.clearInterval(id);
  }, [phase]);

  // Звук и перехват отдельно от тика: внутри функции обновления состояния им
  // не место — React вправе вызвать её дважды, и сирена звучала бы парой.
  useEffect(() => {
    if (phase !== 'translate') return;
    if (timeLeft > 0 && timeLeft <= 6 && !alarmedRef.current) {
      alarmedRef.current = true;
      playDuel('alarm');
    }
    if (timeLeft === 0) intercept();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase, timeLeft]);

  useEffect(() => {
    if (phase !== 'translate' || pose === 'hurt') return;
    if (timeLeft <= 6) setPose('hurry');
    else if (streak >= 12) setPose('rhythm');
    else if (streak > 0) setPose('typing');
    else setPose(answers[index] ? 'listen' : 'smug');
  }, [answers, index, phase, pose, streak, timeLeft]);

  /** Время фразы вышло. Счёт это не трогает — сгорает темп. */
  const intercept = () => {
    playDuel('guard');
    setPose('hurt');
    setTempo((current) => current * CLOCK_DRAIN);
    setStreak(0);
    setTimeLeft(SENTENCE_SECONDS);
    alarmedRef.current = false;
    later(700, () => setPose((current) => (current === 'hurt' ? 'think' : current)));
  };

  const onType = (next: string) => {
    const previous = answers[index] ?? '';
    setAnswers((current) => current.map((value, at) => (at === index ? next : value)));
    const grew = next.length - previous.length;
    if (grew <= 0) {
      lastKeyRef.current = performance.now();
      return;
    }

    const now = performance.now();
    const chained = now - lastKeyRef.current <= IDLE_MS;
    lastKeyRef.current = now;

    const run = (chained ? streak : 0) + grew;
    setStreak(run);
    setBest((top) => Math.max(top, run));

    const finishedWord = next.endsWith(' ') && !previous.endsWith(' ') && previous.trim().length > 0;
    setTempo((current) => Math.min(100, current + TEMPO_PER_CHAR * grew + (finishedWord ? TEMPO_PER_WORD : 0)));

    playDuelKey(comboStep(run));
    if (isComboMilestone(run)) playDuel('combo');
  };

  const goTo = (next: number) => {
    if (next < 0 || next >= sentences.length) return;
    setIndex(next);
    setTimeLeft(SENTENCE_SECONDS);
    alarmedRef.current = false;
    lastKeyRef.current = performance.now();
    later(60, () => inputRef.current?.focus());
  };

  const confirmSentence = () => {
    if (!(answers[index] ?? '').trim()) return;
    if (index + 1 < sentences.length) {
      goTo(index + 1);
      return;
    }
    if (!allFilled) {
      const gap = answers.findIndex((answer) => !answer.trim());
      if (gap >= 0) goTo(gap);
      return;
    }
    lockedTempoRef.current = tempo;
    setPhase('choose');
    playDuel('start');
    announce('Переводы готовы', 'Чей лучше');
  };

  /**
   * Разбор: пары открываются по одной.
   *
   * Так видно, где вы взяли своё и где отдали. Все пять разом — это стена
   * текста, которую пролистывают.
   */
  const runReveal = (list: TranslationGameVerdict[]) => {
    setPhase('resolve');
    setShown(0);
    setStyle(0);
    let hero = ROUND_HP;
    let foe = ROUND_HP;
    let total = 0;

    list.forEach((verdict, order) => {
      later(300 + order * REVEAL_MS, () => {
        const blow = blowFor(verdict.winner, lockedTempoRef.current);
        hero = Math.max(0, hero - blow.toHero);
        foe = Math.max(0, foe - blow.toFoe);
        total += blow.style;
        setHeroScore(hero);
        setFoeScore(foe);
        setStyle(total);
        setShown(order + 1);

        if (verdict.winner === 'user') {
          playDuel(blow.crit ? 'crit' : 'hit');
          setPose('strike');
        } else if (verdict.winner === 'translator') {
          playDuel('hit', 0.82);
          setPose('hurt');
        } else {
          playDuel('guard');
          setPose('inspect');
        }
      });
    });

    later(300 + list.length * REVEAL_MS + 300, () => {
      const outcome = roundOutcome(hero, foe);
      playDuel(outcome === 'user' ? 'victory' : outcome === 'translator' ? 'defeat' : 'combo');
      setPose(outcome === 'user' ? 'trophy' : outcome === 'translator' ? 'think' : 'compare');
      setPhase('result');
    });
  };

  const startRound = async (number: number) => {
    setLoading(true);
    setError('');
    try {
      const next = await loadTranslationGameRound(level, number, provider, direction);
      clearTimers();
      setRound(next);
      setRoundNumber(number);
      setAnswers(Array.from({ length: next.sentences.length }, () => ''));
      setVerdicts([]);
      setSummary('');
      setIndex(0);
      setHeroScore(ROUND_HP);
      setFoeScore(ROUND_HP);
      setTempo(0);
      setStreak(0);
      setBest(0);
      setShown(0);
      setStyle(0);
      setTimeLeft(SENTENCE_SECONDS);
      alarmedRef.current = false;
      lastKeyRef.current = performance.now();
      setPose('taunt');
      setPhase('translate');
      playDuel('start');
      announce('Поехали', `Раунд ${number} из ${TOTAL_ROUNDS}`);
      later(120, () => inputRef.current?.focus());
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Не удалось начать раунд.');
      setPhase('setup');
    } finally {
      setLoading(false);
    }
  };

  const askGemma = async () => {
    if (!round || !allFilled) return;
    setLoading(true);
    setError('');
    setPose('study');
    try {
      const result: TranslationGameJudgement = await judgeTranslationGameRound(
        round.sentences.map((sentence, at): TranslationGameEntry => ({
          source: sentence.text,
          userTranslation: answers[at] ?? '',
          translatorTranslation: sentence.translatorTranslation,
        })),
        direction,
      );
      const sorted = [...result.verdicts].sort((a, b) => a.index - b.index);
      setVerdicts(sorted);
      setSummary(result.summary);
      runReveal(sorted);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Gemma 4 не ответила.');
      setPose('think');
    } finally {
      setLoading(false);
    }
  };

  const chooseManual = (at: number, winner: TranslationGameWinner) => {
    setVerdicts((current) =>
      [
        ...current.filter((item) => item.index !== at),
        {
          index: at,
          winner,
          userScore: winner === 'user' ? 10 : winner === 'tie' ? 8 : 6,
          translatorScore: winner === 'translator' ? 10 : winner === 'tie' ? 8 : 6,
          feedback: 'Оценено вами.',
        },
      ].sort((a, b) => a.index - b.index),
    );
  };

  const finishManual = () => {
    if (!manualComplete) return;
    setSummary('Вы сами сравнили точность и естественность пяти переводов.');
    runReveal(verdicts);
  };

  const nextRound = () => {
    const nextScore = addScore(score, roundScore);
    setScore(nextScore);
    if (roundNumber >= TOTAL_ROUNDS) {
      setPhase('finished');
      playDuel(nextScore.user >= nextScore.translator ? 'victory' : 'defeat');
      return;
    }
    void startRound(roundNumber + 1);
  };

  const restart = () => {
    clearTimers();
    setRound(null);
    setAnswers([]);
    setVerdicts([]);
    setSummary('');
    setScore({ user: 0, translator: 0, ties: 0 });
    setRoundNumber(1);
    setPhase('setup');
    setError('');
  };

  const toggleSound = () => {
    const next = !muted;
    setMuted(next);
    setDuelMuted(next);
  };

  if (phase === 'setup') {
    return (
      <Setup
        level={level}
        provider={provider}
        direction={direction}
        loading={loading}
        error={error}
        onLevel={setLevel}
        onProvider={setProvider}
        onDirection={setDirection}
        onStart={() => void startRound(1)}
        onLeave={onLeave}
      />
    );
  }

  if (phase === 'finished') {
    return (
      <Finished
        score={addScore(score, roundScore)}
        translatorName={translatorName}
        provider={provider}
        onRestart={restart}
        onLeave={onLeave}
      />
    );
  }

  if (!round) return null;

  const sentence = sentences[index];
  const outcome = roundOutcome(heroScore, foeScore);
  // В разборе счёт растёт вместе с открытыми парами, а не прыгает сразу.
  const revealed = phase === 'resolve' ? verdicts.slice(0, shown) : verdicts;
  const running = timeLeft / SENTENCE_SECONDS;
  const burning = phase === 'translate' && timeLeft <= 6;

  return (
    <main className="mx-auto w-full max-w-3xl px-5 py-8 sm:py-12">
      {curtain && <PhaseCurtain key={curtain.title} label={curtain.label} title={curtain.title} />}

      <button type="button" onClick={restart} className="inline-flex items-center gap-1.5 text-sm font-semibold text-[var(--accent)]">
        <LuChevronLeft className="size-4" />
        Выйти из матча
      </button>

      {/* Рамка карточки краснеет на последних секундах: человек смотрит в поле
          ввода, и часы он замечает только боковым зрением. */}
      <Card
        className="paper-grain mt-5 px-5 py-6 transition-colors sm:px-8 sm:py-8"
        style={burning ? { borderColor: 'var(--accent)' } : undefined}
      >
        <div className="relative flex items-start justify-between gap-4">
          <div className="flex min-w-0 flex-1 flex-wrap items-center gap-x-2 gap-y-1 text-xs font-bold uppercase tracking-wide text-[var(--accent)]">
            <span>{level}</span>
            <MatchMetaOrnament />
            <span>Раунд {roundNumber} из {TOTAL_ROUNDS}</span>
            {phase === 'translate' && (
              <>
                <MatchMetaOrnament />
                <span>Фраза {index + 1} из {sentences.length}</span>
              </>
            )}
          </div>
          <button
            type="button"
            onClick={toggleSound}
            aria-label={muted ? 'Включить звук' : 'Выключить звук'}
            className="-mt-1 shrink-0 text-[var(--text-muted)] transition-colors hover:text-[var(--accent)]"
          >
            {muted ? <LuVolumeX className="size-4" /> : <LuVolume2 className="size-4" />}
          </button>
          {phase === 'translate' && (
            <DuelClock seconds={Math.ceil(timeLeft)} total={SENTENCE_SECONDS} />
          )}
        </div>

        <div className="relative mt-4">
          <ScoreBar
            hero={heroScore}
            foe={foeScore}
            max={ROUND_HP}
            wonHero={revealed.filter((item) => item.winner === 'user').length}
            wonFoe={revealed.filter((item) => item.winner === 'translator').length}
            foeName={translatorName}
          />
        </div>

        <div className="relative mt-7 flex items-start gap-4 sm:gap-6">
          <Fighter pose={pose} className="w-16 shrink-0 sm:w-20" />
          <div className="min-w-0 flex-1">
            <p className="text-xs font-bold uppercase tracking-wide text-[var(--text-muted)]">
              {phase === 'translate' ? stageLabel : STAGE_LABEL[phase]}
            </p>
            {phase === 'result' ? (
              <h2 className="mt-2 text-2xl sm:text-3xl">
                {outcome === 'user' ? 'Раунд ваш' : outcome === 'translator' ? `Раунд за ${translatorName}` : 'Раунд вничью'}
              </h2>
            ) : (
              <p className="mt-2 font-display text-xl leading-8 sm:text-2xl">
                {phase === 'translate'
                  ? (sentence?.text ?? '')
                  : phase === 'resolve' && shown > 0
                    ? (sentences[shown - 1]?.text ?? '')
                    : 'Отметьте, чей перевод точнее и живее, или доверьте это Gemma 4.'}
              </p>
            )}
          </div>
        </div>

        {phase === 'translate' && (
          <div className="relative mt-6">
            {/* Полоса времени во всю ширину — та же, что за столом матча.
                Цифры отсчёта висят на кольце в шапке. */}
            <div className="h-1 overflow-hidden rounded-full bg-[var(--bg-sunken)]">
              <div
                className="h-full rounded-full transition-[width] duration-100 ease-linear"
                style={{
                  width: `${running * 100}%`,
                  background: burning ? 'var(--accent)' : 'var(--line)',
                }}
              />
            </div>

            <div className="mt-4 flex items-center gap-2">
              <button
                type="button"
                onClick={() => goTo(index - 1)}
                disabled={index === 0}
                aria-label="Предыдущая фраза"
                className="grid size-11 shrink-0 place-items-center rounded-md text-[var(--text-muted)] hover:bg-[var(--bg-sunken)] disabled:opacity-30"
              >
                <LuChevronLeft className="size-5" />
              </button>
              <label htmlFor="duel-answer" className="sr-only">
                Ваш перевод фразы {index + 1}
              </label>
              <input
                id="duel-answer"
                ref={inputRef}
                value={answers[index] ?? ''}
                onChange={(event) => onType(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === 'Enter') {
                    event.preventDefault();
                    confirmSentence();
                  }
                }}
                maxLength={600}
                autoComplete="off"
                placeholder={targetLabel}
                className="min-w-0 flex-1 rounded-md border border-[var(--line)] bg-[var(--bg-raised)] px-3 py-2.5 outline-none focus:border-[var(--accent)]"
              />
              <Button size="sm" onClick={confirmSentence} disabled={!(answers[index] ?? '').trim()} className="shrink-0">
                {index + 1 < sentences.length ? <>Дальше<LuChevronRight /></> : <>К разбору<LuArrowRight /></>}
              </Button>
            </div>

            <div className="mt-3 flex items-center gap-3">
              <span className="text-xs text-[var(--text-muted)]">Темп</span>
              <div className="h-1 max-w-32 flex-1 overflow-hidden rounded-full bg-[var(--bg-sunken)]">
                <div
                  className="h-full rounded-full bg-[var(--color-gold)] transition-[width] duration-150 ease-out"
                  style={{ width: `${tempo}%` }}
                />
              </div>
              <span className="text-xs tabular-nums text-[var(--text-muted)]">
                {streak > 1 ? `серия ${streak}` : ''}
              </span>
              <span className="ml-auto flex gap-1" aria-hidden>
                {sentences.map((item, at) => (
                  <span
                    key={item.id}
                    className={`size-1.5 rounded-full ${
                      at === index
                        ? 'bg-[var(--accent)]'
                        : (answers[at] ?? '').trim()
                          ? 'bg-[var(--accent)]/35'
                          : 'bg-[var(--line)]'
                    }`}
                  />
                ))}
              </span>
            </div>
          </div>
        )}

        {/* Пока Gemma читает, панель сравнений уходит: пустая страница с
            крутящимся кружком в кнопке читается как зависший сайт. */}
        {phase === 'choose' && loading && (
          <div className="relative mt-4">
            <DuelWaiting
              title="Gemma сравнивает переводы"
              text="Судья не знает, где чей перевод: он видит только два текста под метками."
            >
              <motion.div
                animate={reduced ? undefined : { y: [0, -7, 0], rotate: [-1.5, 1.5, -1.5] }}
                transition={{ duration: 2, repeat: Infinity, ease: 'easeInOut' }}
              >
                <Fighter pose="study" className="mx-auto w-20" />
              </motion.div>
              <ShuffleDeck count={sentences.length} />
            </DuelWaiting>
          </div>
        )}

        {phase !== 'translate' && !(phase === 'choose' && loading) && (
          <div className="relative mt-6 space-y-3">
            {sentences.map((item, at) => {
              const verdict = verdicts.find((entry) => entry.index === at);
              const open = phase !== 'resolve' || at < shown;
              return (
                <Pair
                  key={item.id}
                  order={at}
                  source={item.text}
                  mine={answers[at] ?? ''}
                  machine={item.translatorTranslation}
                  translatorName={translatorName}
                  verdict={open ? verdict : undefined}
                  open={open}
                  reduced={reduced}
                  onChoose={phase === 'choose' ? (winner) => chooseManual(at, winner) : undefined}
                  showFeedback={phase === 'result'}
                />
              );
            })}

            {error && (
              <p role="alert" className="rounded-md border border-[var(--error)]/30 bg-[var(--error-soft)] px-4 py-3 text-sm">
                {error}
              </p>
            )}

            {phase === 'choose' && (
              <div className="flex flex-wrap gap-3 pt-1">
                <Button variant="secondary" disabled={loading || !round.judgeEnabled} onClick={() => void askGemma()}>
                  {loading ? <Spinner className="size-5" /> : <LuBot />}
                  Спросить Gemma 4
                </Button>
                <Button disabled={!manualComplete} onClick={finishManual}>
                  <LuSwords />
                  Принять мою оценку
                </Button>
              </div>
            )}

            {phase === 'result' && (
              <div className="border-t border-[var(--line)] pt-5">
                <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-sm">
                  <span className="font-semibold">
                    {roundScore.user} : {roundScore.translator}
                  </span>
                  {style > 0 && <span className="text-[var(--text-muted)]">ранг {rankOf(style)}</span>}
                  {best > 1 && <span className="text-[var(--text-muted)]">лучшая серия {best}</span>}
                </div>
                {summary && <p className="mt-3 leading-7 text-[var(--text-muted)]">{summary}</p>}
                <div className="mt-5">
                  <Button onClick={nextRound}>
                    {roundNumber === TOTAL_ROUNDS ? 'Завершить матч' : 'Следующий раунд'}
                    <LuArrowRight />
                  </Button>
                </div>
              </div>
            )}
          </div>
        )}
      </Card>
    </main>
  );
}

/** Компактный разделитель счётчика: тот же мотив вышивки, что на сайте. */
function MatchMetaOrnament() {
  return (
    <Ornament
      count={1}
      animated={false}
      className="h-4 w-5 shrink-0 text-[var(--accent)]/70"
    />
  );
}

/** Пара переводов: ваш и машинный, с отметкой победителя. */
function Pair({
  order,
  source,
  mine,
  machine,
  translatorName,
  verdict,
  open,
  reduced,
  onChoose,
  showFeedback,
}: {
  order: number;
  source: string;
  mine: string;
  machine: string;
  translatorName: string;
  verdict?: TranslationGameVerdict;
  open: boolean;
  reduced: boolean;
  onChoose?: (winner: TranslationGameWinner) => void;
  showFeedback: boolean;
}) {
  // Закрытая пара не просто бледная: она ещё и лежит чуть ниже и мельче, а в
  // момент открытия подскакивает. Одной прозрачности глаз не ловит, и разбор
  // читался как список, который просто посветлел.
  return (
    <motion.div
      animate={{
        opacity: open ? 1 : 0.3,
        y: open ? 0 : 8,
        scale: open ? 1 : 0.985,
      }}
      transition={{ duration: reduced ? 0 : 0.42, ease: [0.22, 1, 0.36, 1] }}
      className="rounded-md border p-4 transition-colors"
      style={{ borderColor: open && verdict ? 'var(--color-gold)' : 'var(--line)' }}
    >
      <p className="font-display leading-7">
        <span className="mr-2 text-sm text-[var(--text-muted)]">{order + 1}</span>
        {source}
      </p>
      <div className="mt-3 grid gap-2 sm:grid-cols-2">
        <SideBox icon={LuUser} label="Ваш перевод" text={mine} color="var(--accent)" won={verdict?.winner === 'user'} />
        <SideBox icon={LuBot} label={translatorName} text={machine} color="var(--machine)" won={verdict?.winner === 'translator'} />
      </div>
      {onChoose && (
        <div className="mt-3 grid grid-cols-3 gap-2">
          <Pick active={verdict?.winner === 'user'} onClick={() => onChoose('user')}>Я</Pick>
          <Pick active={verdict?.winner === 'tie'} onClick={() => onChoose('tie')}>Ничья</Pick>
          <Pick active={verdict?.winner === 'translator'} onClick={() => onChoose('translator')}>{translatorName}</Pick>
        </div>
      )}
      <AnimatePresence>
        {showFeedback && verdict && (
          <motion.p
            initial={reduced ? false : { opacity: 0 }}
            animate={{ opacity: 1 }}
            className="mt-3 rounded-md bg-[var(--bg-sunken)] px-3 py-2 text-sm leading-6"
          >
            <strong>{winnerLabel(verdict.winner, translatorName)}</strong> · {verdict.userScore.toFixed(1)} :{' '}
            {verdict.translatorScore.toFixed(1)}. {verdict.feedback}
          </motion.p>
        )}
      </AnimatePresence>
    </motion.div>
  );
}

function SideBox({
  icon: Icon,
  label,
  text,
  color,
  won,
}: {
  icon: typeof LuUser;
  label: string;
  text: string;
  color: string;
  won: boolean;
}) {
  const reduced = useReducedMotion() ?? false;
  return (
    <motion.div
      // Победившая сторона коротко подскакивает: в разборе пары открываются
      // одна за другой, и без толчка непонятно, какая из них только что взяла
      // очко.
      animate={won && !reduced ? { scale: [1, 1.03, 1] } : undefined}
      transition={{ duration: 0.45, ease: 'easeOut' }}
      className="rounded-md border p-3 transition-colors"
      style={{
        borderColor: won ? color : 'var(--line)',
        background: won ? `color-mix(in srgb, ${color} 7%, transparent)` : undefined,
      }}
    >
      <p className="flex items-center gap-1.5 text-xs font-bold uppercase" style={{ color: won ? color : 'var(--text-muted)' }}>
        <Icon className="size-3.5" />
        {label}
        {won && <LuCrown className="size-3.5" />}
      </p>
      <p className="mt-1.5 leading-6">{text}</p>
    </motion.div>
  );
}

function Pick({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`min-h-11 truncate rounded-md border px-2 text-sm font-semibold transition-colors ${
        active ? 'border-[var(--accent)] bg-[var(--accent)] text-parchment' : 'border-[var(--line)] hover:border-[var(--accent)]'
      }`}
    >
      {children}
    </button>
  );
}

function Setup({
  level,
  provider,
  direction,
  loading,
  error,
  onLevel,
  onProvider,
  onDirection,
  onStart,
  onLeave,
}: {
  level: TranslationGameLevel;
  provider: TranslationGameProvider;
  direction: TranslationGameDirection;
  loading: boolean;
  error: string;
  onLevel: (value: TranslationGameLevel) => void;
  onProvider: (value: TranslationGameProvider) => void;
  onDirection: (value: TranslationGameDirection) => void;
  onStart: () => void;
  onLeave: () => void;
}) {
  return (
    <main className="mx-auto w-full max-w-3xl px-5 py-8 sm:py-12">
      {/* Назад — в меню игры, а не в тренажёрку: уровень и направление сюда
          пришли оттуда, и менять их удобнее там же. */}
      <button
        type="button"
        onClick={onLeave}
        className="inline-flex items-center gap-1.5 text-sm font-semibold text-[var(--accent)]"
      >
        <LuChevronLeft className="size-4" /> К выбору игры
      </button>

      <header className="mt-6 flex items-start gap-5">
        <Fighter pose="taunt" className="hidden w-24 shrink-0 sm:block" />
        <div>
          <h1 className="text-3xl sm:text-4xl">Матч с машиной</h1>
          <p className="mt-4 max-w-xl text-lg leading-8 text-[var(--text-muted)]">
            Три раунда по пять фраз. Сначала переводите вы под часы, затем открывается ответ машины.
            Победителя выбираете сами или Gemma 4.
          </p>
        </div>
      </header>

      <Card className="mt-8 px-5 py-6 sm:px-8 sm:py-7">
        <fieldset>
          <legend className="text-sm font-bold">Уровень сербского</legend>
          <div className="mt-3 grid grid-cols-3 gap-2 sm:grid-cols-6">
            {LEVELS.map((item) => (
              <button
                key={item}
                type="button"
                onClick={() => onLevel(item)}
                className={`min-h-11 rounded-md border font-bold transition-colors ${
                  level === item
                    ? 'border-[var(--accent)] bg-[var(--accent)] text-parchment'
                    : 'border-[var(--line)] hover:border-[var(--accent)]'
                }`}
              >
                {item}
              </button>
            ))}
          </div>
        </fieldset>

        <fieldset className="mt-7">
          <legend className="text-sm font-bold">Направление</legend>
          <div className="mt-3 grid gap-2 sm:grid-cols-2">
            {DIRECTIONS.map((item) => (
              <button
                key={item.id}
                type="button"
                onClick={() => onDirection(item.id)}
                aria-pressed={direction === item.id}
                className={`min-h-14 rounded-md border px-4 py-3 text-left transition-colors ${
                  direction === item.id
                    ? 'border-[var(--accent)] bg-[var(--accent)]/8'
                    : 'border-[var(--line)] hover:border-[var(--accent)]'
                }`}
              >
                <span className="block font-bold">{item.title}</span>
                <span className="mt-0.5 block text-xs text-[var(--text-muted)]">{item.hint}</span>
              </button>
            ))}
          </div>
        </fieldset>

        <fieldset className="mt-7">
          <legend className="text-sm font-bold">Соперник</legend>
          <div className="mt-3 grid gap-2 sm:grid-cols-2">
            {(['deepl', 'google'] as TranslationGameProvider[]).map((item) => (
              <button
                key={item}
                type="button"
                onClick={() => onProvider(item)}
                className={`flex min-h-14 items-center gap-3 rounded-md border px-4 text-left font-bold transition-colors ${
                  provider === item
                    ? 'border-[var(--machine)] bg-[var(--machine)]/8 text-[var(--machine)]'
                    : 'border-[var(--line)] hover:border-[var(--machine)]'
                }`}
              >
                <LuLanguages className="size-5" />
                {item === 'deepl' ? 'DeepL' : 'Google Translate'}
              </button>
            ))}
          </div>
        </fieldset>

        {error && (
          <p role="alert" className="mt-5 rounded-md border border-[var(--error)]/30 bg-[var(--error-soft)] px-4 py-3 text-sm">
            {error}
          </p>
        )}

        {/* Звуки тянутся заранее, по наведению: набор весит около двухсот
            килобайт, и первый удар не должен ждать загрузки. */}
        <Button
          className="mt-7 w-full"
          size="lg"
          disabled={loading}
          onClick={onStart}
          onMouseEnter={preloadDuelSounds}
          onFocus={preloadDuelSounds}
        >
          {loading ? <Spinner className="size-5" /> : <><LuSwords className="size-5" /> Начать матч</>}
        </Button>
      </Card>
    </main>
  );
}

/**
 * Итог матча: тот же пьедестал, что в матче на несколько человек.
 *
 * Столбики растут снизу, и кто выиграл, видно раньше, чем человек разберёт
 * цифры. Конфетти сыплется только победителю: проигравшему праздник в лицо —
 * это издёвка, а не утешение.
 */
function Finished({
  score,
  translatorName,
  provider,
  onRestart,
  onLeave,
}: {
  score: MatchScore;
  translatorName: string;
  provider: TranslationGameProvider;
  onRestart: () => void;
  onLeave: () => void;
}) {
  const won = score.user > score.translator;
  const drawn = score.user === score.translator;
  const rows: DuelStanding[] = [
    { id: 'me', name: 'Ты', score: score.user, place: won || drawn ? 1 : 2 },
    { id: 'foe', name: translatorName, score: score.translator, place: won ? 2 : 1, machine: provider },
  ];

  return (
    <main className="mx-auto w-full max-w-2xl px-5 py-10 sm:py-14">
      <Card className="relative overflow-hidden px-5 py-10 text-center sm:px-8">
        {won && <Confetti />}
        <div className="relative">
          <Fighter pose={won ? 'trophy' : drawn ? 'compare' : 'think'} className="mx-auto w-28" />
          <p className="mt-4 text-xs font-bold uppercase tracking-wide text-[var(--accent)]">Матч завершён</p>
          <h1 className="mt-1 font-display text-3xl sm:text-4xl">
            {won ? 'Ты победил' : drawn ? 'Ничья' : 'В следующий раз получится'}
          </h1>
          <Ornament className="mx-auto my-6 w-48" count={7} />
          <Podium rows={rows} you="me" />
          <p className="mt-6 text-[var(--text-muted)]">
            Ничьих: {score.ties} · всего {TOTAL_ROUNDS * 5} предложений
          </p>
          <div className="mt-7 flex flex-wrap justify-center gap-3">
            <Button size="lg" onClick={onRestart}>
              <LuRotateCcw className="size-5" /> Сыграть ещё
            </Button>
            <Button size="lg" variant="secondary" onClick={onLeave}>
              <LuUsers className="size-5" /> Позвать людей
            </Button>
          </div>
        </div>
      </Card>
    </main>
  );
}

function countVerdicts(verdicts: TranslationGameVerdict[]): MatchScore {
  return verdicts.reduce<MatchScore>(
    (result, verdict) => {
      if (verdict.winner === 'user') result.user += 1;
      else if (verdict.winner === 'translator') result.translator += 1;
      else result.ties += 1;
      return result;
    },
    { user: 0, translator: 0, ties: 0 },
  );
}

function addScore(left: MatchScore, right: MatchScore): MatchScore {
  return {
    user: left.user + right.user,
    translator: left.translator + right.translator,
    ties: left.ties + right.ties,
  };
}

function winnerLabel(winner: TranslationGameWinner, translatorName: string): string {
  if (winner === 'user') return 'Лучше ваш перевод';
  if (winner === 'translator') return `Лучше ${translatorName}`;
  return 'Ничья';
}
