import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type MutableRefObject,
  type ReactNode,
  type WheelEvent as ReactWheelEvent,
} from 'react';
import {
  LuBookOpen,
  LuChevronDown,
  LuChevronUp,
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
  const [activeIndex, setActiveIndex] = useState(0);
  const idsRef = useRef<string[]>([]);
  const feedRef = useRef<HTMLDivElement>(null);
  const wheelLockedRef = useRef(false);

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

  useEffect(() => {
    const previous = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    window.scrollTo({ top: 0, behavior: 'auto' });
    return () => { document.body.style.overflow = previous; };
  }, []);

  const scrollToCard = useCallback((requested: number) => {
    const container = feedRef.current;
    if (!container || items.length === 0) return;
    const index = Math.max(0, Math.min(requested, items.length - 1));
    const card = container.querySelector<HTMLElement>(`[data-feed-index="${index}"]`);
    if (!card) return;
    setActiveIndex(index);
    container.scrollTo({
      top: card.offsetTop,
      behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth',
    });
  }, [items.length]);

  useEffect(() => {
    const container = feedRef.current;
    if (!container || items.length === 0) return;
    const observer = new IntersectionObserver((entries) => {
      const visible = entries
        .filter((entry) => entry.isIntersecting)
        .sort((left, right) => right.intersectionRatio - left.intersectionRatio)[0];
      if (!(visible?.target instanceof HTMLElement) || visible.intersectionRatio < .55) return;
      setActiveIndex(Number(visible.target.dataset.feedIndex ?? 0));
    }, { root: container, threshold: [.55, .75, .95] });
    container.querySelectorAll<HTMLElement>('[data-feed-index]').forEach((card) => observer.observe(card));
    return () => observer.disconnect();
  }, [items.length]);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (isTypingTarget(event.target)) return;
      if (event.key === 'ArrowDown' || event.key === 'PageDown' || event.key === ' ') {
        event.preventDefault();
        scrollToCard(activeIndex + 1);
      } else if (event.key === 'ArrowUp' || event.key === 'PageUp') {
        event.preventDefault();
        scrollToCard(activeIndex - 1);
      } else if (event.key === 'Home') {
        event.preventDefault();
        scrollToCard(0);
      } else if (event.key === 'End') {
        event.preventDefault();
        scrollToCard(items.length - 1);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [activeIndex, items.length, scrollToCard]);

  function handleWheel(event: ReactWheelEvent<HTMLDivElement>) {
    if (Math.abs(event.deltaY) < 8 || event.ctrlKey) return;
    const direction = event.deltaY > 0 ? 1 : -1;
    if (nestedScrollerCanMove(event.target, feedRef.current, direction)) return;
    event.preventDefault();
    if (wheelLockedRef.current) return;
    wheelLockedRef.current = true;
    scrollToCard(activeIndex + direction);
    window.setTimeout(() => { wheelLockedRef.current = false; }, 480);
  }

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
    <main className="relative h-[calc(100dvh-4rem)] overflow-hidden bg-[#171411] text-white">
      <div className="pointer-events-none absolute inset-x-0 top-0 z-30 border-b border-white/15 bg-black/55 text-white backdrop-blur-md">
        <div className="pointer-events-auto mx-auto flex h-14 max-w-6xl items-center justify-between gap-3 px-4 sm:px-5">
          <div className="flex items-center gap-2">
            <h1 className="font-display text-xl font-bold">Микро-лента</h1>
            <span className="hidden rounded-md border border-white/30 px-2 py-0.5 text-[0.68rem] font-bold uppercase sm:inline">эксперимент</span>
            {strategy === 'personalized' && <span className="hidden text-xs text-white/65 md:inline">Для вас</span>}
          </div>
          <div className="flex items-center gap-2">
            <span className="hidden min-w-10 text-center text-xs font-bold tabular-nums text-white/70 sm:inline">
              {activeIndex + 1} / {items.length}
            </span>
            <ScriptSwitch value={script} onChange={changeScript} />
            <div className="hidden sm:block [&_label]:!text-white/75 [&_label:hover]:!bg-white/10"><TtsVoicePicker compact /></div>
          </div>
        </div>
      </div>

      <div
        ref={feedRef}
        onWheel={handleWheel}
        className="h-full snap-y snap-mandatory overflow-y-auto overscroll-contain scroll-smooth [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
      >
        {items.map((item, index) => (
          <FeedStory
            key={item.id}
            index={index}
            item={item}
            script={script}
            onNeedMore={index === items.length - 2 && !loadingMore && !exhausted
              ? () => void load(false)
              : undefined}
          />
        ))}
      </div>

      <div className="pointer-events-none absolute inset-y-0 right-4 z-20 hidden items-center md:flex">
        <div className="pointer-events-auto flex flex-col gap-2">
          <FeedNavButton label="Предыдущая карточка" disabled={activeIndex === 0} onClick={() => scrollToCard(activeIndex - 1)}>
            <LuChevronUp />
          </FeedNavButton>
          <FeedNavButton label="Следующая карточка" disabled={activeIndex >= items.length - 1} onClick={() => scrollToCard(activeIndex + 1)}>
            <LuChevronDown />
          </FeedNavButton>
        </div>
      </div>

      {error && <div className="absolute inset-x-4 bottom-4 z-40 mx-auto max-w-2xl"><ErrorNote>{error}</ErrorNote></div>}
      {loadingMore && <div className="pointer-events-none absolute bottom-4 left-4 z-30 rounded-full bg-black/55 p-3"><Spinner className="size-5 text-white" /></div>}
      {exhausted && activeIndex === items.length - 1 && (
        <div className="pointer-events-none absolute bottom-3 left-1/2 z-20 -translate-x-1/2 rounded-full bg-black/55 px-3 py-1.5 text-xs font-semibold text-white/75">
          На сегодня всё
        </div>
      )}
    </main>
  );
}

