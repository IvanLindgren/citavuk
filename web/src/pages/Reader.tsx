import { AnimatePresence, motion, useReducedMotion } from 'framer-motion';
import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties } from 'react';
import { HiBackward, HiForward, HiPause, HiPlay, HiSpeakerWave, HiXMark } from 'react-icons/hi2';
import { Virtuoso, type VirtuosoHandle } from 'react-virtuoso';

import { downloadContent } from '../api/sync';
import { Discussion } from '../components/Discussion';
import { Mascot } from '../components/Mascot';
import { BookLevelNotice } from '../components/BookLevelNotice';
import { ReaderSettingsPanel } from '../components/ReaderSettingsPanel';
import { ShareBook } from '../components/ShareBook';
import { Button, ButtonLink, Spinner } from '../components/ui';
import { WordReader, type ReaderMark } from '../components/WordReader';
import { getBook, getParagraphs, saveProgress, type BookMeta } from '../lib/books';
import { odysseyRewardUnlocked } from '../events/odyssey';
import { paginate, pageForPosition } from '../lib/pages';
import { playPageTurn, releasePageTurn } from '../lib/pageTurn';
import {
  FONT_STACKS,
  FULL_WIDTH,
  paletteFor,
  useReaderSettings,
} from '../lib/readerSettings';
import { Link, useParams, useRouter } from '../lib/router';
import { useAuth } from '../state/auth';
import { useSeo } from '../lib/seo';
import { useAnnouncements } from '../state/announcements';
import { ttsAudioUrl } from '../api/listening';
import { TtsVoicePicker } from '../components/TtsVoicePicker';
import { parseBlock } from '../lib/blocks';
import { tokenize } from '../lib/tokenize';
import { setReadingProgress } from '../lib/readingProgress';
import { deleteReaderQuote, listReaderQuotes, quoteColor, recolorReaderQuote, saveReaderQuote, type QuoteColor, type ReaderQuote } from '../lib/readerQuotes';
import { HighlightPicker, QUOTE_SWATCH } from '../components/HighlightPicker';
import { useSync } from '../state/sync';

type LoadState =
  | { kind: 'loading' }
  | { kind: 'missing' }
  | { kind: 'needsDownload'; book: BookMeta }
  | { kind: 'ready'; book: BookMeta; paragraphs: string[] };

interface AudiobookCue {
  text: string;
  page: number;
  paragraph: number;
  start: number;
}

