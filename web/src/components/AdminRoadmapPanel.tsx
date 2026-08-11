import { useCallback, useEffect, useState } from 'react';
import { LuPlus, LuTrash2 } from 'react-icons/lu';

import {
  deleteAdminRoadmapExercise,
  deleteAdminRoadmapItem,
  deleteAdminRoadmapWord,
  loadAdminRoadmapSection,
  publishAdminRoadmapWords,
  saveAdminRoadmapExercise,
  saveAdminRoadmapIntro,
  saveAdminRoadmapItem,
  saveAdminRoadmapWord,
  type AdminRoadmapSection,
} from '../api/adminRoadmap';
import type { LessonExercise } from '../api/lessons';
import {
  ROADMAP_CATEGORIES,
  ROADMAP_LEVELS,
  type RoadmapExerciseSet,
  type RoadmapItem,
} from '../api/roadmap';
import type { RoadmapExerciseDraft, RoadmapItemDraft } from '../api/adminRoadmap';
import { LessonExerciseEditor } from './LessonExerciseEditor';
import { Button, ErrorNote, Spinner } from './ui';

/**
 * Наполнение дорожной карты.
 *
 * Правится по клетке: уровень × раздел. Показывать сразу всю карту незачем —
 * автор наполняет её по одному разделу за раз, а двадцать четыре клетки на
 * одном экране не помещаются и не читаются.
 */

const field =
  'w-full rounded-md border border-[var(--line)] bg-[var(--bg)] px-3 py-2.5 outline-none focus:border-[var(--accent)]';

const CATEGORY_LABELS: Record<string, string> = {
  reading: 'Reading',
  grammar: 'Grammar',
  vocabulary: 'Vocabulary',
  writing: 'Writing',
};

const KIND_LABELS: Record<RoadmapItem['kind'], string> = {
  book: 'Книга из публичной библиотеки',
  link: 'Внешняя ссылка',
  feed_card: 'Карточка Вукотока',
  text: 'Свой текст',
  grammar_topic: 'Тема грамматики',
  lesson: 'Урок преподавателя',
};

/** Какое поле payload осмысленно для каждого вида пункта. */
const KIND_PAYLOAD: Partial<Record<RoadmapItem['kind'], { key: string; label: string }>> = {
  book: { key: 'bookId', label: 'Идентификатор книги в каталоге' },
  link: { key: 'url', label: 'Адрес' },
  feed_card: { key: 'itemId', label: 'Идентификатор карточки' },
  lesson: { key: 'slug', label: 'Адрес урока (slug)' },
};

export function AdminRoadmapPanel() {
  const [level, setLevel] = useState<string>('A1');
  const [category, setCategory] = useState<string>('reading');
  const [section, setSection] = useState<AdminRoadmapSection | null>(null);
  const [error, setError] = useState('');

  const reload = useCallback(() => {
    setSection(null);
    setError('');
    loadAdminRoadmapSection(level, category)
      .then(setSection)
      .catch((caught: unknown) =>
        setError(caught instanceof Error ? caught.message : 'Раздел не загрузился.'),
      );
  }, [category, level]);

  useEffect(reload, [reload]);

  return (
    <div>
      <div className="flex flex-wrap gap-2">
        {ROADMAP_LEVELS.map((item) => (
          <button
            key={item}
            type="button"
            onClick={() => setLevel(item)}
            className={`rounded-md border px-3 py-1.5 text-sm font-semibold ${
              level === item
                ? 'border-[var(--accent)] bg-[var(--accent)]/10'
                : 'border-[var(--line)]'
            }`}
          >
            {item}
          </button>
        ))}
      </div>
      <div className="mt-3 flex flex-wrap gap-2">
        {ROADMAP_CATEGORIES.map((item) => (
          <button
            key={item}
            type="button"
            onClick={() => setCategory(item)}
            className={`rounded-md border px-3 py-1.5 text-sm font-semibold ${
              category === item
                ? 'border-[var(--accent)] bg-[var(--accent)]/10'
                : 'border-[var(--line)]'
            }`}
          >
            {CATEGORY_LABELS[item]}
          </button>
        ))}
      </div>

      {error && <div className="mt-6"><ErrorNote>{error}</ErrorNote></div>}
      {!section && !error && <div className="py-12 text-center"><Spinner /></div>}

      {section && (
        <div className="mt-8 grid gap-10">
          <IntroEditor
            level={level}
            category={category}
            intro={section.intro}
            onSaved={reload}
          />
          <ItemsEditor
            level={level}
            category={category}
            items={section.items}
            onChanged={reload}
          />
          <ExercisesEditor
            level={level}
            category={category}
            sets={section.exercises}
            items={section.items}
            onChanged={reload}
          />
          {category === 'vocabulary' && (
            <WordsEditor level={level} words={section.words} onChanged={reload} />
          )}
        </div>
      )}
    </div>
  );
}

