import { AnimatePresence, motion, useReducedMotion } from 'framer-motion';
import { useCallback, useEffect, useMemo, useState, type CSSProperties } from 'react';

import { downloadContent } from '../api/sync';
import { Discussion } from '../components/Discussion';
import { Mascot } from '../components/Mascot';
import { ReaderSettingsPanel } from '../components/ReaderSettingsPanel';
import { ShareBook } from '../components/ShareBook';
import { Button, Spinner } from '../components/ui';
import { WordReader } from '../components/WordReader';
import { getBook, getParagraphs, saveProgress, type BookMeta } from '../lib/books';
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

/** Сколько символов помещается на логическую страницу. */
const PAGE_CHARS = 1500;

type LoadState =
  | { kind: 'loading' }
  | { kind: 'missing' }
  | { kind: 'needsDownload'; book: BookMeta }
  | { kind: 'ready'; book: BookMeta; paragraphs: string[] };

export function Reader() {
  useSeo({
    title: 'Читалка — Читавук',
    noindex: true,
  });

  const { id } = useParams();
  const { navigate } = useRouter();
  const { account } = useAuth();
  const reduceMotion = useReducedMotion();
  const { settings, update, reset } = useReaderSettings();

  const [state, setState] = useState<LoadState>({ kind: 'loading' });
  const [downloading, setDownloading] = useState(false);
  const [page, setPage] = useState(0);
  const [panelOpen, setPanelOpen] = useState(false);
  const [discussionToken, setDiscussionToken] = useState('');
  const [discussionOpen, setDiscussionOpen] = useState(false);
  // Направление последнего перехода: страница уезжает туда, откуда пришла
  // следующая, иначе перелистывание «вперёд» и «назад» выглядят одинаково.
  const [direction, setDirection] = useState(1);

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

  /**
   * Абзацы группируются в страницы примерно равной длины.
   *
   * Границей всегда остаётся абзац: разрывать его нельзя, иначе предложение
   * окажется на двух страницах и перевод слова потеряет свой контекст.
   */
  const pages = useMemo(() => {
    const result: string[][] = [];
    let current: string[] = [];
    let length = 0;

    for (const paragraph of paragraphs) {
      if (length > 0 && length + paragraph.length > PAGE_CHARS) {
        result.push(current);
        current = [];
        length = 0;
      }
      current.push(paragraph);
      length += paragraph.length;
    }
    if (current.length > 0) result.push(current);
    return result;
  }, [paragraphs]);

  /** Первый абзац каждой страницы — прогресс хранится в абзацах, не в страницах. */
  const pageStarts = useMemo(() => {
    const starts: number[] = [];
    let index = 0;
    for (const pageParagraphs of pages) {
      starts.push(index);
      index += pageParagraphs.length;
    }
    return starts;
  }, [pages]);

  // Открываем на том месте, где остановились.
  useEffect(() => {
    if (state.kind !== 'ready' || pageStarts.length === 0) return;
    const target = pageStarts.findLastIndex(
      (start) => start <= state.book.lastParagraph,
    );
    setPage(target < 0 ? 0 : target);
  }, [state, pageStarts]);

  const goTo = useCallback(
    (next: number) => {
      if (next < 0 || next >= pages.length || state.kind !== 'ready') return;
      setDirection(next > page ? 1 : -1);
      setPage(next);
      playPageTurn(settings.sound);
      window.scrollTo({ top: 0, behavior: 'smooth' });
      void saveProgress(state.book.id, pageStarts[next] ?? 0);
    },
    [pages.length, state, pageStarts, page, settings.sound],
  );

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
  }, [page, goTo]);

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
        <Link to="/library">
          <Button className="mt-6">В библиотеку</Button>
        </Link>
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

  const current = pages[page] ?? [];
  const progress = pages.length > 1 ? ((page + 1) / pages.length) * 100 : 100;
  const palette = paletteFor(settings.theme);
  const flip = settings.animate && !reduceMotion;

  // Отступ между абзацами задаётся переменной, а не полем `marginBottom`:
  // строчный стиль перебил бы любое правило и оставил лишний отступ под
  // последним абзацем, из-за чего низ страницы выглядел бы кривым.
  const pageStyle = {
    background: palette?.background,
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
  };

  return (
    <main className="px-5 py-8">
      {/* Полоса прогресса книги вверху — привычный ориентир в читалках. */}
      <div className="fixed inset-x-0 top-16 z-30 h-1 bg-transparent">
        <motion.div
          className="h-full bg-[var(--accent)]"
          animate={{ width: `${progress}%` }}
          transition={{ duration: 0.4, ease: [0.22, 1, 0.36, 1] }}
        />
      </div>

      <div className="mx-auto max-w-5xl">
        <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
          <div className="min-w-0">
            <Link
              to={
                state.book.folder
                  ? `/library?folder=${encodeURIComponent(state.book.folder)}`
                  : '/library'
              }
              className="text-sm text-[var(--text-muted)] transition-colors hover:text-[var(--accent)]"
            >
              ← {state.book.folder || 'Библиотека'}
            </Link>
            <h1 className="mt-1 truncate text-2xl">{state.book.title}</h1>
          </div>

          <div className="flex items-center gap-2">
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
              className="flex items-center gap-2 rounded-2xl border border-[var(--line)] bg-[var(--bg-raised)] px-3.5 py-2.5 text-sm font-semibold text-[var(--text-muted)] transition-colors hover:border-[var(--accent)] hover:text-[var(--accent)]"
            >
              <svg viewBox="0 0 24 24" className="size-4 fill-current" aria-hidden="true">
                <path d="M12 8a4 4 0 100 8 4 4 0 000-8zm8.4 4a8.4 8.4 0 01-.1 1.2l2 1.6-2 3.4-2.4-1a8.3 8.3 0 01-2 1.2l-.4 2.6h-4l-.4-2.6a8.3 8.3 0 01-2-1.2l-2.4 1-2-3.4 2-1.6a8.4 8.4 0 010-2.4l-2-1.6 2-3.4 2.4 1a8.3 8.3 0 012-1.2L9.5 3h4l.4 2.6c.7.3 1.4.7 2 1.2l2.4-1 2 3.4-2 1.6c.1.4.1.8.1 1.2z" />
              </svg>
              Настройки
            </button>
          </div>
        </div>

        {/* Перспектива нужна повороту страницы: без неё rotateY выглядит
            как обычное сжатие по горизонтали. */}
        <div className="relative" style={{ perspective: 1600 }}>
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
              className="paper-grain relative mx-auto rounded-3xl border border-[var(--line)] bg-[var(--bg-raised)] p-6 shadow-[var(--shadow-soft)] [&_p]:mb-[var(--reader-gap)] [&_p:last-child]:mb-0 sm:p-10"
            >
              <div className="relative">
                <WordReader
                  paragraphs={current}
                  bookId={state.book.id}
                  bionic={settings.bionic}
                  paragraphClassName="reader-selectable"
                  paragraphStyle={paragraphStyle}
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
                className="mx-auto mt-4 flex w-28 items-end justify-center rounded-2xl outline-none transition-transform hover:-translate-y-1 focus-visible:ring-2 focus-visible:ring-[var(--accent)] lg:absolute lg:-right-28 lg:bottom-2 lg:mt-0"
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

        <AnimatePresence mode="wait">
          {discussionToken && discussionOpen && (
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

        <p className="mt-3 text-center text-xs text-[var(--text-muted)]">
          Стрелки ← → листают страницы. Нажмите любое слово, чтобы увидеть
          перевод в этом предложении.
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

      <ReaderSettingsPanel
        open={panelOpen}
        settings={settings}
        onChange={update}
        onReset={reset}
        onClose={() => setPanelOpen(false)}
      />
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
