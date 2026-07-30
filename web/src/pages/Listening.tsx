import { motion, useReducedMotion } from 'framer-motion';
import { useEffect, useMemo, useState } from 'react';

import { getAudioLessons } from '../api/listening';
import { Mascot } from '../components/Mascot';
import { Button, ErrorNote, Spinner } from '../components/ui';
import type { AudioLesson } from '../listening/types';
import { Link } from '../lib/router';
import { useSeo } from '../lib/seo';

type State =
  | { kind: 'loading' }
  | { kind: 'error'; message: string }
  | { kind: 'ready'; lessons: AudioLesson[] };

export function Listening() {
  useSeo({
    title: 'Сербский на слух: подкасты и уроки с транскриптом — Читавук',
    description:
      'Аудирование с синхронным транскриптом: слова подсвечиваются по мере звучания, сложные на слух разбираются отдельно.',
  });

  const [state, setState] = useState<State>({ kind: 'loading' });
  const [query, setQuery] = useState('');

  const load = () => {
    const controller = new AbortController();
    setState({ kind: 'loading' });
    void getAudioLessons(controller.signal)
      .then((lessons) => setState({ kind: 'ready', lessons }))
      .catch((error) => {
        if (controller.signal.aborted) return;
        setState({
          kind: 'error',
          message: error instanceof Error ? error.message : 'Не удалось загрузить аудиоуроки.',
        });
      });
    return () => controller.abort();
  };

  useEffect(load, []);

  const filtered = useMemo(() => {
    if (state.kind !== 'ready') return [];
    const needle = query.trim().toLocaleLowerCase('sr');
    if (!needle) return state.lessons;
    return state.lessons.filter((lesson) =>
      `${lesson.title} ${lesson.subtitle}`.toLocaleLowerCase('sr').includes(needle),
    );
  }, [query, state]);

  return (
    <main className="pb-20">
      <section className="border-b border-[var(--line)] bg-[var(--bg-raised)] px-5 py-9">
        <div className="mx-auto grid max-w-5xl items-center gap-6 sm:grid-cols-[1fr_220px]">
          <div>
            <div className="mb-3 flex items-center gap-3">
              <span className="rounded-full bg-[var(--accent)] px-3 py-1 text-xs font-bold text-white">
                БЕТА
              </span>
              <span className="text-sm font-semibold text-[var(--text-muted)]">
                Аудирование со Слухао
              </span>
            </div>
            <h1 className="text-4xl sm:text-5xl">Слушайте живой сербский</h1>
            <p className="mt-4 max-w-2xl text-lg leading-relaxed text-[var(--text-muted)]">
              Подкасты и короткие уроки с транскриптом. Текущая фраза следует за
              звуком, а сложные сочетания заранее отмечены красным.
            </p>
          </div>
          <Mascot
            pose="sluhao_slusa"
            alt="Черногорский орёл Слухао слушает подкаст"
            width={440}
            float
            priority
          />
        </div>
      </section>

      <section className="mx-auto max-w-5xl px-5 py-8">
        <label className="relative block">
          <span className="sr-only">Найти подкаст</span>
          <SearchIcon />
          <input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            className="w-full rounded-xl border border-[var(--line)] bg-[var(--bg-raised)] py-3 pl-11 pr-4 text-base"
            placeholder="Найти выпуск или тему"
          />
        </label>

        {state.kind === 'loading' && (
          <div className="flex min-h-64 items-center justify-center text-[var(--text-muted)]">
            <Spinner className="size-6" />
          </div>
        )}
        {state.kind === 'error' && (
          <div className="mx-auto mt-10 max-w-xl">
            <ErrorNote>{state.message}</ErrorNote>
            <Button className="mt-5" onClick={load}>Повторить</Button>
          </div>
        )}
        {state.kind === 'ready' && (
          <div className="mt-7 grid gap-4 md:grid-cols-2">
            {filtered.map((lesson, index) => (
              <LessonPreview key={lesson.id} lesson={lesson} index={index} />
            ))}
          </div>
        )}
        {state.kind === 'ready' && filtered.length === 0 && (
          <p className="py-16 text-center text-[var(--text-muted)]">
            По этому запросу ничего не нашлось.
          </p>
        )}
      </section>
    </main>
  );
}

function LessonPreview({
  lesson,
  index,
}: {
  lesson: AudioLesson;
  index: number;
}) {
  const reduceMotion = useReducedMotion();
  const minutes = lesson.duration ? Math.max(1, Math.round(lesson.duration / 60)) : null;
  return (
    <motion.article
      initial={reduceMotion ? false : { opacity: 0, y: 14 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: Math.min(index, 8) * 0.045 }}
      className="group border-b border-[var(--line)] py-5 md:px-4"
    >
      <Link to={`/listening/${encodeURIComponent(lesson.id)}`} className="block">
        <div className="flex items-start gap-4">
          <span className="flex size-12 shrink-0 items-center justify-center rounded-full bg-[var(--accent)] text-white shadow-[0_3px_0_0_color-mix(in_srgb,var(--accent)_55%,black)]">
            <PlayIcon />
          </span>
          <div className="min-w-0">
            <h2 className="text-xl leading-snug transition-colors group-hover:text-[var(--accent)]">
              {lesson.title}
            </h2>
            <p className="mt-2 line-clamp-2 text-sm leading-relaxed text-[var(--text-muted)]">
              {lesson.subtitle || 'Урок с интерактивным транскриптом'}
            </p>
            <div className="mt-3 flex flex-wrap gap-3 text-xs font-semibold text-[var(--text-muted)]">
              {minutes && <span>{minutes} мин</span>}
              <span>
                {lesson.transcript_url
                  ? 'Транскрипт по аудио'
                  : 'Транскрипт готовится'}
              </span>
            </div>
          </div>
        </div>
      </Link>
    </motion.article>
  );
}

function SearchIcon() {
  return <svg viewBox="0 0 24 24" className="pointer-events-none absolute left-4 top-3.5 size-5 fill-current text-[var(--text-muted)]"><path d="M10 3a7 7 0 105.3 11.6L21 20.3l1.4-1.4-5.7-5.7A7 7 0 0010 3zm0 2a5 5 0 110 10 5 5 0 010-10z" /></svg>;
}

function PlayIcon() {
  return <svg viewBox="0 0 24 24" className="ml-0.5 size-6 fill-current"><path d="M8 5v14l11-7z" /></svg>;
}
