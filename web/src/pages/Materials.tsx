import { AnimatePresence, motion } from 'framer-motion';
import { useCallback, useMemo, useState } from 'react';

import { Mascot } from '../components/Mascot';
import { PdfPreview } from '../components/PdfPreview';
import { PdfStrip } from '../components/PdfStrip';
import { Button, Card, ErrorNote, Reveal, Spinner } from '../components/ui';
import { importText, plural } from '../lib/books';
import {
  extractDocumentFromUrl,
  IMPORT_STAGE_LABELS,
  type ImportStage,
} from '../lib/documentImport';
import {
  DOCUMENTS,
  LEVELS,
  SOURCES,
  SUBJECTS,
  YEARS,
  filterDocuments,
  formatBytes,
  subjectsForLevel,
  type DocumentKind,
  type MaterialDocument,
  type MaterialLevel,
} from '../materials/catalog';
import { Link, useParams, useQuery, useRouter } from '../lib/router';
import { useAuth } from '../state/auth';
import { useSync } from '../state/sync';
import { useSeo } from '../lib/seo';

const KINDS: Array<{ id: DocumentKind; label: string }> = [
  { id: 'test', label: 'Тесты' },
  { id: 'key', label: 'Ответы и решения' },
  { id: 'book', label: 'Пособия' },
  { id: 'guide', label: 'Инструкции' },
];

/**
 * Сколько карточек показывать до нажатия «показать ещё».
 *
 * Меньше, чем обычно бывает в каталогах: у каждой карточки живое превью из
 * настоящего PDF, и полсотни таких за раз — это уже минуты работы процессора.
 */
const PAGE_SIZE = 12;

