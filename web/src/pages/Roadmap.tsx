import type { ComponentType } from 'react';
import { useCallback, useEffect, useState } from 'react';
import {
  LuArrowRight,
  LuBookOpen,
  LuLanguages,
  LuPenLine,
  LuSpellCheck,
  LuTarget,
  LuX,
} from 'react-icons/lu';

import {
  levelPassed,
  loadRoadmap,
  nextLevel,
  saveRoadmapTarget,
  type RoadmapCategory,
  type RoadmapOverview,
} from '../api/roadmap';
import { Mascot } from '../components/Mascot';
import { Ornament } from '../components/Ornament';
import { RoadmapComments } from '../components/RoadmapComments';
import { RoadmapPath } from '../components/RoadmapPath';
import { RoadmapSectionPanel } from '../components/RoadmapSectionPanel';
import { Button, ErrorNote, Reveal, Spinner } from '../components/ui';
import { useRouter } from '../lib/router';
import { useSeo } from '../lib/seo';
import { useAuth } from '../state/auth';

/**
 * Дорожная карта сербского языка.
 *
 * Вводный текст, описания категорий и объяснение устройства — авторские, взяты
 * дословно. Менять их нельзя даже ради единообразия формулировок: это голос
 * автора страницы, а не подпись к элементу интерфейса. Оформление при этом
 * разное: сплошной текст на полторы тысячи знаков читают единицы, поэтому
 * перечисление разделов разложено по карточкам, а правило перехода вынесено во
 * врезку — слова те же, вес разный.
 */

/** Значок раздела. Четыре одинаковых прямоугольника глаз не различает. */
const CATEGORY_ICONS: Record<string, ComponentType<{ className?: string }>> = {
  reading: LuBookOpen,
  grammar: LuSpellCheck,
  vocabulary: LuLanguages,
  writing: LuPenLine,
};

