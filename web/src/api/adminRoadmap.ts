import { request } from './client';
import type {
  RoadmapExerciseSet,
  RoadmapItem,
  RoadmapWord,
} from './roadmap';

/**
 * Правка дорожной карты.
 *
 * Наполнение живёт в базе именно ради этих запросов: автор добавляет текст или
 * упражнение прямо на сайте, без выкатки. Черновики видны только здесь — на
 * самой карте показывается и считается в проценте только опубликованное.
 */

export interface AdminRoadmapSection {
  level: string;
  category: string;
  intro: string;
  items: RoadmapItem[];
  exercises: RoadmapExerciseSet[];
  words: RoadmapWord[];
}

export function loadAdminRoadmapSection(level: string, category: string) {
  return request<AdminRoadmapSection>(`/v1/admin/roadmap/${level}/${category}`);
}

export function saveAdminRoadmapIntro(
  level: string,
  category: string,
  intro: string,
) {
  return request<{ saved: boolean }>(
    `/v1/admin/roadmap/${level}/${category}/intro`,
    { method: 'PUT', body: { intro } },
  );
}

export type RoadmapItemDraft = Omit<Partial<RoadmapItem>, 'level' | 'category'> & {
  level: string;
  category: string;
  kind: RoadmapItem['kind'];
  title: string;
};

export function saveAdminRoadmapItem(item: RoadmapItemDraft) {
  return request<RoadmapItem>('/v1/admin/roadmap/items', {
    method: 'POST',
    body: item,
  });
}

export function deleteAdminRoadmapItem(id: string) {
  return request<void>(`/v1/admin/roadmap/items/${id}`, { method: 'DELETE' });
}

export type RoadmapExerciseDraft = Omit<
  Partial<RoadmapExerciseSet>,
  'level' | 'category'
> & {
  level: string;
  category: string;
  title: string;
};

export function saveAdminRoadmapExercise(set: RoadmapExerciseDraft) {
  return request<RoadmapExerciseSet>('/v1/admin/roadmap/exercises', {
    method: 'POST',
    body: set,
  });
}

export function deleteAdminRoadmapExercise(id: string) {
  return request<void>(`/v1/admin/roadmap/exercises/${id}`, {
    method: 'DELETE',
  });
}

export type RoadmapWordDraft = Omit<Partial<RoadmapWord>, 'level'> & {
  level: string;
  theme: string;
  lemma: string;
};

export function saveAdminRoadmapWord(word: RoadmapWordDraft) {
  return request<RoadmapWord>('/v1/admin/roadmap/words', {
    method: 'POST',
    body: word,
  });
}

export function deleteAdminRoadmapWord(id: string) {
  return request<void>(`/v1/admin/roadmap/words/${id}`, { method: 'DELETE' });
}

/** Открывает читателям весь черновой словарь уровня разом. */
export function publishAdminRoadmapWords(level: string) {
  return request<{ published: number }>(
    `/v1/admin/roadmap/words/${level}/publish`,
    { method: 'POST' },
  );
}
