import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type RefObject,
  type ReactNode,
} from 'react';
import {
  LuBookOpen,
  LuCheck,
  LuChevronDown,
  LuChevronLeft,
  LuChevronUp,
  LuHeart,
  LuMessageCircle,
  LuPause,
  LuPlus,
  LuRefreshCw,
  LuThumbsDown,
  LuVolume2,
  LuX,
} from 'react-icons/lu';

import {
  getLikedMicroFeed,
  getMicroFeed,
  recordMicroFeedInteraction,
  type DifficultWord,
  type MicroFeedItem,
  type MicroFeedPreferences,
  type MicroFeedReaction,
  type MicroFeedScript,
  type MicroFeedStrategy,
} from '../api/microFeed';
import { ttsAudioUrl } from '../api/listening';
import { FeedComments } from '../components/FeedComments';
import { Mascot } from '../components/Mascot';
import { MicroFeedOnboarding } from '../components/MicroFeedOnboarding';
import { WordReader } from '../components/WordReader';
import { TtsVoicePicker } from '../components/TtsVoicePicker';
import { ErrorNote, Spinner } from '../components/ui';
import { VUKOTOK_PATH } from '../components/Header';
import { useFocusTrap, useScrollLock } from '../lib/overlay';
import { Link } from '../lib/router';
import { useSeo } from '../lib/seo';
import { speechChunks } from '../lib/speech';
import { saveVocabularyWord } from '../lib/vocabulary';
import { useSync } from '../state/sync';

