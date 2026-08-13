import { lazy, Suspense, useCallback, useEffect, useMemo, useState } from 'react';
import { LuArrowLeft, LuList, LuMapPin } from 'react-icons/lu';

import { PlaceSheet } from '../components/PlaceSheet';
import { ErrorNote, Spinner } from '../components/ui';
import { Link } from '../lib/router';
import { useSeo } from '../lib/seo';
import {
  contentOf,
  inScript,
  kindById,
  loadTravel,
  readScript,
  saveScript,
  type Script,
} from '../travel/content';
import { iconBody, PlaceIcon } from '../travel/icons';
import { lookupPlace } from '../travel/overpass';
import type { City, CityPin, Point, TravelBundle } from '../travel/types';

/**
 * Путешествие: карта Сербии, на которой можно ткнуть в заведение и узнать, что
 * в нём говорят.
 *
 * Карта — не обязательная часть. Ключ к тайлам задаётся окружением, и если его
 * нет, раздел показывает тот же справочник списком: слова к пекарне нужны и
 * тому, кто открыл сайт без карты.
 */

const MAPTILER_KEY = import.meta.env.VITE_MAPTILER_KEY?.trim() ?? '';

const TILE_URL = MAPTILER_KEY
  ? `https://api.maptiler.com/maps/streets-v4/256/{z}/{x}/{y}.png?key=${MAPTILER_KEY}`
  : '';

/*
 * Пререндер обходит сайт headless-браузером и ждёт тишины в сети. Карта тишины
 * не даёт: она докачивает тайлы, пока её видно. Поэтому под автоматизацией
 * показывается список — в сохранённый HTML канва всё равно не попадает.
 */
const AUTOMATED = typeof navigator !== 'undefined' && navigator.webdriver;

const TravelMap = lazy(() =>
  import('../components/TravelMap').then((m) => ({ default: m.TravelMap })),
);

interface Selection {
  title: string;
  serbian: boolean;
  kind: string;
}

/** Тип места в справочнике записан строчной буквы: в заголовке нужна прописная. */
function capitalize(text: string): string {
  return text.charAt(0).toUpperCase() + text.slice(1);
}

