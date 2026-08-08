import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  LuArrowUpRight,
  LuBookOpen,
  LuCheck,
  LuChevronDown,
  LuGraduationCap,
  LuLink,
  LuNewspaper,
  LuSparkles,
  LuSquareCheckBig,
} from 'react-icons/lu';

import {
  loadRoadmapSection,
  markRoadmapDone,
  type RoadmapCategory,
  type RoadmapExerciseSet,
  type RoadmapItem,
  type RoadmapSection,
  type RoadmapWord,
} from '../api/roadmap';
import { importText } from '../lib/books';
import { loadPublicBook, loadPublicLibrary } from '../lib/publicLibrary';
import { useRouter } from '../lib/router';
import { useAuth } from '../state/auth';
import { useSync } from '../state/sync';
import { Exercise, ExerciseResultContext } from './LessonPlayer';
import { Button, ErrorNote, Spinner } from './ui';

/**
 * Содержимое одной клетки карты: уровень × раздел.
 *
 * Грузится по нажатию, а не вместе с картой: клеток двадцать четыре, и тянуть
 * их все ради одной открытой значило бы отдавать словарь на полторы тысячи
 * слов каждому, кто просто посмотрел на тропу.
 */
export function RoadmapSectionPanel({
  level,
  category,
  onProgress,
}: {
  level: string;
  category: RoadmapCategory;
  onProgress: () => void;
}) {
  const [section, setSection] = useState<RoadmapSection | null>(null);
  const [error, setError] = useState('');

  const reload = useCallback(
    (signal?: AbortSignal) => {
      loadRoadmapSection(level, category.key, signal)
        .then(setSection)
        .catch((caught: unknown) => {
          if (signal?.aborted) return;
          setError(caught instanceof Error ? caught.message : 'Раздел не загрузился.');
        });
    },
    [category.key, level],
  );

  useEffect(() => {
    const controller = new AbortController();
    setSection(null);
    setError('');
    reload(controller.signal);
    return () => controller.abort();
  }, [reload]);

  const afterMark = () => {
    reload();
    onProgress();
  };

  if (error) return <ErrorNote>{error}</ErrorNote>;
  if (!section) return <div className="py-10 text-center"><Spinner /></div>;

  const empty =
    section.items.length === 0 &&
    section.exercises.length === 0 &&
    section.words.length === 0;

  return (
    <div className="mt-6">
      <p className="max-w-3xl leading-7 text-[var(--text-muted)]">{category.about}</p>
      {section.intro && (
        <p className="mt-4 max-w-3xl whitespace-pre-line leading-7">{section.intro}</p>
      )}

      {category.planned && (
        <p className="mt-6 rounded-xl border border-[var(--line)] bg-[var(--bg-sunken)]/50 px-4 py-3">
          Пока планируется — упражнения на написание предложений и игра против
          переводчика. <span lang="sr">Ускоро ће бити.</span>
        </p>
      )}

      {empty && !category.planned && (
        <div className="mt-6 flex items-center gap-3 rounded-2xl border border-dashed border-[var(--line)] bg-[var(--bg-sunken)]/40 px-5 py-6">
          <LuSparkles className="size-5 shrink-0 text-[var(--accent)]" />
          <p className="text-[var(--text-muted)]">
            Увы, тут пока пусто — но скоро что-то появится.
          </p>
        </div>
      )}

      {section.items.length > 0 && (
        <ul className="mt-6 grid gap-3">
          {section.items.map((item) => (
            <ItemRow key={item.id} item={item} onMarked={afterMark} />
          ))}
        </ul>
      )}

      {section.exercises.length > 0 && (
        <div className="mt-8">
          <h3 className="font-display text-xl">Упражнения</h3>
          <div className="mt-3 grid gap-3">
            {section.exercises.map((set) => (
              <ExerciseCard key={set.id} set={set} onDone={afterMark} />
            ))}
          </div>
        </div>
      )}

      {section.words.length > 0 && (
        <WordList words={section.words} onMarked={afterMark} />
      )}
    </div>
  );
}

const KIND_ICON = {
  book: LuBookOpen,
  link: LuLink,
  feed_card: LuNewspaper,
  text: LuBookOpen,
  grammar_topic: LuGraduationCap,
  lesson: LuGraduationCap,
} as const;

