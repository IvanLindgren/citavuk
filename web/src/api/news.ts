import { API_BASE, request } from './client';

/** Газета «Вести»: номер, заметка целиком и ролики сербских каналов. */

export interface NewsVideo {
  youtube?: string;
  file?: string;
}

export interface NewsStory {
  id: string;
  title: string;
  summary: string;
  link: string;
  source: string;
  image?: string;
  video?: NewsVideo;
  published?: string;
}

export interface NewsPage {
  code: string;
  title: string;
  stories: NewsStory[];
}

export interface NewsIssue {
  printedAt: string;
  nextIssue: string;
  sections: NewsPage[];
  sources: string[];
}

export interface NewsBlock {
  kind: 'p' | 'h' | 'img' | 'youtube' | 'video';
  text?: string;
  image?: string;
  youtube?: string;
  file?: string;
}

export interface NewsArticle {
  link: string;
  title: string;
  source: string;
  image?: string;
  published?: string;
  blocks: NewsBlock[];
}

export interface VideoInterest {
  code: string;
  title: string;
  channels: string[];
}

export interface VideoPick {
  id: string;
  title: string;
  channel: string;
  interest: string;
  published: string;
  short?: boolean;
}

export function getNewsIssue(fresh = false, signal?: AbortSignal): Promise<NewsIssue> {
  return request<NewsIssue>(`/v1/news${fresh ? '?fresh=1' : ''}`, { anonymous: true, signal, timeoutMs: 60_000 });
}

export function getNewsArticle(link: string, signal?: AbortSignal): Promise<NewsArticle> {
  return request<NewsArticle>(`/v1/news/article?url=${encodeURIComponent(link)}`, { anonymous: true, signal, timeoutMs: 40_000 });
}

export function getVideoPicks(interests: string[], signal?: AbortSignal): Promise<{ interests: VideoInterest[]; videos: VideoPick[] }> {
  const query = interests.length ? `?interests=${encodeURIComponent(interests.join(','))}` : '';
  return request(`/v1/videos/picks${query}`, { anonymous: true, signal, timeoutMs: 40_000 });
}

/** Картинка заметки через наш сервер: издание не узнаёт, кто открыл газету. */
export function newsImageUrl(id: string): string {
  return `${API_BASE}/v1/news/image/${encodeURIComponent(id)}`;
}

export function videoThumbUrl(id: string): string {
  return `${API_BASE}/v1/videos/thumb/${encodeURIComponent(id)}`;
}
