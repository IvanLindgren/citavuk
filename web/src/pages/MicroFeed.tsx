import { useCallback, useEffect, useRef, useState, type MutableRefObject, type ReactNode } from 'react';
import {
  LuBookOpen,
  LuHeart,
  LuPause,
  LuRefreshCw,
  LuThumbsDown,
  LuVolume2,
} from 'react-icons/lu';

import {
  getMicroFeed,
  recordMicroFeedInteraction,
  type MicroFeedItem,
  type MicroFeedReaction,
  type MicroFeedScript,
} from '../api/microFeed';
import { ttsAudioUrl } from '../api/listening';
import { WordReader } from '../components/WordReader';
import { TtsVoicePicker } from '../components/TtsVoicePicker';
import { ErrorNote, Spinner } from '../components/ui';
import { Link } from '../lib/router';
import { useSeo } from '../lib/seo';

export function MicroFeed() {
  useSeo({
    title: 'Микро-лента сербских текстов — Читавук',
    description: 'Короткие сербские тексты, факты, новости и книжные отрывки с переводом по нажатию.',
    noindex: true,
  });
  const [items, setItems] = useState<MicroFeedItem[]>([]);
  const [script, setScript] = useState<MicroFeedScript>(() =>
    localStorage.getItem('citavuk-micro-feed-script') === 'cyrillic' ? 'cyrillic' : 'latin',
  );
  const [strategy, setStrategy] = useState<'cold' | 'personalized'>('cold');
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [exhausted, setExhausted] = useState(false);
  const [error, setError] = useState('');
  const idsRef = useRef<string[]>([]);

  const load = useCallback(async (reset = false) => {
    if (reset) {
      setLoading(true);
      setExhausted(false);
    } else {
      setLoadingMore(true);
    }
    setError('');
    const controller = new AbortController();
    try {
      const exclude = reset ? [] : idsRef.current;
      const response = await getMicroFeed(exclude, controller.signal);
      setStrategy(response.strategy);
      setItems((current) => {
        const base = reset ? [] : current;
        const known = new Set(base.map((item) => item.id));
        const fresh = response.items.filter((item) => !known.has(item.id));
        const next = [...base, ...fresh];
        idsRef.current = next.map((item) => item.id);
        if (fresh.length === 0) setExhausted(true);
        return next;
      });
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Не удалось загрузить ленту.');
    } finally {
      setLoading(false);
      setLoadingMore(false);
    }
    return () => controller.abort();
  }, []);

  useEffect(() => { void load(true); }, [load]);

  function changeScript(value: MicroFeedScript) {
    setScript(value);
    localStorage.setItem('citavuk-micro-feed-script', value);
  }

  if (loading) {
    return <main className="grid min-h-[70dvh] place-items-center"><Spinner className="size-7" /></main>;
  }

  if (items.length === 0) {
    return (
      <main className="mx-auto grid min-h-[70dvh] max-w-xl place-items-center px-5 text-center">
        <div>
          <img src="/img/citavuk_zadumch.png" alt="" className="mx-auto h-36 w-auto object-contain" />
          <h1 className="mt-5 text-3xl">Микро-лента пока пуста</h1>
          <p className="mt-3 text-[var(--text-muted)]">Первые материалы проходят редакторскую проверку.</p>
          {error && <div className="mt-5"><ErrorNote>{error}</ErrorNote></div>}
          <button type="button" onClick={() => void load(true)} className="mt-5 inline-flex items-center gap-2 rounded-lg border border-[var(--line)] px-4 py-2.5 font-semibold hover:border-[var(--accent)]">
            <LuRefreshCw className="size-4" /> Обновить
          </button>
        </div>
      </main>
    );
  }

  return (
    <main className="bg-[var(--bg)]">
      <div className="border-y border-[var(--line)] bg-[var(--bg-raised)]">
        <div className="mx-auto flex min-h-14 max-w-6xl flex-wrap items-center justify-between gap-3 px-5 py-2">
          <div className="flex items-center gap-2">
            <h1 className="font-display text-xl font-bold">Микро-лента</h1>
            <span className="rounded-md border border-[var(--accent)]/35 px-2 py-0.5 text-[0.68rem] font-bold uppercase text-[var(--accent)]">эксперимент</span>
            {strategy === 'personalized' && <span className="hidden text-xs text-[var(--text-muted)] sm:inline">Для вас</span>}
          </div>
          <div className="flex items-center gap-2">
            <ScriptSwitch value={script} onChange={changeScript} />
            <TtsVoicePicker compact />
          </div>
        </div>
      </div>

      <div className="snap-y snap-mandatory">
        {items.map((item, index) => (
          <FeedStory
            key={item.id}
            item={item}
            script={script}
            onNeedMore={index === items.length - 2 && !loadingMore && !exhausted
              ? () => void load(false)
              : undefined}
          />
        ))}
      </div>

      {error && <div className="mx-auto max-w-2xl px-5 py-5"><ErrorNote>{error}</ErrorNote></div>}
      {loadingMore && <div className="grid h-24 place-items-center"><Spinner className="size-6" /></div>}
      {exhausted && <div className="border-t border-[var(--line)] px-5 py-10 text-center text-sm text-[var(--text-muted)]">На сегодня всё прочитано.</div>}
    </main>
  );
}