export function MicroFeed() {
  useSeo({
    title: 'Вукоток — сербский тикток: короткие тексты на сербском лентой',
    description:
      'Лента коротких текстов на сербском: листаете как тикток, но вместо видео — текст. Перевод любого слова по нажатию, озвучка и подбор по тому, что вы дочитываете.',
    // Раздел открывается и по прежнему адресу /micro-feed. Без явного указания
    // оба адреса объявляли бы каноническим себя, и вес страницы делился бы
    // надвое.
    canonical: VUKOTOK_PATH,
  });
  const [items, setItems] = useState<MicroFeedItem[]>([]);
  const [script, setScript] = useState<MicroFeedScript>(() =>
    localStorage.getItem('citavuk-micro-feed-script') === 'cyrillic' ? 'cyrillic' : 'latin',
  );
  const [strategy, setStrategy] = useState<MicroFeedStrategy>('cold');
  // Анкета приезжает вместе с лентой: решать, показывать ли опрос, нужно ДО
  // первой карточки, иначе он встаёт поверх уже открытой ленты.
  const [preferences, setPreferences] = useState<MicroFeedPreferences | null>(null);
  const [showLiked, setShowLiked] = useState(false);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [exhausted, setExhausted] = useState(false);
  const [error, setError] = useState('');
  const [activeIndex, setActiveIndex] = useState(0);
  // Карточка, чей полный текст открыт шторкой. Пока она открыта, лента не
  // листается: иначе колесо и стрелки уводили бы страницу из-под читаемого
  // текста.
  const [expanded, setExpanded] = useState<MicroFeedItem | null>(null);
  // Обработчик клавиш вешается один раз, поэтому состояние шторки он читает
  // через ref: замыкание на первое значение сделало бы проверку бесполезной.
  const expandedRef = useRef<MicroFeedItem | null>(null);
  // Обсуждение открывается внутри карточки, но лента должна замереть так же,
  // как под шторкой текста: иначе колесо и стрелки уводят страницу из-под
  // читаемой переписки.
  const [discussing, setDiscussing] = useState(false);
  const discussingRef = useRef(false);
  const idsRef = useRef<string[]>([]);
  const feedRef = useRef<HTMLDivElement>(null);
  const wheelLockedRef = useRef(false);
  // Обработчик колеса подписывается один раз, поэтому текущую карточку он
  // читает через ref: замыкание на первое значение листало бы всегда от нуля.
  const activeIndexRef = useRef(0);

  // Уход со страницы отменяет незавершённый запрос ленты.
  //
  // Раньше AbortController создавался внутри load, а `return () =>
  // controller.abort()` возвращался ИЗ async-функции — то есть внутрь промиса,
  // который вызывающий код выбрасывал. Очистка выглядела рабочей, но запрос не
  // отменялся никогда, а ответ приходил уже в размонтированный компонент.
  const abortRef = useRef<AbortController | null>(null);
  useEffect(() => () => abortRef.current?.abort(), []);

  const load = useCallback(async (reset = false) => {
    if (reset) {
      setLoading(true);
      setExhausted(false);
    } else {
      setLoadingMore(true);
    }
    setError('');
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;
    try {
      const exclude = reset ? [] : idsRef.current;
      const response = await getMicroFeed(exclude, controller.signal);
      setStrategy(response.strategy);
      if (response.preferences) setPreferences(response.preferences);
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
      // Отменённый запрос — не ошибка ленты: страницу просто закрыли.
      if (controller.signal.aborted) return;
      setError(caught instanceof Error ? caught.message : 'Не удалось загрузить ленту.');
    } finally {
      if (!controller.signal.aborted) {
        setLoading(false);
        setLoadingMore(false);
      }
    }
  }, []);

  useEffect(() => { void load(true); }, [load]);
  useEffect(() => { expandedRef.current = expanded; }, [expanded]);
  useEffect(() => { discussingRef.current = discussing; }, [discussing]);
  useEffect(() => { activeIndexRef.current = activeIndex; }, [activeIndex]);

  // Лента занимает экран целиком, поэтому страница под ней не прокручивается.
  // Замок общий на все слои (см. lib/overlay): раньше и здесь, и в шапке
  // каждый запоминал «прежнее» значение сам, и наложение их ломало.
  useScrollLock(true);
  useEffect(() => { window.scrollTo({ top: 0, behavior: 'auto' }); }, []);

  const scrollToCard = useCallback((requested: number) => {
    const container = feedRef.current;
    if (!container || items.length === 0) return;
    const index = Math.max(0, Math.min(requested, items.length - 1));
    const card = container.querySelector<HTMLElement>(`[data-feed-index="${index}"]`);
    if (!card) return;
    setActiveIndex(index);
    // Смещение считается от контейнера прокрутки, а не через offsetTop:
    // offsetTop меряется от ближайшего позиционированного предка, а это <main>,
    // а не сам скроллер. Сейчас они совпадают, но любой отступ сверху развалил
    // бы навигацию по карточкам, и заметно это стало бы не сразу.
    container.scrollTo({
      top: container.scrollTop + card.getBoundingClientRect().top
        - container.getBoundingClientRect().top,
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
      if (expandedRef.current || discussingRef.current || isTypingTarget(event.target)) return;
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

  // Колесо подписывается вручную, а НЕ через onWheel.
  //
  // React вешает wheel, touchstart и touchmove на корень пассивными
  // слушателями, поэтому preventDefault внутри onWheel не делает ничего (и
  // ругается в консоль). Обычная прокрутка при этом шла вместе с программной,
  // и на snap-mandatory они дрались: колесо пролистывало то одну карточку, то
  // сразу две. Только addEventListener с passive: false отменяет прокрутку.
  useEffect(() => {
    const container = feedRef.current;
    if (!container) return;

    const onWheel = (event: WheelEvent) => {
      if (expandedRef.current || discussingRef.current) return;
      if (Math.abs(event.deltaY) < 8 || event.ctrlKey) return;
      event.preventDefault();
      if (wheelLockedRef.current) return;
      wheelLockedRef.current = true;
      scrollToCard(activeIndexRef.current + (event.deltaY > 0 ? 1 : -1));
      window.setTimeout(() => { wheelLockedRef.current = false; }, 480);
    };

    container.addEventListener('wheel', onWheel, { passive: false });
    return () => container.removeEventListener('wheel', onWheel);
  }, [scrollToCard]);

  function changeScript(value: MicroFeedScript) {
    setScript(value);
    localStorage.setItem('citavuk-micro-feed-script', value);
  }

  if (loading) {
    return <main className="grid min-h-[70dvh] place-items-center"><Spinner className="size-7" /></main>;
  }

  // Анкета встаёт до ленты, а не поверх неё: спрашивать «что вам интересно» уже
  // после первой карточки — значит спрашивать с опозданием.
  if (preferences && !preferences.onboarded) {
    return (
      <MicroFeedOnboarding
        preferences={preferences}
        onDone={(saved) => { setPreferences(saved); void load(true); }}
      />
    );
  }

  if (items.length === 0) {
    return (
      <main className="mx-auto grid min-h-[70dvh] max-w-xl place-items-center px-5 text-center">
        <div>
          <img src="/img/citavuk_zadumch.png" alt="" className="mx-auto h-36 w-auto object-contain" />
          <h1 className="mt-5 text-3xl">Вукоток пока пуст</h1>
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
    <main className="relative h-dvh overflow-hidden bg-[#100e0c] text-white lg:h-[calc(100dvh-4rem)]">
      <div className="pointer-events-none absolute inset-x-0 top-0 z-30 bg-gradient-to-b from-black/75 to-transparent pb-6 text-white">
        <div className="pointer-events-auto mx-auto flex h-14 max-w-6xl items-center justify-between gap-3 px-4 sm:px-5">
          <div className="flex min-w-0 items-center gap-2">
            {/* На телефоне шапки сайта над лентой нет — эта ссылка и есть
                выход из раздела. */}
            <Link to="/" aria-label="На главную Читавука" className="-ml-1 grid size-9 shrink-0 place-items-center rounded-full text-xl hover:bg-white/10 lg:hidden">
              <LuChevronLeft />
            </Link>
            <h1 className="font-display text-xl font-bold">Вукоток</h1>
            <span className="hidden rounded-md border border-white/25 px-2 py-0.5 text-[0.68rem] font-bold uppercase sm:inline">эксперимент</span>
            {strategy !== 'cold' && <span className="hidden text-xs text-white/65 md:inline">Для вас</span>}
          </div>
          <div className="flex items-center gap-2">
            <span className="hidden min-w-10 text-center text-xs font-bold tabular-nums text-white/70 sm:inline">
              {activeIndex + 1} / {items.length}
            </span>
            {/* Понравившееся достаётся отсюда. Раньше лайк был только сигналом
                подбора: нажал — карточка уехала вверх, и найти её было негде. */}
            <button
              type="button"
              onClick={() => setShowLiked(true)}
              aria-label="Сохранённые карточки"
              title="Сохранённые карточки"
              className="grid size-9 place-items-center rounded-full text-white/80 hover:bg-white/10 hover:text-white"
            >
              <LuHeart className="size-[1.15rem]" />
            </button>
            <ScriptSwitch value={script} onChange={changeScript} />
            <div className="hidden sm:block [&_label]:!text-white/75 [&_label:hover]:!bg-white/10"><TtsVoicePicker compact /></div>
          </div>
        </div>
      </div>

      <div
        ref={feedRef}
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
            onExpand={() => {
              setExpanded(item);
              void recordMicroFeedInteraction(item.id, 'read_more_clicked').catch(() => {});
            }}
            onDiscussing={setDiscussing}
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

      {expanded && (
        <StorySheet item={expanded} script={script} onClose={() => setExpanded(null)} />
      )}

      {showLiked && (
        <LikedSheet
          script={script}
          onClose={() => setShowLiked(false)}
          onOpen={(item) => {
            setShowLiked(false);
            setExpanded(item);
          }}
        />
      )}

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
  onExpand,
  onDiscussing,
}: {
  index: number;
  item: MicroFeedItem;
  script: MicroFeedScript;
  onNeedMore?: () => void;
  onExpand: () => void;
  /** Открытая шторка обсуждения останавливает листание всей ленты. */
  onDiscussing: (open: boolean) => void;
}) {
  const text = script === 'cyrillic' ? item.textCyrillic : item.textLatin;
  const title = script === 'cyrillic' ? item.titleCyrillic : item.titleLatin;
  const minutes = Math.max(1, Math.round(text.split(/\s+/).length / 180));
  const { hook, truncated } = hookOf(text);
  const articleRef = useRef<HTMLElement>(null);
  const visibleAt = useRef<number | null>(null);
  const viewTimer = useRef<number | null>(null);
  const viewSent = useRef(false);
  const finishSent = useRef(false);
  const totalDwell = useRef(0);
  const requestedMore = useRef(false);
  const onNeedMoreRef = useRef(onNeedMore);
  const textRef = useRef(text);
  const speech = useCardSpeech(item, text);
  const stopSpeech = speech.stop;
  const [reaction, setReaction] = useState<MicroFeedReaction>(item.reaction);
  const [likes, setLikes] = useState(item.likesCount);
  const [dislikes, setDislikes] = useState(item.dislikesCount);
  const [comments, setComments] = useState(item.commentsCount);
  const [discussing, setDiscussing] = useState(false);
  const [justLiked, setJustLiked] = useState(false);
  // Сообщает только та карточка, которая обсуждение открыла. Если бы о своём
  // закрытом состоянии сообщали все, догруженная карточка снимала бы блокировку
  // с уже открытой шторки соседа.
  useEffect(() => {
    if (!discussing) return;
    onDiscussing(true);
    return () => onDiscussing(false);
  }, [discussing, onDiscussing]);

  useEffect(() => { onNeedMoreRef.current = onNeedMore; }, [onNeedMore]);
  useEffect(() => { textRef.current = text; }, [text]);

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
      // Карточка ушла с экрана — вместе с ней замолкает и её озвучка. Голос
      // из карточки, которую уже пролистали, звучит как поломка.
      stopSpeech();
      finishVisibility(item.id, visibleAt, viewTimer, finishSent, totalDwell, textRef.current);
    }, { threshold: [.15, .55, .9] });
    observer.observe(node);
    return () => {
      observer.disconnect();
      finishVisibility(item.id, visibleAt, viewTimer, finishSent, totalDwell, textRef.current);
    };
  }, [item.id, stopSpeech]);

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
      // Лайк — ещё и закладка, но об этом надо сказать: подсказка появляется
      // ровно в тот момент, когда человек её и заслужил, и гаснет сама.
      if (final === 1) {
        setJustLiked(true);
        window.setTimeout(() => setJustLiked(false), 4000);
      }
    } catch {
      setReaction(previous);
      setLikes(item.likesCount);
      setDislikes(item.dislikesCount);
    }
  }

  return (
    <article
      ref={articleRef}
      data-feed-index={index}
      /*
        На широком экране карточка — телефон посреди страницы, а не полоса во
        весь монитор. Растянутая на 2500 точек лента ничем не напоминала то,
        ради чего она сделана: строка текста уезжала на полметра вправо, а
        картинка превращалась в фон рабочего стола.
      */
      className="relative flex h-full snap-start snap-always items-center justify-center lg:gap-4 lg:px-6 lg:py-[4.5rem]"
    >
      <StoryBackdrop item={item} />

      {/*
        Пропорция телефона, но не строго 9:16: при 16 у карточки не остаётся
        ширины на строку, и текст рассыпается по три слова. Ограничение по
        ширине держит строку читаемой на любом мониторе.
      */}
      <div className={`relative flex size-full flex-col overflow-hidden lg:h-full lg:w-auto lg:min-w-[23rem] lg:max-w-[30rem] lg:rounded-[1.75rem] lg:border lg:border-white/10 lg:shadow-[0_24px_70px_rgba(0,0,0,.6)] lg:[aspect-ratio:10/16] ${categoryBackground(item.category)}`}>
        {/*
          Карточка ничем не скроллится внутри — и это главное в ней.
          Раньше текст на 100–150 слов не помещался на телефон, поэтому лежал во
          вложенном скроллере внутри snap-контейнера. На компьютере положение
          спасал обработчик колеса, а у касания такого обработчика нет: палец
          попадал во внутренний скроллер, и свайп к следующей карточке срабатывал
          через раз. Теперь на экране крючок, а полный текст открывается шторкой.
        */}
        {item.imageUrl
          ? (
            <img
              src={item.imageUrl}
              alt=""
              loading="lazy"
              className="absolute inset-0 size-full object-cover"
              onError={(event) => { event.currentTarget.style.display = 'none'; }}
            />
          )
          : <PlainCover title={title} />}
        <div className="absolute inset-0 bg-gradient-to-t from-black/95 via-black/72 to-black/30" />

        {/*
          Подпись сжимается, а не выталкивает заголовок за край.
          Раньше блок был обычным потоком внутри `justify-end`: когда текст не
          помещался, наружу уезжал ВЕРХ — то есть тема и заголовок, — и карточка
          начиналась с середины фразы. Теперь урезается только крючок, у него
          для этого есть «Читать дальше».
        */}
        <div className="relative flex h-full min-h-0 flex-col justify-end px-4 pb-6 pt-16 sm:px-6 sm:pb-8 lg:px-6 lg:pb-8 lg:pt-8">
          <div className="flex min-h-0 flex-col pr-14 sm:pr-16 lg:pr-0">
            <div className="flex shrink-0 flex-wrap items-center gap-2 text-xs font-bold uppercase text-white/70">
              <span className="rounded-md border border-white/20 bg-black/30 px-2 py-1 text-white/90">{categoryLabel(item.category)}</span>
              <span>{item.cefr}</span>
              <span aria-hidden="true">·</span>
              <span>{minutes} мин</span>
            </div>

            {/*
              Заголовок разбирается по словам наравне с текстом. Раньше он был
              обычной строкой, и самые заметные на карточке слова оказывались
              единственными, которые нельзя нажать. Обёртка — div с role, а не
              h2: внутри WordReader абзацы, а абзац внутри заголовка — невалидная
              разметка.
            */}
            <div role="heading" aria-level={2} className="mt-3 shrink-0">
              <WordReader
                paragraphs={[title]}
                paragraphClassName="font-display text-2xl font-bold leading-tight text-white sm:text-3xl"
              />
            </div>

            <div className="mt-3 min-h-0 overflow-hidden [mask-image:linear-gradient(to_bottom,#000_78%,transparent)]">
              <WordReader
                paragraphs={[hook]}
                paragraphClassName="font-display text-[1.05rem] leading-[1.55] text-white/90 sm:text-lg sm:leading-7"
              />
            </div>

            {truncated && (
              <button
                type="button"
                onClick={onExpand}
                className="mt-3 inline-flex shrink-0 items-center gap-2 self-start rounded-lg bg-white/15 px-4 py-2.5 font-semibold text-white backdrop-blur-sm transition-colors hover:bg-white/25"
              >
                Читать дальше
              </button>
            )}

            <Hashtags tags={item.tags} />

            {/*
              Сложные слова — кнопки, а не подписи. Прежде это был <span> с
              подсказкой в title: на телефоне такая подсказка не показывается
              вовсе, и разобранные для читателя слова нельзя было ни прочитать
              целиком, ни забрать в словарь.
            */}
            <div className="mt-3 flex shrink-0 gap-2 overflow-x-auto pb-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
              {item.difficultWords.map((word) => (
                <DifficultWordChip key={`${item.id}-${word.word}`} word={word} />
              ))}
            </div>

            <div className="mt-3 flex shrink-0 flex-wrap items-center justify-between gap-3 border-t border-white/15 pt-3 text-xs sm:text-sm">
              <SourceLine item={item} />
              {item.bookTargetUrl && <BookLink item={item} />}
            </div>
          </div>
        </div>

      </div>

      {/*
        На широком экране кнопки стоят СБОКУ от карточки, а не поверх неё: в
        колонке шириной с телефон они накрывали последние строки текста и
        обрезали разобранные слова.
      */}
      <div className="absolute bottom-6 right-2.5 z-10 flex flex-col items-center gap-3 sm:bottom-8 sm:right-4 lg:static lg:bottom-auto lg:right-auto lg:self-end lg:pb-8">
          <ActionButton
            label={speech.state === 'playing' ? 'Остановить озвучку' : 'Озвучить карточку'}
            active={speech.state === 'playing'}
            onClick={speech.toggle}
          >
            {speech.state === 'playing' ? <LuPause /> : <LuVolume2 />}
          </ActionButton>
          <ActionButton label="Обсуждение" count={comments} onClick={() => setDiscussing(true)}>
            <LuMessageCircle />
          </ActionButton>
          <ActionButton label="Нравится" count={likes} active={reaction === 1} onClick={() => void toggleReaction(1)}>
            <LuHeart />
          </ActionButton>
          <ActionButton label="Не показывать похожее" count={dislikes} active={reaction === -1} onClick={() => void toggleReaction(-1)}>
            <LuThumbsDown />
          </ActionButton>
        </div>

        {speech.state === 'error' && (
          <p className="pointer-events-none absolute inset-x-4 bottom-1 z-10 text-center text-xs font-semibold text-[#ffb4ae]">
            Озвучка сейчас недоступна.
          </p>
        )}

        {justLiked && (
          <div
            role="status"
            className="pointer-events-none absolute inset-x-4 bottom-2 z-20 mx-auto max-w-sm rounded-xl bg-white/95 px-4 py-2.5 text-center text-sm font-semibold text-black shadow-lg"
          >
            Сохранено — ищите в <LuHeart className="inline size-4 align-[-2px]" /> наверху
          </div>
        )}

        {discussing && (
          <FeedComments
            itemId={item.id}
            onClose={() => setDiscussing(false)}
            onCountChange={(delta) => setComments((value) => Math.max(0, value + delta))}
          />
        )}
    </article>
  );
}