function IntroEditor({
  level,
  category,
  intro,
  onSaved,
}: {
  level: string;
  category: string;
  intro: string;
  onSaved: () => void;
}) {
  const [value, setValue] = useState(intro);
  const [busy, setBusy] = useState(false);
  useEffect(() => setValue(intro), [intro]);

  return (
    <section>
      <h3 className="font-display text-xl">Вводный текст раздела</h3>
      <p className="mt-1 text-sm text-[var(--text-muted)]">
        Показывается под общим описанием категории. Пусто — раздел обходится
        общим описанием.
      </p>
      <textarea
        rows={4}
        className={`${field} mt-3`}
        value={value}
        onChange={(event) => setValue(event.target.value)}
      />
      <Button
        className="mt-3"
        disabled={busy}
        onClick={async () => {
          setBusy(true);
          try {
            await saveAdminRoadmapIntro(level, category, value);
            onSaved();
          } finally {
            setBusy(false);
          }
        }}
      >
        Сохранить
      </Button>
    </section>
  );
}

function ItemsEditor({
  level,
  category,
  items,
  onChanged,
}: {
  level: string;
  category: string;
  items: RoadmapItem[];
  onChanged: () => void;
}) {
  const [draft, setDraft] = useState<Partial<RoadmapItemDraft> | null>(null);

  return (
    <section>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h3 className="font-display text-xl">Пункты раздела</h3>
        <Button
          variant="secondary"
          onClick={() =>
            setDraft({ level, category, kind: 'link', title: '', payload: {} })
          }
        >
          <LuPlus />
          Добавить
        </Button>
      </div>

      <ul className="mt-3 grid gap-2">
        {items.map((item) => (
          <li
            key={item.id}
            className="flex flex-wrap items-center gap-3 rounded-md border border-[var(--line)] px-4 py-3"
          >
            <span className="min-w-0 flex-1">
              <span className="block font-semibold">{item.title}</span>
              <span className="block text-sm text-[var(--text-muted)]">
                {KIND_LABELS[item.kind]} ·{' '}
                {item.status === 'published' ? 'опубликован' : 'черновик'}
              </span>
            </span>
            <button
              type="button"
              onClick={() => setDraft(item)}
              className="text-sm font-semibold text-[var(--accent)]"
            >
              Править
            </button>
            <button
              type="button"
              onClick={async () => {
                await deleteAdminRoadmapItem(item.id);
                onChanged();
              }}
              aria-label="Удалить пункт"
              className="text-[var(--text-muted)] hover:text-red-600"
            >
              <LuTrash2 />
            </button>
          </li>
        ))}
        {items.length === 0 && (
          <li className="text-sm text-[var(--text-muted)]">Пунктов пока нет.</li>
        )}
      </ul>

      {draft && (
        <ItemForm
          draft={draft}
          onCancel={() => setDraft(null)}
          onSaved={() => {
            setDraft(null);
            onChanged();
          }}
        />
      )}
    </section>
  );
}

