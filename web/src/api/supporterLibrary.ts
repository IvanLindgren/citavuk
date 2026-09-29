import { API_BASE, ApiError, getToken, request } from './client';

export type LibraryKind = 'book' | 'podcast';

export interface LibraryItem {
  id: string;
  kind: LibraryKind;
  title: string;
  author: string;
  description: string;
  level: string;
  coverUrl: string;
  body?: string;
  bodyChars: number;
  audioMime: string;
  audioSize: number;
  published: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface LibraryItemInput {
  kind: LibraryKind;
  title: string;
  author: string;
  description: string;
  level: string;
  coverUrl: string;
  body: string;
  published: boolean;
}

export async function getSupporterLibrary(): Promise<LibraryItem[]> {
  const response = await request<{ items: LibraryItem[] }>('/v1/supporter-library');
  return response.items ?? [];
}

export function getLibraryItem(id: string): Promise<LibraryItem> {
  return request<LibraryItem>(`/v1/supporter-library/${encodeURIComponent(id)}`, { timeoutMs: 60_000 });
}

/** Аудио отдаётся по той же сессии: браузер приложит cookie к запросу <audio>. */
export function libraryAudioUrl(item: Pick<LibraryItem, 'id' | 'updatedAt'>): string {
  return `${API_BASE}/v1/supporter-library/${encodeURIComponent(item.id)}/audio?v=${encodeURIComponent(item.updatedAt)}`;
}

export async function getAdminLibrary(): Promise<LibraryItem[]> {
  const response = await request<{ items: LibraryItem[] }>('/v1/admin/supporter-library');
  return response.items ?? [];
}

export function createLibraryItem(input: LibraryItemInput): Promise<LibraryItem> {
  return request<LibraryItem>('/v1/admin/supporter-library', { method: 'POST', body: input, timeoutMs: 60_000 });
}

export function updateLibraryItem(id: string, input: LibraryItemInput): Promise<LibraryItem> {
  return request<LibraryItem>(`/v1/admin/supporter-library/${encodeURIComponent(id)}`, { method: 'PUT', body: input, timeoutMs: 60_000 });
}

export function deleteLibraryItem(id: string): Promise<void> {
  return request<void>(`/v1/admin/supporter-library/${encodeURIComponent(id)}`, { method: 'DELETE' });
}

const CHUNK = 16 * 1024 * 1024;

/**
 * Загружает аудио частями по 16 МБ: nginx пропускает тела до 52 МБ, а подкаст
 * бывает длиннее. Оборвавшаяся часть повторяется с места, которое сервер
 * подтвердил в ответе 409.
 */
export async function uploadLibraryAudio(
  id: string,
  file: File,
  onProgress: (share: number) => void,
): Promise<void> {
  const mime = file.type || 'audio/mpeg';
  let offset = 0;
  let failures = 0;
  while (offset < file.size) {
    const end = Math.min(offset + CHUNK, file.size);
    const final = end === file.size;
    const url = `${API_BASE}/v1/admin/supporter-library/${encodeURIComponent(id)}/audio?offset=${offset}${final ? '&final=1' : ''}`;
    const token = getToken();
    let response: Response;
    try {
      response = await fetch(url, {
        method: 'PUT',
        body: file.slice(offset, end),
        headers: {
          'Content-Type': mime,
          'X-Citavuk-Client': 'web',
          ...(token && token !== 'cookie' ? { Authorization: `Bearer ${token}` } : {}),
        },
        credentials: 'include',
      });
    } catch {
      if (++failures > 5) throw new ApiError('Связь рвётся — загрузка остановлена.');
      continue;
    }
    if (response.status === 409) {
      const body = (await response.json().catch(() => ({}))) as { received?: number };
      offset = body.received ?? 0;
      continue;
    }
    if (!response.ok) {
      const body = (await response.json().catch(() => ({}))) as { message?: string };
      throw new ApiError(body.message ?? `Ошибка загрузки (${response.status}).`, response.status);
    }
    failures = 0;
    offset = end;
    onProgress(offset / file.size);
  }
}