function ItemRow({ item, onMarked }: { item: RoadmapItem; onMarked: () => void }) {
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const Icon = KIND_ICON[item.kind] ?? LuBookOpen;

  const toggle = async () => {
    setBusy(true);
    try {
      await markRoadmapDone('item', item.id, !item.done);
      onMarked();
    } finally {
      setBusy(false);
    }
  };

  return (
    <li className="rounded-xl border border-[var(--line)] bg-[var(--bg-raised)]">
      <div className="flex flex-wrap items-start gap-3 px-4 py-3">
        <Icon className="mt-1 shrink-0 text-[var(--accent)]" />
        <div className="min-w-0 flex-1">
          <p className="font-semibold">{item.title}</p>
          {item.summary && (
            <p className="mt-1 text-sm text-[var(--text-muted)]">{item.summary}</p>
          )}
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <ItemAction item={item} />
          {item.body && (
            <button
              type="button"
              onClick={() => setOpen((value) => !value)}
              aria-expanded={open}
              className="grid size-9 place-items-center rounded-md text-[var(--text-muted)] hover:bg-[var(--bg-sunken)]"
              title={open ? 'Свернуть' : 'Развернуть'}
            >
              <LuChevronDown className={open ? 'rotate-180 transition-transform' : 'transition-transform'} />
            </button>
          )}
          <DoneToggle done={item.done} busy={busy} onToggle={toggle} />
        </div>
      </div>
      {open && item.body && (
        <div className="border-t border-[var(--line)] px-4 py-4">
          <p className="max-w-[62ch] whitespace-pre-line leading-7">{item.body}</p>
        </div>
      )}
    </li>
  );
}

/** Кнопка «открыть»: у каждого вида пункта она своя. */
function ItemAction({ item }: { item: RoadmapItem }) {
  const { navigate } = useRouter();
  const { sync } = useSync();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const url = typeof item.payload?.url === 'string' ? item.payload.url : '';
  const slug = typeof item.payload?.slug === 'string' ? item.payload.slug : '';
  const bookId = typeof item.payload?.bookId === 'string' ? item.payload.bookId : '';
  const trainerTopicId = typeof item.payload?.trainerTopicId === 'string'
    ? item.payload.trainerTopicId
    : '';

  if (item.kind === 'link' && url) {
    return (
      <a
        href={url}
        target="_blank"
        rel="noreferrer noopener"
        className="inline-flex items-center gap-1.5 rounded-md px-3 py-2 text-sm font-semibold text-[var(--accent)] hover:bg-[var(--bg-sunken)]"
      >
        Открыть <LuArrowUpRight />
      </a>
    );
  }

  if (item.kind === 'lesson' && slug) {
    return (
      <button
        type="button"
        onClick={() => navigate(`/lessons/${slug}`)}
        className="rounded-md px-3 py-2 text-sm font-semibold text-[var(--accent)] hover:bg-[var(--bg-sunken)]"
      >
        К уроку
      </button>
    );
  }

  if (item.kind === 'feed_card') {
    return (
      <button
        type="button"
        onClick={() => navigate('/vukotok')}
        className="rounded-md px-3 py-2 text-sm font-semibold text-[var(--accent)] hover:bg-[var(--bg-sunken)]"
      >
        В Вукоток
      </button>
    );
  }

  if (trainerTopicId) {
    return (
      <button
        type="button"
        onClick={() => navigate(`/trainer?topic=${encodeURIComponent(trainerTopicId)}`)}
        className="rounded-md px-3 py-2 text-sm font-semibold text-[var(--accent)] hover:bg-[var(--bg-sunken)]"
      >
        Практиковаться
      </button>
    );
  }

  // Книга из публичной библиотеки и свой текст открываются одинаково: оба
  // попадают в читалку через обычный импорт, а не через отдельный просмотр.
  // Читать со словарём по нажатию — то, ради чего Читавук и существует.
  if ((item.kind === 'book' && bookId) || (item.kind === 'text' && item.body)) {
    const open = async () => {
      setBusy(true);
      setError('');
      try {
        let text = item.body ?? '';
        if (item.kind === 'book') {
          const catalog = await loadPublicLibrary();
          const entry = catalog.items.find((candidate) => candidate.id === bookId);
          if (!entry) throw new Error('Книга не найдена в каталоге.');
          text = await loadPublicBook(entry);
        }
        const book = await importText(item.title, text);
        void sync();
        navigate(`/reader/${book.id}`);
      } catch (caught: unknown) {
        setError(caught instanceof Error ? caught.message : 'Не удалось открыть.');
      } finally {
        setBusy(false);
      }
    };
    return (
      <div className="text-right">
        <button
          type="button"
          onClick={open}
          disabled={busy}
          className="rounded-md px-3 py-2 text-sm font-semibold text-[var(--accent)] hover:bg-[var(--bg-sunken)] disabled:opacity-60"
        >
          {busy ? 'Открываем…' : 'Читать'}
        </button>
        {error && <p className="mt-1 text-xs text-red-600">{error}</p>}
      </div>
    );
  }

  return null;
}

