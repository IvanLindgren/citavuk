import { AnimatePresence, motion, useReducedMotion } from 'framer-motion';
import { useCallback, useEffect, useMemo, useState } from 'react';

import { Mascot } from '../components/Mascot';
import { SyncBadge } from '../components/SyncBadge';
import { Button, Card, Reveal, Spinner } from '../components/ui';
import { playCourseSound } from '../course/sounds';
import {
  createPalace,
  deletePalace,
  getPalace,
  listPalaces,
  savePalace,
  walkOrder,
  withPin,
  type Palace as PalaceRecord,
} from '../lib/palace';
import { Link } from '../lib/router';
import { allVocabulary, type VocabEntry } from '../lib/vocabulary';
import { useAuth } from '../state/auth';
import { useSync } from '../state/sync';
import { useSeo } from '../lib/seo';
import {
  SCENES,
  SCENE_HEIGHT,
  SCENE_WIDTH,
  sceneById,
  type PalaceObject,
  type PalaceScene,
} from '../palace/scenes';

/**
 * Дворец памяти.
 *
 * Выбираете комнату, развешиваете слова по предметам и потом проходите по ней в
 * одном и том же порядке. Слово вспоминается не само по себе, а вместе с местом:
 * «на подоконнике лежало…».
 *
 * Слова берутся из своего же словаря — того, что собирается в читалке. Можно и
 * ввести руками: иногда нужно повесить фразу, которой в словаре ещё нет.
 */

type Mode = { kind: 'list' } | { kind: 'edit'; id: string } | { kind: 'walk'; id: string };

export function Palace() {
  useSeo({
    title: 'Дворец памяти — Читавук',
    noindex: true,
  });

  const { account } = useAuth();
  const { revision, sync } = useSync();
  const [mode, setMode] = useState<Mode>({ kind: 'list' });
  const [palaces, setPalaces] = useState<PalaceRecord[] | null>(null);

  const reload = useCallback(async () => {
    setPalaces(await listPalaces());
  }, []);

  // revision меняется после каждой синхронизации, принёсшей новое: дворец,
  // построенный на другом устройстве, обязан появиться без перезагрузки.
  useEffect(() => {
    void reload();
  }, [reload, revision]);

  if (palaces === null) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center text-[var(--text-muted)]">
        <Spinner className="size-6" />
      </div>
    );
  }

  if (mode.kind !== 'list') {
    return (
      <PalaceRoom
        id={mode.id}
        walking={mode.kind === 'walk'}
        onWalk={(walking) =>
          setMode({ kind: walking ? 'walk' : 'edit', id: mode.id })
        }
        onExit={() => {
          setMode({ kind: 'list' });
          void reload();
        }}
      />
    );
  }

  return (
    <main className="px-5 py-10 sm:py-14">
      <div className="mx-auto max-w-5xl">
        <Reveal className="mb-8">
          <div className="flex flex-wrap items-start justify-between gap-6">
            <div className="max-w-2xl">
              <h1 className="text-3xl sm:text-4xl">Дворец памяти</h1>
              <p className="mt-3 leading-relaxed text-[var(--text-muted)]">
                Приём, которому две с половиной тысячи лет: список раскладывают
                по предметам знакомой комнаты и вспоминают, мысленно проходя по
                ней. Выберите комнату, повесьте слова на предметы — и потом
                пройдите по маршруту, вспоминая каждое.
              </p>
              <div className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-[var(--text-muted)]">
                <SyncBadge />
                {!account && (
                  <span>
                    Дворцы хранятся в этом браузере.{' '}
                    <Link
                      to="/login"
                      className="font-semibold text-[var(--accent)] underline-offset-2 hover:underline"
                    >
                      Войдите
                    </Link>
                    , чтобы они были и на других устройствах.
                  </span>
                )}
              </div>
            </div>
            <div className="hidden w-32 shrink-0 sm:block">
              <Mascot pose="citavuk_gram" alt="" width={256} float />
            </div>
          </div>
        </Reveal>

        {palaces.length > 0 && (
          <div className="mb-10 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {palaces.map((palace) => {
              const scene = sceneById(palace.sceneId);
              const filled = Object.keys(palace.pins).length;
              return (
                <Card key={palace.id} className="flex h-full flex-col p-5">
                  <div className="mb-3 overflow-hidden rounded-2xl border border-[var(--line)]">
                    <SceneView scene={scene} palace={palace} preview />
                  </div>
                  <h2 className="text-xl leading-snug">{palace.name}</h2>
                  <p className="mt-1 text-sm text-[var(--text-muted)]">
                    {scene.title} · {filled} из {scene.objects.length} предметов
                  </p>
                  <div className="mt-auto flex flex-wrap gap-2 pt-4">
                    <Button
                      size="sm"
                      onClick={() => setMode({ kind: 'edit', id: palace.id })}
                    >
                      Открыть
                    </Button>
                    {filled > 0 && (
                      <Button
                        size="sm"
                        variant="secondary"
                        onClick={() => setMode({ kind: 'walk', id: palace.id })}
                      >
                        Пройти
                      </Button>
                    )}
                    <button
                      type="button"
                      onClick={async () => {
                        if (!window.confirm(`Удалить дворец «${palace.name}»?`)) return;
                        await deletePalace(palace.id);
                        await reload();
                        if (account) void sync();
                      }}
                      className="ml-auto rounded-lg px-3 py-1.5 text-xs text-[var(--text-muted)] transition-colors hover:bg-serb-red/10 hover:text-serb-red"
                    >
                      Удалить
                    </button>
                  </div>
                </Card>
              );
            })}
          </div>
        )}

        <Reveal>
          <h2 className="mb-4 text-2xl">
            {palaces.length > 0 ? 'Построить ещё один' : 'Выберите комнату'}
          </h2>
          <div className="grid gap-4 sm:grid-cols-3">
            {SCENES.map((scene) => (
              <Card
                key={scene.id}
                className="flex h-full flex-col p-4 transition-all duration-300 hover:-translate-y-1 hover:shadow-[var(--shadow-lift)]"
              >
                <div className="overflow-hidden rounded-2xl border border-[var(--line)]">
                  <SceneView scene={scene} palace={null} preview />
                </div>
                <h3 className="mt-3 text-lg">{scene.title}</h3>
                <p className="text-sm text-[var(--text-muted)]">
                  {scene.subtitle} · {scene.objects.length} предметов
                </p>
                <Button
                  size="sm"
                  className="mt-4"
                  onClick={async () => {
                    const name =
                      window.prompt('Название дворца', scene.title) ?? '';
                    if (!name.trim()) return;
                    const palace = await createPalace(name, scene.id);
                    await reload();
                    if (account) void sync();
                    setMode({ kind: 'edit', id: palace.id });
                  }}
                >
                  Занять комнату
                </Button>
              </Card>
            ))}
          </div>
        </Reveal>
      </div>
    </main>
  );
}