export function Materials() {

  // Ссылки вида /materials?level=fakultet ведут сразу в нужный раздел: из
  // подвала и с других страниц имеет смысл звать не «в каталог вообще», а в его
  // конкретную часть.
  const query0 = useQuery();
  // Путь /materials/math — отдельная страница предмета. Она нужна не столько
  // для навигации (фильтр рядом), сколько чтобы у каждого предмета был свой
  // адрес, заголовок и текст: поисковик ранжирует страницы, а не состояния
  // фильтра, и «математика пријемни» должно куда-то приводить.
  const { subject: subjectPath } = useParams();
  const pageSubject = useMemo(
    () => SUBJECTS.find((entry) => entry.id === subjectPath) ?? null,
    [subjectPath],
  );

  const [level, setLevel] = useState<MaterialLevel | null>(() =>
    LEVELS.some((entry) => entry.id === query0.level)
      ? (query0.level as MaterialLevel)
      : null,
  );
  const [subjectId, setSubjectId] = useState<string | null>(
    () => pageSubject?.id ?? null,
  );
  const [year, setYear] = useState<number | null>(null);
  const [kindId, setKindId] = useState<DocumentKind | null>('test');
  const [query, setQuery] = useState('');
  const [limit, setLimit] = useState(PAGE_SIZE);

  useSeo(
    pageSubject
      ? {
          title: `${pageSubject.title}: тесты для поступления в Сербии | Читавук`,
          description: `${pageSubject.count} документов по предмету «${pageSubject.title}»: экзаменационные тесты, решения и пособия с сайтов сербских учреждений и факультетов. Скачать и открыть в читалке с переводом.`,
        }
      : {
          title: 'Материалы для поступления в сербские гимназии и вузы | Читавук',
          description:
            'Настоящие экзаменационные тесты, решения и пособия с сайтов сербских учреждений: приём в гимназии и вступительные на факультеты университетов Белграда, Нови-Сада, Ниша и Крагуеваца.',
        },
  );

  const subjects = useMemo(() => subjectsForLevel(level), [level]);
  const found = useMemo(
    () => filterDocuments({ level, subjectId, year, kindId, query }),
    [level, subjectId, year, kindId, query],
  );
  const shown = found.slice(0, limit);

  const reset = useCallback(() => {
    setLevel(null);
    // На странице предмета сброс возвращает к её предмету, а не ко всему
    // каталогу: иначе адрес и содержимое разошлись бы.
    setSubjectId(pageSubject?.id ?? null);
    setYear(null);
    setKindId('test');
    setQuery('');
    setLimit(PAGE_SIZE);
  }, [pageSubject]);

  // Любая смена фильтра возвращает к первой странице: иначе после сужения
  // выборки человек смотрит на «показать ещё» там, где всего восемь карточек.
  const change = useCallback(<T,>(apply: (value: T) => void) => {
    return (value: T) => {
      apply(value);
      setLimit(PAGE_SIZE);
    };
  }, []);

  const chooseLevel = change<MaterialLevel | null>((value) => {
    setLevel(value);
    // Предмет мог существовать только на прежнем уровне.
    setSubjectId(null);
  });

  return (
    <main className="px-5 py-10 sm:py-14">
      <div className="mx-auto max-w-6xl">
        <Reveal className="mb-8">
          <div className="flex flex-wrap items-start justify-between gap-6">
            <div className="max-w-2xl">
              {pageSubject && (
                <Link
                  to="/materials"
                  className="text-sm text-[var(--text-muted)] transition-colors hover:text-[var(--accent)]"
                >
                  ← Все материалы
                </Link>
              )}
              <h1 className="mt-1 text-3xl sm:text-4xl">
                {pageSubject
                  ? `${pageSubject.title}: тесты и пособия для поступления`
                  : 'Материалы для поступления'}
              </h1>
              <p className="mt-3 leading-relaxed text-[var(--text-muted)]">
                {pageSubject ? (
                  <>
                    {pageSubject.count}{' '}
                    {plural(
                      pageSubject.count,
                      'документ',
                      'документа',
                      'документов',
                    )}{' '}
                    по предмету «{pageSubject.title}»
                    {pageSubject.yearFrom
                      ? ` за ${pageSubject.yearFrom}–${pageSubject.yearTo} годы`
                      : ''}
                    : настоящие экзаменационные тесты, решения к ним и пособия с
                    сайтов сербских учреждений и факультетов.
                  </>
                ) : (
                  <>
                    Настоящие экзаменационные тесты, решения и пособия для
                    приёма в сербские гимназии и на факультеты. Всё взято с
                    сайтов учреждений-первоисточников: {DOCUMENTS.length}{' '}
                    документов, {SOURCES.length} учреждений.
                  </>
                )}
              </p>
              <p className="mt-2 text-sm leading-relaxed text-[var(--text-muted)]">
                Документы остаются на сайте источника. По кнопке «В библиотеку»
                текст загружается к вам и открывается в читалке, с разбором
                слов и переводом.
              </p>
            </div>
            <div className="hidden w-32 shrink-0 sm:block">
              <Mascot pose="citavuk_rule" alt="" width={256} float />
            </div>
          </div>
        </Reveal>

        <Reveal delay={0.05} className="mb-6">
          <Card className="p-4 sm:p-5">
            <label className="block">
              <span className="sr-only">Поиск по материалам</span>
              <input
                type="search"
                value={query}
                onChange={(event) => {
                  setQuery(event.target.value);
                  setLimit(PAGE_SIZE);
                }}
                placeholder="Предмет, год, факультет: например «математика 2025»"
                className="w-full rounded-2xl border border-[var(--line)] bg-[var(--bg)] px-4 py-3 outline-none transition-colors placeholder:text-[var(--text-muted)]/70 focus:border-[var(--accent)]"
              />
            </label>

            <div className="mt-4 space-y-3">
              <FilterRow label="Куда">
                <Chip active={level === null} onClick={() => chooseLevel(null)}>
                  Всё
                </Chip>
                {LEVELS.map((entry) => (
                  <Chip
                    key={entry.id}
                    active={level === entry.id}
                    onClick={() => chooseLevel(entry.id)}
                  >
                    {entry.title}
                    <span className="ml-1.5 opacity-60">{entry.count}</span>
                  </Chip>
                ))}
              </FilterRow>

              <FilterRow label="Предмет">
                <Chip
                  active={subjectId === null}
                  onClick={() => change(setSubjectId)(null)}
                >
                  Все
                </Chip>
                {subjects.map((subject) => (
                  <Chip
                    key={subject.id}
                    active={subjectId === subject.id}
                    onClick={() => change(setSubjectId)(subject.id)}
                  >
                    {subject.title}
                    <span className="ml-1.5 opacity-60">{subject.count}</span>
                  </Chip>
                ))}
              </FilterRow>

              <FilterRow label="Год">
                <Chip active={year === null} onClick={() => change(setYear)(null)}>
                  Любой
                </Chip>
                {YEARS.map((value) => (
                  <Chip
                    key={value}
                    active={year === value}
                    onClick={() => change(setYear)(value)}
                  >
                    {value}
                  </Chip>
                ))}
              </FilterRow>

              <FilterRow label="Вид">
                <Chip active={kindId === null} onClick={() => change(setKindId)(null)}>
                  Все
                </Chip>
                {KINDS.map((kind) => (
                  <Chip
                    key={kind.id}
                    active={kindId === kind.id}
                    onClick={() => change(setKindId)(kind.id)}
                  >
                    {kind.label}
                  </Chip>
                ))}
              </FilterRow>
            </div>
          </Card>
        </Reveal>

        <div className="mb-4 flex flex-wrap items-center justify-between gap-3 text-sm text-[var(--text-muted)]">
          <span>
            {found.length > 0
              ? `Найдено ${found.length} из ${DOCUMENTS.length}`
              : 'Ничего не нашлось'}
          </span>
          {(level || subjectId || year || kindId !== 'test' || query) && (
            <button
              type="button"
              onClick={reset}
              className="font-semibold text-[var(--accent)] transition-colors hover:text-[var(--accent-hover)]"
            >
              Сбросить фильтры
            </button>
          )}
        </div>

        {found.length === 0 ? (
          <Card className="px-6 py-14 text-center">
            <p className="text-lg">По этому запросу материалов нет</p>
            <p className="mt-2 text-[var(--text-muted)]">
              Попробуйте выбрать другой предмет или год.
            </p>
          </Card>
        ) : (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            <AnimatePresence mode="popLayout">
              {shown.map((document, index) => (
                <MaterialCard
                  key={document.id}
                  document={document}
                  index={index % PAGE_SIZE}
                />
              ))}
            </AnimatePresence>
          </div>
        )}

        {limit < found.length && (
          <div className="mt-8 flex justify-center">
            <Button
              variant="secondary"
              onClick={() => setLimit((value) => value + PAGE_SIZE)}
            >
              Показать ещё {Math.min(PAGE_SIZE, found.length - limit)}
            </Button>
          </div>
        )}

        {!pageSubject && <SubjectIndex />}
        <Sources />
      </div>
    </main>
  );
}

