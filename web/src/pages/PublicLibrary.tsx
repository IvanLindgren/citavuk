import { motion } from 'framer-motion';
import { useEffect, useMemo, useState } from 'react';
import { HiArrowDownTray, HiBookOpen, HiMagnifyingGlass } from 'react-icons/hi2';

import { Button, Card, ErrorNote, Reveal, Spinner } from '../components/ui';
import { importText } from '../lib/books';
import {
  loadPublicBook,
  loadPublicLibrary,
  type PublicLibraryItem,
} from '../lib/publicLibrary';
import { useRouter } from '../lib/router';
import { useSeo } from '../lib/seo';
import { useSync } from '../state/sync';

const ALL = 'Все';

export function PublicLibrary() {
  useSeo({
    title: 'Публичная библиотека на сербском — Читавук',
    description:
      'Сербская классика и фольклор в общественном достоянии: открыть в читалке с переводом или скачать бесплатно.',
  });
  const { navigate } = useRouter();
  const { sync } = useSync();
  const [items, setItems] = useState<PublicLibraryItem[] | null>(null);
  const [error, setError] = useState('');
  const [query, setQuery] = useState('');
  const [genre, setGenre] = useState(ALL);
  const [loadingId, setLoadingId] = useState('');

  useEffect(() => {
    const controller = new AbortController();
    loadPublicLibrary(controller.signal)
      .then((catalog) => setItems(catalog.items))
      .catch((caught: unknown) => {
        if (!controller.signal.aborted) {
          setError(
            caught instanceof Error ? caught.message : 'Каталог не загрузился.',
          );
        }
      });
    return () => controller.abort();
  }, []);

  const genres = useMemo(
    () => [ALL, ...new Set((items ?? []).map((item) => item.genre))],
    [items],
  );
  const visible = useMemo(() => {
    const needle = query.trim().toLocaleLowerCase('ru');
    return (items ?? []).filter(
      (item) =>
        (genre === ALL || item.genre === genre) &&
        (!needle ||
          `${item.title} ${item.author} ${item.kind}`
            .toLocaleLowerCase('ru')
            .includes(needle)),
    );
  }, [items, genre, query]);

  async function open(item: PublicLibraryItem) {
    setError('');
    setLoadingId(item.id);
    try {
      const text = await loadPublicBook(item);
      const book = await importText(
        item.title,
        text,
        `public:${item.id}`,
      );
      void sync();
      navigate(`/reader/${book.id}`);
    } catch (caught) {
      setError(
        caught instanceof Error ? caught.message : 'Не удалось открыть книгу.',
      );
    } finally {
      setLoadingId('');
    }
  }

  return (
    <main className="px-5 py-10 sm:py-14">
      <div className="mx-auto max-w-6xl">
        <Reveal>
          <div className="grid items-end gap-6 border-b border-[var(--line)] pb-8 md:grid-cols-[1fr_auto]">
            <div className="max-w-3xl">
              <p className="text-xs font-bold uppercase tracking-wide text-[var(--accent)]">
                Свободные тексты
              </p>
              <h1 className="mt-2 text-3xl sm:text-4xl">Публичная библиотека</h1>
              <p className="mt-4 text-lg leading-relaxed text-[var(--text-muted)]">
                Сербская классика и фольклор, которые можно читать и скачивать
                законно. Каталог загружает только обложки и описания; полный
                текст приходит в память лишь после выбора одной книги.
              </p>
            </div>
            <div className="hidden w-32 md:block">
              <img
                src="/img/citavuk_gram.webp"
                srcSet="/img/citavuk_gram.webp 1x, /img/citavuk_gram@2x.webp 2x"
                alt=""
                width={200}
                className="w-full"
              />
            </div>
          </div>
        </Reveal>

        <div className="mt-7 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <label className="flex min-h-12 flex-1 items-center gap-3 rounded-2xl border border-[var(--line)] bg-[var(--bg-raised)] px-4 sm:max-w-md">
            <HiMagnifyingGlass className="size-5 text-[var(--text-muted)]" />
            <input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Название или автор"
              className="min-w-0 flex-1 bg-transparent outline-none"
            />
          </label>
          <div className="flex gap-2 overflow-x-auto pb-1">
            {genres.map((value) => (
              <button
                key={value}
                type="button"
                onClick={() => setGenre(value)}
                className={[
                  'shrink-0 rounded-xl border px-3.5 py-2 text-sm font-semibold transition-colors',
                  genre === value
                    ? 'border-[var(--accent)] bg-[var(--accent)] text-parchment'
                    : 'border-[var(--line)] bg-[var(--bg-raised)] text-[var(--text-muted)] hover:border-[var(--accent)]',
                ].join(' ')}
              >
                {value}
              </button>
            ))}
          </div>
        </div>

        {error && (
          <div className="mt-5">
            <ErrorNote>{error}</ErrorNote>
          </div>
        )}

        {!items ? (
          <div className="flex min-h-64 items-center justify-center gap-2 text-[var(--text-muted)]">
            <Spinner /> Открываем каталог…
          </div>
        ) : (
          <div className="mt-8 grid gap-6 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
            {visible.map((item, index) => (
              <motion.article
                key={item.id}
                initial={{ opacity: 0, y: 12 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: Math.min(index * 0.035, 0.25) }}
              >
                <Card className="group flex h-full flex-col overflow-hidden p-0 transition-all duration-300 hover:-translate-y-1 hover:shadow-[var(--shadow-lift)]">
                  <div className="aspect-[18/26] overflow-hidden bg-[var(--bg-sunken)]">
                    <img
                      src={item.coverUrl}
                      alt={`Обложка «${item.title}»`}
                      loading="lazy"
                      width={720}
                      height={1040}
                      className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-[1.025]"
                    />
                  </div>
                  <div className="flex flex-1 flex-col p-4">
                    <div className="flex flex-wrap gap-1.5 text-[11px] font-semibold">
                      <span className="rounded-full bg-[var(--accent)]/10 px-2 py-0.5 text-[var(--accent)]">
                        {item.genre}
                      </span>
                      <span className="rounded-full bg-[var(--bg-sunken)] px-2 py-0.5 text-[var(--text-muted)]">
                        {item.kind}
                      </span>
                      <span className="rounded-full bg-[var(--bg-sunken)] px-2 py-0.5 text-[var(--text-muted)]">
                        {item.level}
                      </span>
                    </div>
                    <h2 className="mt-3 text-xl leading-tight">{item.title}</h2>
                    <p className="mt-1 text-sm font-semibold text-[var(--text-muted)]">
                      {item.author}
                    </p>
                    <p className="mt-3 flex-1 text-sm leading-relaxed text-[var(--text-muted)]">
                      {item.summary}
                    </p>
                    <div className="mt-4 grid grid-cols-[1fr_auto] gap-2">
                      <Button
                        onClick={() => void open(item)}
                        disabled={Boolean(loadingId)}
                        className="min-w-0"
                      >
                        {loadingId === item.id ? (
                          <Spinner />
                        ) : (
                          <HiBookOpen className="size-5" />
                        )}
                        Читать
                      </Button>
                      <a
                        href={item.textUrl}
                        download={`${item.title}.txt`}
                        aria-label={`Скачать «${item.title}»`}
                        title="Скачать TXT"
                        className="flex size-12 items-center justify-center rounded-2xl border border-[var(--line)] bg-[var(--bg-raised)] text-lg text-[var(--text-muted)] transition-colors hover:border-[var(--accent)] hover:text-[var(--accent)]"
                      >
                        <HiArrowDownTray />
                      </a>
                    </div>
                    <a
                      href={item.sourceUrls[0]}
                      target="_blank"
                      rel="noreferrer noopener"
                      className="mt-3 text-xs text-[var(--text-muted)] underline-offset-2 hover:text-[var(--accent)] hover:underline"
                    >
                      Источник и лицензия
                    </a>
                  </div>
                </Card>
              </motion.article>
            ))}
          </div>
        )}
      </div>
    </main>
  );
}
