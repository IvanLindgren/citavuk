import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { LuDices, LuEye, LuEyeOff, LuMic, LuPencilLine, LuRotateCcw, LuVolume2, LuVolumeX } from 'react-icons/lu';

import { ApiError } from '../api/client';
import {
  getSpeakingAccess,
  getSpeakingTopics,
  reviewSpeaking,
  SPEAKING_MIN_WORDS,
  type SpeakingAccess,
  type SpeakingCatalog,
  type SpeakingReview,
  type SpeakingSource,
  type SpeakingTopic,
} from '../api/speaking';
import { Button, ButtonLink, Card, Spinner } from '../components/ui';
import { AnswerField, HintWords, ReviewView, VoiceRecorder } from '../games/speaking/panels';
import { countWords } from '../games/speaking/highlight';
import { GenreIcon } from '../games/speaking/GenreIcon';
import { recordingSupported } from '../games/speaking/recorder';
import { SlotMachine } from '../games/speaking/SlotMachine';
import { activeStorageName } from '../lib/db';
import { useSeo } from '../lib/seo';
import { acceptStudy } from '../lib/study';
import { useAuth } from '../state/auth';
import { useQuery } from '../lib/router';
import { uiLocale } from '../lib/i18n';

const TITLE = 'Говори или пиши';
const SETTINGS_KEY = 'citavuk-speaking-settings';
const HISTORY_KEY = 'citavuk-speaking-history';

interface Settings {
  genres: string[];
  muted: boolean;
  hints: boolean;
}

interface HistoryItem {
  id: string;
  topic: string;
  source: SpeakingSource;
  level: string;
  mistakes: number;
  at: number;
}

function readJSON<T>(key: string, fallback: T): T {
  try {
    return { ...fallback, ...(JSON.parse(localStorage.getItem(key) ?? 'null') as object | null) } as T;
  } catch {
    return fallback;
  }
}

function historyKey() { return `${HISTORY_KEY}:${activeStorageName()}`; }
function readHistory(): HistoryItem[] {
  try {
    const value = JSON.parse(localStorage.getItem(historyKey()) ?? '[]') as HistoryItem[];
    return Array.isArray(value) ? value : [];
  } catch {
    return [];
  }
}

function writeStorage(key: string, value: unknown) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // Выбор проживёт до перезагрузки.
  }
}

function Shell({ children }: { children: ReactNode }) {
  return <main className="paper-grain min-h-[calc(100dvh-4rem)] px-3 py-8 sm:px-5 sm:py-12">{children}</main>;
}

function Teaser({ access }: { access: SpeakingAccess }) {
  const date = new Date(access.publicFrom).toLocaleDateString(uiLocale(), { day: 'numeric', month: 'long' });
  return (
    <Shell>
      <Card className="mx-auto max-w-2xl p-7 text-center sm:p-10">
        <img src="/img/citavuk_gram.webp" alt="" width={160} height={160} className="mx-auto w-32 object-contain" />
        <h1 className="mt-4 text-balance text-3xl sm:text-4xl">{TITLE}</h1>
        <p className="mx-auto mt-4 max-w-lg text-lg leading-relaxed text-[var(--text-muted)]">
          Случайная тема для разговора или короткого текста по-сербски.
        </p>
        <p className="mx-auto mt-3 max-w-lg leading-relaxed">
          До {date} игра открыта друзьям Читавука — тем, кто поддержал проект. С {date} в неё сможет играть каждый.
        </p>
        <div className="mt-7 flex flex-wrap justify-center gap-3">
          <ButtonLink to="/support" size="lg">Стать другом Читавука</ButtonLink>
          {!access.signedIn && <ButtonLink to="/login" variant="secondary" size="lg">Войти</ButtonLink>}
        </div>
      </Card>
    </Shell>
  );
}

function Chip({ active, onClick, children }: { active: boolean; onClick: () => void; children: ReactNode }) {
  return (
    <button
      type="button"
      aria-pressed={active}
      onClick={onClick}
      className={[
        'inline-flex min-h-10 items-center gap-1.5 rounded-xl border px-3 text-sm font-semibold transition-colors',
        active
          ? 'border-[var(--accent)] bg-[var(--accent)] text-parchment'
          : 'border-[var(--line)] bg-[var(--bg-raised)] hover:border-[var(--accent)]',
      ].join(' ')}
    >
      {children}
    </button>
  );
}

type Answer =
  | { mode: null }
  | { mode: 'write'; text: string }
  | { mode: 'speak'; text: string | null };

interface Done {
  topic: SpeakingTopic;
  text: string;
  review: SpeakingReview;
}

