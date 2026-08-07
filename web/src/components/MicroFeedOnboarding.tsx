import { useRef, useState } from 'react';
import { LuCheck } from 'react-icons/lu';

import {
  MICRO_FEED_LEVELS,
  saveMicroFeedPreferences,
  type MicroFeedItem,
  type MicroFeedPreferences,
} from '../api/microFeed';
import { Mascot } from './Mascot';
import { Spinner } from './ui';
import { useFocusTrap, useScrollLock } from '../lib/overlay';

type Category = MicroFeedItem['category'];
type Level = MicroFeedItem['cefr'];

const CATEGORIES: { key: Category; label: string; hint: string }[] = [
  { key: 'history', label: 'История', hint: 'Балканы, короли, войны' },
  { key: 'culture', label: 'Культура', hint: 'Кино, музыка, обычаи' },
  { key: 'science', label: 'Наука', hint: 'Открытия и объяснения' },
  { key: 'fiction', label: 'Литература', hint: 'Отрывки из книг' },
  { key: 'society', label: 'Общество', hint: 'Как живут люди' },
  { key: 'news', label: 'Новости', hint: 'Что происходит сейчас' },
  { key: 'travel', label: 'Путешествия', hint: 'Куда съездить на Балканах' },
  { key: 'food', label: 'Еда', hint: 'Кухня, застолье, рецепты' },
  { key: 'sport', label: 'Спорт', hint: 'Баскетбол, теннис, футбол' },
  { key: 'music', label: 'Музыка', hint: 'Песни, группы, труба' },
  { key: 'language', label: 'Про язык', hint: 'Слова, выражения, тонкости' },
];

const LEVELS: Record<Level, string> = {
  A1: 'Первые слова',
  A2: 'Простые фразы',
  B1: 'Читаю с переводчиком',
  B2: 'Читаю почти свободно',
  C1: 'Свободно',
};

/**
 * Что показывать в Вукотоке — спрашиваем сразу.
 *
 * Подбор до сих пор строился только по поведению, а поведения при первом заходе
 * нет. Новому читателю лента показывала «популярное вперемешку с лёгким» и
 * ждала, пока он налистает сигналов. На чужом языке это дорогая цена: карточка
 * не тридцатисекундный ролик, её читают минуту, и первые десять неподходящих
 * отбивают желание вернуться.
 *
 * Спрашивается ровно два вопроса — темы и уровень. Больше нельзя: анкета перед
 * лентой и так стоит между человеком и тем, зачем он пришёл.
 */