export function Travel() {
  useSeo({
    title: 'Путешествие по Сербии — слова и разговоры для каждого места',
    description:
      'Карта пяти сербских городов: выбери пекарню, аптеку или мост и узнай, какие слова, фразы и разговоры там понадобятся.',
  });

  const [bundle, setBundle] = useState<TravelBundle | null>(null);
  const [failed, setFailed] = useState(false);
  const [cityId, setCityId] = useState('');
  const [script, setScript] = useState<Script>(readScript);
  const [selection, setSelection] = useState<Selection | null>(null);
  const [marked, setMarked] = useState<Point | null>(null);
  const [looking, setLooking] = useState(false);
  const [note, setNote] = useState('');
  const [catalogue, setCatalogue] = useState(false);
  const [mapBroken, setMapBroken] = useState(false);
  const [mapReady, setMapReady] = useState(false);

  useEffect(() => {
    let alive = true;
    loadTravel().then(
      (loaded) => {
        if (!alive) return;
        setBundle(loaded);
        setCityId(loaded.cities[0]?.id ?? '');
      },
      () => alive && setFailed(true),
    );
    return () => {
      alive = false;
    };
  }, []);

  const city: City | null = useMemo(
    () => bundle?.cities.find((item) => item.id === cityId) ?? bundle?.cities[0] ?? null,
    [bundle, cityId],
  );

  const switchScript = () => {
    const next: Script = script === 'latin' ? 'cyrillic' : 'latin';
    setScript(next);
    saveScript(next);
  };

  const pickPin = useCallback((pin: CityPin) => {
    setMarked(pin.at);
    setSelection({ title: pin.sr, serbian: true, kind: pin.kind });
    setNote('');
    setCatalogue(false);
  }, []);

  const pickPoint = useCallback(
    (at: Point) => {
      if (!bundle) return;
      setLooking(true);
      setNote('');
      lookupPlace(at, bundle.kinds).then(
        (found) => {
          setLooking(false);
          if (!found) {
            setSelection(null);
            setMarked(null);
            setNote('Читавук не разглядел тут знакомого места. Попробуй ткнуть точнее.');
            return;
          }
          setMarked(found.at);
          setCatalogue(false);
          const kind = kindById(bundle, found.kind ?? '');
          setSelection({
            title: found.name || capitalize(kind?.ru ?? ''),
            serbian: Boolean(found.name),
            kind: found.kind ?? '',
          });
        },
        () => {
          setLooking(false);
          setNote('Карта не ответила. Попробуй ещё раз через минуту.');
        },
      );
    },
    [bundle],
  );

  const closeSheet = useCallback(() => {
    setSelection(null);
    setMarked(null);
  }, []);

  const withMap = Boolean(TILE_URL) && !mapBroken && !AUTOMATED;

  useEffect(() => {
    if (!withMap || mapReady) return;
    const timeout = window.setTimeout(() => setMapBroken(true), 12_000);
    return () => window.clearTimeout(timeout);
  }, [mapReady, withMap]);

  if (failed) {
    return (
      <main className="flex min-h-[60vh] items-center justify-center px-5">
        <ErrorNote>Не удалось загрузить справочник мест. Обнови страницу.</ErrorNote>
      </main>
    );
  }

  if (!bundle || !city) {
    return (
      <main className="flex min-h-[60vh] items-center justify-center text-[var(--text-muted)]">
        <Spinner className="size-6" />
      </main>
    );
  }

  const kind = selection ? kindById(bundle, selection.kind) : null;
  const content = selection ? contentOf(bundle, selection.kind) : null;

  return (
    <main className="relative h-[100dvh] w-full overflow-hidden bg-[var(--bg)]">
      {withMap ? (
        <Suspense fallback={<div className="absolute inset-0 bg-[var(--bg-sunken)]" />}>
          <TravelMap
            tileUrl={TILE_URL}
            city={city}
            bundle={bundle}
            marked={marked}
            onPickPin={pickPin}
            onPickPoint={pickPoint}
            onReady={() => setMapReady(true)}
          />
        </Suspense>
      ) : (
        <CityList
          city={city}
          bundle={bundle}
          script={script}
          onPick={(pin) => pickPin(pin)}
        />
      )}

      {withMap && !mapReady && (
        <div className="pointer-events-none absolute inset-0 z-[5] flex items-center justify-center bg-[var(--bg)]/75">
          <div className="flex items-center gap-3 rounded-2xl bg-[var(--bg-raised)] px-4 py-3 text-sm font-semibold shadow-lg">
            <Spinner className="size-5" />
            Загружаем карту…
          </div>
        </div>
      )}

      <header className="pointer-events-none absolute inset-x-0 top-0 z-10 flex flex-col gap-2 p-3">
        <div className="pointer-events-auto flex items-center gap-2">
          <Link
            to="/"
            aria-label="Назад"
            className="flex size-10 items-center justify-center rounded-2xl border border-[var(--line)] bg-[var(--bg-raised)] text-[var(--text)] shadow-lg"
          >
            <LuArrowLeft className="size-5" />
          </Link>
          <span className="rounded-2xl border border-[var(--line)] bg-[var(--bg-raised)] px-4 py-2 font-semibold shadow-lg">
            {inScript('Путовање', script)}
          </span>
          <button
            type="button"
            onClick={switchScript}
            className="rounded-2xl border border-[var(--line)] bg-[var(--bg-raised)] px-3 py-2 text-sm font-semibold shadow-lg"
          >
            {script === 'latin' ? 'Ћирилица' : 'Latinica'}
          </button>
          <button
            type="button"
            onClick={() => setCatalogue((open) => !open)}
            className="flex items-center gap-2 rounded-2xl border border-[var(--line)] bg-[var(--bg-raised)] px-3 py-2 text-sm font-semibold shadow-lg"
          >
            <LuList className="size-4" />
            Все места
          </button>
        </div>

        <div className="pointer-events-auto flex gap-2 overflow-x-auto pb-1">
          {bundle.cities.map((item) => (
            <button
              key={item.id}
              type="button"
              onClick={() => {
                setCityId(item.id);
                closeSheet();
              }}
              className={[
                'shrink-0 rounded-2xl px-4 py-2 text-sm font-semibold shadow-lg transition-colors',
                item.id === city.id
                  ? 'bg-[var(--accent)] text-parchment'
                  : 'border border-[var(--line)] bg-[var(--bg-raised)] text-[var(--text)]',
              ].join(' ')}
            >
              {inScript(item.sr, script)}
            </button>
          ))}
        </div>
      </header>

      {(looking || note) && (
        <div className="pointer-events-none absolute inset-x-0 top-28 z-10 flex justify-center px-4">
          <p className="max-w-md rounded-2xl bg-[var(--bg-raised)] px-4 py-2 text-center text-sm shadow-lg">
            {looking ? 'Читавук смотрит, что это за место…' : note}
          </p>
        </div>
      )}

      {catalogue && (
        <Catalogue
          bundle={bundle}
          script={script}
          onPick={(id) => {
            const picked = kindById(bundle, id);
            setSelection({ title: capitalize(picked?.ru ?? ''), serbian: false, kind: id });
            setMarked(null);
            setCatalogue(false);
            setNote('');
          }}
          onClose={() => setCatalogue(false)}
        />
      )}

      {kind && content && (
        <PlaceSheet
          title={selection?.title || capitalize(kind.ru)}
          titleSerbian={selection?.serbian ?? false}
          kind={kind}
          icon={iconBody(bundle, kind.icon)}
          content={content}
          script={script}
          onClose={closeSheet}
        />
      )}
    </main>
  );
}

