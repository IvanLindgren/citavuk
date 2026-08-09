import type { LessonExercise } from './lessons';
import { request } from './client';

/**
 * Дорожная карта сербского языка.
 *
 * Карта открыта всем: вопрос «что учить дальше» задают до регистрации. Отметки
 * и проценты появляются только у вошедшего, поэтому запросы карты помечены
 * anonymous — гость видит ту же карту, только без своего прогресса.
 */

export const ROADMAP_LEVELS = ['A1', 'A2', 'B1', 'B2', 'C1', 'C2'] as const;
export type RoadmapLevel = (typeof ROADMAP_LEVELS)[number];

export const ROADMAP_CATEGORIES = [
  'reading',
  'grammar',
  'vocabulary',
  'writing',
] as const;
export type RoadmapCategoryKey = (typeof ROADMAP_CATEGORIES)[number];

export interface RoadmapCategory {
  key: RoadmapCategoryKey;
  title: string;
  local: string;
  about: string;
  /** Раздел, которого ещё нет. В зачёт уровня не идёт. */
  planned?: boolean;
}

export interface RoadmapProgress {
  done: number;
  total: number;
  /** Доля 0..1. Считается на сервере: два независимых деления разошлись бы. */
  ratio: number;
  passed: boolean;
}

export interface RoadmapLevelView {
  level: RoadmapLevel;
  name: string;
  categories: Record<string, RoadmapProgress>;
  passed: boolean;
}

export interface RoadmapOverview {
  levels: RoadmapLevelView[];
  categories: RoadmapCategory[];
  /** Цель: к какому уровню человек идёт. Пусто — цель не выбрана. */
  target: string;
  /** Уровень аккаунта: где человек сейчас. Это не то же, что цель. */
  current: string;
  passingScore: number;
  signedIn: boolean;
}

export interface RoadmapItem {
  id: string;
  level: RoadmapLevel;
  category: RoadmapCategoryKey;
  kind: 'book' | 'link' | 'feed_card' | 'text' | 'grammar_topic' | 'lesson';
  title: string;
  summary: string;
  body?: string;
  payload: Record<string, unknown>;
  position: number;
  status: 'draft' | 'published';
  done: boolean;
  updatedAt: string;
}

export interface RoadmapExerciseSet {
  id: string;
  level: RoadmapLevel;
  category: RoadmapCategoryKey;
  itemId?: string;
  title: string;
  content: { exercises?: LessonExercise[] };
  position: number;
  status: 'draft' | 'published';
  done: boolean;
  score: number;
  updatedAt: string;
}

export interface RoadmapWord {
  id: string;
  level: RoadmapLevel;
  theme: string;
  lemma: string;
  translation: string;
  pos?: string;
  note?: string;
  example?: string;
  rank?: number;
  position: number;
  status: 'draft' | 'published';
  known: boolean;
}

export interface RoadmapSection {
  level: RoadmapLevel;
  category: RoadmapCategory;
  intro: string;
  items: RoadmapItem[];
  exercises: RoadmapExerciseSet[];
  words: RoadmapWord[];
  progress: RoadmapProgress;
}

export interface RoadmapComment {
  id: string;
  level: RoadmapLevel;
  parentId?: string;
  userId: string;
  author: string;
  body: string;
  createdAt: string;
  mine: boolean;
}

export function loadRoadmap(signal?: AbortSignal) {
  // Ручка открыта гостям, но вошедшему всё равно нужен Authorization: без
  // него сервер не знает ни выбранную цель, ни отметки о пройденном.
  return request<RoadmapOverview>('/v1/roadmap', { signal });
}

export function loadRoadmapSection(
  level: string,
  category: string,
  signal?: AbortSignal,
) {
  return request<RoadmapSection>(`/v1/roadmap/${level}/${category}`, {
    signal,
  }).then((section) => ({
    ...section,
    // Older deployments serialized untouched Go slices as null. Treat that as
    // an empty section so a cached response cannot take down the whole page.
    items: section.items ?? [],
    exercises: section.exercises ?? [],
    words: section.words ?? [],
  }));
}

/** Отмечает пункт, набор упражнений или слово. done: false снимает отметку. */
export function markRoadmapDone(
  kind: 'item' | 'exercise' | 'word',
  id: string,
  done: boolean,
  score = 1,
  source: 'manual' | 'trainer' = 'manual',
) {
  return request<{ done: boolean; score?: number }>('/v1/roadmap/progress', {
    method: 'POST',
    body: { kind, id, done, score, source },
  });
}

export function saveRoadmapTarget(level: string) {
  return request<{ target: string }>('/v1/roadmap/target', {
    method: 'PUT',
    body: { level },
  });
}

export function loadRoadmapComments(level: string, signal?: AbortSignal) {
  return request<{ comments: RoadmapComment[] }>(
    `/v1/roadmap/${level}/comments`,
    { signal },
  ).then((response) => response.comments);
}

export function addRoadmapComment(
  level: string,
  body: string,
  parentId?: string,
) {
  return request<RoadmapComment>(`/v1/roadmap/${level}/comments`, {
    method: 'POST',
    body: { body, parentId: parentId ?? '' },
  });
}

export function deleteRoadmapComment(id: string) {
  return request<void>(`/v1/roadmap/comments/${id}`, { method: 'DELETE' });
}

/**
 * Уровень взят целиком: по всем считаемым разделам не ниже порога.
 *
 * Планируемые разделы пропускаются — требовать 80% от Writing, которого ещё
 * нет, значило бы закрыть переход на всех уровнях сразу. Правило то же, что на
 * сервере (roadmap.LevelPassed); здесь оно нужно, чтобы не ждать ответа ради
 * уже известного.
 */
export function levelPassed(
  level: RoadmapLevelView,
  categories: RoadmapCategory[],
): boolean {
  const counted = categories.filter((category) => !category.planned);
  if (counted.length === 0) return false;
  return counted.every((category) => {
    const progress = level.categories[category.key];
    return Boolean(progress && progress.total > 0 && progress.passed);
  });
}

/** Следующая ступень. Пусто, если дальше некуда. */
export function nextLevel(level: string): string {
  const index = ROADMAP_LEVELS.indexOf(level as RoadmapLevel);
  if (index < 0 || index + 1 >= ROADMAP_LEVELS.length) return '';
  return ROADMAP_LEVELS[index + 1] ?? '';
}
