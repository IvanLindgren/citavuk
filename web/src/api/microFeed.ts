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
  category: 'history' | 'culture' | 'science' | 'fiction' | 'society' | 'news';
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

const VISITOR_KEY = 'citavuk-micro-feed-visitor';

export function microFeedVisitorId(): string {
  const saved = localStorage.getItem(VISITOR_KEY);
  if (saved && /^[0-9a-f-]{36}$/i.test(saved)) return saved;
  const id = typeof crypto.randomUUID === 'function'
    ? crypto.randomUUID()
    : fallbackUUID();
  localStorage.setItem(VISITOR_KEY, id);
  return id;
}

function fallbackUUID(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(16));
  bytes[6] = (bytes[6]! & 0x0f) | 0x40;
  bytes[8] = (bytes[8]! & 0x3f) | 0x80;
  const hex = Array.from(bytes, (value) => value.toString(16).padStart(2, '0')).join('');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

export async function getMicroFeed(exclude: string[], signal?: AbortSignal) {
  const query = new URLSearchParams({ visitorId: microFeedVisitorId(), limit: '8' });
  if (exclude.length > 0) query.set('exclude', exclude.slice(-80).join(','));
  return request<{ items: MicroFeedItem[]; strategy: 'cold' | 'personalized' }>(
    `/v1/micro-feed?${query}`,
    { signal },
  );
}

export function recordMicroFeedInteraction(
  itemId: string,
  event: 'view' | 'like' | 'dislike' | 'reaction_cleared' | 'read_more_clicked' | 'quick_skip' | 'complete' | 'audio_play',
  dwellMs = 0,
) {
  return request<void>(`/v1/micro-feed/${encodeURIComponent(itemId)}/interactions`, {
    method: 'POST',
    body: { visitorId: microFeedVisitorId(), event, dwellMs: Math.max(0, Math.round(dwellMs)) },
  });
}

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