/** Комната: расстановка слов и обход. */
function PalaceRoom({
  id,
  walking,
  onWalk,
  onExit,
}: {
  id: string;
  walking: boolean;
  onWalk: (walking: boolean) => void;
  onExit: () => void;
}) {
  const { account } = useAuth();
  const { sync } = useSync();
  const [palace, setPalace] = useState<PalaceRecord | null>(null);
  const [loading, setLoading] = useState(true);
  const [vocabulary, setVocabulary] = useState<VocabEntry[]>([]);
  const [active, setActive] = useState<string | null>(null);

  useEffect(() => {
    void (async () => {
      const [loaded, words] = await Promise.all([getPalace(id), allVocabulary()]);
      setPalace(loaded);
      setVocabulary(words.filter((word) => !word.deleted));
      setLoading(false);
    })();
  }, [id]);

  const scene = useMemo(
    () => (palace ? sceneById(palace.sceneId) : SCENES[0]!),
    [palace],
  );

  const pin = useCallback(
    async (objectId: string, word: string, translation: string, vocabId: string | null) => {
      if (!palace) return;
      const next = withPin(
        palace,
        objectId,
        word ? { word, translation, vocabId } : null,
      );
      setPalace(next);
      await savePalace(next);
      // Расстановка уходит на сервер сразу, а не через две минуты: закрой
      // человек вкладку — она осталась бы только здесь.
      if (account) void sync();
    },
    [palace, account, sync],
  );

  if (loading) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center text-[var(--text-muted)]">
        <Spinner className="size-6" />
      </div>
    );
  }

  // Дворец могли снести на другом устройстве, пока эта вкладка была открыта.
  // Крутить бесконечный индикатор в такой ситуации — худшее из возможного.
  if (!palace) {
    return (
      <main className="flex min-h-[60vh] flex-col items-center justify-center px-5 text-center">
        <h1 className="text-2xl">Дворца больше нет</h1>
        <p className="mt-3 text-[var(--text-muted)]">
          Возможно, его удалили на другом устройстве.
        </p>
        <Button className="mt-6" onClick={onExit}>
          Все дворцы
        </Button>
      </main>
    );
  }

  if (walking) {
    return (
      <Walk
        palace={palace}
        scene={scene}
        onFinish={() => onWalk(false)}
        onExit={onExit}
      />
    );
  }

  const object = scene.objects.find((item) => item.id === active) ?? null;
  const filled = Object.keys(palace.pins).length;

  return (
    <main className="px-5 py-8">
      <div className="mx-auto max-w-5xl">
        <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
          <div className="min-w-0">
            <button
              type="button"
              onClick={onExit}
              className="text-sm text-[var(--text-muted)] transition-colors hover:text-[var(--accent)]"
            >
              ← Все дворцы
            </button>
            <h1 className="mt-1 truncate text-2xl">{palace.name}</h1>
          </div>
          <div className="flex items-center gap-3">
            <span className="text-sm text-[var(--text-muted)]">
              {filled} из {scene.objects.length}
            </span>
            <Button disabled={filled === 0} onClick={() => onWalk(true)}>
              Пройти по дворцу
            </Button>
          </div>
        </div>

        <Card className="overflow-hidden p-0">
          <SceneView
            scene={scene}
            palace={palace}
            activeId={active}
            onPick={(objectId) => setActive((current) => (current === objectId ? null : objectId))}
            onDropWord={(objectId, word) =>
              void pin(objectId, word.word, word.translation, word.vocabId)
            }
          />
        </Card>

        <WordStrip palace={palace} vocabulary={vocabulary} />

        <p className="mt-3 text-center text-sm text-[var(--text-muted)]">
          Перетащите слово на предмет — или нажмите на предмет, чтобы вписать
          своё.
        </p>

        <AnimatePresence mode="wait">
          {object && (
            <motion.div
              key={object.id}
              initial={{ opacity: 0, y: 14 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: 8 }}
              transition={{ duration: 0.22 }}
              className="mt-5"
            >
              <PinEditor
                object={object}
                current={palace.pins[object.id] ?? null}
                vocabulary={vocabulary}
                onSave={(word, translation, vocabId) =>
                  void pin(object.id, word, translation, vocabId)
                }
                onClear={() => void pin(object.id, '', '', null)}
                onClose={() => setActive(null)}
              />
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </main>
  );
}

/** Слово, которое тащат на предмет. */
interface DraggedWord {
  word: string;
  translation: string;
  vocabId: string | null;
}

const DRAG_TYPE = 'application/x-citavuk-word';

/**
 * Читает перетаскиваемое слово.
 *
 * В `dataTransfer` может оказаться что угодно — текст с другой вкладки, файл,
 * ссылка. Разбор поэтому защитный: чужое перетаскивание должно ничего не
 * сделать, а не повесить на полку строку «https://».
 */
function readDraggedWord(data: DataTransfer): DraggedWord | null {
  try {
    const raw = data.getData(DRAG_TYPE);
    if (!raw) return null;
    const parsed: unknown = JSON.parse(raw);
    if (typeof parsed !== 'object' || parsed === null) return null;
    const value = parsed as Record<string, unknown>;
    if (typeof value.word !== 'string' || value.word.trim() === '') return null;
    return {
      word: value.word,
      translation: typeof value.translation === 'string' ? value.translation : '',
      vocabId: typeof value.vocabId === 'string' ? value.vocabId : null,
    };
  } catch {
    return null;
  }
}

/**
 * Полоса слов под комнатой: отсюда слова перетаскиваются на предметы.
 *
 * Прежде слово можно было повесить только через выбор предмета и поиск по
 * словарю — два шага и переключение внимания на каждое слово. Перетаскивание
 * ближе к самому приёму: человек смотрит на комнату и кладёт слово туда, где
 * оно, по его замыслу, должно лежать.
 *
 * Уже развешанные слова из полосы убираются: одно слово на двух предметах
 * сделало бы маршрут неоднозначным, а именно однозначность маршрута тут и
 * работает.
 */
function WordStrip({
  palace,
  vocabulary,
}: {
  palace: PalaceRecord;
  vocabulary: VocabEntry[];
}) {
  const free = useMemo(() => {
    const used = new Set(Object.values(palace.pins).map((pin) => pin.word));
    return vocabulary.filter((entry) => !used.has(entry.word));
  }, [palace.pins, vocabulary]);

  if (vocabulary.length === 0) {
    return (
      <p className="mt-4 text-center text-sm text-[var(--text-muted)]">
        Словарь пока пуст. Отмечайте слова в читалке — и они появятся здесь.
      </p>
    );
  }

  if (free.length === 0) {
    return (
      <p className="mt-4 text-center text-sm text-[var(--text-muted)]">
        Все слова словаря уже развешаны.
      </p>
    );
  }

  return (
    <div className="mt-4 flex gap-2 overflow-x-auto pb-2">
      {free.map((entry) => (
        <button
          key={entry.id}
          type="button"
          draggable
          onDragStart={(event) => {
            event.dataTransfer.effectAllowed = 'copy';
            event.dataTransfer.setData(
              DRAG_TYPE,
              JSON.stringify({
                word: entry.word,
                translation: entry.translation,
                vocabId: entry.id,
              }),
            );
          }}
          className="shrink-0 cursor-grab rounded-xl border border-[var(--line)] bg-[var(--bg-raised)] px-3 py-2 text-left transition-colors hover:border-[var(--accent)] active:cursor-grabbing"
        >
          <span className="block font-bold">{entry.word}</span>
          {entry.translation && (
            <span className="block text-xs text-[var(--text-muted)]">
              {entry.translation}
            </span>
          )}
        </button>
      ))}
    </div>
  );
}

function PinEditor({
  object,
  current,
  vocabulary,
  onSave,
  onClear,
  onClose,
}: {
  object: PalaceObject;
  current: { word: string; translation: string; vocabId: string | null } | null;
  vocabulary: VocabEntry[];
  onSave: (word: string, translation: string, vocabId: string | null) => void;
  onClear: () => void;
  onClose: () => void;
}) {
  const [query, setQuery] = useState('');

  const found = useMemo(() => {
    const needle = query.trim().toLocaleLowerCase('sr');
    const pool = needle
      ? vocabulary.filter(
          (word) =>
            word.word.toLocaleLowerCase('sr').includes(needle) ||
            word.translation.toLocaleLowerCase('ru').includes(needle),
        )
      : vocabulary;
    // Больше десятка вариантов выбирать глазами уже тяжело — остальное
    // отсекается поиском.
    return pool.slice(0, 12);
  }, [vocabulary, query]);

  return (
    <Card className="p-5">
      <div className="mb-4 flex items-start justify-between gap-4">
        <div>
          <div className="text-xs font-semibold uppercase tracking-wide text-[var(--text-muted)]">
            Предмет
          </div>
          <div className="font-display text-xl font-bold">
            {object.label}{' '}
            <span className="text-base font-normal text-[var(--text-muted)]">
              — {object.ru}
            </span>
          </div>
        </div>
        <button
          type="button"
          onClick={onClose}
          aria-label="Закрыть"
          className="rounded-full p-2 text-[var(--text-muted)] transition-colors hover:bg-[var(--bg-sunken)]"
        >
          <svg viewBox="0 0 20 20" className="size-5 fill-current" aria-hidden="true">
            <path d="M6.3 5A1 1 0 004.9 6.4L8.5 10l-3.6 3.6a1 1 0 101.4 1.4L10 11.4l3.6 3.6a1 1 0 001.4-1.4L11.4 10l3.6-3.6A1 1 0 0013.6 5L10 8.6 6.4 5z" />
          </svg>
        </button>
      </div>

      {current && (
        <div className="mb-4 flex items-center justify-between gap-4 rounded-2xl bg-[var(--bg-sunken)] px-4 py-3">
          <div>
            <div className="font-display text-lg font-bold text-[var(--accent)]">
              {current.word}
            </div>
            {current.translation && (
              <div className="text-sm text-[var(--text-muted)]">
                {current.translation}
              </div>
            )}
          </div>
          <button
            type="button"
            onClick={onClear}
            className="rounded-lg px-3 py-1.5 text-xs text-[var(--text-muted)] transition-colors hover:bg-serb-red/10 hover:text-serb-red"
          >
            Снять
          </button>
        </div>
      )}

      <label className="block">
        <span className="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-[var(--text-muted)]">
          Из словаря или своё
        </span>
        <input
          type="search"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Начните набирать слово"
          className="w-full rounded-2xl border border-[var(--line)] bg-[var(--bg)] px-4 py-3 outline-none transition-colors placeholder:text-[var(--text-muted)]/70 focus:border-[var(--accent)]"
        />
      </label>

      {vocabulary.length === 0 && (
        <p className="mt-3 text-sm text-[var(--text-muted)]">
          Словарь пуст. Слова попадают в него из читалки — а сюда можно вписать
          любое своё.
        </p>
      )}

      <div className="mt-3 flex flex-wrap gap-1.5">
        {found.map((word) => (
          <button
            key={word.id}
            type="button"
            onClick={() => onSave(word.word, word.translation, word.id)}
            className="rounded-full bg-[var(--bg-sunken)] px-3 py-1.5 text-sm font-semibold text-[var(--text-muted)] transition-colors hover:text-[var(--accent)]"
            title={word.translation}
          >
            {word.word}
          </button>
        ))}
        {query.trim() && !found.some((word) => word.word === query.trim()) && (
          <button
            type="button"
            onClick={() => onSave(query.trim(), '', null)}
            className="rounded-full bg-[var(--accent)] px-3 py-1.5 text-sm font-semibold text-parchment"
          >
            Повесить «{query.trim()}»
          </button>
        )}
      </div>
    </Card>
  );
}

/** Обход дворца: предмет за предметом, в неизменном порядке. */
function Walk({
  palace,
  scene,
  onFinish,
  onExit,
}: {
  palace: PalaceRecord;
  scene: PalaceScene;
  onFinish: () => void;
  onExit: () => void;
}) {
  const reduceMotion = useReducedMotion();
  const route = useMemo(
    () => walkOrder(palace, scene.objects.map((object) => object.id)),
    [palace, scene],
  );
  const [step, setStep] = useState(0);
  const [revealed, setRevealed] = useState(false);

  const current = route[step];
  const object = scene.objects.find((item) => item.id === current?.objectId);

  const next = useCallback(() => {
    setRevealed(false);
    setStep((value) => value + 1);
  }, []);

  useEffect(() => {
    if (step >= route.length && route.length > 0) playCourseSound('complete');
  }, [step, route.length]);

  if (step >= route.length) {
    return (
      <main className="px-5 py-14">
        <div className="mx-auto max-w-xl">
          <Card className="paper-grain px-6 py-14 text-center">
            <div className="mx-auto mb-6 w-36">
              <Mascot pose="citavuk_ukaz" alt="" width={288} float />
            </div>
            <h1 className="text-2xl">Дворец пройден</h1>
            <p className="mx-auto mt-3 max-w-md leading-relaxed text-[var(--text-muted)]">
              {route.length} {route.length === 1 ? 'слово' : 'слов'} на своих
              местах. Повторите завтра — маршрут тот же, и вспоминать будет
              заметно легче.
            </p>
            <div className="mt-7 flex flex-wrap justify-center gap-3">
              <Button
                onClick={() => {
                  setStep(0);
                  setRevealed(false);
                }}
              >
                Ещё раз
              </Button>
              <Button variant="secondary" onClick={onFinish}>
                К расстановке
              </Button>
              <Button variant="ghost" onClick={onExit}>
                Все дворцы
              </Button>
            </div>
          </Card>
        </div>
      </main>
    );
  }

  return (
    <main className="px-5 py-8">
      <div className="mx-auto max-w-5xl">
        <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
          <button
            type="button"
            onClick={onFinish}
            className="text-sm text-[var(--text-muted)] transition-colors hover:text-[var(--accent)]"
          >
            ← Выйти из обхода
          </button>
          <span className="text-sm text-[var(--text-muted)]">
            {step + 1} из {route.length}
          </span>
        </div>

        <Card className="overflow-hidden p-0">
          <SceneView
            scene={scene}
            palace={palace}
            activeId={current?.objectId ?? null}
            spotlight
            hideLabels
          />
        </Card>

        <Card className="mt-5 px-6 py-8 text-center">
          <div className="text-xs font-semibold uppercase tracking-wide text-[var(--text-muted)]">
            {object?.label ?? 'Предмет'}
          </div>
          <AnimatePresence mode="wait">
            {revealed ? (
              <motion.div
                key="answer"
                initial={reduceMotion ? false : { opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                className="mt-3"
              >
                <div className="font-display text-3xl font-bold text-[var(--accent)]">
                  {current?.pin.word}
                </div>
                {current?.pin.translation && (
                  <div className="mt-1 text-[var(--text-muted)]">
                    {current.pin.translation}
                  </div>
                )}
                <Button className="mt-6" onClick={next}>
                  Дальше
                </Button>
              </motion.div>
            ) : (
              <motion.div
                key="question"
                initial={reduceMotion ? false : { opacity: 0 }}
                animate={{ opacity: 1 }}
                className="mt-3"
              >
                <p className="text-lg">Что вы здесь оставили?</p>
                <Button
                  variant="secondary"
                  className="mt-6"
                  onClick={() => setRevealed(true)}
                >
                  Вспомнил, показать
                </Button>
              </motion.div>
            )}
          </AnimatePresence>
        </Card>
      </div>
    </main>
  );
}

/** Отрисовка комнаты. */
function SceneView({
  scene,
  palace,
  activeId = null,
  preview = false,
  spotlight = false,
  hideLabels = false,
  onPick,
  onDropWord,
}: {
  scene: PalaceScene;
  palace: PalaceRecord | null;
  activeId?: string | null;
  preview?: boolean;
  spotlight?: boolean;
  hideLabels?: boolean;
  onPick?: (objectId: string) => void;
  onDropWord?: (objectId: string, word: DraggedWord) => void;
}) {
  // Предмет под курсором во время перетаскивания. Без подсветки человек
  // отпускает слово вслепую и промахивается мимо соседнего предмета.
  const [over, setOver] = useState<string | null>(null);

  return (
    <svg
      viewBox={`0 0 ${SCENE_WIDTH} ${SCENE_HEIGHT}`}
      className="block w-full"
      role="img"
      aria-label={`Комната «${scene.title}»`}
    >
      {scene.backdrop}

      {scene.objects.map((object) => {
        const pin = palace?.pins[object.id];
        const active = activeId === object.id;
        const dim = spotlight && !active;

        return (
          <g
            key={object.id}
            transform={`translate(${object.x} ${object.y})`}
            opacity={dim ? 0.28 : 1}
            style={{
              cursor: onPick ? 'pointer' : undefined,
              transition: 'opacity 0.3s',
            }}
            onDragOver={
              onDropWord
                ? (event) => {
                    // preventDefault здесь обязателен: без него браузер
                    // считает область запрещённой для сброса и курсор
                    // показывает перечёркнутый круг.
                    event.preventDefault();
                    setOver(object.id);
                  }
                : undefined
            }
            onDragLeave={onDropWord ? () => setOver(null) : undefined}
            onDrop={
              onDropWord
                ? (event) => {
                    event.preventDefault();
                    setOver(null);
                    const word = readDraggedWord(event.dataTransfer);
                    if (word) onDropWord(object.id, word);
                  }
                : undefined
            }
            onClick={onPick ? () => onPick(object.id) : undefined}
            role={onPick ? 'button' : undefined}
            tabIndex={onPick ? 0 : undefined}
            onKeyDown={
              onPick
                ? (event) => {
                    if (event.key === 'Enter' || event.key === ' ') {
                      event.preventDefault();
                      onPick(object.id);
                    }
                  }
                : undefined
            }
          >
            {/* Прозрачная площадка под предметом: рисунок бывает тонким —
                стебель цветка, ножка лампы, — и попасть в него перетаскиванием
                почти невозможно. Она же ловит нажатие мимо самого рисунка. */}
            {(onPick || onDropWord) && (
              <rect
                x={-90}
                y={-90}
                width={180}
                height={180}
                fill="transparent"
              />
            )}

            {object.art}

            {/* Кольцо вокруг предмета: у выбранного — чтобы было понятно, о
                каком месте речь; под перетаскиванием — куда упадёт слово. */}
            {over === object.id && (
              <circle r={92} fill="#c23b33" opacity={0.16} />
            )}
            {active && (
              <circle
                r={92}
                fill="none"
                stroke="#c23b33"
                strokeWidth={6}
                strokeDasharray="14 10"
                opacity={0.9}
              />
            )}

            {pin && !hideLabels && (
              <g transform="translate(0 -110)">
                <rect
                  x={-Math.max(40, pin.word.length * 9)}
                  y={-22}
                  width={Math.max(80, pin.word.length * 18)}
                  height={40}
                  rx={14}
                  fill="#fbf6ea"
                  stroke="#9e2b25"
                  strokeWidth={3}
                />
                <text
                  x={0}
                  y={5}
                  textAnchor="middle"
                  fontSize={preview ? 24 : 22}
                  fontWeight="700"
                  fill="#9e2b25"
                  fontFamily="Lora, Georgia, serif"
                >
                  {pin.word}
                </text>
              </g>
            )}

            {/* Свободное место помечается точкой — иначе непонятно, куда
                вообще можно нажать. */}
            {!pin && onPick && (
              <circle r={13} cy={-96} fill="#9e2b25" opacity={0.35} />
            )}
          </g>
        );
      })}
    </svg>
  );
}
