import { useEffect, useMemo, useState, type CSSProperties } from 'react';
import { LuArrowLeft, LuArrowRight, LuCheck, LuGift, LuMap } from 'react-icons/lu';

import { Spinner } from '../components/ui';
import { WordReader } from '../components/WordReader';
import {
  completeOdysseyChapter,
  ODYSSEY_CHAPTER_COUNT,
  ODYSSEY_EVENT_ID,
  rememberOdysseyChapter,
  syncOdysseyProgress,
  uploadOdysseyProgress,
  useOdysseyProgress,
} from '../events/odyssey';
import { loadOdysseyChapter, type OdysseyChapter } from '../events/odysseyContent';
import manifest from '../events/odyssey-manifest.json';
import { FONT_STACKS, useReaderSettings } from '../lib/readerSettings';
import { Link } from '../lib/router';

interface Illustration {
  src: string;
  alt: string;
  caption: string;
  sourceUrl: string;
}

const ILLUSTRATIONS: Record<number, Illustration> = {
  5: {
    src: '/events/odyssey/calypso.webp',
    alt: 'Одиссей смотрит на море с острова Калипсо',
    caption: '«Одиссей и Калипсо», Арнольд Бёклин, 1882. Public domain.',
    sourceUrl: 'https://commons.wikimedia.org/wiki/File:Arnold_B%C3%B6cklin_008.jpg',
  },
  6: {
    src: '/events/odyssey/nausicaa.webp',
    alt: 'Одиссей встречает Навсикаю и её спутниц',
    caption: '«Одиссей и Навсикая», Питер Ластман, 1619. Public domain.',
    sourceUrl: 'https://commons.wikimedia.org/wiki/File:Lastman_Odysseus_and_Nausica%C3%A4.jpg',
  },
  9: {
    src: '/events/odyssey/cyclops.webp',
    alt: 'Одиссей спасается от циклопа Полифема на лодке',
    caption: '«Одиссей и Полифем», Арнольд Бёклин, 1896. Public domain.',
    sourceUrl: 'https://commons.wikimedia.org/wiki/File:Arnold_B%C3%B6cklin_-_Odysseus_and_Polyphemus.jpg',
  },
  10: {
    src: '/events/odyssey/circe.webp',
    alt: 'Кирка предлагает Одиссею чашу',
    caption: '«Кирка подаёт чашу Одиссею», Джон Уильям Уотерхаус, 1891. Public domain.',
    sourceUrl: 'https://commons.wikimedia.org/wiki/File:Circe_Offering_the_Cup_to_Odysseus.jpg',
  },
  12: {
    src: '/events/odyssey/sirens.webp',
    alt: 'Привязанный к мачте Одиссей слушает сирен',
    caption: '«Одиссей и сирены», Джон Уильям Уотерхаус, 1891. Public domain.',
    sourceUrl: 'https://commons.wikimedia.org/wiki/File:John_William_Waterhouse_-_Ulysses_and_the_Sirens_-_Google_Art_Project.jpg',
  },
  19: {
    src: '/events/odyssey/penelope.webp',
    alt: 'Пенелопа за ткацким станком среди женихов',
    caption: '«Пенелопа и женихи», Джон Уильям Уотерхаус, 1912. Public domain.',
    sourceUrl: 'https://commons.wikimedia.org/wiki/File:JohnWilliamWaterhouse-PenelopeandtheSuitors(1912).jpg',
  },
  23: {
    src: '/events/odyssey/return.webp',
    alt: 'Возвращение Одиссея к Пенелопе',
    caption: '«Возвращение Одиссея», Пинтуриккьо, около 1509. Public domain.',
    sourceUrl: 'https://commons.wikimedia.org/wiki/File:Pinturicchio,_Return_of_Odysseus.jpg',
  },
};

