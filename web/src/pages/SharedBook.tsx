import { useEffect, useState } from 'react';

import { getShare, getShareContent, type SharedBook as Share } from '../api/share';
import { Button, Card, ErrorNote, Spinner } from '../components/ui';
import { importText, plural } from '../lib/books';
import { Link, useParams, useRouter } from '../lib/router';
import { useSeo } from '../lib/seo';
import { useAuth } from '../state/auth';
import { useSync } from '../state/sync';

/**
 * Короткая посадочная страница непубличной ссылки.
 *
 * Обсуждение здесь намеренно не показывается. После импорта книга открывается
 * в обычной читалке, где у каждой логической страницы своя ветка и свой волк.
 */
export function SharedBook() {
  const { token = '' } = useParams();
  const { navigate } = useRouter();
  const { account } = useAuth();
  const { sync } = useSync();

  const [share, setShare] = useState<Share | null>(null);
  const [error, setError] = useState('');
  const [importing, setImporting] = useState(false);

  useSeo({
    title: share ? `${share.title} — Читавук` : 'Книга по ссылке — Читавук',
    noindex: true,
  });

  useEffect(() => {
    if (!token) return;
    const controller = new AbortController();
    getShare(token, controller.signal)
      .then(setShare)
      .catch((caught: unknown) => {
        if (!controller.signal.aborted) {
          setError(
            caught instanceof Error ? caught.message : 'Ссылка не открылась.',
          );
        }
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
        caught instanceof Error
          ? caught.message
          : 'Не удалось добавить книгу.',
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

  return (
    <main className="mx-auto w-full max-w-2xl px-4 py-10 sm:px-6 sm:py-16">
      <Card className="paper-grain p-6 text-center sm:p-10">
        <img
          src="/img/citavuk_zadumch.png"
          alt=""
          width={180}
          height={180}
          className="mx-auto -mb-2 w-36"
        />
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
        <p className="mx-auto mt-4 max-w-md text-sm leading-relaxed text-[var(--text-muted)]">
          После добавления откроется обычная читалка. У каждой страницы там своё
          обсуждение на сербском.
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
    </main>
  );
}
