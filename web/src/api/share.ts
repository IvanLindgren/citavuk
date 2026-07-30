import { API_BASE, request } from './client';

/**
 * Ссылка на книгу и обсуждение её страниц.
 *
 * Текст на сервере не дублируется: книга уже выгружена обычной синхронизацией,
 * ссылка лишь открывает к ней доступ. Поэтому поделиться можно только тем, что
 * успело выгрузиться, — сервер об этом и сообщает.
 */

export interface SharedBook {
  token: string;
  title: string;
  paragraphs: number;
  createdAt: string;
  opened: number;
}

export interface BookComment {
  id: string;
  paragraph: number;
  author: string;
  body: string;
  createdAt: string;
  /** Своё сообщение — его можно убрать. */
  mine: boolean;
}

/** Адрес, который человек отправляет знакомым. */
export function shareUrl(token: string): string {
  const origin =
    typeof window === 'undefined' ? 'https://citavuk.ru' : window.location.origin;
  return `${origin}/shared/${token}`;
}

export async function createShare(
  contentSha: string,
  title: string,
  paragraphs: number,
): Promise<SharedBook> {
  return request<SharedBook>('/v1/share/books', {
    method: 'POST',
    body: { contentSha, title, paragraphs },
  });
}

export async function getShare(
  token: string,
  signal?: AbortSignal,
): Promise<SharedBook> {
  return request<SharedBook>(`/v1/share/books/${encodeURIComponent(token)}`, {
    anonymous: true,
    signal,
  });
}

/** Текст книги по ссылке. Приходит массивом абзацев. */
export async function getShareContent(
  token: string,
  signal?: AbortSignal,
): Promise<string[]> {
  const response = await fetch(
    `${API_BASE}/v1/share/books/${encodeURIComponent(token)}/content`,
    { signal },
  );
  if (!response.ok) throw new Error('Не удалось получить текст книги.');
  const paragraphs = (await response.json()) as unknown;
  if (!Array.isArray(paragraphs)) throw new Error('Текст книги повреждён.');
  return paragraphs.filter((item): item is string => typeof item === 'string');
}

export async function revokeShare(token: string): Promise<void> {
  await request(`/v1/share/books/${encodeURIComponent(token)}`, {
    method: 'DELETE',
  });
}

export async function getComments(
  token: string,
  paragraph: number,
  signal?: AbortSignal,
): Promise<BookComment[]> {
  const response = await request<{ items?: BookComment[] }>(
    `/v1/share/books/${encodeURIComponent(token)}/comments?paragraph=${paragraph}`,
    { signal },
  );
  return response.items ?? [];
}

/** Карта «страница → сколько сообщений»: по ней читалка помечает страницы. */
export async function getCommentPages(
  token: string,
  signal?: AbortSignal,
): Promise<Record<string, number>> {
  const response = await request<{ pages?: Record<string, number> }>(
    `/v1/share/books/${encodeURIComponent(token)}/comments`,
    { signal },
  );
  return response.pages ?? {};
}

export async function addComment(
  token: string,
  paragraph: number,
  body: string,
): Promise<BookComment> {
  return request<BookComment>(
    `/v1/share/books/${encodeURIComponent(token)}/comments`,
    { method: 'POST', body: { paragraph, body } },
  );
}

export async function hideComment(id: string): Promise<void> {
  await request(`/v1/share/comments/${encodeURIComponent(id)}`, {
    method: 'DELETE',
  });
}