function ItemForm({
  draft,
  onCancel,
  onSaved,
}: {
  draft: Partial<RoadmapItemDraft>;
  onCancel: () => void;
  onSaved: () => void;
}) {
  const [value, setValue] = useState(draft);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const kind = (value.kind ?? 'link') as RoadmapItem['kind'];
  const payloadField = KIND_PAYLOAD[kind];
  const payload = (value.payload ?? {}) as Record<string, unknown>;

  return (
    <div className="mt-4 grid gap-4 rounded-xl border border-[var(--accent)]/40 bg-[var(--bg-raised)] p-5">
      <label className="grid gap-2 text-sm font-semibold">
        Вид
        <select
          className={field}
          value={kind}
          onChange={(event) =>
            setValue({ ...value, kind: event.target.value as RoadmapItem['kind'] })
          }
        >
          {Object.entries(KIND_LABELS).map(([key, label]) => (
            <option key={key} value={key}>
              {label}
            </option>
          ))}
        </select>
      </label>

      <label className="grid gap-2 text-sm font-semibold">
        Название
        <input
          className={field}
          value={value.title ?? ''}
          onChange={(event) => setValue({ ...value, title: event.target.value })}
        />
      </label>

      <label className="grid gap-2 text-sm font-semibold">
        Короткое пояснение
        <input
          className={field}
          value={value.summary ?? ''}
          onChange={(event) => setValue({ ...value, summary: event.target.value })}
        />
      </label>

      {payloadField && (
        <label className="grid gap-2 text-sm font-semibold">
          {payloadField.label}
          <input
            className={field}
            value={String(payload[payloadField.key] ?? '')}
            onChange={(event) =>
              setValue({
                ...value,
                payload: { ...payload, [payloadField.key]: event.target.value },
              })
            }
          />
        </label>
      )}

      {(kind === 'text' || kind === 'grammar_topic') && (
        <label className="grid gap-2 text-sm font-semibold">
          {kind === 'text' ? 'Текст' : 'Объяснение темы'}
          <textarea
            rows={8}
            className={field}
            value={value.body ?? ''}
            onChange={(event) => setValue({ ...value, body: event.target.value })}
          />
        </label>
      )}

      <div className="flex flex-wrap items-center gap-4">
        <label className="inline-flex items-center gap-2 text-sm font-semibold">
          <input
            type="checkbox"
            checked={value.status === 'published'}
            onChange={(event) =>
              setValue({ ...value, status: event.target.checked ? 'published' : 'draft' })
            }
          />
          Опубликовать
        </label>
        <label className="inline-flex items-center gap-2 text-sm font-semibold">
          Порядок
          <input
            type="number"
            className="w-20 rounded-md border border-[var(--line)] bg-[var(--bg)] px-2 py-1"
            value={value.position ?? 0}
            onChange={(event) =>
              setValue({ ...value, position: Number(event.target.value) })
            }
          />
        </label>
      </div>

      {error && <ErrorNote>{error}</ErrorNote>}

      <div className="flex flex-wrap gap-3">
        <Button
          disabled={busy}
          onClick={async () => {
            setBusy(true);
            setError('');
            try {
              await saveAdminRoadmapItem({
                ...value,
                level: value.level ?? '',
                category: value.category ?? '',
                kind,
                title: value.title ?? '',
              });
              onSaved();
            } catch (caught: unknown) {
              setError(caught instanceof Error ? caught.message : 'Не сохранилось.');
            } finally {
              setBusy(false);
            }
          }}
        >
          Сохранить
        </Button>
        <button type="button" onClick={onCancel} className="text-sm text-[var(--text-muted)]">
          Отмена
        </button>
      </div>
    </div>
  );
}

function ExercisesEditor({
  level,
  category,
  sets,
  items,
  onChanged,
}: {
  level: string;
  category: string;
  sets: RoadmapExerciseSet[];
  items: RoadmapItem[];
  onChanged: () => void;
}) {
  const [draft, setDraft] = useState<Partial<RoadmapExerciseDraft> | null>(null);

  return (
    <section>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h3 className="font-display text-xl">Упражнения</h3>
        <Button
          variant="secondary"
          onClick={() =>
            setDraft({ level, category, title: '', content: { exercises: [] } })
          }
        >
          <LuPlus />
          Добавить набор
        </Button>
      </div>

      <ul className="mt-3 grid gap-2">
        {sets.map((set) => (
          <li
            key={set.id}
            className="flex flex-wrap items-center gap-3 rounded-md border border-[var(--line)] px-4 py-3"
          >
            <span className="min-w-0 flex-1">
              <span className="block font-semibold">{set.title}</span>
              <span className="block text-sm text-[var(--text-muted)]">
                {set.content?.exercises?.length ?? 0} заданий ·{' '}
                {set.status === 'published' ? 'опубликован' : 'черновик'}
              </span>
            </span>
            <button
              type="button"
              onClick={() => setDraft(set)}
              className="text-sm font-semibold text-[var(--accent)]"
            >
              Править
            </button>
            <button
              type="button"
              onClick={async () => {
                await deleteAdminRoadmapExercise(set.id);
                onChanged();
              }}
              aria-label="Удалить набор"
              className="text-[var(--text-muted)] hover:text-red-600"
            >
              <LuTrash2 />
            </button>
          </li>
        ))}
        {sets.length === 0 && (
          <li className="text-sm text-[var(--text-muted)]">Упражнений пока нет.</li>
        )}
      </ul>

      {draft && (
        <ExerciseForm
          draft={draft}
          items={items}
          onCancel={() => setDraft(null)}
          onSaved={() => {
            setDraft(null);
            onChanged();
          }}
        />
      )}
    </section>
  );
}