function FeedStory({
  index,
  item,
  script,
  onNeedMore,
}: {
  index: number;
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
      data-feed-index={index}
      className={`relative h-full snap-start snap-always overflow-hidden border-b border-white/10 ${categoryBackground(item.category)}`}
    >
      <div className="mx-auto flex h-full max-w-5xl items-center px-4 pb-4 pt-16 sm:px-8 sm:pb-7 sm:pt-20 lg:px-12">
        <div
          data-feed-story-scroll
          className="max-h-full min-w-0 w-full overflow-y-auto overscroll-contain py-4 pr-14 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden sm:py-6 sm:pr-20 lg:pr-24"
        >
          <div className="flex flex-wrap items-center gap-2 text-xs font-bold uppercase text-white/65">
            <span className="rounded-md border border-white/15 bg-black/20 px-2 py-1 text-white/90">{categoryLabel(item.category)}</span>
            <span>{item.cefr}</span>
            <span aria-hidden="true">·</span>
            <span>{minutes} мин</span>
          </div>

          {item.imageUrl && (
            <img src={item.imageUrl} alt="" className="mt-4 max-h-[24dvh] w-full object-cover sm:mt-5" />
          )}

          <h2 className="mt-4 max-w-3xl font-display text-2xl font-bold leading-tight sm:mt-5 sm:text-4xl">{title}</h2>
          <WordReader
            paragraphs={[text]}
            className="mt-4 sm:mt-6"
            paragraphClassName="font-display text-[1.02rem] leading-[1.62] sm:text-xl sm:leading-9"
          />

          <div className="mt-5 flex gap-2 overflow-x-auto pb-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden sm:mt-7 sm:flex-wrap">
            {item.difficultWords.map((word) => (
              <span key={`${item.id}-${word.word}`} title={`${word.lemma} ${word.transcription} — ${word.translationRu}`} className="shrink-0 rounded-md border border-white/15 bg-black/20 px-2.5 py-1.5 text-xs sm:text-sm">
                <strong>{word.word}</strong>{' '}
                <span className="text-white/65">{word.transcription} · {word.translationRu}</span>
              </span>
            ))}
          </div>

          <div className="mt-5 flex flex-wrap items-center justify-between gap-3 border-t border-white/15 pt-3 text-xs sm:mt-7 sm:pt-4 sm:text-sm">
            <SourceLine item={item} />
            {item.bookTargetUrl && <BookLink item={item} />}
          </div>
        </div>
      </div>

      <div className="absolute bottom-7 right-2.5 z-10 flex flex-col items-center gap-3 sm:bottom-10 sm:right-5">
        <StoryActions
          playing={playing} reaction={reaction} likes={likes} dislikes={dislikes}
          onAudio={toggleAudio} onReaction={toggleReaction}
        />
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
    <button type="button" title={label} aria-label={label} aria-pressed={active} onClick={onClick} className={`flex size-12 flex-col items-center justify-center rounded-full border text-white shadow-md backdrop-blur-sm transition-colors ${active ? 'border-[#d34b45] bg-[#ae2a28]' : 'border-white/20 bg-black/35 hover:bg-black/55'}`}>
      <span className="text-xl">{children}</span>
      {count != null && <span className="text-[0.65rem] leading-none">{compactCount(count)}</span>}
    </button>
  );
}

