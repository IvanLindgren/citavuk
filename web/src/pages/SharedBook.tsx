import { AnimatePresence, motion, useReducedMotion } from 'framer-motion';
import { useEffect, useState } from 'react';

import { Discussion } from '../components/Discussion';
import { Button, Card, ErrorNote, Spinner } from '../components/ui';
import { getShare, getShareContent, type SharedBook as Share } from '../api/share';
import { importText, plural } from '../lib/books';
import { Link, useParams, useRouter } from '../lib/router';
import { useSeo } from '../lib/seo';
import { useAuth } from '../state/auth';
import { useSync } from '../state/sync';

/**
 * Книга, открытая по ссылке.
 *
 * Страница доступна без аккаунта: по ссылке приходят и те, у кого его нет, и
 * книгу они должны увидеть прежде, чем решать, заводить ли.
 *
 * Обсуждение спрятано за волком нарочно. Раздел, где писать можно только
 * по-сербски, — не для всех, кто просто зашёл прочитать; тот, кто нашёл его
 * сам, уже настроен разговаривать. Волк подсказывает, что его стоит потрогать:
 * покачивается и подписан.
 */

/** Сколько раз нужно нажать на волка. */
const TAPS_TO_OPEN = 3;

export function SharedBook() {
  const { token = '' } = useParams();
  const { navigate } = useRouter();
  const { account } = useAuth();
  const { sync } = useSync();
  const reduceMotion = useReducedMotion();

  const [share, setShare] = useState<Share | null>(null);
  const [error, setError] = useState('');
  const [importing, setImporting] = useState(false);
  const [taps, setTaps] = useState(0);

  useSeo({
    title: share ? `${share.title} — Читавук` : 'Книга по ссылке — Читавук',
    // Ссылка непубличная: в поиске её быть не должно.
    noindex: true,
  });

  useEffect(() => {
    if (!token) return;
    const controller = new AbortController();
    getShare(token, controller.signal)
      .then(setShare)
      .catch((caught: unknown) => {
        if (controller.signal.aborted) return;
        setError(
          caught instanceof Error ? caught.message : 'Ссылка не открылась.',
        );
      });
    return () => controller.abort();
  }, [token]);

  async function addToLibrary() {
    setError('');
    setImporting(true);
    try {
      const paragraphs = await getShareContent(token);
      if (paragraphs.length === 0) throw new Error('Книга пустая.');
      const book = await importText(
        share?.title || 'Книга по ссылке',
        paragraphs.join('\n\n'),
        `share:${token}`,
      );
      if (account) void sync();
      navigate(`/reader/${book.id}`);
    } catch (caught) {
      setError(
        caught instanceof Error ? caught.message : 'Не удалось добавить книгу.',
      );
    } finally {
      setImporting(false);
    }
  }

  if (error && !share) {
    return (
      <main className="mx-auto w-full max-w-2xl px-4 py-16 sm:px-6">
        <ErrorNote>{error}</ErrorNote>
        <Link to="/library">
          <Button variant="secondary" className="mt-4">
            В свою библиотеку
          </Button>
        </Link>
      </main>
    );
  }

  if (!share) {
    return (
      <main className="mx-auto flex w-full max-w-2xl items-center gap-2 px-4 py-16 text-[var(--text-muted)] sm:px-6">
        <Spinner /> Открываем книгу…
      </main>
    );
  }

  const opened = taps >= TAPS_TO_OPEN;

  return (
    <main className="mx-auto w-full max-w-2xl px-4 py-8 sm:px-6 sm:py-12">
      <Card className="p-5 text-center sm:p-8">
        <p className="text-xs font-bold uppercase tracking-wide text-[var(--accent)]">
          книгой поделились с вами
        </p>
        <h1 className="mt-2 font-display text-2xl font-bold sm:text-3xl">
          {share.title}
        </h1>
        <p className="mt-2 text-sm text-[var(--text-muted)]">
          {share.paragraphs}{' '}
          {plural(share.paragraphs, 'абзац', 'абзаца', 'абзацев')}
        </p>

        <Button
          className="mt-6 w-full sm:w-auto"
          disabled={importing}
          onClick={() => void addToLibrary()}
        >
          {importing ? (
            <>
              <Spinner /> Добавляем…
            </>
          ) : (
            'Добавить себе и читать'
          )}
        </Button>

        {error && (
          <div className="mt-4 text-left">
            <ErrorNote>{error}</ErrorNote>
          </div>
        )}
      </Card>

      {/* Волк-подсказка. Раскрывает обсуждение после нескольких нажатий. */}
      <div className="mt-8 flex flex-col items-center">
        <motion.button
          type="button"
          onClick={() => setTaps((count) => count + 1)}
          aria-label={
            opened ? 'Волк уже привёл вас в обсуждение' : 'Потрогать волка'
          }
          className="w-32 rounded-full outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)] sm:w-40"
          animate={
            reduceMotion || opened
              ? undefined
              : { rotate: [0, -4, 4, -2, 0], y: [0, -4, 0] }
          }
          transition={{ duration: 2.2, repeat: Infinity, repeatDelay: 1.6 }}
          whileTap={{ scale: 0.94 }}
        >
          <img
            src="/img/citavuk_zadumch.png"
            alt="Задумчивый волк Читавук"
            className="w-full select-none"
            draggable={false}
          />
        </motion.button>

        <AnimatePresence mode="wait">
          {!opened ? (
            <motion.p
              key="hint"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="mt-2 max-w-xs text-center text-sm text-[var(--text-muted)]"
            >
              {taps === 0
                ? 'Волк о чём-то задумался. Потрогайте его.'
                : taps === 1
                  ? 'Кажется, он не против ещё раз.'
                  : 'Ещё чуть-чуть…'}
            </motion.p>
          ) : (
            <motion.p
              key="done"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              className="mt-2 max-w-sm text-center text-sm font-semibold text-[var(--accent)]"
            >
              Волк надумал: тут можно обсудить книгу — но только по-сербски.
            </motion.p>
          )}
        </AnimatePresence>
      </div>

      <AnimatePresence>
        {opened && (
          <motion.div
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            className="mt-6"
          >
            {/* Обсуждение первой страницы: по ссылке человек ещё не читал книгу,
                и привязывать разговор к «текущей» странице пока не к чему. */}
            <Discussion token={token} paragraph={0} />
          </motion.div>
        )}
      </AnimatePresence>
    </main>
  );
}