/** Что даёт каждый раздел. Формулировки авторские, разбиты по карточкам. */
const HOW_IT_WORKS = [
  {
    key: 'reading',
    title: 'Reading',
    text: ' — предлагаемые книги, статьи и тексты для данного уровня (можно ' +
      'импортировать сразу в Читавук) или упражнения на данный текст.',
  },
  {
    key: 'grammar',
    title: 'Grammar',
    text: ' — список тем по грамматике и, если есть, предлагаемые уроки и ' +
      'упражнения на грамматику для данного уровня.',
  },
  {
    key: 'vocabulary',
    title: 'Vocabulary',
    text: ' — страница со списком слов по распределенным категориям (типа, ' +
      'животные, дом, семья и т.к далее); их можно добавлять в словарь и ' +
      'отмечать прямо на сайте, какие слова вы уже выучили.',
  },
  {
    key: 'writing',
    title: 'Writing (пока планируется)',
    text: ' — упражнения на написание предложений и игра против переводчика ' +
      '(will be soon/ускоро ће бити)',
  },
];
export function Roadmap() {
  useSeo({
    title: 'Дорожная карта сербского языка: что учить на каждом уровне',
    description:
      'Слова, темы, тексты и упражнения сербского языка, разложенные по уровням CEFR и категориям Reading, Grammar, Vocabulary, Writing. Отмечайте пройденное и переходите на следующий уровень.',
  });
  const { account } = useAuth();
  const { navigate } = useRouter();
  const [overview, setOverview] = useState<RoadmapOverview | null>(null);
  const [error, setError] = useState('');
  const [selected, setSelected] = useState('');
  const [category, setCategory] = useState<RoadmapCategory | null>(null);

  const refresh = useCallback((signal?: AbortSignal) => {
    loadRoadmap(signal)
      .then((data) => {
        setOverview(data);
        setSelected((current) => {
          if (current) return current;
          // Открывается то, к чему человек идёт; если цели нет — его уровень;
          // если и его нет — начало. Пустая карта при первом заходе выглядела
          // бы так, будто ничего не загрузилось.
          return data.target || data.current || 'A1';
        });
      })
      .catch((caught: unknown) => {
        if (signal?.aborted) return;
        setError(caught instanceof Error ? caught.message : 'Карта не загрузилась.');
      });
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    refresh(controller.signal);
    return () => controller.abort();
  }, [refresh]);

  const chooseTarget = async (level: string) => {
    const saved = await saveRoadmapTarget(level);
    if (saved.target) setSelected(saved.target);
    setOverview((previous) =>
      previous ? { ...previous, target: saved.target } : previous,
    );
  };

  const level = overview?.levels.find((item) => item.level === selected);
  const done = level && overview ? levelPassed(level, overview.categories) : false;

  return (
    <main className="mx-auto w-full max-w-5xl px-5 py-10 sm:py-14">
      <Reveal>
        <header className="max-w-3xl">
          <p className="text-xs font-bold uppercase tracking-wide text-[var(--accent)]">
            Читавук
          </p>
          <h1 className="mt-3 text-4xl sm:text-5xl">Дорожная карта сербского языка</h1>
        </header>
      </Reveal>

      <Reveal delay={0.05}>
        <div className="paper-grain mt-8 rounded-3xl border border-[var(--line)] bg-[var(--bg-raised)] px-5 py-7 shadow-[var(--shadow-soft)] sm:px-9 sm:py-9">
          <div className="flex flex-col gap-6 sm:flex-row sm:items-start">
            <Mascot
              pose="citavuk_roadmap"
              alt="Читавук с картой сербского языка"
              width={168}
              className="shrink-0"
            />
            <div className="max-w-[62ch] leading-8 [&>p+p]:mt-4 [&_strong]:font-semibold">
            <p className="first-letter:float-left first-letter:mr-2 first-letter:font-display first-letter:text-6xl first-letter:leading-[0.85] first-letter:text-[var(--accent)]">
              Всегда, когда начинаешь учить язык, а особенно такой редкий, как
              сербский, задаешься вопросом — что делать после пары тройки
              грамматических упражнений и быстрых онлайн-курсов? Откуда брать
              новые слова, что смотреть? На этой странице я, разработчик сайта
              Читавук (см. страницу обо мне:{' '}
              <button
                type="button"
                onClick={() => navigate('/about')}
                className="font-semibold text-[var(--accent)] underline underline-offset-4"
              >
                citavuk.ru/about
              </button>
              ), постарался распределить слова, темы, упражнения сербского языка
              по уровням CERF и по знакомым из английского категориям языка:
              Reading (Čitanje), Grammar (Gramatika), Vocabulary (Vokabular),
              Writing (Pisanje); увы, категория Speaking, при всей ей важности,
              не может быть развита через интернет (даже при условии, если бы я
              сделал условное распознавание вашей речи и затем общение таким
              образом через голосового чат-бота — это будет выглядеть максимально
              искусственно), тут уже только ваши силы находить носителей
              сербского или профессиональных учителей и общаться с ними.
            </p>
            </div>
          </div>
        </div>
      </Reveal>

      <Ornament className="my-10" />

      <Reveal delay={0.05}>
        <div className="grid gap-4 sm:grid-cols-2">
          {(overview?.categories ?? []).map((item) => {
            const Icon = CATEGORY_ICONS[item.key] ?? LuBookOpen;
            return (
              <article
                key={item.key}
                className="relative overflow-hidden rounded-2xl border border-[var(--line)] bg-[var(--bg-raised)] p-5"
              >
                <span
                  className="absolute inset-x-0 top-0 h-1 bg-[var(--accent)]"
                  aria-hidden
                />
                <div className="flex items-center gap-3">
                  <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-[var(--accent)]/12 text-[var(--accent)]">
                    <Icon className="size-5" />
                  </span>
                  <h2 className="font-display text-xl">
                    {item.title}
                    <span
                      className="ml-2 text-base font-normal text-[var(--text-muted)]"
                      lang="sr"
                    >
                      {item.local}
                    </span>
                  </h2>
                  {item.planned && (
                    <span className="ml-auto rounded-full bg-[var(--bg-sunken)] px-2.5 py-1 text-xs font-semibold text-[var(--text-muted)]">
                      скоро
                    </span>
                  )}
                </div>
                <p className="mt-3 leading-7 text-[var(--text-muted)]">{item.about}</p>
              </article>
            );
          })}
        </div>
      </Reveal>

      <Reveal delay={0.05}>
        <section className="mt-12 max-w-[68ch] space-y-4 leading-8">
          <h2 className="font-display text-2xl">Как устроена дорожная карта?</h2>
          <p>
            Вы выбираете (или просто смотрите) любой уровень, к которому вы
            сейчас стремитесь в сербском языке. Затем, вы можете нажать на каждый
            раздел освоения языка по данному уровню, и увидеть:
          </p>
        </section>
      </Reveal>

      <Reveal delay={0.05}>
        <ul className="mt-6 grid gap-3 sm:grid-cols-2">
          {HOW_IT_WORKS.map((item) => {
            const Icon = CATEGORY_ICONS[item.key] ?? LuBookOpen;
            return (
              <li
                key={item.key}
                className="flex gap-3 rounded-2xl border border-[var(--line)] bg-[var(--bg-raised)] p-4"
              >
                <span className="grid size-9 shrink-0 place-items-center rounded-lg bg-[var(--accent)]/12 text-[var(--accent)]">
                  <Icon className="size-4.5" />
                </span>
                <p className="leading-7">
                  <strong>{item.title}</strong>
                  {item.text}
                </p>
              </li>
            );
          })}
        </ul>
      </Reveal>

      <Reveal delay={0.05}>
        <div className="mt-6 grid gap-4 rounded-2xl border border-[var(--accent)]/30 bg-[var(--accent)]/8 p-5 sm:grid-cols-[auto_1fr] sm:items-start">
          <span className="grid size-11 place-items-center rounded-xl bg-[var(--accent)]/15 text-[var(--accent)]">
            <LuTarget className="size-5" />
          </span>
          <div className="max-w-[62ch] leading-8">
            <p>
              Читавук автоматически отслеживает прогресс и показывает его в
              личном кабинете По каждому разделу для данного уровня, и, как
              только вы наберете <strong>&gt;80% по каждому разделу</strong>, вы
              сможете перейти на следующий уровень, если вы заранее выбрали
              уровень; если же вы не выбирали уровень, то вы можете свободно
              передвигаться между разделами любого уровня.
            </p>
            <p className="mt-3">
              К этой странице создан раздел комментариев, на которые можно
              отвечать, — потому что любая дорожная карта требует обсуждений и
              дополнений, которые мог не учесть автор.
            </p>
          </div>
        </div>
      </Reveal>

      {error && <div className="mt-10"><ErrorNote>{error}</ErrorNote></div>}
      {!overview && !error && <div className="py-16 text-center"><Spinner /></div>}

      {overview && (
        <>
          <section className="mt-14">
            <div className="flex flex-wrap items-baseline justify-between gap-3">
              <h2 className="font-display text-2xl">Уровни</h2>
              {overview.target ? (
                <p className="inline-flex items-center gap-2 text-sm">
                  <LuTarget className="text-[var(--accent)]" />
                  Цель — {overview.target}
                  <button
                    type="button"
                    onClick={() => chooseTarget('')}
                    className="inline-flex items-center gap-1 text-[var(--text-muted)] hover:text-[var(--accent)]"
                  >
                    <LuX />
                    снять
                  </button>
                </p>
              ) : (
                account && (
                  <p className="text-sm text-[var(--text-muted)]">
                    Цель не выбрана — все уровни открыты.
                  </p>
                )
              )}
            </div>

            <RoadmapPath
              levels={overview.levels}
              categories={overview.categories}
              selected={selected}
              target={overview.target}
              current={overview.current}
              onSelect={(next) => {
                setSelected(next);
                setCategory(null);
              }}
            />
          </section>

          {level && (
            <section className="mt-14 border-t border-[var(--line)] pt-10">
              <div className="flex flex-wrap items-center justify-between gap-4">
                <h2 className="font-display text-3xl">
                  {level.level} · {level.name}
                </h2>
                {account && overview.target !== level.level && (
                  <Button variant="secondary" onClick={() => chooseTarget(level.level)}>
                    <LuTarget />
                    Сделать целью
                  </Button>
                )}
              </div>

              {done && (
                <div className="mt-5 rounded-2xl border border-[var(--accent)]/30 bg-[var(--accent)]/8 px-5 py-4">
                  <p className="font-semibold">
                    Уровень {level.level} взят: больше 80% по каждому разделу.
                  </p>
                  {nextLevel(level.level) && (
                    <Button
                      className="mt-3"
                      onClick={() => {
                        void chooseTarget(nextLevel(level.level));
                        setSelected(nextLevel(level.level));
                        setCategory(null);
                      }}
                    >
                      Перейти на {nextLevel(level.level)}
                      <LuArrowRight />
                    </Button>
                  )}
                </div>
              )}

              <div className="mt-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                {overview.categories.map((item) => {
                  const progress = level.categories[item.key];
                  const active = category?.key === item.key;
                  return (
                    <button
                      key={item.key}
                      type="button"
                      onClick={() => setCategory(active ? null : item)}
                      aria-pressed={active}
                      className={`rounded-2xl border p-4 text-left transition-colors ${
                        active
                          ? 'border-[var(--accent)] bg-[var(--accent)]/10'
                          : 'border-[var(--line)] bg-[var(--bg-raised)] hover:border-[var(--accent)]'
                      }`}
                    >
                      <p className="font-display text-lg">{item.title}</p>
                      <p className="text-sm text-[var(--text-muted)]" lang="sr">
                        {item.local}
                      </p>
                      {item.planned ? (
                        <p className="mt-3 text-sm text-[var(--text-muted)]">
                          ускоро ће бити
                        </p>
                      ) : (
                        <>
                          <p className="mt-3 text-sm text-[var(--text-muted)]">
                            {progress?.done ?? 0} из {progress?.total ?? 0} ·{' '}
                            {Math.round((progress?.ratio ?? 0) * 100)}%
                          </p>
                          <span className="mt-2 block h-1.5 overflow-hidden rounded-full bg-[var(--bg-sunken)]">
                            <span
                              className={`block h-full ${
                                progress?.passed ? 'bg-emerald-700' : 'bg-[var(--accent)]'
                              }`}
                              style={{ width: `${(progress?.ratio ?? 0) * 100}%` }}
                            />
                          </span>
                        </>
                      )}
                    </button>
                  );
                })}
              </div>

              {category && (
                <RoadmapSectionPanel
                  level={level.level}
                  category={category}
                  onProgress={() => refresh()}
                />
              )}
            </section>
          )}

          <RoadmapComments level={selected || 'A1'} />
        </>
      )}
    </main>
  );
}
