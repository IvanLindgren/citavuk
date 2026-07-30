export interface PublicLibraryItem {
  id: string;
  title: string;
  author: string;
  year: string;
  kind: string;
  genre: string;
  level: string;
  summary: string;
  coverUrl: string;
  textUrl: string;
  externalUrl?: string;
  attribution?: string;
  sourceUrls: string[];
  license: string;
  characters: number;
  coverSourceUrl?: string;
  coverLicense?: string;
  coverAuthor?: string;
}

interface PublicLibraryCatalog {
  version: number;
  generatedAt: string;
  items: PublicLibraryItem[];
}

let catalogPromise: Promise<PublicLibraryCatalog> | null = null;

/** Загружает только компактные метаданные. Тексты запрашиваются по одному. */
export function loadPublicLibrary(
  signal?: AbortSignal,
): Promise<PublicLibraryCatalog> {
  if (!catalogPromise || signal) {
    const request = fetch('/public-library/catalog.json', {
      signal,
      cache: 'no-cache',
    }).then(async (response) => {
      if (!response.ok) throw new Error('Каталог временно недоступен.');
      return (await response.json()) as PublicLibraryCatalog;
    });
    if (!signal) catalogPromise = request;
    return request;
  }
  return catalogPromise;
}

export async function loadPublicBook(
  item: PublicLibraryItem,
  signal?: AbortSignal,
): Promise<string> {
  if (!item.textUrl) throw new Error('У этого материала нет локального текста.');
  const response = await fetch(item.textUrl, { signal });
  if (!response.ok) throw new Error('Не удалось загрузить текст.');
  return response.text();
}