/**
 * Обложка для карточки без картинки.
 *
 * Иллюстрация есть примерно у каждой четвёртой: у новостных лент картинок в
 * RSS нет вовсе, они приходят только из Википедии. Верхняя половина остальных
 * карточек была просто чёрной, и это читалось как незагрузившаяся картинка, а
 * не как задумка. Буква названия крупной плашкой — приём книжной вёрстки, и
 * пустоты в карточке не остаётся.
 */
function PlainCover({ title }: { title: string }) {
  const letter = [...title.trim()][0] ?? 'Ч';
  return (
    <div className="absolute inset-0 overflow-hidden" aria-hidden="true">
      <div className="absolute inset-x-0 top-0 h-2/3 bg-[radial-gradient(ellipse_at_50%_20%,rgba(255,255,255,.14),transparent_70%)]" />
      <span className="absolute left-1/2 top-[26%] -translate-x-1/2 -translate-y-1/2 font-display text-[11rem] font-bold leading-none text-white/[.07] sm:text-[14rem]">
        {letter}
      </span>
      {/* Читавук у карточек без иллюстрации. Поза сделана ровно для этого
          раздела, но жила только на главной — там он про Вукоток рассказывал,
          а в самом Вукотоке его не было. */}
      <Mascot
        pose="citavuk_vukotok"
        alt=""
        className="absolute left-1/2 top-[26%] w-40 -translate-x-1/2 -translate-y-1/2 opacity-90 drop-shadow-[0_10px_30px_rgba(0,0,0,.55)] sm:w-52"
      />
    </div>
  );
}