function FeedStory({
  item,
  script,
  onNeedMore,
}: {
  item: MicroFeedItem;
  script: MicroFeedScript;
  onNeedMore?: () => void;
}) {
  const text = script === 'cyrillic' ? item.textCyrillic : item.textLatin;
  const title = script === 'cyrillic' ? item.titleCyrillic : item.titleLatin;
  const minutes = Math.max(1, Math.round(text.split(/\s+/).length / 180));
  const articleRef = useRef<HTMLElement>(null);
  const visibleAt = useRef<number | null>(null);
  const viewTimer = useRef<number | null>(null);
  const viewSent = useRef(false);
  const finishSent = useRef(false);
  const totalDwell = useRef(0);
  const requestedMore = useRef(false);
  const onNeedMoreRef = useRef(onNeedMore);
  const textRef = useRef(text);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const [playing, setPlaying] = useState(false);
  const [reaction, setReaction] = useState<MicroFeedReaction>(item.reaction);
  const [likes, setLikes] = useState(item.likesCount);
  const [dislikes, setDislikes] = useState(item.dislikesCount);

  useEffect(() => { onNeedMoreRef.current = onNeedMore; }, [onNeedMore]);
  useEffect(() => {
    textRef.current = text;
    audioRef.current?.pause();
    audioRef.current = null;
    setPlaying(false);
  }, [text]);

  useEffect(() => {
    const node = articleRef.current;
    if (!node) return;
    const observer = new IntersectionObserver(([entry]) => {
      if (!entry) return;
      if (entry.isIntersecting && entry.intersectionRatio >= .55) {
        if (visibleAt.current == null) visibleAt.current = performance.now();
        if (!viewSent.current && viewTimer.current == null) {
          viewTimer.current = window.setTimeout(() => {
            viewSent.current = true;
            void recordMicroFeedInteraction(item.id, 'view').catch(() => {});
          }, 700);
        }
        if (onNeedMoreRef.current && !requestedMore.current) {
          requestedMore.current = true;
          onNeedMoreRef.current();
        }
        return;
      }
      finishVisibility(item.id, visibleAt, viewTimer, finishSent, totalDwell, textRef.current);
    }, { threshold: [.15, .55, .9] });
    observer.observe(node);
    return () => {
      observer.disconnect();
      finishVisibility(item.id, visibleAt, viewTimer, finishSent, totalDwell, textRef.current);
      audioRef.current?.pause();
    };
  }, [item.id]);

  async function toggleReaction(next: Exclude<MicroFeedReaction, 0>) {
    const previous = reaction;
    const final: MicroFeedReaction = previous === next ? 0 : next;
    setReaction(final);
    setLikes((value) => value + (final === 1 ? 1 : 0) - (previous === 1 ? 1 : 0));
    setDislikes((value) => value + (final === -1 ? 1 : 0) - (previous === -1 ? 1 : 0));
    try {
      await recordMicroFeedInteraction(
        item.id,
        final === 0 ? 'reaction_cleared' : final === 1 ? 'like' : 'dislike',
      );
    } catch {
      setReaction(previous);
      setLikes(item.likesCount);
      setDislikes(item.dislikesCount);
    }
  }

  function toggleAudio() {
    if (audioRef.current && !audioRef.current.paused) {
      audioRef.current.pause();
      setPlaying(false);
      return;
    }
    const audio = audioRef.current ?? new Audio(item.audioUrl || ttsAudioUrl(text));
    audioRef.current = audio;
    audio.onended = () => setPlaying(false);
    audio.onerror = () => setPlaying(false);
    void audio.play().then(() => {
      setPlaying(true);
      void recordMicroFeedInteraction(item.id, 'audio_play').catch(() => {});
    }).catch(() => setPlaying(false));
  }

  return (
    <article
      ref={articleRef}
      className={`relative min-h-[calc(100dvh-7.5rem)] snap-start snap-always border-b border-[var(--line)] ${categoryBackground(item.category)}`}
    >
      <div className="mx-auto grid min-h-[calc(100dvh-7.5rem)] max-w-6xl grid-cols-1 items-center gap-8 px-5 py-8 lg:grid-cols-[minmax(0,900px)_72px] lg:justify-between lg:py-9">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2 text-xs font-bold uppercase text-[var(--text-muted)]">
            <span className="rounded-md bg-[var(--bg-raised)] px-2 py-1">{categoryLabel(item.category)}</span>
            <span>{item.cefr}</span>
            <span aria-hidden="true">·</span>
            <span>{minutes} мин</span>
          </div>

          {item.imageUrl && (
            <img src={item.imageUrl} alt="" className="mt-6 aspect-[16/7] w-full rounded-lg object-cover" />
          )}

          <h2 className="mt-5 max-w-3xl font-display text-3xl font-bold leading-tight sm:text-4xl">{title}</h2>
          <div className="mt-4 flex items-center gap-2 lg:hidden">
            <StoryActions
              playing={playing} reaction={reaction} likes={likes} dislikes={dislikes}
              onAudio={toggleAudio} onReaction={toggleReaction}
            />
          </div>
          <WordReader
            paragraphs={[text]}
            className="mt-6"
            paragraphClassName="font-display text-lg leading-8 sm:text-xl sm:leading-9"
          />

          <div className="mt-7 flex flex-wrap gap-2">
            {item.difficultWords.map((word) => (
              <span key={`${item.id}-${word.word}`} title={`${word.lemma} ${word.transcription} — ${word.translationRu}`} className="rounded-md border border-[var(--line)] bg-[var(--bg-raised)] px-2.5 py-1.5 text-sm">
                <strong>{word.word}</strong>{' '}
                <span className="text-[var(--text-muted)]">{word.transcription} · {word.translationRu}</span>
              </span>
            ))}
          </div>

          <div className="mt-7 flex flex-wrap items-center justify-between gap-4 border-t border-[var(--line)] pt-4 text-sm">
            <SourceLine item={item} />
            {item.bookTargetUrl && <BookLink item={item} />}
          </div>
        </div>

        <div className="hidden items-center gap-2 lg:flex lg:flex-col lg:justify-center">
          <StoryActions
            playing={playing} reaction={reaction} likes={likes} dislikes={dislikes}
            onAudio={toggleAudio} onReaction={toggleReaction}
          />
        </div>
      </div>
    </article>
  );
}