/**
 * Перечень предметов ссылками.
 *
 * Фильтр наверху делает то же самое, но состояние фильтра — не адрес: на него
 * нельзя сослаться, его не найдёт поисковик и не сохранит в закладки человек,
 * которому нужна только математика. Здесь у каждого предмета свой адрес.
 */
function SubjectIndex() {
  return (
    <Reveal className="mt-14">
      <h2 className="mb-4 text-2xl">Материалы по предметам</h2>
      <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
        {SUBJECTS.map((subject) => (
          <Link
            key={subject.id}
            to={`/materials/${subject.id}`}
            className="flex items-baseline justify-between gap-3 rounded-2xl border border-[var(--line)] bg-[var(--bg-raised)] px-4 py-3 transition-colors hover:border-[var(--accent)]"
          >
            <span className="font-semibold">{subject.title}</span>
            <span className="shrink-0 text-sm text-[var(--text-muted)]">
              {subject.count}
              {subject.yearFrom ? ` · ${subject.yearFrom}–${subject.yearTo}` : ''}
            </span>
          </Link>
        ))}
      </div>
    </Reveal>
  );
}

/** Кто именно опубликовал материалы. Каталог чужой, и это надо называть. */
function Sources() {
  return (
    <Reveal className="mt-14">
      <Card className="p-5 sm:p-6">
        <h2 className="text-lg">Откуда материалы</h2>
        <p className="mt-2 text-sm leading-relaxed text-[var(--text-muted)]">
          Все документы опубликованы самими учреждениями в открытом доступе,
          без регистрации и оплаты. Мы их не храним и не копируем: каталог это
          указатель, каждая ссылка ведёт на сайт источника.
        </p>
        <ul className="mt-4 grid gap-2 sm:grid-cols-2">
          {SOURCES.map((source) => (
            <li key={source.id} className="text-sm">
              <a
                href={source.page}
                target="_blank"
                rel="noreferrer noopener"
                className="font-semibold underline-offset-2 hover:text-[var(--accent)] hover:underline"
              >
                {source.publisher}
              </a>
              <span className="ml-1.5 text-[var(--text-muted)]">
                · {source.count}
              </span>
            </li>
          ))}
        </ul>
      </Card>
    </Reveal>
  );
}