/**
 * Размытая подложка вокруг телефонной карточки на широком экране.
 *
 * Пустые поля по бокам выглядели бы обрезанным видео. Размытая та же картинка —
 * приём самого тиктока: она заполняет экран, но не соперничает с карточкой.
 */
function StoryBackdrop({ item }: { item: MicroFeedItem }) {
  return (
    <div className="pointer-events-none absolute inset-0 hidden overflow-hidden lg:block" aria-hidden="true">
      {item.imageUrl && (
        <img
          src={item.imageUrl}
          alt=""
          loading="lazy"
          className="size-full scale-110 object-cover opacity-40 blur-3xl"
          onError={(event) => { event.currentTarget.style.display = 'none'; }}
        />
      )}
      <div className="absolute inset-0 bg-[#100e0c]/70" />
    </div>
  );
}

/** Метки темы. В ленте они читаются как хэштеги — так же, как в тиктоке. */
function Hashtags({ tags }: { tags: string[] }) {
  const shown = tags.filter((tag) => tag.trim() !== '').slice(0, 4);
  if (shown.length === 0) return null;
  return (
    <p className="mt-2.5 flex flex-wrap gap-x-2 gap-y-1 text-sm font-semibold text-white/70">
      {shown.map((tag) => <span key={tag}>#{tag.replace(/\s+/g, '')}</span>)}
    </p>
  );
}

/**
 * Разобранное для читателя слово: перевод виден сразу, нажатие кладёт в словарь.
 */
function DifficultWordChip({ word }: { word: DifficultWord }) {
  const { sync } = useSync();
  const [saved, setSaved] = useState(false);
  const [failed, setFailed] = useState(false);

  async function save() {
    if (saved) return;
    try {
      await saveVocabularyWord({
        word: word.word,
        lemma: word.lemma,
        translation: word.translationRu,
        // Произношение — половина пользы от разбора: по написанию сербское
        // ударение и длину гласного не восстановить.
        forms: word.transcription ? { произношение: word.transcription } : {},
      });
      setSaved(true);
      setFailed(false);
      void sync();
    } catch {
      setFailed(true);
    }
  }

  return (
    <button
      type="button"
      onClick={() => void save()}
      aria-label={saved ? `${word.word} — в словаре` : `Добавить «${word.word}» в словарь`}
      className={`flex shrink-0 items-center gap-1.5 rounded-md border px-2.5 py-1.5 text-xs transition-colors ${
        saved
          ? 'border-[#7fbf7f]/60 bg-[#1e3a1e]/70 text-white'
          : 'border-white/15 bg-black/35 text-white hover:border-white/40 hover:bg-black/55'
      }`}
    >
      {saved ? <LuCheck className="size-3.5 shrink-0 text-[#9fd89f]" /> : <LuPlus className="size-3.5 shrink-0 text-white/50" />}
      <span><strong>{word.word}</strong> <span className="text-white/65">{word.translationRu}</span></span>
      {failed && <span className="text-[#ffb4ae]">не вышло</span>}
    </button>
  );
}

/**
 * Озвучка карточки.
 *
 * Синтезатор отказывается озвучивать больше 400 символов, а в карточке их
 * 700–1100 — поэтому кнопка не работала вовсе: запрос уходил, приходила пустая
 * ошибка, значок молча возвращался назад. Текст режется на куски по границе
 * предложения и играется подряд.
 */
function useCardSpeech(item: MicroFeedItem, text: string) {
  const [state, setState] = useState<'idle' | 'playing' | 'error'>('idle');
  const current = useRef<HTMLAudioElement | null>(null);
  const stopped = useRef(false);

  const stop = useCallback(() => {
    stopped.current = true;
    current.current?.pause();
    current.current = null;
    setState('idle');
  }, []);

  // Смена алфавита и уход карточки с экрана обрывают чтение: озвучка одного
  // текста поверх другого — самая заметная поломка из возможных.
  useEffect(() => stop, [stop, text]);

  const toggle = useCallback(() => {
    if (state === 'playing') {
      stop();
      return;
    }
    stopped.current = false;
    setState('playing');
    void recordMicroFeedInteraction(item.id, 'audio_play').catch(() => {});
    // Готовая запись, если она есть, звучит лучше синтеза и идёт одним файлом.
    const urls = item.audioUrl ? [item.audioUrl] : speechChunks(text).map((chunk) => ttsAudioUrl(chunk));
    void playSequence(urls, current, stopped)
      .then(() => { if (!stopped.current) setState('idle'); })
      .catch(() => { if (!stopped.current) setState('error'); });
  }, [item.audioUrl, item.id, state, stop, text]);

  return { state, toggle, stop };
}

async function playSequence(
  urls: string[],
  current: RefObject<HTMLAudioElement | null>,
  stopped: RefObject<boolean>,
) {
  // Следующий кусок начинает грузиться, пока звучит текущий: синтез первой
  // фразы занимает секунду-другую, и без прогрева пауза слышна на каждом стыке.
  let next: HTMLAudioElement | null = null;
  for (const [index, url] of urls.entries()) {
    if (stopped.current) return;
    const audio = next ?? new Audio(url);
    const following = urls[index + 1];
    next = following ? new Audio(following) : null;
    current.current = audio;
    await playOne(audio, stopped);
  }
}

function playOne(audio: HTMLAudioElement, stopped: RefObject<boolean>) {
  return new Promise<void>((resolve, reject) => {
    audio.onended = () => resolve();
    audio.onerror = () => reject(new Error('Озвучка недоступна.'));
    // Остановка читателем — не ошибка: последовательность просто заканчивается.
    audio.onpause = () => { if (stopped.current) resolve(); };
    audio.play().catch(reject);
  });
}

/**
 * Полный текст карточки — шторкой поверх ленты.
 *
 * Шторка, а не разворот карточки на месте: развернувшийся текст снова не
 * поместился бы на экран, и внутри карточки опять появился бы скроллер,
 * отбирающий свайп. Здесь скроллится шторка, а лента под ней не листается
 * вовсе, пока шторка открыта.
 */
function StorySheet({
  item,
  script,
  onClose,
}: {
  item: MicroFeedItem;
  script: MicroFeedScript;
  onClose: () => void;
}) {
  const text = script === 'cyrillic' ? item.textCyrillic : item.textLatin;
  const title = script === 'cyrillic' ? item.titleCyrillic : item.titleLatin;
  const sheetRef = useRef<HTMLDivElement>(null);

  // Шторка перекрывает ленту целиком, поэтому фокус обязан остаться внутри:
  // иначе Tab уводил в карточки под ней, которых читатель уже не видит.
  useFocusTrap(true, sheetRef);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onClose]);

  // Шторка закрывается только тем нажатием, которое НАЧАЛОСЬ на подложке.
  // Иначе выделение фразы, доведённое пальцем до края шторки, отпускалось уже
  // на подложке — и вместо панели перевода шторка просто захлопывалась.
  const closedFromBackdrop = useRef(false);

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-black/70 sm:items-center"
      role="dialog"
      aria-modal="true"
      aria-label={title}
      onPointerDown={(event) => {
        closedFromBackdrop.current = event.target === event.currentTarget;
      }}
      onClick={(event) => {
        if (event.target === event.currentTarget && closedFromBackdrop.current) onClose();
      }}
    >
      <div
        ref={sheetRef}
        onClick={(event) => event.stopPropagation()}
        className="flex max-h-[88dvh] w-full max-w-2xl flex-col rounded-t-3xl bg-[#1c1814] text-white shadow-2xl sm:rounded-3xl"
      >
        <div className="flex items-start gap-3 border-b border-white/10 px-5 py-4">
          <div role="heading" aria-level={2} className="min-w-0 flex-1">
            <WordReader
              paragraphs={[title]}
              paragraphClassName="font-display text-xl font-bold leading-tight"
            />
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Закрыть"
            className="grid size-9 shrink-0 place-items-center rounded-full bg-white/10 text-lg hover:bg-white/20"
          >
            <LuX />
          </button>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-5 py-4">
          <WordReader
            paragraphs={[text]}
            paragraphClassName="font-display text-[1.05rem] leading-[1.62] text-white/90 sm:text-lg sm:leading-8"
          />
          <div className="mt-5 flex flex-wrap gap-2">
            {item.difficultWords.map((word) => (
              <DifficultWordChip key={`sheet-${item.id}-${word.word}`} word={word} />
            ))}
          </div>
          <div className="mt-5 border-t border-white/15 pt-3 text-xs sm:text-sm">
            <SourceLine item={item} />
          </div>
        </div>
      </div>
    </div>
  );
}

