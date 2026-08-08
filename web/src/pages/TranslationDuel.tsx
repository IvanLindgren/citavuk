import { useMemo, useState } from 'react';
import {
  LuArrowRight,
  LuBot,
  LuChevronLeft,
  LuLanguages,
  LuRotateCcw,
  LuSwords,
  LuUser,
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
} from '../api/translationGame';
import { Button, Card, Spinner } from '../components/ui';
import { Link } from '../lib/router';
import { useSeo } from '../lib/seo';

const LEVELS: TranslationGameLevel[] = ['A1', 'A2', 'B1', 'B2', 'C1', 'C2'];
const TOTAL_ROUNDS = 3;

type Phase = 'setup' | 'translate' | 'choose' | 'result' | 'finished';

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

  const [level, setLevel] = useState<TranslationGameLevel>('A2');
  const [provider, setProvider] = useState<TranslationGameProvider>('deepl');
  const [roundNumber, setRoundNumber] = useState(1);
  const [round, setRound] = useState<Awaited<ReturnType<typeof loadTranslationGameRound>> | null>(null);
  const [answers, setAnswers] = useState<string[]>([]);
  const [phase, setPhase] = useState<Phase>('setup');
  const [verdicts, setVerdicts] = useState<TranslationGameVerdict[]>([]);
  const [summary, setSummary] = useState('');
  const [score, setScore] = useState<MatchScore>({ user: 0, translator: 0, ties: 0 });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const translatorName = provider === 'deepl' ? 'DeepL' : 'Google Translate';
  const allFilled = answers.length === 5 && answers.every((answer) => answer.trim().length > 0);
  const manualComplete = verdicts.length === 5;
  const roundScore = useMemo(() => countVerdicts(verdicts), [verdicts]);

  const startRound = async (number: number) => {
    setLoading(true);
    setError('');
    try {
      const next = await loadTranslationGameRound(level, number, provider);
      setRound(next);
      setRoundNumber(number);
      setAnswers(Array.from({ length: next.sentences.length }, () => ''));
      setVerdicts([]);
      setSummary('');
      setPhase('translate');
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Не удалось начать раунд.');
    } finally {
      setLoading(false);
    }
  };

  const askGemma = async () => {
    if (!round || !allFilled) return;
    setLoading(true);
    setError('');
    try {
      const result: TranslationGameJudgement = await judgeTranslationGameRound(
        round.sentences.map((sentence, index): TranslationGameEntry => ({
          source: sentence.text,
          userTranslation: answers[index] ?? '',
          translatorTranslation: sentence.translatorTranslation,
        })),
      );
      setVerdicts([...result.verdicts].sort((a, b) => a.index - b.index));
      setSummary(result.summary);
      setPhase('result');
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Gemma 4 не ответила.');
    } finally {
      setLoading(false);
    }
  };

  const chooseManual = (index: number, winner: TranslationGameWinner) => {
    setVerdicts((current) => [
      ...current.filter((item) => item.index !== index),
      {
        index,
        winner,
        userScore: winner === 'user' ? 10 : winner === 'tie' ? 8 : 6,
        translatorScore: winner === 'translator' ? 10 : winner === 'tie' ? 8 : 6,
        feedback: 'Оценено вами.',
      },
    ].sort((a, b) => a.index - b.index));
  };

  const finishManual = () => {
    if (!manualComplete) return;
    setSummary('Вы сами сравнили точность и естественность пяти переводов.');
    setPhase('result');
  };

  const nextRound = () => {
    const nextScore = addScore(score, roundScore);
    setScore(nextScore);
    if (roundNumber >= TOTAL_ROUNDS) {
      setPhase('finished');
      return;
    }
    void startRound(roundNumber + 1);
  };

  const restart = () => {
    setRound(null);
    setAnswers([]);
    setVerdicts([]);
    setSummary('');
    setScore({ user: 0, translator: 0, ties: 0 });
    setRoundNumber(1);
    setPhase('setup');
    setError('');
  };

  if (phase === 'setup') {
    return (
      <main className="mx-auto max-w-3xl px-5 py-10 sm:py-14">
        <Link to="/trainer" className="inline-flex items-center gap-1.5 text-sm font-bold text-[var(--accent)]">
          <LuChevronLeft className="size-4" /> Тренажёрка
        </Link>
        <div className="mt-7 flex items-start gap-4">
          <span className="grid size-14 shrink-0 place-items-center rounded-lg bg-[var(--accent)] text-white">
            <LuSwords className="size-7" />
          </span>
          <div>
            <h1 className="text-3xl sm:text-4xl">Ты против переводчика</h1>
            <p className="mt-3 max-w-xl leading-relaxed text-[var(--text-muted)]">
              Три раунда по пять фраз. Сначала переводите вы, затем открывается ответ машины. Победителя выбираете сами или Gemma 4.
            </p>
          </div>
        </div>

        <Card className="mt-9 p-5 sm:p-7">
          <fieldset>
            <legend className="text-sm font-bold">Уровень сербского</legend>
            <div className="mt-3 grid grid-cols-3 gap-2 sm:grid-cols-6">
              {LEVELS.map((item) => (
                <button key={item} type="button" onClick={() => setLevel(item)}
                  className={`min-h-11 rounded-lg border px-3 font-bold ${level === item ? 'border-[var(--accent)] bg-[var(--accent)] text-white' : 'border-[var(--line)] bg-[var(--bg)]'}`}>
                  {item}
                </button>
              ))}
            </div>
          </fieldset>

          <fieldset className="mt-7">
            <legend className="text-sm font-bold">Соперник</legend>
            <div className="mt-3 grid gap-2 sm:grid-cols-2">
              {(['deepl', 'google'] as TranslationGameProvider[]).map((item) => (
                <button key={item} type="button" onClick={() => setProvider(item)}
                  className={`flex min-h-14 items-center gap-3 rounded-lg border px-4 text-left font-bold ${provider === item ? 'border-[var(--accent)] bg-[var(--accent)]/10 text-[var(--accent)]' : 'border-[var(--line)]'}`}>
                  <LuLanguages className="size-5" />
                  {item === 'deepl' ? 'DeepL' : 'Google Translate'}
                </button>
              ))}
            </div>
          </fieldset>

          {error && <ErrorMessage text={error} />}
          <Button className="mt-7 w-full" size="lg" disabled={loading} onClick={() => void startRound(1)}>
            {loading ? <Spinner className="size-5" /> : <><LuSwords className="size-5" /> Начать матч</>}
          </Button>
        </Card>
      </main>
    );
  }

  if (phase === 'finished') {
    const final = addScore(score, roundScore);
    const winner = final.user > final.translator ? 'Вы победили!' : final.user < final.translator ? `${translatorName} победил` : 'Ничья';
    return (
      <main className="mx-auto flex min-h-[70vh] max-w-2xl flex-col items-center justify-center px-5 text-center">
        <LuSwords className="size-14 text-[var(--accent)]" />
        <p className="mt-5 text-sm font-bold uppercase text-[var(--text-muted)]">Матч завершён</p>
        <h1 className="mt-2 text-4xl">{winner}</h1>
        <p className="mt-5 text-xl font-bold">{final.user} : {final.translator}</p>
        <p className="mt-2 text-[var(--text-muted)]">Ничьих: {final.ties} · всего 15 предложений</p>
        <Button className="mt-8" size="lg" onClick={restart}><LuRotateCcw className="size-5" /> Сыграть ещё</Button>
      </main>
    );
  }

  if (!round) return null;

  return (
    <main className="mx-auto max-w-4xl px-4 py-7 sm:px-5 sm:py-10">
      <header className="mb-6 flex items-center gap-3">
        <button type="button" onClick={restart} aria-label="Выйти из матча" className="grid size-10 shrink-0 place-items-center rounded-lg border border-[var(--line)]">
          <LuChevronLeft className="size-5" />
        </button>
        <div className="min-w-0 flex-1">
          <p className="text-sm font-bold text-[var(--accent)]">{level} · раунд {roundNumber} из {TOTAL_ROUNDS}</p>
          <div className="mt-2 grid grid-cols-3 gap-1.5" aria-label={`Раунд ${roundNumber} из ${TOTAL_ROUNDS}`}>
            {Array.from({ length: TOTAL_ROUNDS }, (_, index) => <span key={index} className={`h-2 rounded-full ${index < roundNumber ? 'bg-[var(--accent)]' : 'bg-[var(--bg-sunken)]'}`} />)}
          </div>
        </div>
        <span className="hidden text-sm font-bold sm:block">против {translatorName}</span>
      </header>

      <div className="space-y-3">
        {round.sentences.map((sentence, index) => {
          const verdict = verdicts.find((item) => item.index === index);
          return (
            <Card key={sentence.id} className="p-4 sm:p-5">
              <div className="flex gap-3">
                <span className="grid size-8 shrink-0 place-items-center rounded-full bg-[var(--bg-sunken)] text-sm font-bold">{index + 1}</span>
                <p className="pt-1 font-display text-lg leading-relaxed">{sentence.text}</p>
              </div>
              {phase === 'translate' ? (
                <label className="mt-4 block">
                  <span className="mb-2 flex items-center gap-2 text-sm font-bold"><LuUser className="size-4" /> Ваш перевод</span>
                  <textarea value={answers[index] ?? ''} onChange={(event) => setAnswers((current) => current.map((value, answerIndex) => answerIndex === index ? event.target.value : value))}
                    rows={3} maxLength={1200} placeholder="Переведите на русский..."
                    className="w-full resize-y rounded-lg border border-[var(--line)] bg-[var(--bg)] px-3 py-3 leading-relaxed outline-none focus:border-[var(--accent)]" />
                </label>
              ) : (
                <div className="mt-4 grid gap-3 sm:grid-cols-2">
                  <TranslationBox icon={LuUser} label="Ваш перевод" text={answers[index] ?? ''} active={verdict?.winner === 'user'} />
                  <TranslationBox icon={LuBot} label={translatorName} text={sentence.translatorTranslation} active={verdict?.winner === 'translator'} />
                </div>
              )}

              {phase === 'choose' && (
                <div className="mt-4 grid grid-cols-3 gap-2">
                  <WinnerButton active={verdict?.winner === 'user'} onClick={() => chooseManual(index, 'user')}>Я</WinnerButton>
                  <WinnerButton active={verdict?.winner === 'tie'} onClick={() => chooseManual(index, 'tie')}>Ничья</WinnerButton>
                  <WinnerButton active={verdict?.winner === 'translator'} onClick={() => chooseManual(index, 'translator')}>{translatorName}</WinnerButton>
                </div>
              )}
              {phase === 'result' && verdict && (
                <p className="mt-4 rounded-lg bg-[var(--bg-sunken)] px-3 py-2 text-sm leading-relaxed">
                  <strong>{winnerLabel(verdict.winner, translatorName)}</strong> · {verdict.userScore.toFixed(1)} : {verdict.translatorScore.toFixed(1)}. {verdict.feedback}
                </p>
              )}
            </Card>
          );
        })}
      </div>

      {error && <ErrorMessage text={error} />}

      <div className="sticky bottom-0 mt-5 border-t border-[var(--line)] bg-[var(--bg)]/95 py-4 backdrop-blur">
        {phase === 'translate' && (
          <Button className="w-full" size="lg" disabled={!allFilled} onClick={() => setPhase('choose')}>
            Открыть перевод соперника <LuArrowRight className="size-5" />
          </Button>
        )}
        {phase === 'choose' && (
          <div className="grid gap-2 sm:grid-cols-2">
            <Button size="lg" variant="secondary" disabled={loading || !round.judgeEnabled} onClick={() => void askGemma()}>
              {loading ? <Spinner className="size-5" /> : <LuBot className="size-5" />} Спросить Gemma 4
            </Button>
            <Button size="lg" disabled={!manualComplete} onClick={finishManual}>Принять мою оценку</Button>
          </div>
        )}
        {phase === 'result' && (
          <div>
            <div className="mb-3 flex items-center justify-between gap-3 text-sm">
              <p className="text-[var(--text-muted)]">{summary}</p>
              <strong className="shrink-0">{roundScore.user} : {roundScore.translator}</strong>
            </div>
            <Button className="w-full" size="lg" onClick={nextRound}>
              {roundNumber === TOTAL_ROUNDS ? 'Завершить матч' : 'Следующий раунд'} <LuArrowRight className="size-5" />
            </Button>
          </div>
        )}
      </div>
    </main>
  );
}

