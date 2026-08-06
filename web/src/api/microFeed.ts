import { request } from './client';

export type MicroFeedStatus = 'draft' | 'published' | 'archived';
export type MicroFeedScript = 'cyrillic' | 'latin';
export type MicroFeedReaction = -1 | 0 | 1;

export interface DifficultWord {
  word: string;
  lemma: string;
  transcription: string;
  translationRu: string;
}

export interface MicroFeedItem {
  id: string;
  status: MicroFeedStatus;
  kind: 'news' | 'fact' | 'culture' | 'science' | 'fiction' | 'society' | 'book_excerpt';
  category:
    | 'history' | 'culture' | 'science' | 'fiction' | 'society' | 'news'
    | 'travel' | 'food' | 'sport' | 'music' | 'language';
  titleCyrillic: string;
  titleLatin: string;
  textCyrillic: string;
  textLatin: string;
  originalLanguage: string;
  originalScript: 'cyrillic' | 'latin' | 'translated';
  cefr: 'A1' | 'A2' | 'B1' | 'B2' | 'C1';
  tags: string[];
  difficultWords: DifficultWord[];
  imageUrl: string;
  audioUrl: string;
  sourceSlug: string;
  sourceImportId?: string;
  sourceTitle: string;
  sourceUrl: string;
  sourcePublishedAt: string | null;
  licenseCode: string;
  attributionText: string;
  bookId: string;
  chapterId: string;
  startPositionChar: number;
  bookTargetUrl: string;
  viewsCount: number;
  likesCount: number;
  dislikesCount: number;
  readMoreCount: number;
  commentsCount: number;
  reaction: MicroFeedReaction;
  hasEmbedding: boolean;
  publishedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface MicroFeedSource {
  slug: string;
  title: string;
  sourceKind: 'rss' | 'mediawiki' | 'manual';
  sourceUrl: string;
  language: string;
  rightsMode: 'reuse' | 'summary_only' | 'manual_review';
  licenseCode: string;
  attributionName: string;
  attributionUrl: string;
  enabled: boolean;
  lastSyncedAt: string | null;
}

export interface MicroFeedImport {
  id: string;
  sourceSlug: string;
  sourceTitle: string;
  externalId: string;
  title: string;
  sourceUrl: string;
  rawText: string;
  sourcePublishedAt: string | null;
  status: 'queued' | 'processed' | 'rejected';
  rejectionReason: string;
  createdAt: string;
}

export type MicroFeedItemDraft = Pick<MicroFeedItem,
  | 'kind' | 'category' | 'titleCyrillic' | 'titleLatin'
  | 'textCyrillic' | 'textLatin' | 'originalLanguage' | 'originalScript'
  | 'cefr' | 'tags' | 'difficultWords' | 'imageUrl' | 'audioUrl'
  | 'sourceSlug' | 'sourceTitle' | 'sourceUrl' | 'licenseCode'
  | 'attributionText' | 'bookId' | 'chapterId' | 'startPositionChar'
  | 'bookTargetUrl'
>;

/**
 * Идентификатор гостя выдаёт СЕРВЕР и подписывает своим ключом.
 *
 * Раньше его придумывал браузер: любой UUID принимался как новый читатель, и
 * лайк накручивался сменой строки в запросе. Здесь браузер только хранит то,
 * что ему выдали, вместе с лентой (`visitorToken` в ответе `/v1/micro-feed`).
 *
 * Прежний ключ localStorage намеренно другой: сохранённый самодельный UUID
 * сервер всё равно не примет, и подсовывать его в новый обмен незачем.
 */
const VISITOR_TOKEN_KEY = 'citavuk-micro-feed-visitor-token';

export function microFeedVisitorToken(): string {
  return localStorage.getItem(VISITOR_TOKEN_KEY) ?? '';
}

function rememberVisitorToken(token: string | undefined) {
  if (token) localStorage.setItem(VISITOR_TOKEN_KEY, token);
}

export async function getMicroFeed(exclude: string[], signal?: AbortSignal) {
  const query = new URLSearchParams({ limit: '8' });
  // Первый заход идёт без токена — сервер заведёт его и вернёт вместе с лентой.
  const token = microFeedVisitorToken();
  if (token) query.set('visitorToken', token);
  if (exclude.length > 0) query.set('exclude', exclude.slice(-80).join(','));

  const response = await request<{
    items: MicroFeedItem[];
    strategy: MicroFeedStrategy;
    preferences?: MicroFeedPreferences;
    visitorToken?: string;
  }>(`/v1/micro-feed?${query}`, { signal });
  rememberVisitorToken(response.visitorToken);
  return response;
}

export type MicroFeedStrategy = 'cold' | 'declared' | 'personalized';

/** Темы и уровень, названные читателем в анкете. */
export interface MicroFeedPreferences {
  categories: MicroFeedItem['category'][];
  cefr: MicroFeedItem['cefr'];
  /** Анкета пройдена. Пустой список тем — тоже ответ, а не «не спрашивали». */
  onboarded: boolean;
}

export const MICRO_FEED_LEVELS: MicroFeedItem['cefr'][] = ['A1', 'A2', 'B1', 'B2', 'C1'];

export function saveMicroFeedPreferences(
  categories: MicroFeedItem['category'][],
  cefr: MicroFeedItem['cefr'],
) {
  return request<MicroFeedPreferences>('/v1/micro-feed/preferences', {
    method: 'PUT',
    body: { visitorToken: microFeedVisitorToken(), categories, cefr },
  });
}

/** Карточки, отмеченные лайком: лайк работает ещё и закладкой. */
export async function getLikedMicroFeed(signal?: AbortSignal) {
  const query = new URLSearchParams({ visitorToken: microFeedVisitorToken() });
  const response = await request<{ items: MicroFeedItem[] }>(
    `/v1/micro-feed/liked?${query}`,
    { signal },
  );
  return response.items;
}

/**
 * Автоматический браузер: пререндер сборки, проверка ссылок, обход поисковика.
 *
 * Его показы и дочитывания в профиль идти не должны. Лента учится на поведении
 * читателя, а робот «дочитывает» каждую карточку за долю секунды и одинаково —
 * это не интерес, это шум, и в подборе он растворяет настоящие сигналы.
 * Пререндер сайта прогоняет ленту на каждой сборке, то есть шум был бы
 * регулярным.
 */
function automated(): boolean {
  return typeof navigator !== 'undefined' && navigator.webdriver === true;
}

export function recordMicroFeedInteraction(
  itemId: string,
  event: 'view' | 'like' | 'dislike' | 'reaction_cleared' | 'read_more_clicked' | 'quick_skip' | 'complete' | 'audio_play',
  dwellMs = 0,
) {
  if (automated()) return Promise.resolve();
  // Без токена действие учитывать не за кем. Он приходит вместе с лентой, то
  // есть к первому действию уже есть; отсутствие означает, что лента вообще не
  // загрузилась, и слать действие незачем.
  const token = microFeedVisitorToken();
  if (!token) return Promise.resolve();
  return request<void>(`/v1/micro-feed/${encodeURIComponent(itemId)}/interactions`, {
    method: 'POST',
    body: { visitorToken: token, event, dwellMs: Math.max(0, Math.round(dwellMs)) },
  });
}

export interface MicroFeedComment {
  id: string;
  itemId: string;
  userId: string;
  author: string;
  body: string;
  createdAt: string;
  /** Своя реплика: её можно удалить. Решает сервер, а не браузер. */
  mine: boolean;
}

/** Предел длины реплики. Тот же стоит на сервере и в базе. */
export const COMMENT_MAX = 600;

export const getMicroFeedComments = async (itemId: string, signal?: AbortSignal) =>
  (await request<{ items: MicroFeedComment[] }>(
    `/v1/micro-feed/${encodeURIComponent(itemId)}/comments`,
    { signal },
  )).items;

export const addMicroFeedComment = (itemId: string, body: string) =>
  request<MicroFeedComment>(`/v1/micro-feed/${encodeURIComponent(itemId)}/comments`, {
    method: 'POST', body: { body },
  });

export const deleteMicroFeedComment = (commentId: string) =>
  request<void>(`/v1/micro-feed/comments/${encodeURIComponent(commentId)}`, {
    method: 'DELETE',
  });

export const getAdminMicroFeedSources = () =>
  request<{ items: MicroFeedSource[]; generatorEnabled: boolean; embeddingsEnabled: boolean }>(
    '/v1/admin/micro-feed/sources',
  );

export const syncMicroFeedSource = (slug: string) =>
  request<{ found: number; saved: number }>(
    `/v1/admin/micro-feed/sources/${encodeURIComponent(slug)}/sync`,
    { method: 'POST', timeoutMs: 60_000 },
  );

export const getAdminMicroFeedImports = async (status = 'queued') =>
  (await request<{ items: MicroFeedImport[] }>(
    `/v1/admin/micro-feed/imports?status=${encodeURIComponent(status)}`,
  )).items;

export const generateMicroFeedItem = (id: string) =>
  request<MicroFeedItem>(`/v1/admin/micro-feed/imports/${encodeURIComponent(id)}/generate`, {
    method: 'POST', timeoutMs: 190_000,
  });

export const rejectMicroFeedImport = (id: string, reason: string) =>
  request<void>(`/v1/admin/micro-feed/imports/${encodeURIComponent(id)}/reject`, {
    method: 'POST', body: { reason },
  });

export const getAdminMicroFeedItems = async (status = '') =>
  (await request<{ items: MicroFeedItem[] }>(
    `/v1/admin/micro-feed/items?status=${encodeURIComponent(status)}`,
  )).items;

export const createMicroFeedItem = (body: MicroFeedItemDraft) =>
  request<MicroFeedItem>('/v1/admin/micro-feed/items', { method: 'POST', body });

export const updateMicroFeedItem = (id: string, body: MicroFeedItemDraft) =>
  request<MicroFeedItem>(`/v1/admin/micro-feed/items/${encodeURIComponent(id)}`, {
    method: 'PUT', body,
  });

export const publishMicroFeedItem = (id: string) =>
  request<MicroFeedItem>(`/v1/admin/micro-feed/items/${encodeURIComponent(id)}/publish`, {
    method: 'POST', timeoutMs: 60_000,
  });

export const archiveMicroFeedItem = (id: string) =>
  request<void>(`/v1/admin/micro-feed/items/${encodeURIComponent(id)}/archive`, { method: 'POST' });

export const deleteMicroFeedItem = (id: string) =>
  request<void>(`/v1/admin/micro-feed/items/${encodeURIComponent(id)}`, { method: 'DELETE' });