export function Speaking() {
  const query = useQuery();
  useSeo({
    title: 'Разговорный сербский: говори или пиши, Читавук разберёт ошибки',
    description:
      'Разговорная практика сербского языка: барабан выбирает тему из 150, ты говоришь вслух или пишешь по-сербски, а Читавук находит ошибки и объясняет их по-русски.',
  });
  const { account } = useAuth();
  const [access, setAccess] = useState<SpeakingAccess | null>(null);
  const [catalog, setCatalog] = useState<SpeakingCatalog | null>(null);
  const [failed, setFailed] = useState(false);
  const [owner, setOwner] = useState<string | null | undefined>(undefined);

  useEffect(() => {
    let cancelled = false;
    const scope = account?.id ?? null;
    setFailed(false);
    getSpeakingAccess()
      .then(async (value) => {
        if (cancelled) return;
        const nextCatalog = value.open ? await getSpeakingTopics() : null;
        if (cancelled) return;
        setAccess(value);
        setOwner(scope);
        setCatalog(nextCatalog);
      })
      .catch(() => !cancelled && setFailed(true));
    return () => {
      cancelled = true;
    };
  }, [account?.id]);

  if (failed) {
    return (
      <Shell>
        <Card className="mx-auto max-w-lg p-8 text-center">
          <p className="text-lg">Игра не загрузилась. Проверь связь и обнови страницу.</p>
        </Card>
      </Shell>
    );
  }
  if (owner !== (account?.id ?? null) || !access || (access.open && !catalog)) {
    return (
      <Shell>
        <div className="flex justify-center py-24"><Spinner className="size-7" /></div>
      </Shell>
    );
  }
  if (!access.open || !catalog) return <Teaser access={access} />;
  return <Game key={account?.id ?? 'guest'} catalog={catalog} signedIn={!!account} initialMode={query.mode === 'speak' || query.mode === 'write' ? query.mode : null} />;
}

