import type { CourseBundle, Exercise } from './types';

export type TrainerDomain = 'grammar' | 'reading' | 'writing';

interface TrainerTopicSpec {
  id: string;
  domain: 'grammar';
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

const WRITING_TYPES = new Set<Exercise['type']>([
  'fill_blank',
  'sentence_builder',
  'letter_unscramble',
]);

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
 * Собирает три режима из одного источника. Грамматика получает все упражнения
 * связанного skill и короткую проверку понятия. Čitanje оставляет тексты с
 * вопросами, Pisanje — задания, где ответ действительно нужно набрать или
 * собрать, а не просто выбрать.
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
    const grammar = uniqueExercises([
      ...spec.supplementalExercises,
      ...courseExercises,
    ]);
    if (grammar.length > 0) {
      result.push({
        id: spec.id,
        domain: 'grammar',
        level: spec.level,
        title: spec.title,
        summary: spec.summary,
        roadmapItemId: spec.roadmapItemId,
        exercises: grammar,
      });
    }

    const reading = courseExercises.filter((exercise) => exercise.type === 'reading_qa');
    if (reading.length > 0) {
      result.push({
        id: `${spec.id}-reading`,
        domain: 'reading',
        level: spec.level,
        title: spec.title,
        summary: 'Текст на сербском с вопросами на понимание.',
        roadmapItemId: '',
        exercises: reading,
      });
    }

    const writing = courseExercises.filter((exercise) => WRITING_TYPES.has(exercise.type));
    if (writing.length > 0) {
      result.push({
        id: `${spec.id}-writing`,
        domain: 'writing',
        level: spec.level,
        title: spec.title,
        summary: 'Наберите форму или соберите сербское предложение.',
        roadmapItemId: '',
        exercises: writing,
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