/**
 * Понравившееся: карточки, отмеченные лайком.
 *
 * Лайк в ленте был только сигналом подбора — нажал, карточка уехала вверх, и
 * найти её было негде. На чужом языке лайк чаще всего значит «вернусь и
 * разберу», и без этого списка обещание не выполнялось.
 */
function LikedSheet({
  script,
  onClose,
  onOpen,
}: {
  script: MicroFeedScript;
  onClose: () => void;
  onOpen: (item: MicroFeedItem) => void;
}) {
  const [items, setItems] = useState<MicroFeedItem[] | null>(null);
  const [error, setError] = useState('');
  const sheetRef = useRef<HTMLDivElement>(null);
  const fromBackdrop = useRef(false);

  useFocusTrap(true, sheetRef);

  useEffect(() => {
    const controller = new AbortController();
    void getLikedMicroFeed(controller.signal)
      .then(setItems)
      .catch((caught) => {
        if (controller.signal.aborted) return;
        setItems([]);
        setError(caught instanceof Error ? caught.message : 'Не удалось загрузить сохранённое.');
      });
    return () => controller.abort();
  }, []);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onClose]);

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-black/70 sm:items-center"
      role="dialog"
      aria-modal="true"
      aria-label="Сохранённые карточки"
      onPointerDown={(event) => { fromBackdrop.current = event.target === event.currentTarget; }}
      onClick={(event) => {
        if (event.target === event.currentTarget && fromBackdrop.current) onClose();
      }}
    >
      <div
        ref={sheetRef}
        className="flex max-h-[88dvh] w-full max-w-2xl flex-col rounded-t-3xl bg-[#1c1814] text-white shadow-2xl sm:rounded-3xl"
      >
        <div className="flex items-center gap-3 border-b border-white/10 px-5 py-4">
          <h2 className="min-w-0 flex-1 font-display text-xl font-bold">Понравившееся</h2>
          <button
            type="button"
            onClick={onClose}
            aria-label="Закрыть"
            className="grid size-9 shrink-0 place-items-center rounded-full bg-white/10 text-lg hover:bg-white/20"
          >
            <LuX />
          </button>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-5 py-4">
          {items === null && <div className="grid place-items-center py-10"><Spinner className="size-6" /></div>}
          {error && <ErrorNote>{error}</ErrorNote>}
          {items?.length === 0 && !error && (
            <div className="py-8 text-center">
              <Mascot pose="citavuk_vukotok" alt="" className="mx-auto w-28" />
              <p className="mt-4 font-semibold">Пока пусто</p>
              <p className="mt-1 text-sm text-white/65">
                Нажмите <LuHeart className="inline size-4 align-[-2px]" /> на карточке — она
                окажется здесь, и к ней можно будет вернуться.
              </p>
            </div>
          )}
          <ul className="space-y-2">
            {items?.map((item) => (
              <li key={item.id}>
                <button
                  type="button"
                  onClick={() => onOpen(item)}
                  className="flex w-full items-center gap-3 rounded-xl border border-white/10 bg-black/25 p-3 text-left transition-colors hover:border-white/35 hover:bg-black/40"
                >
                  {item.imageUrl
                    ? (
                      <img
                        src={item.imageUrl}
                        alt=""
                        loading="lazy"
                        className="size-14 shrink-0 rounded-lg object-cover"
                        onError={(event) => { event.currentTarget.style.display = 'none'; }}
                      />
                    )
                    : (
                      <span className={`grid size-14 shrink-0 place-items-center rounded-lg font-display text-2xl font-bold ${categoryBackground(item.category)}`}>
                        {[...(script === 'cyrillic' ? item.titleCyrillic : item.titleLatin).trim()][0] ?? 'Ч'}
                      </span>
                    )}
                  <span className="min-w-0 flex-1">
                    <span className="block truncate font-semibold">
                      {script === 'cyrillic' ? item.titleCyrillic : item.titleLatin}
                    </span>
                    <span className="mt-0.5 block text-xs text-white/55">
                      {categoryLabel(item.category)} · {item.cefr}
                    </span>
                  </span>
                  <LuBookOpen className="size-5 shrink-0 text-white/45" />
                </button>
              </li>
            ))}
          </ul>
        </div>
      </div>
    </div>
  );
}