function DoneToggle({
  done,
  busy,
  onToggle,
}: {
  done: boolean;
  busy: boolean;
  onToggle: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onToggle}
      disabled={busy}
      aria-pressed={done}
      title={done ? 'Снять отметку' : 'Отметить пройденным'}
      className={`grid size-9 place-items-center rounded-md border transition-colors ${
        done
          ? 'border-emerald-700 bg-emerald-700 text-white'
          : 'border-[var(--line)] text-[var(--text-muted)] hover:border-[var(--accent)]'
      } disabled:opacity-60`}
    >
      <LuCheck />
    </button>
  );
}

/**
 * Набор упражнений.
 *
 * Засчитывается долей верных ответов, а не фактом открытия: иначе «пройдено»
 * означало бы «развернул и закрыл». Доля собирается из самих упражнений через
 * ExerciseResultContext и учитывается по первой проверке каждого.
 */
function ExerciseCard({
  set,
  onDone,
}: {
  set: RoadmapExerciseSet;
  onDone: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [results, setResults] = useState<boolean[]>([]);
  const [saving, setSaving] = useState(false);
  const exercises = useMemo(() => set.content?.exercises ?? [], [set.content]);

  const right = results.filter(Boolean).length;

  const finish = async () => {
    setSaving(true);
    try {
      await markRoadmapDone(
        'exercise',
        set.id,
        true,
        exercises.length > 0 ? right / exercises.length : 1,
      );
      onDone();
      setOpen(false);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="rounded-xl border border-[var(--line)] bg-[var(--bg-raised)]">
      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        aria-expanded={open}
        className="flex w-full items-center gap-3 px-4 py-3 text-left"
      >
        <LuSquareCheckBig className="shrink-0 text-[var(--accent)]" />
        <span className="min-w-0 flex-1">
          <span className="block font-semibold">{set.title}</span>
          <span className="block text-sm text-[var(--text-muted)]">
            {exercises.length} заданий
            {set.done && ` · пройдено на ${Math.round(set.score * 100)}%`}
          </span>
        </span>
        <LuChevronDown className={open ? 'rotate-180 transition-transform' : 'transition-transform'} />
      </button>
      {open && (
        <div className="border-t border-[var(--line)] px-4 pb-5">
          <ExerciseResultContext.Provider
            // Исходы копятся по порядку проверок. Каждое задание сообщает о
            // себе один раз (CheckRow молчит на повторных нажатиях), а список
            // ограничен числом заданий: «начать заново» иначе позволяло бы
            // набить долю верных сверх сотни процентов.
            value={(correct) => {
              setResults((previous) =>
                previous.length < exercises.length ? [...previous, correct] : previous,
              );
            }}
          >
            {exercises.map((exercise, index) => (
              <Exercise key={exercise.id} exercise={exercise} index={index} />
            ))}
          </ExerciseResultContext.Provider>
          <div className="mt-4 flex flex-wrap items-center gap-3">
            <Button onClick={finish} disabled={saving}>
              {saving ? 'Сохраняем…' : 'Завершить'}
            </Button>
            <span className="text-sm text-[var(--text-muted)]">
              Верных {right} из {exercises.length}
            </span>
          </div>
        </div>
      )}
    </div>
  );
}

/**
 * Словарь уровня: слова по темам.
 *
 * Темы — плитки с кольцом прогресса, а не строки списка: тема выбирается
 * глазом («сегодня еда»), и сплошной столбец из двадцати заголовков этому
 * мешает. Открытая тема разворачивается на всю ширину под плитками, чтобы
 * слова читались в две-три колонки, а не в одну узкую.
 */
function WordList({
  words,
  onMarked,
}: {
  words: RoadmapWord[];
  onMarked: () => void;
}) {
  const { account } = useAuth();
  const [open, setOpen] = useState('');

  const themes = useMemo(() => {
    const groups = new Map<string, RoadmapWord[]>();
    for (const word of words) {
      const list = groups.get(word.theme) ?? [];
      list.push(word);
      groups.set(word.theme, list);
    }
    return [...groups.entries()].map(([theme, list]) => ({
      theme,
      words: list,
      known: list.filter((word) => word.known).length,
    }));
  }, [words]);

  const known = words.filter((word) => word.known).length;
  const current = themes.find((item) => item.theme === open);

  return (
    <div className="mt-10">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h3 className="font-display text-2xl">Слова уровня</h3>
          <p className="text-sm text-[var(--text-muted)]">
            {themes.length} тем · {words.length} слов
          </p>
        </div>
        <div className="text-right">
          <p className="font-display text-3xl text-[var(--accent)]">
            {known}
            <span className="text-lg text-[var(--text-muted)]">/{words.length}</span>
          </p>
          <p className="text-sm text-[var(--text-muted)]">выучено</p>
        </div>
      </div>

      <div className="mt-3 h-2 overflow-hidden rounded-full bg-[var(--bg-sunken)]">
        <div
          className="h-full rounded-full bg-[var(--accent)] transition-[width] duration-500"
          style={{ width: `${(known / Math.max(1, words.length)) * 100}%` }}
        />
      </div>

      {!account && (
        <p className="mt-3 text-sm text-[var(--text-muted)]">
          Войдите, чтобы отмечать выученные слова — отметки хранятся в аккаунте.
        </p>
      )}

      <div className="mt-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {themes.map((item) => (
          <ThemeTile
            key={item.theme}
            theme={item.theme}
            total={item.words.length}
            known={item.known}
            active={open === item.theme}
            onClick={() => setOpen(open === item.theme ? '' : item.theme)}
          />
        ))}
      </div>

      {current && (
        <section className="mt-5 rounded-2xl border border-[var(--accent)]/35 bg-[var(--bg-raised)] p-5">
          <div className="flex flex-wrap items-baseline justify-between gap-3">
            <h4 className="font-display text-xl">{current.theme}</h4>
            <p className="text-sm text-[var(--text-muted)]">
              выучено {current.known} из {current.words.length}
            </p>
          </div>
          <ul className="mt-4 grid gap-1.5 sm:grid-cols-2 lg:grid-cols-3">
            {current.words.map((word) => (
              <WordRow key={word.id} word={word} onMarked={onMarked} />
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}

/** Плитка темы: название, счётчик и кольцо прогресса. */
function ThemeTile({
  theme,
  total,
  known,
  active,
  onClick,
}: {
  theme: string;
  total: number;
  known: number;
  active: boolean;
  onClick: () => void;
}) {
  const ratio = total === 0 ? 0 : known / total;
  const radius = 16;
  const circumference = 2 * Math.PI * radius;
  const complete = known === total && total > 0;

  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={`flex items-center gap-3 rounded-2xl border px-4 py-3 text-left transition-colors ${
        active
          ? 'border-[var(--accent)] bg-[var(--accent)]/10'
          : 'border-[var(--line)] bg-[var(--bg-raised)] hover:border-[var(--accent)]'
      }`}
    >
      <span className="relative grid size-10 shrink-0 place-items-center">
        <svg viewBox="0 0 40 40" className="absolute size-full -rotate-90">
          <circle cx="20" cy="20" r={radius} fill="none" stroke="var(--bg-sunken)" strokeWidth="4" />
          <circle
            cx="20"
            cy="20"
            r={radius}
            fill="none"
            stroke={complete ? 'rgb(4 120 87)' : 'var(--accent)'}
            strokeWidth="4"
            strokeLinecap="round"
            strokeDasharray={circumference}
            strokeDashoffset={circumference * (1 - ratio)}
            className="transition-[stroke-dashoffset] duration-500"
          />
        </svg>
        {complete && <LuCheck className="relative size-4 text-emerald-700" />}
      </span>
      <span className="min-w-0 flex-1">
        <span className="block truncate font-semibold">{theme}</span>
        <span className="block text-sm text-[var(--text-muted)]">
          {known} из {total}
        </span>
      </span>
      <LuChevronDown
        className={`shrink-0 text-[var(--text-muted)] ${active ? 'rotate-180' : ''} transition-transform`}
      />
    </button>
  );
}

function WordRow({ word, onMarked }: { word: RoadmapWord; onMarked: () => void }) {
  const [busy, setBusy] = useState(false);
  const toggle = async () => {
    setBusy(true);
    try {
      await markRoadmapDone('word', word.id, !word.known);
      onMarked();
    } finally {
      setBusy(false);
    }
  };
  return (
    <li>
      <button
        type="button"
        onClick={toggle}
        disabled={busy}
        aria-pressed={word.known}
        className={`flex w-full items-start gap-3 rounded-xl px-3 py-2 text-left transition-colors ${
          word.known
            ? 'bg-emerald-700/10'
            : 'hover:bg-[var(--bg-sunken)]/70'
        } disabled:opacity-60`}
      >
        <span
          className={`mt-0.5 grid size-5 shrink-0 place-items-center rounded-md border transition-colors ${
            word.known
              ? 'border-emerald-700 bg-emerald-700 text-white'
              : 'border-[var(--line)]'
          }`}
        >
          {word.known && <LuCheck className="size-3.5" />}
        </span>
        <span className="min-w-0 flex-1">
          <span className="flex flex-wrap items-baseline gap-x-2">
            <span
              className={`font-display text-lg ${word.known ? 'text-[var(--text-muted)] line-through decoration-emerald-700/40' : ''}`}
              lang="sr"
            >
              {word.lemma}
            </span>
            {word.note && (
              <span className="rounded-full bg-[var(--bg-sunken)] px-2 py-0.5 text-xs text-[var(--text-muted)]">
                {word.note}
              </span>
            )}
          </span>
          <span className="block text-sm text-[var(--text-muted)]">{word.translation}</span>
        </span>
      </button>
    </li>
  );
}