function Game({ catalog, signedIn, initialMode }: { catalog: SpeakingCatalog; signedIn: boolean; initialMode: 'speak' | 'write' | null }) {
  const [settings, setSettings] = useState<Settings>(() =>
    readJSON<Settings>(SETTINGS_KEY, { genres: [], muted: false, hints: true }),
  );
  const [history, setHistory] = useState<HistoryItem[]>(readHistory);
  const [spinId, setSpinId] = useState(0);
  const [topic, setTopic] = useState<SpeakingTopic | null>(null);
  const [landed, setLanded] = useState(false);
  const [answer, setAnswer] = useState<Answer>({ mode: null });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [done, setDone] = useState<Done | null>(null);
  const session = useRef(crypto.randomUUID());
  const answerRef = useRef<HTMLDivElement>(null);
  const canRecord = useMemo(recordingSupported, []);

  const genreIds = useMemo(() => new Set(catalog.genres.map((genre) => genre.id)), [catalog]);
  const chosen = settings.genres.filter((id) => genreIds.has(id));
  const pool = useMemo(
    () => (chosen.length ? catalog.topics.filter((item) => chosen.includes(item.genre)) : catalog.topics),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [catalog, chosen.join(',')],
  );
  const genreById = useMemo(() => new Map(catalog.genres.map((genre) => [genre.id, genre])), [catalog]);

  const update = (patch: Partial<Settings>) => {
    const next = { ...settings, ...patch };
    setSettings(next);
    writeStorage(SETTINGS_KEY, next);
  };

  const toggleGenre = (id: string) => {
    if (spinId > 0 && !landed) return;
    update({ genres: chosen.includes(id) ? chosen.filter((item) => item !== id) : [...chosen, id] });
  };

  const spin = useCallback(() => {
    if (spinId > 0 && !landed) return;
    // Свежая тема: не та же самая, что только что выпала.
    const options = pool.length > 1 ? pool.filter((item) => item.id !== topic?.id) : pool;
    setTopic(options[Math.floor(Math.random() * options.length)]!);
    setLanded(false);
    setAnswer({ mode: null });
    setDone(null);
    setError('');
    session.current = crypto.randomUUID();
    setSpinId((value) => value + 1);
  }, [landed, pool, spinId, topic?.id]);

  // Ответ открывается прямо под барабаном: экран не должен требовать прокрутки.
  useEffect(() => {
    if (answer.mode) answerRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }, [answer.mode]);
  useEffect(() => {
    if (done) answerRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }, [done]);

  const submit = async (text: string, source: SpeakingSource) => {
    if (!topic || busy) return;
    setBusy(true);
    const owner = activeStorageName();
    setError('');
    try {
      const response = await reviewSpeaking({ sessionId: session.current, topicId: topic.id, text, source });
      if (owner !== activeStorageName()) return;
      if (response.study) acceptStudy(response.study, activeStorageName(), true);
      setDone({ topic, text: response.text, review: response.review });
      const item: HistoryItem = {
        id: session.current,
        topic: topic.ru,
        source,
        level: response.review.level,
        mistakes: response.review.mistakes.length,
        at: Date.now(),
      };
      const next = [item, ...history.filter((entry) => entry.id !== item.id)].slice(0, 8);
      setHistory(next);
      writeStorage(historyKey(), next);
      session.current = crypto.randomUUID();
    } catch (caught) {
      setError(
        caught instanceof ApiError && caught.status !== 0
          ? caught.message
          : 'Нет связи с сервером. Твой текст на месте — попробуй ещё раз.',
      );
    } finally {
      setBusy(false);
    }
  };

  const text = answer.mode === 'write' ? answer.text : answer.mode === 'speak' ? answer.text : null;
  const enough = text !== null && countWords(text) >= SPEAKING_MIN_WORDS;
  const genre = topic ? genreById.get(topic.genre) : undefined;

  return (
    <Shell>
      <div className="mx-auto max-w-4xl">
        <div className="flex flex-col items-center gap-5 text-center sm:flex-row sm:text-left">
          <div>
            <h1 className="text-balance text-3xl leading-tight sm:text-4xl">{initialMode === 'speak' ? 'Говори!' : initialMode === 'write' ? 'Пиши!' : TITLE}</h1>
            <p className="mt-3 leading-relaxed text-[var(--text-muted)]">
              Получи тему и ответь по-сербски.
            </p>
          </div>
        </div>

        <section className="mt-5">
          <div className="flex items-center justify-between gap-3">
            <details className="min-w-0 flex-1">
              <summary className="cursor-pointer text-sm text-[var(--text-muted)]">{chosen.length ? `Темы: ${chosen.length}` : 'Все темы'}</summary>
              <div className="mt-3 flex flex-wrap gap-2">{catalog.genres.map(item => <Chip key={item.id} active={chosen.includes(item.id)} onClick={() => toggleGenre(item.id)}><GenreIcon genre={item} className="size-4" />{item.ru}</Chip>)}</div>
            </details>
            <button
              type="button"
              onClick={() => update({ muted: !settings.muted })}
              aria-label={settings.muted ? 'Включить звук барабана' : 'Выключить звук барабана'}
              className="rounded-lg p-2 text-[var(--text-muted)] hover:bg-[var(--bg-sunken)]"
            >
              {settings.muted ? <LuVolumeX className="size-5" /> : <LuVolume2 className="size-5" />}
            </button>
          </div>

          {/* Автомат шире текстовой колонки: на большом экране он главный на странице. */}
          <div className="mt-6 lg:relative lg:left-1/2 lg:w-[min(1040px,calc(100vw-4rem))] lg:-translate-x-1/2">
            <SlotMachine
              pool={pool}
              genres={catalog.genres}
              spinId={spinId}
              target={topic}
              title={initialMode === 'write' ? 'Пиши!' : 'Говори!'}
              muted={settings.muted}
              onPull={spin}
              onLanded={() => { setLanded(true); if (initialMode === 'write') setAnswer({mode:'write',text:''}); else if (initialMode === 'speak' && canRecord) setAnswer({mode:'speak',text:null}); }}
            />
          </div>
          <div className="mt-5 flex justify-center">
            <Button size="lg" onClick={spin} disabled={spinId > 0 && !landed}>
              <LuDices className="size-5" aria-hidden="true" />
              {spinId === 0 ? 'Выбрать тему' : landed ? 'Другая тема' : 'Крутится…'}
            </Button>
          </div>
          {spinId === 0 && <p className="mt-3 text-center text-sm text-[var(--text-muted)]">Потяни рычаг справа или нажми кнопку.</p>}
        </section>

        <div ref={answerRef} className="scroll-mt-20">
          {topic && landed && !done && (
            <Card className="mt-6 p-5 sm:p-7">
              <p className="flex items-center gap-2 text-sm font-bold uppercase  text-[var(--accent)]">
                <GenreIcon genre={genre} className="size-5" />
                {genre?.ru}
              </p>
              <h2 className="mt-2 text-balance text-2xl leading-snug sm:text-3xl">{topic.ru}</h2>
              <p className="mt-2 text-lg text-[var(--text-muted)]" lang="sr">{topic.sr}</p>
              {settings.hints && <HintWords topic={topic} />}
              <button
                type="button"
                onClick={() => update({ hints: !settings.hints })}
                className="mt-3 inline-flex items-center gap-1.5 text-sm text-[var(--text-muted)] hover:text-[var(--accent)]"
              >
                {settings.hints ? <LuEyeOff className="size-4" /> : <LuEye className="size-4" />}
                {settings.hints ? 'Скрыть подсказки' : 'Показать опорные слова'}
              </button>

              {answer.mode === null && (
                <div className="mt-6 grid gap-3 sm:grid-cols-2">
                  <Button size="lg" onClick={() => setAnswer({ mode: 'speak', text: null })} disabled={!canRecord}>
                    <LuMic className="size-5" aria-hidden="true" /> Сказать
                  </Button>
                  <Button size="lg" variant="secondary" onClick={() => setAnswer({ mode: 'write', text: '' })}>
                    <LuPencilLine className="size-5" aria-hidden="true" /> Написать
                  </Button>
                  {!canRecord && (
                    <p className="text-sm text-[var(--text-muted)] sm:col-span-2">
                      В этом браузере нельзя записать голос — напиши ответ текстом.
                    </p>
                  )}
                </div>
              )}

              {answer.mode !== null && (
                <div className="mt-6 border-t border-[var(--line)] pt-5">
                  {answer.mode === 'speak' && answer.text === null ? (
                    <>
                      <VoiceRecorder onTranscript={(value) => setAnswer({ mode: 'speak', text: value })} />
                      <div className="mt-2 text-center">
                        <Button variant="ghost" size="sm" onClick={() => setAnswer({ mode: null })}>Выбрать по-другому</Button>
                      </div>
                    </>
                  ) : (
                    <>
                      {answer.mode === 'speak' && (
                        <p className="mb-2 text-sm text-[var(--text-muted)]">
                          Вот что услышал Читавук. Если слово распознано неверно, поправь его.
                        </p>
                      )}
                      <AnswerField
                        value={answer.text ?? ''}
                        onChange={(value) => setAnswer({ ...answer, text: value } as Answer)}
                        disabled={busy}
                        label="Твой ответ"
                        placeholder="Напиши несколько предложений по-сербски."
                      />
                      {error && (
                        <p className="mt-3 text-[var(--accent)]" role="alert">{error}</p>
                      )}
                      <div className="mt-4 flex flex-wrap gap-3">
                        {signedIn ? (
                          <Button
                            size="lg"
                            disabled={!enough || busy}
                            onClick={() => void submit(answer.text ?? '', answer.mode === 'speak' ? 'voice' : 'text')}
                          >
                            {busy ? <Spinner className="size-5" /> : null}
                            {busy ? 'Читавук проверяет…' : 'Разобрать ошибки'}
                          </Button>
                        ) : (
                          <ButtonLink to="/login" size="lg">Войти, чтобы разобрать</ButtonLink>
                        )}
                        <Button
                          variant="secondary"
                          size="lg"
                          disabled={busy}
                          onClick={() => setAnswer(answer.mode === 'speak' ? { mode: 'speak', text: null } : { mode: null })}
                        >
                          <LuRotateCcw className="size-5" aria-hidden="true" />
                          {answer.mode === 'speak' ? 'Записать заново' : 'Назад'}
                        </Button>
                      </div>
                    </>
                  )}
                </div>
              )}
            </Card>
          )}

          {done && (
            <Card className="mt-6 p-5 sm:p-7">
              <p className="text-sm font-bold uppercase  text-[var(--accent)]">Разбор, {done.topic.ru}</p>
              <ReviewView
                text={done.text}
                review={done.review}
                onAgain={spin}
                onRewrite={() => {
                  setAnswer({ mode: 'write', text: done.text });
                  setDone(null);
                }}
              />
            </Card>
          )}
        </div>

        {history.length > 0 && (
          <section className="mt-8" aria-label="Недавние попытки">
            <h2 className="text-sm font-bold uppercase  text-[var(--text-muted)]">Недавние попытки</h2>
            <ul className="mt-2 divide-y divide-[var(--line)] rounded-2xl border border-[var(--line)] bg-[var(--bg-raised)]">
              {history.map((item) => (
                <li key={item.id} className="flex items-center gap-3 px-4 py-3">
                  <span aria-hidden="true">{item.source === 'voice' ? <LuMic /> : <LuPencilLine />}</span>
                  <span className="min-w-0 flex-1 truncate">{item.topic}</span>
                  {item.level && <span className="rounded-full bg-[var(--bg-sunken)] px-2 py-0.5 text-xs font-bold">{item.level}</span>}
                  <span className="text-sm text-[var(--text-muted)]">
                    {item.mistakes === 0 ? 'без ошибок' : `ошибок: ${item.mistakes}`}
                  </span>
                </li>
              ))}
            </ul>
          </section>
        )}
      </div>
    </Shell>
  );
}
