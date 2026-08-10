import raw from './catalog.json';

/**
 * Каталог материалов для поступления.
 *
 * Файлы у нас не хранятся: каталог содержит только описания и ссылки на
 * первоисточник. Скачивание идёт по явному нажатию пользователя и проходит
 * через тот же путь, что и «добавить по ссылке», — так у документа остаётся
 * автор, а мы не раздаём чужую библиотеку.
 *
 * Собирается скриптом `scripts/build-materials.py`, который проверяет каждую
 * ссылку: битая ссылка на учебник хуже отсутствующей, потому что тратит время
 * ровно тогда, когда человек готовится к экзамену. Тот же скрипт кладёт копию
 * каталога в ассеты Flutter — приложение и сайт обязаны показывать одно и то же.
 */

export type DocumentKind = 'test' | 'key' | 'guide' | 'book';

/** Куда поступают: в гимназию или на факультет. Материалы разные. */
export type MaterialLevel = 'gimnazija' | 'fakultet' | 'jezik';

export interface MaterialDocument {
  /** Устойчивый ключ: короткий хеш адреса. Имена файлов у разных вузов совпадают. */
  id: string;
  file: string;
  title: string;
  subjectId: string;
  subject: string;
  /** Направление приёма: филологическая гимназия, двуязычные отделения и т. д. */
  track: string | null;
  /** У пособий без привязки к экзамену года нет. */
  year: number | null;
  kindId: DocumentKind;
  kind: string;
  level: MaterialLevel;
  levelTitle: string;
  bytes: number;
  url: string;
  sourceId: string;
  publisher: string;
  publisherShort: string;
  sourcePage: string;
}

export interface MaterialSubject {
  id: string;
  title: string;
  count: number;
  yearFrom: number | null;
  yearTo: number | null;
}

export interface MaterialLevelInfo {
  id: MaterialLevel;
  title: string;
  count: number;
}

export interface MaterialSource {
  id: string;
  publisher: string;
  publisherShort: string;
  page: string;
  count: number;
}

interface Catalog {
  levels: MaterialLevelInfo[];
  subjects: MaterialSubject[];
  sources: MaterialSource[];
  documents: MaterialDocument[];
}

const catalog = raw as unknown as Catalog;

export const LEVELS: MaterialLevelInfo[] = catalog.levels;
export const SUBJECTS: MaterialSubject[] = catalog.subjects;
export const DOCUMENTS: MaterialDocument[] = catalog.documents;

/**
 * Учреждения-источники, по одной строке на каждое.
 *
 * В каталоге у одного факультета может быть несколько разделов (у матфака,
 * например, архив и подготовительные курсы). Для читателя это один источник.
 */
export const SOURCES: MaterialSource[] = Object.values(
  catalog.sources.reduce<Record<string, MaterialSource>>((acc, source) => {
    const existing = acc[source.publisher];
    acc[source.publisher] = existing
      ? { ...existing, count: existing.count + source.count }
      : source;
    return acc;
  }, {}),
).sort((a, b) => b.count - a.count);

/** Годы, за которые вообще есть материалы, — от новых к старым. */
export const YEARS: number[] = [
  ...new Set(
    DOCUMENTS.map((document) => document.year).filter(
      (year): year is number => year !== null,
    ),
  ),
].sort((a, b) => b - a);

export interface MaterialFilter {
  level: MaterialLevel | null;
  subjectId: string | null;
  year: number | null;
  kindId: DocumentKind | null;
  query: string;
}

export function filterDocuments(filter: MaterialFilter): MaterialDocument[] {
  const query = filter.query.trim().toLowerCase();

  return DOCUMENTS.filter((document) => {
    if (filter.level && document.level !== filter.level) return false;
    if (filter.subjectId && document.subjectId !== filter.subjectId) return false;
    if (filter.year && document.year !== filter.year) return false;
    if (filter.kindId && document.kindId !== filter.kindId) return false;
    if (!query) return true;

    // Поиск идёт и по названию файла: экзамены часто ищут по коду вроде
    // «IBO» или «Filoloska», а они есть только там.
    return (
      document.title.toLowerCase().includes(query) ||
      document.kind.toLowerCase().includes(query) ||
      document.publisher.toLowerCase().includes(query) ||
      document.file.toLowerCase().includes(query)
    );
  });
}

/**
 * Предметы, которые вообще встречаются при выбранном уровне.
 *
 * Показывать «Химия 69» и находить ноль документов, потому что выбрана
 * гимназия, — способ убедить человека, что фильтр сломан.
 */
export function subjectsForLevel(level: MaterialLevel | null): MaterialSubject[] {
  if (!level) return SUBJECTS;

  const counts = new Map<string, number>();
  for (const document of DOCUMENTS) {
    if (document.level !== level) continue;
    counts.set(document.subjectId, (counts.get(document.subjectId) ?? 0) + 1);
  }
  return SUBJECTS.filter((subject) => counts.has(subject.id))
    .map((subject) => ({ ...subject, count: counts.get(subject.id) ?? 0 }))
    .sort((a, b) => b.count - a.count);
}

/** Человекочитаемый размер: «1,2 МБ». */
export function formatBytes(bytes: number): string {
  if (!bytes) return '';
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} КБ`;
  return `${(bytes / (1024 * 1024)).toFixed(1).replace('.', ',')} МБ`;
}
