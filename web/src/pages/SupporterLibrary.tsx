import { lazy, Suspense, useEffect, useMemo, useState } from 'react';
import { LuBookOpen, LuHeadphones, LuLock } from 'react-icons/lu';

import { ApiError } from '../api/client';
import {
  getLibraryItem,
  getSupporterLibrary,
  libraryAudioUrl,
  type LibraryItem,
} from '../api/supporterLibrary';
import { Button, ButtonLink, Card, ErrorNote, Reveal, Spinner } from '../components/ui';
import { importText } from '../lib/books';
import { useParams, useRouter } from '../lib/router';
import { useSeo } from '../lib/seo';
import { useAuth } from '../state/auth';
import { useSync } from '../state/sync';

const WordReader = lazy(() => import('../components/WordReader').then((m) => ({ default: m.WordReader })));

type Load =
  | { kind: 'loading' }
  | { kind: 'guest' }
  | { kind: 'locked' }
  | { kind: 'error'; message: string }
  | { kind: 'ready'; items: LibraryItem[] };

function useLibrary(): Load {
  const { account, loading } = useAuth();
  const [state, setState] = useState<Load>({ kind: 'loading' });
  useEffect(() => {
    if (loading) return;
    if (!account) {
      setState({ kind: 'guest' });
      return;
    }
    let cancelled = false;
    getSupporterLibrary()
      .then((items) => !cancelled && setState({ kind: 'ready', items }))
      .catch((error: unknown) => {
        if (cancelled) return;
        if (error instanceof ApiError && error.status === 403) setState({ kind: 'locked' });
        else setState({ kind: 'error', message: error instanceof ApiError ? error.message : 'Библиотека не загрузилась.' });
      });
    return () => {
      cancelled = true;
    };
  }, [account, loading]);
  return state;
}

export function SupporterLibrary() {
  useSeo({
    title: 'Закрытая библиотека — Читавук',
    description: 'Книги и подкасты на сербском для друзей Читавука — тех, кто поддержал проект.',
  });
  const state = useLibrary();
  const { navigate } = useRouter();
  const { sync } = useSync();
  const [opening, setOpening] = useState('');
  const [error, setError] = useState('');

  const openBook = async (item: LibraryItem) => {
    setError('');
    setOpening(item.id);
    try {
      const full = await getLibraryItem(item.id);
      const book = await importText(full.title, full.body ?? '', `supporter:${full.id}`);
      void sync();
      navigate(`/reader/${book.id}`);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Не удалось открыть книгу.');
    } finally {
      setOpening('');
    }
  };

  return (
    <main className="paper-grain min-h-[calc(100dvh-4rem)] px-4 py-10 sm:px-5 sm:py-14">
      <div className="mx-auto max-w-5xl">
        <Reveal>
          <p className="inline-flex items-center gap-1.5 rounded-full bg-gold/15 px-3 py-1 text-sm font-bold">
            <LuLock className="size-4" aria-hidden="true" /> Для друзей Читавука
          </p>
          <h1 className="mt-3 text-4xl sm:text-5xl">Закрытая библиотека</h1>
          <p className="mt-3 max-w-2xl text-lg leading-relaxed text-[var(--text-muted)]">
            Книги и подкасты на сербском для тех, кто поддержал Читавук. Книга
            открывается в читалке со всеми её подсказками, у подкаста — плеер и
            расшифровка, в которой нажимается каждое слово.
          </p>
        </Reveal>

        <div className="mt-8">
          {state.kind === 'loading' && <div className="flex justify-center py-16"><Spinner className="size-6" /></div>}
          {state.kind === 'guest' && (
            <Card className="p-7 text-center">
              <p className="text-lg">Войди в аккаунт, с которого поддерживал Читавук.</p>
              <ButtonLink to="/login" className="mt-5">Войти</ButtonLink>
            </Card>
          )}
          {state.kind === 'locked' && (
            <Card className="p-7 text-center sm:p-9">
              <img src="/img/citavuk_zdravo.webp" alt="" width={140} height={140} className="mx-auto w-28 object-contain" />
              <p className="mx-auto mt-4 max-w-lg text-lg leading-relaxed">
                Полка открывается тем, кто поддержал проект от 200 ₽ — одной
                оплатой или несколькими. Доступ появляется сразу после оплаты.
              </p>
              <ButtonLink to="/support" size="lg" className="mt-6">Стать другом Читавука</ButtonLink>
            </Card>
          )}
          {state.kind === 'error' && <ErrorNote>{state.message}</ErrorNote>}
          {error && <div className="mb-4"><ErrorNote>{error}</ErrorNote></div>}
          {state.kind === 'ready' && <Shelves items={state.items} opening={opening} onOpenBook={(item) => void openBook(item)} />}
        </div>
      </div>
    </main>
  );
}

