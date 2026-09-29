import { request } from './client';
import type { Study } from './personal';

export interface SpeakingAccess {
  open: boolean;
  publicFrom: string;
  supporter: boolean;
  signedIn: boolean;
  reviewEnabled: boolean;
}

export interface SpeakingGenre {
  id: string;
  icon: string;
  ru: string;
  sr: string;
}

export interface SpeakingWord {
  sr: string;
  ru: string;
}

export interface SpeakingTopic {
  id: string;
  genre: string;
  sr: string;
  ru: string;
  words: SpeakingWord[];
}

export interface SpeakingCatalog {
  genres: SpeakingGenre[];
  topics: SpeakingTopic[];
}

export interface SpeakingMistake {
  original: string;
  fixed: string;
  kind: string;
  label: string;
  explanation: string;
}

export interface SpeakingReview {
  level: string;
  onTopic: boolean;
  summary: string;
  strengths: string[];
  mistakes: SpeakingMistake[];
  polished: string;
  tips: string[];
  words: SpeakingWord[];
}

export type SpeakingSource = 'text' | 'voice';

/** Сервер требует не меньше пяти слов и не больше четырёх тысяч знаков. */
export const SPEAKING_MIN_WORDS = 5;
export const SPEAKING_MAX_CHARS = 4000;

export function getSpeakingAccess(): Promise<SpeakingAccess> {
  return request<SpeakingAccess>('/v1/games/speaking/access');
}

export function getSpeakingTopics(): Promise<SpeakingCatalog> {
  return request<SpeakingCatalog>('/v1/games/speaking/topics');
}

export function reviewSpeaking(input: {
  sessionId: string;
  topicId: string;
  text: string;
  source: SpeakingSource;
}): Promise<{ text: string; review: SpeakingReview; study?: Study | null }> {
  // Модель думает до полутора минут вместе с повторами.
  return request('/v1/games/speaking/review', { method: 'POST', body: input, timeoutMs: 100_000 });
}
