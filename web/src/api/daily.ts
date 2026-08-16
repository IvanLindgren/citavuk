import { request } from './client';

/**
 * «На каждый день»: десять слов, текст с ними и упражнения.
 *
 * Набор собирает сервер и хранит сутки. Клиент его не пересобирает: иначе
 * человек, заглянувший в окно дважды, получил бы два разных набора и не смог бы
 * доучить начатое.
 */

export interface DailyWord {
  lemma: string;
  translation: string;
  pos?: string;
  note?: string;
  theme: string;
  example?: string;
  exampleTranslation?: string;
}

export interface DailyExercise {
  kind: 'choice' | 'fill' | 'translate';
  question: string;
  options?: string[];
  answer: string;
  hint?: string;
}

export interface DailyLesson {
  title: string;
  text: string;
  exercises: DailyExercise[];
}

export interface DailySet {
  id: string;
  day: string;
  level: string;
  words: DailyWord[];
  lesson?: DailyLesson;
  learned: string[];
}

export interface FadedWord {
  word: string;
  translation: string;
  overdueDays: number;
}

export interface DailyProgress {
  reviewedToday: number;
  dueNow: number;
  words: number;
  strong: number;
  faded: FadedWord[];
  streak: number;
}

export interface DailyTheme {
  theme: string;
  words: number;
}

export interface DailyState {
  set: DailySet | null;
  level: string;
  themes: string[];
  enabled: boolean;
  /** Окно уже настроено: пустой список тем при этом значит «всё подряд». */
  configured: boolean;
  progress: DailyProgress;
  lessonReady: boolean;
  /** Модель доступна: без неё окно показывает только слова. */
  canCompose: boolean;
}

export interface DailySettings {
  themes: string[];
  enabled: boolean;
  level: string;
  configured: boolean;
  available: DailyTheme[];
}

export function loadDaily(): Promise<DailyState> {
  return request<DailyState>('/v1/daily');
}

export function loadDailySettings(): Promise<DailySettings> {
  return request<DailySettings>('/v1/daily/settings');
}

export function saveDailySettings(settings: {
  themes: string[];
  enabled: boolean;
  level?: string;
}): Promise<{ themes: string[]; enabled: boolean }> {
  return request('/v1/daily/settings', { method: 'PUT', body: settings });
}

/** Текст пишет модель, поэтому ждём дольше обычного запроса. */
export function composeDailyLesson(): Promise<{ lesson: DailyLesson }> {
  return request('/v1/daily/lesson', { method: 'POST', timeoutMs: 75_000 });
}

export function markDailyLearned(lemma: string): Promise<{ learned: string[] }> {
  return request('/v1/daily/learn', { method: 'POST', body: { lemma } });
}

export function loadDailyProgress(): Promise<{
  progress: DailyProgress;
  set: DailySet | null;
}> {
  return request('/v1/daily/progress');
}