function StoryActions({
  playing,
  reaction,
  likes,
  dislikes,
  onAudio,
  onReaction,
}: {
  playing: boolean;
  reaction: MicroFeedReaction;
  likes: number;
  dislikes: number;
  onAudio: () => void;
  onReaction: (reaction: Exclude<MicroFeedReaction, 0>) => Promise<void>;
}) {
  return (
    <>
      <ActionButton label={playing ? 'Остановить озвучку' : 'Озвучить карточку'} active={playing} onClick={onAudio}>
        {playing ? <LuPause /> : <LuVolume2 />}
      </ActionButton>
      <ActionButton label="Нравится" count={likes} active={reaction === 1} onClick={() => void onReaction(1)}>
        <LuHeart />
      </ActionButton>
      <ActionButton label="Не показывать похожее" count={dislikes} active={reaction === -1} onClick={() => void onReaction(-1)}>
        <LuThumbsDown />
      </ActionButton>
    </>
  );
}

function finishVisibility(
  itemId: string,
  visibleAt: MutableRefObject<number | null>,
  timer: MutableRefObject<number | null>,
  sent: MutableRefObject<boolean>,
  totalDwell: MutableRefObject<number>,
  text: string,
) {
  if (timer.current != null) {
    window.clearTimeout(timer.current);
    timer.current = null;
  }
  if (visibleAt.current == null || sent.current) return;
  const dwell = performance.now() - visibleAt.current;
  visibleAt.current = null;
  totalDwell.current += dwell;
  if (totalDwell.current < 2000) {
    sent.current = true;
    void recordMicroFeedInteraction(itemId, 'quick_skip', totalDwell.current).catch(() => {});
    return;
  }
  const expected = Math.max(15_000, text.split(/\s+/).length / 180 * 60_000 * .65);
  if (totalDwell.current >= expected) {
    sent.current = true;
    void recordMicroFeedInteraction(itemId, 'complete', totalDwell.current).catch(() => {});
  }
}