function ExerciseForm({
  draft,
  items,
  onCancel,
  onSaved,
}: {
  draft: Partial<RoadmapExerciseDraft>;
  items: RoadmapItem[];
  onCancel: () => void;
  onSaved: () => void;
}) {
  const [value, setValue] = useState(draft);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const exercises = value.content?.exercises ?? [];

  return (
    <div className="mt-4 grid gap-4 rounded-xl border border-[var(--accent)]/40 bg-[var(--bg-raised)] p-5">
      <label className="grid gap-2 text-sm font-semibold">
        Название набора
        <input
          className={field}
          value={value.title ?? ''}
          onChange={(event) => setValue({ ...value, title: event.target.value })}
        />
      </label>

      <label className="grid gap-2 text-sm font-semibold">
        К какому пункту
        <select
          className={field}
          value={value.itemId ?? ''}
          onChange={(event) =>
            setValue({ ...value, itemId: event.target.value || undefined })
          }
        >
          <option value="">Не привязан — упражнение уровня</option>
          {items.map((item) => (
            <option key={item.id} value={item.id}>
              {item.title}
            </option>
          ))}
        </select>
      </label>

      <LessonExerciseEditor
        exercises={exercises}
        onChange={(next: LessonExercise[]) =>
          setValue({ ...value, content: { exercises: next } })
        }
      />

      <div className="flex flex-wrap items-center gap-4">
        <label className="inline-flex items-center gap-2 text-sm font-semibold">
          <input
            type="checkbox"
            checked={value.status === 'published'}
            onChange={(event) =>
              setValue({ ...value, status: event.target.checked ? 'published' : 'draft' })
            }
          />
          Опубликовать
        </label>
        <label className="inline-flex items-center gap-2 text-sm font-semibold">
          Порядок
          <input
            type="number"
            className="w-20 rounded-md border border-[var(--line)] bg-[var(--bg)] px-2 py-1"
            value={value.position ?? 0}
            onChange={(event) =>
              setValue({ ...value, position: Number(event.target.value) })
            }
          />
        </label>
      </div>

      {error && <ErrorNote>{error}</ErrorNote>}

      <div className="flex flex-wrap gap-3">
        <Button
          disabled={busy}
          onClick={async () => {
            setBusy(true);
            setError('');
            try {
              await saveAdminRoadmapExercise({
                ...value,
                level: value.level ?? '',
                category: value.category ?? '',
                title: value.title ?? '',
              });
              onSaved();
            } catch (caught: unknown) {
              setError(caught instanceof Error ? caught.message : 'Не сохранилось.');
            } finally {
              setBusy(false);
            }
          }}
        >
          Сохранить
        </Button>
        <button type="button" onClick={onCancel} className="text-sm text-[var(--text-muted)]">
          Отмена
        </button>
      </div>
    </div>
  );
}

/**
 * Словарь уровня.
 *
 * Слов больше тысячи, поэтому правка идёт по одному, а публикация — сразу
 * всего черновика уровня: открывать шестьсот слов по одному никто не станет.
 */