export function Reader() {
  useSeo({
    title: 'Читалка — Читавук',
    noindex: true,
  });

  const { id } = useParams();
  const { revision, sync } = useSync();
  const [quotes, setQuotes] = useState<ReaderQuote[]>([]);
  const [quotesOpen, setQuotesOpen] = useState(false);
  const { navigate } = useRouter();
  const { account } = useAuth();
  const { rewards } = useAnnouncements();
  const reduceMotion = useReducedMotion();
  const { settings, update, reset } = useReaderSettings();

  const [state, setState] = useState<LoadState>({ kind: 'loading' });
  const [downloading, setDownloading] = useState(false);
  const [page, setPage] = useState(0);
  const pageRef = useRef(page);
  pageRef.current = page;
  const [panelOpen, setPanelOpen] = useState(false);
  const [discussionToken, setDiscussionToken] = useState('');
  const [discussionOpen, setDiscussionOpen] = useState(false);
  // Направление последнего перехода: страница уезжает туда, откуда пришла
  // следующая, иначе перелистывание «вперёд» и «назад» выглядят одинаково.
  const [direction, setDirection] = useState(1);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const continuousRef = useRef<VirtuosoHandle>(null);
  const flowRef = useRef(settings.flow);
  const playCueRef = useRef<(index: number, manual?: boolean) => void>(() => {});
  const [audiobookEnabled, setAudiobookEnabled] = useState(false);
  const [audiobookPlaying, setAudiobookPlaying] = useState(false);
  const [audiobookCue, setAudiobookCue] = useState(0);
  const [audiobookSpeed, setAudiobookSpeed] = useState(1);
  const [audioMark, setAudioMark] = useState<{
    page: number;
    paragraph: number;
    start: number;
    end: number;
  } | null>(null);

  useEffect(() => {
    if (!id) return;
    let cancelled = false;

    void (async () => {
      const book = await getBook(id);
      if (cancelled) return;
      if (!book) {
        setState({ kind: 'missing' });
        return;
      }

      const paragraphs = await getParagraphs(id);
      if (cancelled) return;

      // Книга пришла с другого устройства: метаданные есть, текста нет.
      if (paragraphs.length === 0 && book.contentSha) {
        setState({ kind: 'needsDownload', book });
        return;
      }
      if (book.sourceKey.startsWith('share:')) {
        setDiscussionToken(book.sourceKey.slice('share:'.length));
        setDiscussionOpen(true);
      }
      setState({ kind: 'ready', book, paragraphs });
    })();

    return () => {
      cancelled = true;
    };
  }, [id]);

  // Звуковое устройство держать открытым после ухода из читалки незачем.
  useEffect(() => releasePageTurn, []);

  const download = useCallback(async () => {
    if (state.kind !== 'needsDownload') return;
    setDownloading(true);
    const paragraphs = await downloadContent(state.book);
    setDownloading(false);
    if (paragraphs) {
      setState({ kind: 'ready', book: state.book, paragraphs });
    }
  }, [state]);

  // Как только текст понадобился, а связь есть — качаем сами, без лишнего
  // нажатия. Кнопка остаётся на случай неудачи.
  useEffect(() => {
    if (state.kind === 'needsDownload' && account && navigator.onLine) {
      void download();
    }
  }, [state.kind, account, download]);

  const paragraphs = state.kind === 'ready' ? state.paragraphs : [];

  /** Абзацы группируются в страницы примерно равной длины (см. lib/pages). */
  const pages = useMemo(() => paginate(paragraphs), [paragraphs]);

  const audiobookCues = useMemo(() => {
    const cues: AudiobookCue[] = [];
    const sentence = /[^.!?…]+[.!?…]*/g;
    pages.forEach((entry, pageIndex) => {
      entry.texts.forEach((raw, paragraph) => {
        const block = parseBlock(raw);
        if (block.kind !== 'text') return;
        for (const match of block.text.matchAll(sentence)) {
          const full = match[0];
          const text = full.trim();
          if (!text) continue;
          const leading = full.length - full.trimStart().length;
          cues.push({
            text,
            page: pageIndex,
            paragraph,
            start: (match.index ?? 0) + leading,
          });
        }
      });
    });
    return cues;
  }, [pages]);

  /** Первый абзац каждой страницы — прогресс хранится в абзацах, не в страницах. */
  const pageStarts = useMemo(() => pages.map((entry) => entry.start), [pages]);
  useEffect(() => {
    if (!id) return;
    let cancelled = false;
    setQuotes([]);
    void listReaderQuotes(id).then(items => { if (!cancelled) setQuotes(items); }).catch(() => {});
    return () => { cancelled = true; };
  }, [id, account?.id, revision]);
  const quoteMarks = (pageIndex: number) => (pages[pageIndex]?.texts ?? []).map<ReaderMark[]>((_, paragraph) =>
    quotes.filter(quote => quote.page === pageIndex && quote.paragraph === paragraph)
      .map(quote => ({ start: quote.start, end: quote.end, kind: 'quote' as const, value: quoteColor(quote.color) || undefined })));
  const addQuote = async (pageIndex: number, paragraph: number, start: number, end: number, text: string, color: QuoteColor = '') => {
    if (!id) return;
    // Тот же фрагмент ещё раз — значит, его перекрашивают, а не дублируют.
    const same = quotes.find(item => !item.deleted && item.page === pageIndex && item.paragraph === paragraph && item.start === start && item.end === end);
    try {
      if (same) {
        if (quoteColor(same.color) === color) return;
        const updated = await recolorReaderQuote(same.id, color);
        if (updated) setQuotes(previous => previous.map(item => item.id === same.id ? updated : item));
      } else {
        const item = await saveReaderQuote({bookId:id, page:pageIndex, paragraph, start, end, text, color});
        setQuotes(previous => [...previous, item]);
      }
      void sync();
    } catch { /* Чтение книги продолжает работать и без локальной записи. */ }
  };
  const recolorQuote = async (quoteId: string, color: QuoteColor) => {
    const updated = await recolorReaderQuote(quoteId, color).catch(() => null);
    if (updated) {
      setQuotes(previous => previous.map(item => item.id === quoteId ? updated : item));
      void sync();
    }
  };

  // Открываем на том месте, где остановились.
  useEffect(() => {
    if (state.kind !== 'ready' || pageStarts.length === 0) return;
    const target = pageForPosition(pages,state.book.lastParagraph,state.book.lastOffset);
    const next = target < 0 ? 0 : target;
    setPage(next);
    if (settings.flow === 'scroll') {
      requestAnimationFrame(() => {
        continuousRef.current?.scrollToIndex({ index: next, align: 'start' });
      });
    }
  }, [state, pageStarts]);

  useEffect(() => {
    const switched = flowRef.current !== settings.flow;
    flowRef.current = settings.flow;
    if (!switched || settings.flow !== 'scroll') return;
    requestAnimationFrame(() => {
      continuousRef.current?.scrollToIndex({ index: page, align: 'start' });
    });
  }, [page, settings.flow]);

  const goTo = useCallback(
    (next: number) => {
      if (next < 0 || next >= pages.length || state.kind !== 'ready') return;
      setDirection(next > page ? 1 : -1);
      setPage(next);
      if (settings.flow === 'scroll') {
        continuousRef.current?.scrollToIndex({
          index: next,
          align: 'start',
          behavior: 'smooth',
        });
      } else {
        playPageTurn(settings.sound);
        window.scrollTo({ top: 0, behavior: 'smooth' });
      }
      void saveProgress(state.book.id, pageStarts[next] ?? 0, pages[next]?.offset ?? 0);
    },
    [pages.length, state, pageStarts, page, settings.flow, settings.sound],
  );

  const audiobookStorageKey = `citavuk-audiobook-${id ?? 'unknown'}`;

  const saveAudiobook = useCallback((enabled: boolean, cue: number, speed: number) => {
    try { localStorage.setItem(
      audiobookStorageKey,
      JSON.stringify({ enabled, cue, speed }),
    ); } catch { /* Недоступное хранилище не должно прерывать озвучку. */ }
  }, [audiobookStorageKey]);

  const showAudiobookCue = useCallback((index: number, manual = false) => {
    const cue = audiobookCues[index];
    if (!cue || state.kind !== 'ready') return;
    if (!manual && (!settings.audioFollow || cue.page === pageRef.current)) return;
    setDirection(cue.page >= pageRef.current ? 1 : -1);
    setPage(cue.page);
    if (settings.flow === 'scroll') {
      continuousRef.current?.scrollToIndex({
        index: cue.page,
        align: 'center',
        behavior: 'smooth',
      });
    } else {
      window.scrollTo({ top: 0, behavior: 'smooth' });
    }
    void saveProgress(state.book.id, pageStarts[cue.page] ?? 0, pages[cue.page]?.offset ?? 0);
  }, [audiobookCues, pageStarts, settings.flow, settings.audioFollow, state]);

  const showCueRef = useRef(showAudiobookCue);
  showCueRef.current = showAudiobookCue;

  const playAudiobookCue = useCallback((index: number, manual = false) => {
    const cue = audiobookCues[index];
    if (!cue) {
      setAudiobookPlaying(false);
      return;
    }
    audioRef.current?.pause();
    const audio = new Audio(ttsAudioUrl(cue.text));
    audio.playbackRate = audiobookSpeed;
    audioRef.current = audio;
    setAudiobookEnabled(true);
    setAudiobookCue(index);
    setAudioMark(null);
    showAudiobookCue(index, manual);
    saveAudiobook(true, index, audiobookSpeed);
    audio.onplay = () => setAudiobookPlaying(true);
    audio.onpause = () => setAudiobookPlaying(false);
    audio.onended = () => playCueRef.current(index + 1);
    audio.ontimeupdate = () => {
      if (!Number.isFinite(audio.duration) || audio.duration <= 0) return;
      const ratio = Math.min(0.999, audio.currentTime / audio.duration);
      const char = cue.start + Math.floor(cue.text.length * ratio);
      const source = pages[cue.page]?.texts[cue.paragraph] ?? '';
      const block = parseBlock(source);
      if (block.kind !== 'text') return;
      const token = tokenize(block.text).find(
        (item) => item.isWord && char >= item.start && char < item.end,
      );
      if (token) {
        setAudioMark({
          page: cue.page,
          paragraph: cue.paragraph,
          start: token.start,
          end: token.end,
        });
      }
    };
    void audio.play().catch(() => setAudiobookPlaying(false));
  }, [audiobookCues, audiobookSpeed, pages, saveAudiobook, showAudiobookCue]);

  playCueRef.current = playAudiobookCue;

  useEffect(() => {
    if (audiobookCues.length === 0) return;
    try {
      const saved = JSON.parse(localStorage.getItem(audiobookStorageKey) ?? '{}') as {
        enabled?: boolean;
        cue?: number;
        speed?: number;
      };
      if (!saved.enabled) return;
      const cue = Math.max(0, Math.min(saved.cue ?? 0, audiobookCues.length - 1));
      const speed = Math.max(0.7, Math.min(saved.speed ?? 1, 1.8));
      setAudiobookEnabled(true);
      setAudiobookCue(cue);
      setAudiobookSpeed(speed);
      showCueRef.current(cue);
    } catch {
      try { localStorage.removeItem(audiobookStorageKey); } catch { /* Приватное окно. */ }
    }
  }, [audiobookCues, audiobookStorageKey]);

  useEffect(() => () => audioRef.current?.pause(), []);

  // Полосу прогресса рисует шапка — читалка только сообщает долю прочитанного.
  // Полоса привязана к нижнему краю шапки, и держать её снаружи можно было
  // только повторяя чужую высоту; отсюда она и уезжала.
  const progress = pages.length > 1 ? ((page + 1) / pages.length) * 100 : 100;
  useEffect(() => {
    setReadingProgress(state.kind === 'ready' ? progress : null);
  }, [progress, state.kind]);
  useEffect(() => () => setReadingProgress(null), []);

  // Листание с клавиатуры — на десктопе это основной способ читать.
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      // Не перехватываем клавиши, когда пользователь печатает или крутит
      // ползунок в настройках.
      const target = event.target;
      if (
        target instanceof HTMLInputElement ||
        target instanceof HTMLTextAreaElement
      ) {
        return;
      }
      // В непрерывном режиме стрелки, PageUp/PageDown и пробел принадлежат
      // обычной прокрутке браузера.
      if (settings.flow === 'scroll') return;
      switch (event.key) {
        case 'ArrowRight':
        case 'PageDown':
          goTo(page + 1);
          break;
        case 'ArrowLeft':
        case 'PageUp':
          goTo(page - 1);
          break;
        case ' ':
          // Пробел листает только когда страница долистана до низа: иначе он
          // отберёт у браузера прокрутку, а страница длиннее экрана.
          if (atBottom()) {
            event.preventDefault();
            goTo(event.shiftKey ? page - 1 : page + 1);
          }
          break;
        default:
          break;
      }
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [page, goTo, settings.flow]);

  const onContinuousRange = useCallback(
    ({ startIndex }: { startIndex: number }) => {
      if (
        settings.flow !== 'scroll' ||
        state.kind !== 'ready' ||
        startIndex === page
      ) {
        return;
      }
      setPage(startIndex);
      void saveProgress(state.book.id, pageStarts[startIndex] ?? 0, pages[startIndex]?.offset ?? 0);
    },
    [page, pageStarts, settings.flow, state],
  );

  if (state.kind === 'loading') {
    return (
      <div className="flex min-h-[60vh] items-center justify-center text-[var(--text-muted)]">
        <Spinner className="size-6" />
      </div>
    );
  }

  if (state.kind === 'missing') {
    return (
      <main className="flex min-h-[60vh] flex-col items-center justify-center px-5 text-center">
        <h1 className="text-2xl">Книга не найдена</h1>
        <p className="mt-3 text-[var(--text-muted)]">
          Возможно, её удалили или открыли в другом браузере.
        </p>
        <ButtonLink to="/library" className="mt-6">В библиотеку</ButtonLink>
      </main>
    );
  }

  if (state.kind === 'needsDownload') {
    return (
      <main className="flex min-h-[60vh] flex-col items-center justify-center px-5 text-center">
        <div className="mb-6 w-36">
          <Mascot pose="citavuk_povtor" alt="" width={288} float />
        </div>
        <h1 className="text-2xl">{state.book.title}</h1>
        <p className="mt-3 max-w-sm text-[var(--text-muted)]">
          Книга добавлена на другом устройстве. Загрузим текст — и можно читать.
        </p>
        <Button className="mt-6" onClick={() => void download()} disabled={downloading}>
          {downloading ? <Spinner /> : 'Загрузить текст'}
        </Button>
        {!account && (
          <p className="mt-4 text-sm text-[var(--text-muted)]">
            Для загрузки нужно войти в аккаунт.
          </p>
        )}
      </main>
    );
  }

  const current = pages[page]?.texts ?? [];
  const audioMarks = current.map<ReaderMark[]>((_, paragraph) =>
    audioMark && audioMark.page === page && audioMark.paragraph === paragraph
      ? [{ ...audioMark, kind: 'audio' }]
      : [],
  );
  const hasOdysseyReward = odysseyRewardUnlocked(account?.id);
  const campaignRewardUrl = rewards.reader_background_100 ?? '';
  const effectiveTheme = (settings.theme === 'odyssey' && !hasOdysseyReward) ||
    (settings.theme === 'campaign100' && !campaignRewardUrl)
    ? 'auto'
    : settings.theme;
  const palette = paletteFor(effectiveTheme);
  const campaignBackground = effectiveTheme === 'campaign100' && campaignRewardUrl
    ? `url(${JSON.stringify(campaignRewardUrl)})`
    : undefined;
  const flip = settings.animate && !reduceMotion && !settings.calm;

  // Отступ между абзацами задаётся переменной, а не полем `marginBottom`:
  // строчный стиль перебил бы любое правило и оставил лишний отступ под
  // последним абзацем, из-за чего низ страницы выглядел бы кривым.
  const pageStyle = {
    background: palette?.background,
    backgroundImage: palette?.backgroundImage,
    backgroundSize: palette?.backgroundSize,
    backgroundRepeat: palette?.backgroundImage ? 'repeat' : undefined,
    color: palette?.text,
    borderColor: palette?.border,
    maxWidth: settings.maxWidth >= FULL_WIDTH ? undefined : settings.maxWidth,
    '--reader-gap': `${settings.paragraphSpacing}px`,
  } as CSSProperties;

  const paragraphStyle: CSSProperties = {
    fontFamily: FONT_STACKS[settings.font],
    fontSize: settings.fontSize,
    lineHeight: settings.lineHeight,
    letterSpacing: settings.letterSpacing,
    textIndent: settings.firstLineIndent,
    textAlign: settings.justify ? 'justify' : 'left',
    // Переносы нужны выключке по ширине: без них в узкой колонке остаются
    // «дыры» между словами. Браузер переносит по правилам языка, поэтому
    // странице проставлен lang.
    hyphens: settings.justify ? 'auto' : undefined,
    overflowWrap: 'anywhere',
    wordBreak: 'normal',
  };

  const renderContinuousPage = (pageIndex: number) => {
    const entry = pages[pageIndex];
    const marks = quoteMarks(pageIndex).map<ReaderMark[]>((quoteRanges, paragraph) => [
      ...quoteRanges,
      audioMark &&
      audioMark.page === pageIndex &&
      audioMark.paragraph === paragraph
        ? { ...audioMark, kind: 'audio' as const }
        : null,
    ].filter((mark): mark is ReaderMark => mark !== null));

    return (
      <section
        data-reader-page={pageIndex}
        className="min-w-0 px-4 [&_p]:mb-[var(--reader-gap)] [&_p:last-child]:mb-0 sm:px-10"
        style={{
          paddingTop: pageIndex === 0 ? 28 : 0,
          paddingBottom:
            pageIndex === pages.length - 1 ? 36 : settings.paragraphSpacing,
        }}
      >
        <WordReader
          paragraphs={entry?.texts ?? []}
          bookId={state.book.id}
          onSaveQuote={(paragraph, start, end, text, color) => void addQuote(pageIndex, paragraph, start, end, text, color)}
          bionic={settings.bionic}
          stress={settings.stress}
          calm={settings.calm}
          paragraphClassName="reader-selectable"
          paragraphStyle={paragraphStyle}
          paragraphMarks={marks}
        />
        <p className="my-5 text-center text-xs tabular-nums text-[var(--text-muted)]" aria-label={`Страница ${pageIndex + 1} из ${pages.length}`}>
          {pageIndex + 1} / {pages.length}
        </p>

        {discussionToken && pageIndex === page && (
          <div className="mt-4">
            <button
              type="button"
              onClick={() => setDiscussionOpen((value) => !value)}
              aria-expanded={discussionOpen}
              className="mx-auto flex w-40 items-end justify-center rounded-lg outline-none transition-transform hover:-translate-y-1 focus-visible:ring-2 focus-visible:ring-[var(--accent)]"
            >
              <img
                src="/img/citavuk_zadumch.png"
                alt=""
                width={236}
                height={236}
                draggable={false}
                className="w-full select-none drop-shadow-md"
              />
              <span className="sr-only">Обсуждение этого места</span>
            </button>
            {discussionOpen && (
              <Discussion
                token={discussionToken}
                paragraph={pageStarts[pageIndex] ?? 0}
              />
            )}
          </div>
        )}
      </section>
    );
  };

  return (
    <main className={`px-3 py-5 sm:px-5 sm:py-8 ${audiobookEnabled ? 'pb-28' : ''}`}>
      <div className="mx-auto max-w-5xl">
        <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
          <div className="min-w-0 flex-1 basis-full sm:basis-auto">
            <Link
              to={
                state.book.folder
                  ? `/library?folder=${encodeURIComponent(state.book.folder)}`
                  : '/library'
              }
              className="text-sm text-[var(--text-muted)] transition-colors hover:text-[var(--accent)]"
            >
              {state.book.folder || 'Библиотека'}
            </Link>
            <h1 className="mt-1 truncate text-xl sm:text-2xl">{state.book.title}</h1>
          </div>


          <div className="flex min-w-0 max-w-full flex-wrap items-center gap-2">
            <button type="button" onClick={() => setQuotesOpen(true)}
              className="rounded-xl border border-[var(--line)] bg-[var(--bg-raised)] px-3 py-2.5 text-sm text-[var(--text)] hover:text-[var(--accent)]">
              Выделения {quotes.length > 0 ? `(${quotes.length})` : ''}
            </button>
            <button
              type="button"
              onClick={() => playAudiobookCue(audiobookCue)}
              disabled={audiobookCues.length === 0}
              className="rounded-xl border border-[var(--line)] bg-[var(--bg-raised)] p-2.5 text-[var(--text-muted)] hover:text-[var(--accent)] disabled:opacity-40"
              aria-label="Включить аудиокнигу"
              title="Аудиокнига"
            >
              <HiSpeakerWave className="size-5" />
            </button>
            <div className="flex items-center gap-1 rounded-2xl border border-[var(--line)] bg-[var(--bg-raised)] p-1">
              <IconButton
                label="Уменьшить шрифт"
                onClick={() =>
                  update('fontSize', Math.max(14, settings.fontSize - 1))
                }
              >
                А−
              </IconButton>
              <span className="w-9 text-center text-xs tabular-nums text-[var(--text-muted)]">
                {settings.fontSize}
              </span>
              <IconButton
                label="Увеличить шрифт"
                onClick={() =>
                  update('fontSize', Math.min(32, settings.fontSize + 1))
                }
              >
                А+
              </IconButton>
            </div>

            <ShareBook
              book={state.book}
              onLinkCopied={(token) => {
                setDiscussionToken(token);
                setDiscussionOpen(true);
              }}
            />

            <button
              type="button"
              onClick={() => setPanelOpen(true)}
              aria-label="Настройки чтения"
              title="Настройки чтения"
              className="flex items-center gap-2 rounded-2xl border border-[var(--line)] bg-[var(--bg-raised)] px-3.5 py-2.5 text-sm font-semibold text-[var(--text-muted)] transition-colors hover:border-[var(--accent)] hover:text-[var(--accent)]"
            >
              <svg viewBox="0 0 24 24" className="size-4 fill-current" aria-hidden="true">
                <path d="M12 8a4 4 0 100 8 4 4 0 000-8zm8.4 4a8.4 8.4 0 01-.1 1.2l2 1.6-2 3.4-2.4-1a8.3 8.3 0 01-2 1.2l-.4 2.6h-4l-.4-2.6a8.3 8.3 0 01-2-1.2l-2.4 1-2-3.4 2-1.6a8.4 8.4 0 010-2.4l-2-1.6 2-3.4 2.4 1a8.3 8.3 0 012-1.2L9.5 3h4l.4 2.6c.7.3 1.4.7 2 1.2l2.4-1 2 3.4-2 1.6c.1.4.1.8.1 1.2z" />
              </svg>
              <span className="hidden sm:inline">Настройки</span>
            </button>
          </div>
        </div>

        {/*
          Предупреждение о тяжёлой книге стоит здесь, а не при импорте: путей
          добавить книгу пять (файл, ссылка, материалы, публичная библиотека,
          синхронизация), а читать её всё равно начинают отсюда.
        */}
        <BookLevelNotice bookId={state.book.id} paragraphs={paragraphs} />

        {settings.flow === 'scroll' ? (
          <div
            lang="sr"
            style={pageStyle}
            className="paper-grain relative mx-auto min-w-0 overflow-x-clip rounded-lg border border-[var(--line)] bg-[var(--bg-raised)] shadow-[var(--shadow-soft)]"
          >
            {campaignBackground && (
              <div
                aria-hidden="true"
                className="pointer-events-none absolute inset-0 opacity-[0.09]"
                style={{
                  backgroundImage: campaignBackground,
                  backgroundPosition: 'center top',
                  backgroundRepeat: 'repeat',
                  backgroundSize: '320px 320px',
                }}
              />
            )}
            <div className="relative z-[1] min-w-0">
              <Virtuoso
                ref={continuousRef}
                useWindowScroll
                totalCount={pages.length}
                initialTopMostItemIndex={page}
                rangeChanged={onContinuousRange}
                increaseViewportBy={{ top: 0, bottom: 900 }}
                itemContent={renderContinuousPage}
              />
            </div>
          </div>
        ) : (
          /* Перспектива нужна повороту страницы: без неё rotateY выглядит
             как обычное сжатие по горизонтали. */
          <div
            className="relative mx-auto min-w-0"
            style={{
              perspective: 1600,
              maxWidth:
                settings.maxWidth >= FULL_WIDTH ? undefined : settings.maxWidth,
            }}
          >
            <AnimatePresence mode="wait" initial={false} custom={direction}>
              <motion.article
                key={page}
                custom={direction}
                initial={
                  flip
                    ? { opacity: 0, rotateY: direction * 8, x: direction * 40 }
                    : false
                }
                animate={{ opacity: 1, rotateY: 0, x: 0 }}
                exit={
                  flip
                    ? { opacity: 0, rotateY: direction * -6, x: direction * -30 }
                    : { opacity: 0 }
                }
                transition={{ duration: 0.28, ease: [0.22, 1, 0.36, 1] }}
                lang="sr"
                style={{ ...pageStyle, transformOrigin: direction > 0 ? 'left center' : 'right center' }}
                className="paper-grain relative mx-auto min-w-0 overflow-x-clip rounded-lg border border-[var(--line)] bg-[var(--bg-raised)] p-4 shadow-[var(--shadow-soft)] [&_p]:mb-[var(--reader-gap)] [&_p:last-child]:mb-0 sm:p-10"
              >
                {campaignBackground && (
                  <div
                    aria-hidden="true"
                    className="pointer-events-none absolute inset-0 opacity-[0.09]"
                    style={{
                      backgroundImage: campaignBackground,
                      backgroundPosition: 'center top',
                      backgroundRepeat: 'repeat',
                      backgroundSize: '320px 320px',
                    }}
                  />
                )}
                <div className="relative z-[1] min-w-0">
                  <WordReader
                    paragraphs={current}
                    bookId={state.book.id}
                    onSaveQuote={(paragraph, start, end, text, color) => void addQuote(page, paragraph, start, end, text, color)}
                    bionic={settings.bionic}
                    stress={settings.stress}
                    calm={settings.calm}
                    paragraphClassName="reader-selectable"
                    paragraphStyle={paragraphStyle}
                    paragraphMarks={audioMarks.map((items, index) => [...(quoteMarks(page)[index] ?? []), ...items])}
                  />
                </div>
              </motion.article>
            </AnimatePresence>

            <AnimatePresence>
              {discussionToken && (
                <motion.button
                  type="button"
                  initial={{ opacity: 0, scale: 0.82, x: 12 }}
                  animate={{ opacity: 1, scale: 1, x: 0 }}
                  exit={{ opacity: 0, scale: 0.9 }}
                  onClick={() => setDiscussionOpen((value) => !value)}
                  aria-expanded={discussionOpen}
                  aria-label={
                    discussionOpen
                      ? 'Скрыть обсуждение этой страницы'
                      : 'Открыть обсуждение этой страницы'
                  }
                  title="Обсуждение этой страницы"
                  className="mx-auto mt-4 flex w-52 items-end justify-center rounded-lg outline-none transition-transform hover:-translate-y-1 focus-visible:ring-2 focus-visible:ring-[var(--accent)] lg:absolute lg:-right-[19rem] lg:top-6 lg:mt-0 lg:w-72 xl:-right-[21rem] xl:w-80"
                >
                  <img
                    src="/img/citavuk_zadumch.png"
                    alt=""
                    width={236}
                    height={236}
                    draggable={false}
                    className="w-full select-none drop-shadow-md"
                  />
                  <span className="sr-only">Обсуждение страницы</span>
                </motion.button>
              )}
            </AnimatePresence>
          </div>
        )}

        <AnimatePresence mode="wait">
          {settings.flow === 'pages' && discussionToken && discussionOpen && (
            <motion.section
              key={`${discussionToken}:${pageStarts[page] ?? 0}`}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -6 }}
              transition={{ duration: 0.2 }}
              className="mx-auto mt-5"
              style={{
                maxWidth:
                  settings.maxWidth >= FULL_WIDTH ? undefined : settings.maxWidth,
              }}
            >
              <Discussion
                token={discussionToken}
                paragraph={pageStarts[page] ?? 0}
              />
            </motion.section>
          )}
        </AnimatePresence>

        {settings.flow === 'pages' && (
          <nav className="mx-auto mt-6 flex items-center justify-between gap-4"
               style={{ maxWidth: settings.maxWidth >= FULL_WIDTH ? undefined : settings.maxWidth }}>
            <Button variant="secondary" onClick={() => goTo(page - 1)} disabled={page === 0}>
              Назад
            </Button>
            <span className="text-sm text-[var(--text-muted)]">
              {page + 1} из {pages.length}
            </span>
            <Button onClick={() => goTo(page + 1)} disabled={page >= pages.length - 1}>
              Дальше
            </Button>
          </nav>
        )}

        <p className="mt-3 text-center text-xs text-[var(--text-muted)]">
          {settings.flow === 'pages'
            ? 'Клавиши со стрелками влево и вправо листают страницы.'
            : 'Прокручивайте книгу вниз как обычный документ.'}{' '}
          Нажмите любое слово, чтобы увидеть перевод в этом предложении.
        </p>

        {page >= pages.length - 1 && (
          <motion.div
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.4, delay: 0.2 }}
            className="mx-auto mt-10 max-w-2xl rounded-3xl border border-[var(--line)] bg-[var(--bg-sunken)] p-8 text-center"
          >
            <h2 className="text-2xl">Книга дочитана</h2>
            <p className="mt-2 text-[var(--text-muted)]">
              Слова, сохранённые по дороге, ждут в карточках повторения.
            </p>
            <div className="mt-5 flex flex-wrap justify-center gap-3">
              <Button onClick={() => navigate('/cards')}>К карточкам</Button>
              <Button variant="secondary" onClick={() => navigate('/library')}>
                В библиотеку
              </Button>
            </div>
          </motion.div>
        )}
      </div>

      {quotesOpen && (
        <div className="fixed inset-0 z-[90] flex items-center justify-center bg-black/50 p-4" role="presentation" onClick={() => setQuotesOpen(false)}>
          <section role="dialog" aria-label="Выделения в книге" onClick={event => event.stopPropagation()}
            className="max-h-[80vh] w-full max-w-xl overflow-y-auto rounded-3xl border border-[var(--line)] bg-[var(--bg-raised)] p-5 shadow-[var(--shadow-lift)]">
            <div className="flex items-center justify-between gap-4">
              <h2 className="text-xl">Выделения</h2>
              <button type="button" onClick={() => setQuotesOpen(false)} aria-label="Закрыть выделения"><HiXMark className="size-6" /></button>
            </div>
            {quotes.length === 0 && <p className="mt-5 text-[var(--text-muted)]">Выдели фрагмент текста — и подчеркни его или отметь цветом. Выделения видны на всех твоих устройствах.</p>}
            <ul className="mt-4 space-y-3">
              {quotes.map(quote => {
                const target = quote.page;
                return <li key={quote.id} className="rounded-xl border border-[var(--line)] p-3">
                  <button type="button" onClick={() => { setQuotesOpen(false); goTo(target); }} className="block w-full text-left">
                    <span className="text-sm text-[var(--text-muted)]">Страница {target + 1}</span>
                    <span className={['mt-1 block font-display', quoteColor(quote.color) ? QUOTE_SWATCH[quoteColor(quote.color)] : 'underline decoration-[var(--accent)] decoration-2 underline-offset-4'].join(' ')}>{quote.text}</span>
                  </button>
                  <div className="mt-2 flex flex-wrap items-center gap-1.5">
                    <HighlightPicker current={quoteColor(quote.color)} onPick={color => void recolorQuote(quote.id, color)} />
                    <button type="button" className="ml-auto text-xs text-[var(--accent)]" onClick={() => void deleteReaderQuote(quote.id).then(() => { setQuotes(current => current.filter(item => item.id !== quote.id)); void sync(); })}>
                      Убрать выделение
                    </button>
                  </div>
                </li>;
              })}
            </ul>
          </section>
        </div>
      )}

      <ReaderSettingsPanel
        open={panelOpen}
        settings={settings}
        onChange={update}
        onReset={reset}
        onClose={() => setPanelOpen(false)}
        odysseyRewardUnlocked={hasOdysseyReward}
        campaignRewardUrl={campaignRewardUrl}
      />

      {audiobookEnabled && audiobookCues[audiobookCue] && (
        <div className="fixed inset-x-0 bottom-0 z-40 border-t border-[var(--line)] bg-[var(--bg-raised)] shadow-[0_-8px_24px_rgba(0,0,0,0.12)]">
          <div className="mx-auto flex max-w-5xl items-center gap-1 px-3 py-2 sm:gap-2">
            <button
              type="button"
              onClick={() => playAudiobookCue(audiobookCue - 1, true)}
              disabled={audiobookCue === 0}
              className="rounded-full p-2 disabled:opacity-35"
              aria-label="Предыдущая фраза"
            >
              <HiBackward className="size-5" />
            </button>
            <button
              type="button"
              onClick={() => {
                const audio = audioRef.current;
                if (!audio || audio.ended) playAudiobookCue(audiobookCue);
                else if (audio.paused) void audio.play();
                else audio.pause();
              }}
              className="rounded-full bg-[var(--accent)] p-3 text-parchment"
              aria-label={audiobookPlaying ? 'Пауза' : 'Продолжить'}
            >
              {audiobookPlaying ? <HiPause className="size-5" /> : <HiPlay className="size-5" />}
            </button>
            <button
              type="button"
              onClick={() => playAudiobookCue(audiobookCue + 1, true)}
              disabled={audiobookCue + 1 >= audiobookCues.length}
              className="rounded-full p-2 disabled:opacity-35"
              aria-label="Следующая фраза"
            >
              <HiForward className="size-5" />
            </button>
            <div className="min-w-0 flex-1 px-1">
              <div className="truncate text-sm font-semibold">{state.book.title}</div>
              <div className="truncate text-xs text-[var(--text-muted)]">
                {audiobookCues[audiobookCue]?.text}
              </div>
            </div>
            <select
              value={audiobookSpeed}
              onChange={(event) => {
                const speed = Number(event.target.value);
                setAudiobookSpeed(speed);
                if (audioRef.current) audioRef.current.playbackRate = speed;
                saveAudiobook(true, audiobookCue, speed);
              }}
              aria-label="Скорость воспроизведения"
              className="rounded-md border border-[var(--line)] bg-[var(--bg-sunken)] px-2 py-2 text-sm"
            >
              {[0.7, 0.85, 1, 1.15, 1.3, 1.5, 1.8].map((speed) => (
                <option key={speed} value={speed}>{speed}x</option>
              ))}
            </select>
            <TtsVoicePicker compact />
            <button
              type="button"
              onClick={() => {
                audioRef.current?.pause();
                setAudiobookEnabled(false);
                setAudiobookPlaying(false);
                setAudioMark(null);
                saveAudiobook(false, audiobookCue, audiobookSpeed);
              }}
              className="rounded-full p-2"
              aria-label="Закрыть плеер"
            >
              <HiXMark className="size-5" />
            </button>
          </div>
          <label className="mx-auto mb-2 flex w-fit items-center gap-2 text-xs text-[var(--text-muted)]">
            <input type="checkbox" className="accent-[var(--accent)]" checked={settings.audioFollow} onChange={event => update('audioFollow', event.target.checked)} />
            Автопрокрутка при озвучке
          </label>
        </div>
      )}
    </main>
  );
}


/** Долистана ли страница до низа. */
function atBottom(): boolean {
  const scrolled = window.scrollY + window.innerHeight;
  return scrolled >= document.documentElement.scrollHeight - 40;
}

function IconButton({
  children,
  label,
  onClick,
}: {
  children: React.ReactNode;
  label: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      title={label}
      className="rounded-xl px-3 py-1.5 text-sm font-semibold text-[var(--text-muted)] transition-colors hover:bg-[var(--bg-sunken)] hover:text-[var(--text)]"
    >
      {children}
    </button>
  );
}
