/**
 * «Ты против переводчика» — матч из трёх раундов по пять предложений.
 *
 * Игра была списком из пяти полей ввода. Стало: фразы идут по одной под часы,
 * а разбор пяти переводов открывается по одному, с паузой — пять сравнений,
 * показанных разом, читатель не читает, он их пролистывает.
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
  LuLanguages,
  LuRotateCcw,
  LuSwords,
  LuUser,
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
import { Fighter, ScoreBar, type Pose } from '../components/DuelArena';
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
import { Link } from '../lib/router';
import { useSeo } from '../lib/seo';

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

export function TranslationDuel() {
  useSeo({
    title: 'Ты против переводчика — игра с DeepL и Google Translate',
    description: 'Переведите сербские фразы лучше DeepL или Google Translate и попросите Gemma 4 рассудить спор.',
  });

  const reduced = useReducedMotion() ?? false;

  const [level, setLevel] = useState<TranslationGameLevel>('A2');
  const [provider, setProvider] = useState<TranslationGameProvider>('deepl');
  const [direction, setDirection] = useState<TranslationGameDirection>('sr-ru');
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
      />
    );
  }

  if (phase === 'finished') {
    return <Finished score={addScore(score, roundScore)} translatorName={translatorName} onRestart={restart} />;
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
      <button type="button" onClick={restart} className="inline-flex items-center gap-1.5 text-sm font-semibold text-[var(--accent)]">
        <LuChevronLeft className="size-4" />
        Выйти из матча
      </button>

      <Card className="paper-grain mt-5 px-5 py-6 sm:px-8 sm:py-8">
        <div className="relative flex items-start justify-between gap-4">
          <p className="text-xs font-bold uppercase tracking-wide text-[var(--accent)]">
            {level} · раунд {roundNumber} из {TOTAL_ROUNDS}
            {phase === 'translate' ? ` · фраза ${index + 1} из ${sentences.length}` : ''}
          </p>
          <button
            type="button"
            onClick={toggleSound}
            aria-label={muted ? 'Включить звук' : 'Выключить звук'}
            className="-mt-1 shrink-0 text-[var(--text-muted)] transition-colors hover:text-[var(--accent)]"
          >
            {muted ? <LuVolumeX className="size-4" /> : <LuVolume2 className="size-4" />}
          </button>
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
            {/* Часы фразы. Тонкая линия, а не циферблат: время должно быть
                видно краем глаза, а не тянуть взгляд с текста. */}
            <div className="flex items-center gap-3">
              <div className="h-1 flex-1 overflow-hidden rounded-full bg-[var(--bg-sunken)]">
                <div
                  className="h-full rounded-full transition-[width] duration-100 ease-linear"
                  style={{
                    width: `${running * 100}%`,
                    background: burning ? 'var(--accent)' : 'var(--line)',
                  }}
                />
              </div>
              <span className={`w-8 text-right text-xs tabular-nums ${burning ? 'font-bold text-[var(--accent)]' : 'text-[var(--text-muted)]'}`}>
                {Math.ceil(timeLeft)}
              </span>
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

        {phase !== 'translate' && (
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
  return (
    <motion.div
      animate={{ opacity: open ? 1 : 0.35 }}
      transition={{ duration: reduced ? 0 : 0.3 }}
      className="rounded-md border border-[var(--line)] p-4"
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
  return (
    <div
      className="rounded-md border p-3 transition-colors"
      style={{
        borderColor: won ? color : 'var(--line)',
        background: won ? `color-mix(in srgb, ${color} 7%, transparent)` : undefined,
      }}
    >
      <p className="flex items-center gap-1.5 text-xs font-bold uppercase" style={{ color: won ? color : 'var(--text-muted)' }}>
        <Icon className="size-3.5" />
        {label}
      </p>
      <p className="mt-1.5 leading-6">{text}</p>
    </div>
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
}) {
  return (
    <main className="mx-auto w-full max-w-3xl px-5 py-8 sm:py-12">
      <Link to="/trainer" className="inline-flex items-center gap-1.5 text-sm font-semibold text-[var(--accent)]">
        <LuChevronLeft className="size-4" /> Тренажёрка
      </Link>

      <header className="mt-6 flex items-start gap-5">
        <Fighter pose="taunt" className="hidden w-24 shrink-0 sm:block" />
        <div>
          <h1 className="text-3xl sm:text-4xl">Ты против переводчика</h1>
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

function Finished({ score, translatorName, onRestart }: { score: MatchScore; translatorName: string; onRestart: () => void }) {
  const won = score.user > score.translator;
  const drawn = score.user === score.translator;
  return (
    <main className="mx-auto w-full max-w-2xl px-5 py-14 text-center sm:py-20">
      <Fighter pose={won ? 'trophy' : drawn ? 'compare' : 'think'} className="mx-auto w-32" />
      <p className="mt-6 text-xs font-bold uppercase tracking-wide text-[var(--text-muted)]">Матч завершён</p>
      <h1 className="mt-2 text-3xl sm:text-4xl">
        {won ? 'Вы победили' : drawn ? 'Ничья' : `${translatorName} победил`}
      </h1>
      <p className="mt-6 text-2xl font-bold tabular-nums">
        <span className="text-[var(--accent)]">{score.user}</span>
        <span className="mx-3 text-[var(--text-muted)]">:</span>
        <span className="text-[var(--machine)]">{score.translator}</span>
      </p>
      <p className="mt-2 text-[var(--text-muted)]">Ничьих: {score.ties} · всего 15 предложений</p>
      <Button className="mt-8" size="lg" onClick={onRestart}>
        <LuRotateCcw className="size-5" /> Сыграть ещё
      </Button>
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