function TranslationBox({ icon: Icon, label, text, active }: { icon: typeof LuUser; label: string; text: string; active: boolean }) {
  return <div className={`rounded-lg border p-3 ${active ? 'border-[var(--accent)] bg-[var(--accent)]/8' : 'border-[var(--line)]'}`}>
    <p className="flex items-center gap-2 text-xs font-bold uppercase text-[var(--text-muted)]"><Icon className="size-4" /> {label}</p>
    <p className="mt-2 leading-relaxed">{text}</p>
  </div>;
}

function WinnerButton({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return <button type="button" onClick={onClick} className={`min-h-11 rounded-lg border px-2 text-sm font-bold ${active ? 'border-[var(--accent)] bg-[var(--accent)] text-white' : 'border-[var(--line)]'}`}>{children}</button>;
}

function ErrorMessage({ text }: { text: string }) {
  return <p role="alert" className="mt-4 rounded-lg border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-800 dark:text-red-200">{text}</p>;
}

function countVerdicts(verdicts: TranslationGameVerdict[]): MatchScore {
  return verdicts.reduce<MatchScore>((result, verdict) => {
    if (verdict.winner === 'user') result.user += 1;
    else if (verdict.winner === 'translator') result.translator += 1;
    else result.ties += 1;
    return result;
  }, { user: 0, translator: 0, ties: 0 });
}

function addScore(left: MatchScore, right: MatchScore): MatchScore {
  return { user: left.user + right.user, translator: left.translator + right.translator, ties: left.ties + right.ties };
}

function winnerLabel(winner: TranslationGameWinner, translatorName: string): string {
  if (winner === 'user') return 'Лучше ваш перевод';
  if (winner === 'translator') return `Лучше ${translatorName}`;
  return 'Ничья';
}