function FeedNavButton({
  label,
  disabled,
  onClick,
  children,
}: {
  label: string;
  disabled: boolean;
  onClick: () => void;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      title={label}
      aria-label={label}
      disabled={disabled}
      onClick={onClick}
      className="grid size-11 place-items-center rounded-full border border-white/20 bg-black/40 text-2xl text-white shadow-md backdrop-blur-sm transition-colors hover:bg-black/60 disabled:opacity-25"
    >
      {children}
    </button>
  );
}

function ScriptSwitch({ value, onChange }: { value: MicroFeedScript; onChange: (value: MicroFeedScript) => void }) {
  return (
    <div className="flex rounded-lg border border-white/20 bg-black/20 p-0.5" role="group" aria-label="Алфавит">
      <button type="button" onClick={() => onChange('latin')} aria-pressed={value === 'latin'} className={`rounded-md px-2.5 py-1.5 text-xs font-bold ${value === 'latin' ? 'bg-white text-[#211a16]' : 'text-white/65'}`}>Latinica</button>
      <button type="button" onClick={() => onChange('cyrillic')} aria-pressed={value === 'cyrillic'} className={`rounded-md px-2.5 py-1.5 text-xs font-bold ${value === 'cyrillic' ? 'bg-white text-[#211a16]' : 'text-white/65'}`}>Ћирилица</button>
    </div>
  );
}

function SourceLine({ item }: { item: MicroFeedItem }) {
  if (!item.sourceUrl) return <span className="text-white/60">Читавук</span>;
  return (
    <a href={item.sourceUrl} target="_blank" rel="noreferrer noopener" className="min-w-0 text-white/60 underline decoration-white/25 underline-offset-4 hover:text-white">
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
    history: 'bg-[#34281d] text-[#fff7e7]',
    culture: 'bg-[#173329] text-[#f4fff7]',
    science: 'bg-[#173038] text-[#f1fcff]',
    fiction: 'bg-[#3a2028] text-[#fff4f6]',
    society: 'bg-[#2f2840] text-[#faf6ff]',
    news: 'bg-[#352323] text-[#fff5f2]',
  })[category];
}

function compactCount(value: number) {
  if (value >= 1000) return `${(value / 1000).toFixed(value >= 10000 ? 0 : 1)}k`;
  return String(value);
}

function isTypingTarget(target: EventTarget | null) {
  return target instanceof Element && Boolean(target.closest(
    'input, textarea, select, button, a, [contenteditable="true"], [role="dialog"], [data-reader-word]',
  ));
}

function nestedScrollerCanMove(
  target: EventTarget,
  root: HTMLDivElement | null,
  direction: 1 | -1,
) {
  if (!(target instanceof Element) || !root) return false;
  const scroller = target.closest<HTMLElement>('[data-feed-story-scroll]');
  if (!scroller || !root.contains(scroller)) return false;
  if (direction < 0) return scroller.scrollTop > 2;
  return scroller.scrollTop + scroller.clientHeight < scroller.scrollHeight - 2;
}