function ActionButton({
  label,
  count,
  active = false,
  onClick,
  children,
}: {
  label: string;
  count?: number;
  active?: boolean;
  onClick: () => void;
  children: ReactNode;
}) {
  return (
    <button type="button" title={label} aria-label={label} aria-pressed={active} onClick={onClick} className={`grid min-h-12 min-w-12 place-items-center rounded-full border transition-colors ${active ? 'border-[var(--accent)] bg-[var(--accent)] text-white' : 'border-[var(--line)] bg-[var(--bg-raised)] hover:border-[var(--accent)]'}`}>
      <span className="text-xl">{children}</span>
      {count != null && <span className="text-[0.65rem] leading-none">{compactCount(count)}</span>}
    </button>
  );
}

function ScriptSwitch({ value, onChange }: { value: MicroFeedScript; onChange: (value: MicroFeedScript) => void }) {
  return (
    <div className="flex rounded-lg border border-[var(--line)] bg-[var(--bg)] p-0.5" role="group" aria-label="Алфавит">
      <button type="button" onClick={() => onChange('latin')} aria-pressed={value === 'latin'} className={`rounded-md px-2.5 py-1.5 text-xs font-bold ${value === 'latin' ? 'bg-[var(--accent)] text-white' : 'text-[var(--text-muted)]'}`}>Latinica</button>
      <button type="button" onClick={() => onChange('cyrillic')} aria-pressed={value === 'cyrillic'} className={`rounded-md px-2.5 py-1.5 text-xs font-bold ${value === 'cyrillic' ? 'bg-[var(--accent)] text-white' : 'text-[var(--text-muted)]'}`}>Ћирилица</button>
    </div>
  );
}

function SourceLine({ item }: { item: MicroFeedItem }) {
  if (!item.sourceUrl) return <span className="text-[var(--text-muted)]">Читавук</span>;
  return (
    <a href={item.sourceUrl} target="_blank" rel="noreferrer noopener" className="min-w-0 text-[var(--text-muted)] underline decoration-[var(--line)] underline-offset-4 hover:text-[var(--accent)]">
      Источник: {item.attributionText || item.sourceTitle}
      {item.licenseCode ? ` · ${item.licenseCode}` : ''}
    </a>
  );
}

function BookLink({ item }: { item: MicroFeedItem }) {
  const content = <><LuBookOpen className="size-4" /> Nastavi čitanje knjige</>;
  const onClick = () => void recordMicroFeedInteraction(item.id, 'read_more_clicked').catch(() => {});
  const className = 'inline-flex items-center gap-2 rounded-lg bg-[var(--accent)] px-4 py-2.5 font-semibold text-white hover:bg-[var(--accent-hover)]';
  if (item.bookTargetUrl.startsWith('/')) {
    return <Link to={item.bookTargetUrl} onClick={onClick} className={className}>{content}</Link>;
  }
  return <a href={item.bookTargetUrl} onClick={onClick} className={className}>{content}</a>;
}

function categoryLabel(category: MicroFeedItem['category']) {
  return ({ history: 'История', culture: 'Культура', science: 'Наука', fiction: 'Литература', society: 'Общество', news: 'Новости' })[category];
}

function categoryBackground(category: MicroFeedItem['category']) {
  return ({
    history: 'bg-[#f3ead8] dark:bg-[#241f1a]',
    culture: 'bg-[#edf0e6] dark:bg-[#1a211d]',
    science: 'bg-[#e8eff0] dark:bg-[#182124]',
    fiction: 'bg-[#f3e9e7] dark:bg-[#251b1d]',
    society: 'bg-[#eeeaf1] dark:bg-[#211c25]',
    news: 'bg-[var(--bg)]',
  })[category];
}

function compactCount(value: number) {
  if (value >= 1000) return `${(value / 1000).toFixed(value >= 10000 ? 0 : 1)}k`;
  return String(value);
}