/**
 * Крючок: начало текста, помещающееся на экран телефона.
 *
 * Режется по границе предложения — оборванная на полуслове фраза читается как
 * сбой загрузки, а не как приглашение открыть продолжение.
 */
export function hookOf(text: string, maxWords = 46): { hook: string; truncated: boolean } {
  const trimmed = text.trim();
  if (trimmed.split(/\s+/).length <= maxWords) return { hook: trimmed, truncated: false };

  const sentences = trimmed.match(/[^.!?…]+[.!?…]*\s*/g) ?? [trimmed];
  let hook = '';
  for (const sentence of sentences) {
    const next = hook + sentence;
    if (next.trim().split(/\s+/).length > maxWords) {
      // Первое же предложение длиннее крючка — так выглядит абзац без единой
      // точки. Режем по словам: отдать его целиком значило бы вернуться к
      // тексту, который не помещается на экран.
      if (hook.trim() === '') {
        hook = trimmed.split(/\s+/).slice(0, maxWords).join(' ') + '…';
      }
      break;
    }
    hook = next;
  }
  return { hook: hook.trim(), truncated: true };
}

function finishVisibility(
  itemId: string,
  visibleAt: RefObject<number | null>,
  timer: RefObject<number | null>,
  sent: RefObject<boolean>,
  totalDwell: RefObject<number>,
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
  return ({
    history: 'История', culture: 'Культура', science: 'Наука',
    fiction: 'Литература', society: 'Общество', news: 'Новости',
    travel: 'Путешествия', food: 'Еда', sport: 'Спорт',
    music: 'Музыка', language: 'Про язык',
  })[category];
}

function categoryBackground(category: MicroFeedItem['category']) {
  return ({
    history: 'bg-[#34281d] text-[#fff7e7]',
    culture: 'bg-[#173329] text-[#f4fff7]',
    science: 'bg-[#173038] text-[#f1fcff]',
    fiction: 'bg-[#3a2028] text-[#fff4f6]',
    society: 'bg-[#2f2840] text-[#faf6ff]',
    news: 'bg-[#352323] text-[#fff5f2]',
    travel: 'bg-[#1b3340] text-[#f0fbff]',
    food: 'bg-[#3a2f18] text-[#fffaef]',
    sport: 'bg-[#1e3524] text-[#f2fff5]',
    music: 'bg-[#2b1f3c] text-[#f9f4ff]',
    language: 'bg-[#35311c] text-[#fffdf0]',
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