export function OdysseyReader({ accountId }: { accountId: string }) {
  const progress = useOdysseyProgress(accountId);
  const { settings } = useReaderSettings();
  const firstIncomplete = Math.min(
    ODYSSEY_CHAPTER_COUNT,
    progress.completedChapters.length + 1,
  );
  const [chapterNumber, setChapterNumber] = useState(() =>
    Math.min(progress.lastChapter, Math.max(1, firstIncomplete)),
  );
  const [chapter, setChapter] = useState<OdysseyChapter | null>(null);
  const [chapterError, setChapterError] = useState(false);
  const [loadAttempt, setLoadAttempt] = useState(0);
  const illustration = ILLUSTRATIONS[chapterNumber];
  const completed = progress.completedChapters.includes(chapterNumber);
  const readingProgress = Math.round((progress.completedChapters.length / ODYSSEY_CHAPTER_COUNT) * 100);

  useEffect(() => {
    void syncOdysseyProgress(accountId).catch(() => {});
  }, [accountId]);

  useEffect(() => {
    let cancelled = false;
    setChapter(null);
    setChapterError(false);
    void loadOdysseyChapter(chapterNumber).then((loaded) => {
      if (!cancelled) setChapter(loaded);
    }).catch(() => {
      if (!cancelled) setChapterError(true);
    });
    return () => {
      cancelled = true;
    };
  }, [chapterNumber, loadAttempt]);

  const paragraphStyle = useMemo<CSSProperties>(() => ({
    fontFamily: FONT_STACKS[settings.font],
    fontSize: settings.fontSize,
    lineHeight: settings.lineHeight,
    letterSpacing: settings.letterSpacing,
    textAlign: settings.justify ? 'justify' : 'left',
    hyphens: settings.justify ? 'auto' : undefined,
  }), [settings]);

  if (chapterError) {
    return (
      <main className="flex min-h-[60vh] flex-col items-center justify-center px-5 text-center">
        <h1 className="text-2xl">Не удалось открыть песнь</h1>
        <p className="mt-3 text-[var(--text-muted)]">Проверьте соединение и попробуйте ещё раз.</p>
        <button type="button" onClick={() => setLoadAttempt((value) => value + 1)} className="mt-6 rounded-xl bg-[var(--accent)] px-5 py-2.5 font-semibold text-white">
          Повторить
        </button>
      </main>
    );
  }

  if (!chapter) {
    return <div className="flex min-h-[60vh] items-center justify-center"><Spinner /></div>;
  }

  const chooseChapter = (number: number) => {
    const allowed = Math.min(number, firstIncomplete);
    setChapterNumber(allowed);
    rememberOdysseyChapter(accountId, allowed);
    window.scrollTo({ top: 0, behavior: settings.animate ? 'smooth' : 'auto' });
  };

  const finishChapter = () => {
    const updated = completeOdysseyChapter(accountId, chapterNumber);
    void uploadOdysseyProgress(updated).catch(() => {});
    if (chapterNumber < ODYSSEY_CHAPTER_COUNT && updated.completedChapters.includes(chapterNumber)) {
      setChapterNumber(chapterNumber + 1);
      window.scrollTo({ top: 0, behavior: settings.animate ? 'smooth' : 'auto' });
    }
  };

  return (
    <main className="bg-[var(--bg-sunken)] px-4 py-7 sm:px-5 sm:py-10">
      <div className="mx-auto max-w-5xl">
        <div className="mb-5 flex flex-wrap items-end justify-between gap-4">
          <div>
            <Link to="/events" className="inline-flex items-center gap-1.5 text-sm font-semibold text-[var(--text-muted)] hover:text-[var(--accent)]">
              <LuArrowLeft className="size-4" aria-hidden="true" />
              События
            </Link>
            <h1 className="mt-2 text-3xl sm:text-4xl">Одиссея</h1>
            <p className="mt-1 text-sm text-[var(--text-muted)]">Пройдено {readingProgress}% · доступно до 1 сентября</p>
          </div>

          <label className="flex items-center gap-2 text-sm font-semibold">
            <LuMap className="size-4 text-[var(--accent)]" aria-hidden="true" />
            <span className="sr-only">Выберите песнь</span>
            <select
              value={chapterNumber}
              onChange={(event) => chooseChapter(Number(event.target.value))}
              className="rounded-xl border border-[var(--line)] bg-[var(--bg-raised)] px-3 py-2 text-[var(--text)]"
            >
              {manifest.chapters.map((item) => {
                const locked = item.number > firstIncomplete && !progress.rewardUnlocked;
                return (
                  <option key={item.number} value={item.number} disabled={locked}>
                    {progress.completedChapters.includes(item.number) ? '✓ ' : ''}{item.title}
                  </option>
                );
              })}
            </select>
          </label>
        </div>

        <div className="mb-7 h-1.5 overflow-hidden rounded-full bg-[var(--line)]" aria-label={`Пройдено ${readingProgress}%`}>
          <div className="h-full bg-[var(--accent)] transition-[width] duration-300" style={{ width: `${readingProgress}%` }} />
        </div>

        <article
          lang="sr-Cyrl"
          className="paper-grain relative overflow-hidden border border-[var(--line)] bg-[#fbf6ea] text-[#2b2118] shadow-[var(--shadow-soft)]"
        >
          {illustration && (
            <figure className="border-b border-[#2b2118]/15">
              <img src={illustration.src} alt={illustration.alt} className="max-h-[34rem] w-full object-cover" />
              <figcaption className="bg-[#eee0c5] px-5 py-2 text-xs leading-relaxed text-[#5a4a3a] sm:px-10">
                {illustration.caption}{' '}
                <a href={illustration.sourceUrl} target="_blank" rel="noreferrer noopener" className="underline underline-offset-2">
                  Wikimedia Commons
                </a>
              </figcaption>
            </figure>
          )}

          <div className="mx-auto max-w-3xl px-5 py-10 sm:px-10 sm:py-14">
            <header className="mb-10 text-center">
              <p className="text-sm font-bold uppercase text-[#8d3038]">{chapter.title}</p>
              <h2 className="mt-2 text-2xl sm:text-3xl">{chapter.subtitle}</h2>
            </header>

            <WordReader
              paragraphs={chapter.paragraphs}
              bookId={`event:${ODYSSEY_EVENT_ID}`}
              bionic={settings.bionic}
              stress={settings.stress}
              paragraphClassName="event-verse reader-selectable whitespace-pre-line"
              paragraphStyle={paragraphStyle}
            />

            <div className="mt-12 border-t border-[#2b2118]/15 pt-7 text-center">
              {completed ? (
                <div className="inline-flex items-center gap-2 font-semibold text-[#6d563e]">
                  <LuCheck className="size-5" aria-hidden="true" />
                  Песнь завершена
                </div>
              ) : (
                <button
                  type="button"
                  onClick={finishChapter}
                  className="inline-flex items-center gap-2 rounded-2xl bg-[#8d3038] px-6 py-3 font-bold text-white transition-colors hover:bg-[#6f222b]"
                >
                  {chapterNumber === ODYSSEY_CHAPTER_COUNT ? 'Завершить и получить награду' : 'Завершить песнь'}
                  {chapterNumber === ODYSSEY_CHAPTER_COUNT ? <LuGift className="size-5" aria-hidden="true" /> : <LuArrowRight className="size-5" aria-hidden="true" />}
                </button>
              )}
            </div>
          </div>
        </article>

        {progress.rewardUnlocked && (
          <section className="mt-8 border border-[#b68a4e] bg-[#efe3cf] px-6 py-8 text-center text-[#2b2118] shadow-[var(--shadow-soft)] sm:px-10">
            <LuGift className="mx-auto size-9 text-[#8d3038]" aria-hidden="true" />
            <h2 className="mt-3 text-2xl">Спартанские шлемы открыты</h2>
            <p className="mx-auto mt-3 max-w-xl text-[#5a4a3a]">
              Откройте любую книгу, зайдите в настройки чтения и выберите новый фон.
            </p>
            <Link to="/library" className="mt-6 inline-flex rounded-xl bg-[#8d3038] px-5 py-2.5 font-bold text-white">
              В библиотеку
            </Link>
          </section>
        )}

        <p className="mx-auto mt-8 max-w-3xl text-xs leading-relaxed text-[var(--text-muted)]">
          Гомер, «Одиссея». Перевод Томо Маретича, 1915, Public Domain Mark 1.0.{' '}
          <a href="https://archive.org/details/homerova_odiseja_1915-t.maretic" target="_blank" rel="noreferrer noopener" className="underline underline-offset-2">Internet Archive</a>.{' '}
          Текст оцифрован Internet Archive и представлен сербской кириллицей;
          сохранены язык и орфография перевода.
        </p>
      </div>
    </main>
  );
}