function MaterialCard({
  document,
  index,
}: {
  document: MaterialDocument;
  index: number;
}) {
  const { navigate } = useRouter();
  const { account } = useAuth();
  const { sync } = useSync();
  const [stage, setStage] = useState<ImportStage | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [openedPage, setOpenedPage] = useState<number | null>(null);

  const busy = stage !== null;

  /**
   * Полный файл скачивается только по нажатию.
   *
   * Превью в карточке — это несколько отрисованных страниц; чтобы положить
   * документ в библиотеку, нужен весь текст, и это уже осознанное действие.
   */
  async function addToLibrary() {
    setError(null);
    try {
      const extracted = await extractDocumentFromUrl(document.url, setStage);
      setStage('saving');
      const book = await importText(document.title, extracted.text, document.url);
      if (account) void sync();
      navigate(`/reader/${book.id}`);
    } catch (caught) {
      setError(
        caught instanceof Error
          ? caught.message
          : 'Не удалось загрузить документ.',
      );
    } finally {
      setStage(null);
    }
  }

  return (
    <motion.div
      layout
      initial={{ opacity: 0, y: 14 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, scale: 0.96 }}
      transition={{ duration: 0.28, delay: index * 0.02, ease: [0.22, 1, 0.36, 1] }}
    >
      <Card className="flex h-full flex-col p-5 transition-all duration-300 hover:-translate-y-1 hover:shadow-[var(--shadow-lift)]">
        <div className="mb-3 flex flex-wrap items-center gap-2">
          <KindBadge kind={document.kindId} label={document.kind} />
          {document.year && (
            <span className="text-xs text-[var(--text-muted)]">{document.year}</span>
          )}
          {document.bytes > 0 && (
            <span className="text-xs text-[var(--text-muted)]">
              · {formatBytes(document.bytes)}
            </span>
          )}
        </div>

        <h3 className="text-lg leading-snug">{document.subject}</h3>
        <p className="mt-1 text-sm text-[var(--text-muted)]">
          {document.track ?? document.publisherShort}
        </p>

        <div className="mt-4">
          <PdfStrip url={document.url} onOpen={setOpenedPage} />
        </div>

        <p className="mt-3 text-xs leading-relaxed text-[var(--text-muted)]">
          Источник:{' '}
          <a
            href={document.sourcePage}
            target="_blank"
            rel="noreferrer noopener"
            title={document.publisher}
            className="underline-offset-2 hover:text-[var(--accent)] hover:underline"
          >
            {document.publisher}
          </a>
        </p>

        {error && (
          <div className="mt-3">
            <ErrorNote>{error}</ErrorNote>
          </div>
        )}

        <div className="mt-auto flex gap-2 pt-4">
          <Button
            size="sm"
            className="flex-1"
            disabled={busy}
            onClick={() => void addToLibrary()}
          >
            {busy ? (
              <>
                <Spinner />
                {IMPORT_STAGE_LABELS[stage]}
              </>
            ) : (
              'В библиотеку'
            )}
          </Button>
          <a
            href={document.url}
            target="_blank"
            rel="noreferrer noopener"
            title="Открыть на сайте источника"
            className="rounded-2xl border border-[var(--line)] bg-[var(--bg-raised)] px-3 py-2 text-sm font-semibold text-[var(--text-muted)] transition-colors hover:border-[var(--accent)] hover:text-[var(--accent)]"
          >
            Оригинал
          </a>
        </div>
      </Card>

      {openedPage !== null && (
        <PdfPreview
          url={document.url}
          title={document.title}
          startPage={openedPage}
          onClose={() => setOpenedPage(null)}
          onImport={() => void addToLibrary()}
        />
      )}
    </motion.div>
  );
}

function KindBadge({ kind, label }: { kind: DocumentKind; label: string }) {
  const styles: Record<DocumentKind, string> = {
    test: 'bg-[var(--accent)]/12 text-[var(--accent)]',
    key: 'bg-indigo-deep/12 text-indigo-deep dark:bg-indigo-soft/20 dark:text-indigo-soft',
    book: 'bg-emerald-600/12 text-emerald-700 dark:text-emerald-400',
    guide: 'bg-gold/20 text-[var(--text-muted)]',
  };

  return (
    <span
      className={`rounded-full px-2.5 py-0.5 text-[11px] font-semibold uppercase tracking-wide ${styles[kind]}`}
    >
      {label}
    </span>
  );
}

function FilterRow({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex flex-wrap items-baseline gap-2">
      <span className="w-16 shrink-0 text-xs font-semibold uppercase tracking-wide text-[var(--text-muted)]">
        {label}
      </span>
      <div className="flex flex-1 flex-wrap gap-1.5">{children}</div>
    </div>
  );
}

function Chip({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={[
        'rounded-full px-3 py-1.5 text-sm font-semibold transition-colors',
        active
          ? 'bg-[var(--accent)] text-parchment'
          : 'bg-[var(--bg-sunken)] text-[var(--text-muted)] hover:text-[var(--text)]',
      ].join(' ')}
    >
      {children}
    </button>
  );
}