function WordsEditor({
  level,
  words,
  onChanged,
}: {
  level: string;
  words: AdminRoadmapSection['words'];
  onChanged: () => void;
}) {
  const [theme, setTheme] = useState('');
  const [lemma, setLemma] = useState('');
  const [translation, setTranslation] = useState('');
  const [note, setNote] = useState('');
  const [example, setExample] = useState('');
  const [exampleTranslation, setExampleTranslation] = useState('');
  const [busy, setBusy] = useState(false);
  const [filter, setFilter] = useState('');

  const drafts = words.filter((word) => word.status === 'draft').length;
  const visible = words.filter(
    (word) =>
      !filter ||
      word.lemma.includes(filter) ||
      word.translation.includes(filter) ||
      word.theme.includes(filter),
  );

  return (
    <section>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h3 className="font-display text-xl">Слова уровня {level}</h3>
        <p className="text-sm text-[var(--text-muted)]">
          всего {words.length}, черновиков {drafts}
        </p>
      </div>

      {drafts > 0 && (
        <Button
          className="mt-3"
          variant="secondary"
          disabled={busy}
          onClick={async () => {
            setBusy(true);
            try {
              await publishAdminRoadmapWords(level);
              onChanged();
            } finally {
              setBusy(false);
            }
          }}
        >
          Опубликовать все черновики ({drafts})
        </Button>
      )}

      <div className="mt-4 grid gap-3 rounded-xl border border-[var(--line)] p-4 sm:grid-cols-4">
        <input
          className={field}
          placeholder="Тема"
          value={theme}
          onChange={(event) => setTheme(event.target.value)}
        />
        <input
          className={field}
          placeholder="Слово (латиницей)"
          value={lemma}
          onChange={(event) => setLemma(event.target.value)}
        />
        <input
          className={field}
          placeholder="Перевод"
          value={translation}
          onChange={(event) => setTranslation(event.target.value)}
        />
        <div className="flex gap-2">
          <input
            className={field}
            placeholder="Помета"
            value={note}
            onChange={(event) => setNote(event.target.value)}
          />
          <Button
            disabled={busy || !theme.trim() || !lemma.trim()}
            onClick={async () => {
              setBusy(true);
              try {
                await saveAdminRoadmapWord({
                  level,
                  theme,
                  lemma,
                  translation,
                  note,
                  example,
                  exampleTranslation,
                  status: 'published',
                });
                setLemma('');
                setTranslation('');
                setExample('');
                setExampleTranslation('');
                setNote('');
                onChanged();
              } finally {
                setBusy(false);
              }
            }}
          >
            <LuPlus />
          </Button>
        </div>
        {/* Слово в обеих фразах помечается звёздочками: *mačka*. По этой
            пометке оно подчёркивается и в сербской фразе, и в переводе —
            в переводе иначе его не найти, русской морфологии у нас нет. */}
        <textarea
          className={`${field} sm:col-span-2`}
          rows={2}
          placeholder="Фраза по-сербски: Naša *mačka* spava."
          value={example}
          onChange={(event) => setExample(event.target.value)}
        />
        <textarea
          className={`${field} sm:col-span-2`}
          rows={2}
          placeholder="Перевод: Наша *кошка* спит."
          value={exampleTranslation}
          onChange={(event) => setExampleTranslation(event.target.value)}
        />
      </div>

      <input
        className={`${field} mt-4`}
        placeholder="Найти слово, перевод или тему"
        value={filter}
        onChange={(event) => setFilter(event.target.value)}
      />

      <ul className="mt-3 grid max-h-96 gap-1 overflow-y-auto">
        {visible.map((word) => (
          <li
            key={word.id}
            className="flex items-center gap-3 rounded-md border border-[var(--line)] px-3 py-2 text-sm"
          >
            <span className="w-28 shrink-0 text-[var(--text-muted)]">{word.theme}</span>
            <span className="w-40 shrink-0 font-semibold" lang="sr">
              {word.lemma}
            </span>
            <span className="min-w-0 flex-1">{word.translation}</span>
            <span className="hidden min-w-0 flex-[2] truncate text-[var(--text-muted)] lg:block" lang="sr">
              {word.example}
            </span>
            {word.status === 'draft' && (
              <span className="text-xs text-[var(--text-muted)]">черновик</span>
            )}
            <button
              type="button"
              onClick={async () => {
                await deleteAdminRoadmapWord(word.id);
                onChanged();
              }}
              aria-label={`Удалить слово ${word.lemma}`}
              className="text-[var(--text-muted)] hover:text-red-600"
            >
              <LuTrash2 />
            </button>
          </li>
        ))}
      </ul>
    </section>
  );
}
