import type { CourseBundle, Exercise } from './types';

export type TrainerDomain = 'grammar' | 'reading' | 'writing';

interface TrainerTopicSpec {
  id: string;
  domain: TrainerDomain;
  level: string;
  title: string;
  summary: string;
  roadmapItemId: string;
  skillIds: string[];
  supplementalExercises: Exercise[];
}

interface TrainerCatalog {
  version: number;
  topics: TrainerTopicSpec[];
}

export interface TrainerTopic {
  id: string;
  domain: TrainerDomain;
  level: string;
  title: string;
  summary: string;
  roadmapItemId: string;
  exercises: Exercise[];
}

let catalogPromise: Promise<TrainerCatalog> | null = null;

export function loadTrainerCatalog(): Promise<TrainerCatalog> {
  if (catalogPromise) return catalogPromise;
  catalogPromise = fetch('/course/trainer_catalog.json')
    .then((response) => {
      if (!response.ok) throw new Error('Не удалось загрузить каталог Тренажёрки.');
      return response.json() as Promise<TrainerCatalog>;
    })
    .then((catalog) => {
      if (catalog.version !== 1 || !Array.isArray(catalog.topics)) {
        throw new Error('Каталог Тренажёрки повреждён.');
      }
      return catalog;
    })
    .catch((error) => {
      catalogPromise = null;
      throw error;
    });
  return catalogPromise;
}

/**
 * Каталог явно назначает каждому разделу собственные темы. Это принципиально:
 * тип упражнения не определяет учебную цель. Заполнение окончания в уроке о
 * падежах остаётся грамматикой, даже если в нём нужно что-то напечатать.
 */
export function buildTrainerTopics(
  bundle: CourseBundle,
  catalog: TrainerCatalog,
): TrainerTopic[] {
  const bySkill = new Map<string, Exercise[]>();
  for (const unit of bundle.units) {
    for (const skill of unit.skills) {
      bySkill.set(
        skill.id,
        skill.lessons.flatMap((lesson) => lesson.exercises),
      );
    }
  }

  const result: TrainerTopic[] = [];
  for (const spec of catalog.topics) {
    const courseExercises = uniqueExercises(
      spec.skillIds.flatMap((skillId) => bySkill.get(skillId) ?? []),
    );
    const exercises = uniqueExercises([
      ...spec.supplementalExercises,
      ...courseExercises,
    ]);
    if (exercises.length > 0) {
      result.push({
        id: spec.id,
        domain: spec.domain,
        level: spec.level,
        title: spec.title,
        summary: spec.summary,
        roadmapItemId: spec.roadmapItemId,
        exercises,
      });
    }
  }
  return result;
}

function uniqueExercises(exercises: Exercise[]): Exercise[] {
  const seen = new Set<string>();
  return exercises.filter((exercise) => {
    if (seen.has(exercise.id)) return false;
    seen.add(exercise.id);
    return true;
  });
}