/** Города и их места списком: то же, что на карте, но без карты. */
function CityList({
  city,
  bundle,
  script,
  onPick,
}: {
  city: City;
  bundle: TravelBundle;
  script: Script;
  onPick: (pin: CityPin) => void;
}) {
  return (
    <div className="absolute inset-0 overflow-y-auto px-4 pb-10 pt-32">
      <ul className="mx-auto grid max-w-3xl gap-2 sm:grid-cols-2">
        {city.pins.map((pin) => {
          const kind = kindById(bundle, pin.kind);
          return (
            <li key={pin.id}>
              <button
                type="button"
                onClick={() => onPick(pin)}
                className="flex w-full items-center gap-3 rounded-2xl border border-[var(--line)] bg-[var(--bg-raised)] px-4 py-3 text-left transition-colors hover:border-[var(--accent)]"
              >
                <PlaceIcon
                  body={iconBody(bundle, kind?.icon ?? '')}
                  className="size-6 shrink-0 text-[var(--accent)]"
                />
                <span className="min-w-0">
                  <span className="block truncate font-semibold">
                    {inScript(pin.sr, script)}
                  </span>
                  <span className="block truncate text-sm text-[var(--text-muted)]">
                    {kind?.ru ?? pin.ru}
                  </span>
                </span>
              </button>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

/** Все типы мест: чтобы слова к аптеке нашлись без поиска аптеки на карте. */
function Catalogue({
  bundle,
  script,
  onPick,
  onClose,
}: {
  bundle: TravelBundle;
  script: Script;
  onPick: (kind: string) => void;
  onClose: () => void;
}) {
  const groups: Array<['place' | 'road', string]> = [
    ['place', 'Заведения'],
    ['road', 'На улице'],
  ];

  return (
    <div className="absolute inset-0 z-30 overflow-y-auto bg-[var(--bg)]/95 px-4 pb-10 pt-20 backdrop-blur">
      <div className="mx-auto max-w-3xl">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-xl font-semibold">Все места</h2>
          <button
            type="button"
            onClick={onClose}
            className="rounded-2xl border border-[var(--line)] px-4 py-2 text-sm font-semibold"
          >
            Назад к карте
          </button>
        </div>
        {groups.map(([group, label]) => (
          <section key={group} className="mb-6">
            <h3 className="mb-2 text-sm font-semibold uppercase tracking-wide text-[var(--text-muted)]">
              {label}
            </h3>
            <ul className="grid gap-2 sm:grid-cols-2">
              {bundle.kinds
                .filter((kind) => kind.group === group)
                .map((kind) => (
                  <li key={kind.id}>
                    <button
                      type="button"
                      onClick={() => onPick(kind.id)}
                      className="flex w-full items-center gap-3 rounded-2xl border border-[var(--line)] bg-[var(--bg-raised)] px-4 py-3 text-left transition-colors hover:border-[var(--accent)]"
                    >
                      <PlaceIcon
                        body={iconBody(bundle, kind.icon)}
                        className="size-6 shrink-0 text-[var(--accent)]"
                      />
                      <span className="min-w-0">
                        <span className="block truncate font-semibold">
                          {inScript(kind.sr, script)}
                        </span>
                        <span className="block truncate text-sm text-[var(--text-muted)]">
                          {kind.ru}
                        </span>
                      </span>
                    </button>
                  </li>
                ))}
            </ul>
          </section>
        ))}
        <p className="flex items-center gap-2 text-sm text-[var(--text-muted)]">
          <LuMapPin className="size-4 shrink-0" />
          На карте можно ткнуть в любое здание — Читавук сам поймёт, что это.
        </p>
      </div>
    </div>
  );
}