export function MicroFeedOnboarding({
  preferences,
  onDone,
}: {
  preferences: MicroFeedPreferences;
  onDone: (preferences: MicroFeedPreferences) => void;
}) {
  const [categories, setCategories] = useState<Category[]>([]);
  // Уровень с аккаунта — готовый ответ, а не подсказка: он задан один раз для
  // всего приложения, и здесь остаётся только не спрашивать заново.
  const [level, setLevel] = useState<Level>(preferences.cefr);
  const [saving, setSaving] = useState(false);
  const [failed, setFailed] = useState(false);
  const panelRef = useRef<HTMLDivElement>(null);

  useScrollLock(true);
  useFocusTrap(true, panelRef);

  function toggle(key: Category) {
    setCategories((current) =>
      current.includes(key) ? current.filter((item) => item !== key) : [...current, key],
    );
  }

  async function submit(chosen: Category[]) {
    setSaving(true);
    setFailed(false);
    try {
      onDone(await saveMicroFeedPreferences(chosen, level));
    } catch {
      setFailed(true);
      setSaving(false);
    }
  }

  return (
    <div
      className="fixed inset-0 z-[70] grid place-items-center overflow-y-auto bg-[#100e0c] px-4 py-8 text-white"
      role="dialog"
      aria-modal="true"
      aria-label="Настройка ленты"
    >
      <div ref={panelRef} className="w-full max-w-2xl">
        <div className="flex items-center gap-4">
          <Mascot pose="citavuk_vukotok" alt="" className="w-24 shrink-0 sm:w-28" />
          <div>
            <h1 className="font-display text-2xl font-bold sm:text-3xl">
              Просто выбери то, что тебе интересно
            </h1>
            <p className="mt-1 text-sm text-white/70">Ничего сложного!</p>
          </div>
        </div>

        <fieldset className="mt-7">
          <legend className="text-xs font-bold uppercase tracking-wide text-white/60">
            Темы — выберите сколько хотите
          </legend>
          <div className="mt-3 grid gap-2 sm:grid-cols-2">
            {CATEGORIES.map((category) => {
              const active = categories.includes(category.key);
              return (
                <button
                  key={category.key}
                  type="button"
                  aria-pressed={active}
                  onClick={() => toggle(category.key)}
                  className={`flex items-center gap-3 rounded-xl border px-4 py-3 text-left transition-colors ${
                    active
                      ? 'border-white/70 bg-white/15'
                      : 'border-white/15 bg-black/30 hover:border-white/40'
                  }`}
                >
                  <span
                    className={`grid size-5 shrink-0 place-items-center rounded-md border ${
                      active ? 'border-white bg-white text-black' : 'border-white/35'
                    }`}
                    aria-hidden="true"
                  >
                    {active && <LuCheck className="size-3.5" />}
                  </span>
                  <span className="min-w-0">
                    <span className="block font-semibold">{category.label}</span>
                    <span className="block text-xs text-white/60">{category.hint}</span>
                  </span>
                </button>
              );
            })}
          </div>
        </fieldset>

        {/*
          Уровень спрашивается только у того, кого о нём ещё не спрашивали.
          Вошедшему он уже известен по аккаунту, и второй вопрос значил бы, что
          первый ответ никуда не записали.
        */}
        {preferences.levelFromAccount ? (
          <p className="mt-6 text-sm text-white/60">
            Уровень сербского беру из вашего аккаунта: <b>{level}</b>. Поменять его
            можно в настройках.
          </p>
        ) : (
        <fieldset className="mt-6">
          <legend className="text-xs font-bold uppercase tracking-wide text-white/60">
            Сербский сейчас
          </legend>
          <div className="mt-3 flex flex-wrap gap-2">
            {MICRO_FEED_LEVELS.map((value) => (
              <button
                key={value}
                type="button"
                aria-pressed={level === value}
                onClick={() => setLevel(value)}
                className={`rounded-xl border px-4 py-2.5 text-left transition-colors ${
                  level === value
                    ? 'border-white/70 bg-white/15'
                    : 'border-white/15 bg-black/30 hover:border-white/40'
                }`}
              >
                <span className="font-bold">{value}</span>
                <span className="ml-2 text-xs text-white/60">{LEVELS[value]}</span>
              </button>
            ))}
          </div>
        </fieldset>
        )}

        {failed && (
          <p className="mt-4 text-sm text-[#ffb4ae]" role="alert">
            Не удалось сохранить ответы. Попробуйте ещё раз.
          </p>
        )}

        <div className="mt-7 flex flex-wrap items-center gap-3">
          <button
            type="button"
            disabled={saving}
            onClick={() => void submit(categories)}
            className="inline-flex items-center gap-2 rounded-xl bg-white px-5 py-3 font-bold text-black transition-opacity hover:opacity-90 disabled:opacity-50"
          >
            {saving && <Spinner className="size-4" />}
            Открыть ленту
          </button>
          {/*
            Отказ — тоже ответ, и записывается он так же. Иначе анкета встречала
            бы человека при каждом заходе, а «покажите всё подряд» — совершенно
            законный выбор.
          */}
          <button
            type="button"
            disabled={saving}
            onClick={() => void submit([])}
            className="rounded-xl px-4 py-3 text-sm font-semibold text-white/70 underline-offset-4 hover:text-white hover:underline disabled:opacity-50"
          >
            Показывайте всё подряд
          </button>
        </div>
      </div>
    </div>
  );
}