function Shelves({ items, opening, onOpenBook }: { items: LibraryItem[]; opening: string; onOpenBook: (item: LibraryItem) => void }) {
  const books = items.filter((item) => item.kind === 'book');
  const podcasts = items.filter((item) => item.kind === 'podcast');
  if (items.length === 0) {
    return (
      <Card tone="contour" className="p-8 text-center">
        <p className="font-display text-xl font-bold">Полка пока пуста</p>
        <p className="mt-2 text-[var(--text-muted)]">Первые книги и подкасты появятся здесь — заглядывай.</p>
      </Card>
    );
  }
  return (
    <div className="space-y-10">
      {books.length > 0 && (
        <section>
          <h2 className="flex items-center gap-2 text-2xl"><LuBookOpen className="size-6 text-[var(--accent)]" aria-hidden="true" /> Книги</h2>
          <div className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {books.map((item) => (
              <Card key={item.id} className="flex flex-col p-5">
                <Cover item={item} />
                <h3 className="mt-3 text-xl leading-snug">{item.title}</h3>
                {item.author && <p className="text-sm text-[var(--text-muted)]">{item.author}</p>}
                {item.description && <p className="mt-2 flex-1 text-sm leading-relaxed text-[var(--text-muted)]">{item.description}</p>}
                <div className="mt-4 flex items-center justify-between gap-3">
                  {item.level && <span className="rounded-full bg-[var(--bg-sunken)] px-2.5 py-1 text-xs font-bold">{item.level}</span>}
                  <Button size="sm" disabled={opening === item.id} onClick={() => onOpenBook(item)}>
                    {opening === item.id ? 'Открываю…' : 'Читать'}
                  </Button>
                </div>
              </Card>
            ))}
          </div>
        </section>
      )}
      {podcasts.length > 0 && (
        <section>
          <h2 className="flex items-center gap-2 text-2xl"><LuHeadphones className="size-6 text-[var(--accent)]" aria-hidden="true" /> Подкасты</h2>
          <div className="mt-4 grid gap-4 sm:grid-cols-2">
            {podcasts.map((item) => (
              <Card key={item.id} className="flex gap-4 p-5">
                <Cover item={item} small />
                <div className="min-w-0 flex-1">
                  <h3 className="text-xl leading-snug">{item.title}</h3>
                  {item.author && <p className="text-sm text-[var(--text-muted)]">{item.author}</p>}
                  {item.description && <p className="mt-2 line-clamp-3 text-sm leading-relaxed text-[var(--text-muted)]">{item.description}</p>}
                  <ButtonLink to={`/friends-library/${item.id}`} size="sm" className="mt-3">Слушать</ButtonLink>
                </div>
              </Card>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}

function Cover({ item, small = false }: { item: LibraryItem; small?: boolean }) {
  const size = small ? 'size-20 shrink-0' : 'aspect-[3/4] w-full';
  if (item.coverUrl) {
    return <img src={item.coverUrl} alt="" loading="lazy" className={`${size} rounded-xl object-cover`} />;
  }
  const Icon = item.kind === 'book' ? LuBookOpen : LuHeadphones;
  return (
    <div className={`${size} grid place-items-center rounded-xl bg-[linear-gradient(135deg,color-mix(in_srgb,var(--color-gold)_35%,var(--bg-sunken)),var(--bg-sunken))]`}>
      <Icon className={small ? 'size-8 text-[var(--accent)]' : 'size-12 text-[var(--accent)]'} aria-hidden="true" />
    </div>
  );
}

/** Страница подкаста: плеер и расшифровка, по которой можно нажимать слова. */
export function SupporterPodcast() {
  const { id = '' } = useParams();
  const [item, setItem] = useState<LibraryItem | null>(null);
  const [error, setError] = useState('');
  useSeo({ title: item ? `${item.title} — Читавук` : 'Подкаст — Читавук', description: 'Подкаст закрытой библиотеки Читавука.' });

  useEffect(() => {
    let cancelled = false;
    getLibraryItem(id)
      .then((value) => !cancelled && setItem(value))
      .catch((caught: unknown) => {
        if (cancelled) return;
        setError(caught instanceof ApiError && caught.status === 403
          ? 'Подкаст открыт друзьям Читавука.'
          : caught instanceof ApiError ? caught.message : 'Подкаст не загрузился.');
      });
    return () => {
      cancelled = true;
    };
  }, [id]);

  const paragraphs = useMemo(
    () => (item?.body ?? '').split(/\n\s*\n/).map((text) => text.trim()).filter(Boolean),
    [item?.body],
  );

  return (
    <main className="paper-grain min-h-[calc(100dvh-4rem)] px-4 py-10 sm:px-5 sm:py-14">
      <div className="mx-auto max-w-3xl">
        <ButtonLink to="/friends-library" variant="ghost" size="sm">Закрытая библиотека</ButtonLink>
        {error && <div className="mt-6"><ErrorNote>{error}</ErrorNote></div>}
        {!item && !error && <div className="flex justify-center py-16"><Spinner className="size-6" /></div>}
        {item && (
          <>
            <h1 className="mt-4 text-3xl sm:text-4xl">{item.title}</h1>
            {item.author && <p className="mt-1 text-[var(--text-muted)]">{item.author}</p>}
            {item.description && <p className="mt-4 leading-relaxed">{item.description}</p>}
            {item.audioSize > 0 ? (
              <audio className="mt-6 w-full" controls preload="metadata" src={libraryAudioUrl(item)} />
            ) : (
              <p className="mt-6 text-[var(--text-muted)]">Аудио к этому выпуску ещё не загружено.</p>
            )}
            {paragraphs.length > 0 && (
              <Card className="mt-8 p-5 sm:p-8">
                <h2 className="mb-4 text-xl">Расшифровка</h2>
                <Suspense fallback={<div>{paragraphs.map((text) => <p key={text} className="mb-4">{text}</p>)}</div>}>
                  <WordReader paragraphs={paragraphs} calm />
                </Suspense>
              </Card>
            )}
          </>
        )}
      </div>
    </main>
  );
}
