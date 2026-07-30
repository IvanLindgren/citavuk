import type {
  CourseBundle,
  CourseLesson,
  CourseProgress,
  Exercise,
  Evaluation,
  WordTile,
} from './types';
import {
  getRemoteCourseProgress,
  getPublishedCourse,
  putRemoteCourseProgress,
} from '../api/course';

const PROGRESS_KEY = 'citavuk-course-progress-v1';
const DEFAULT_COURSE_ID = 'sr_grammar_prosvirina';
let bundlePromise: Promise<CourseBundle> | null = null;

export function loadCourse(): Promise<CourseBundle> {
  if (bundlePromise) return bundlePromise;

  const bundled = loadBundledCourse();
  const loading = getPublishedCourse(DEFAULT_COURSE_ID)
    .then((bundle) => bundle ?? bundled)
    .catch(() => bundled)
    .then((bundle) => {
      if (!bundle.courseId || !Array.isArray(bundle.units)) {
        throw new Error('Файл курса повреждён.');
      }
      return bundle;
    });

  bundlePromise = loading.catch((error) => {
    bundlePromise = null;
    throw error;
  });
  return bundlePromise;
}

async function loadBundledCourse(): Promise<CourseBundle> {
  const response = await fetch('/course/course_bundle.json');
  if (!response.ok) throw new Error('Не удалось загрузить курс.');
  return (await response.json()) as CourseBundle;
}

export function findLesson(
  bundle: CourseBundle,
  lessonId: string,
): CourseLesson | null {
  for (const unit of bundle.units) {
    for (const skill of unit.skills) {
      const lesson = skill.lessons.find((item) => item.id === lessonId);
      if (lesson) return lesson;
    }
  }
  return null;
}

interface StoredProgress {
  payload: CourseProgress;
  updatedAt: number;
}

export function emptyProgress(bundle: CourseBundle): CourseProgress {
  return {
    courseId: bundle.courseId,
    courseVersion: bundle.courseVersion,
    lessons: {},
    mastery: {},
    xp: 0,
    streak: {
      currentDays: 0,
      longestDays: 0,
      lastStudyDate: null,
    },
    activeLesson: null,
  };
}

export function loadProgress(bundle: CourseBundle): CourseProgress {
  return loadStoredProgress(bundle).payload;
}

function loadStoredProgress(bundle: CourseBundle): StoredProgress {
  try {
    const parsed = JSON.parse(localStorage.getItem(PROGRESS_KEY) ?? '') as
      | StoredProgress
      | CourseProgress
      | Record<string, unknown>;
    if (!parsed || typeof parsed !== 'object') {
      return { payload: emptyProgress(bundle), updatedAt: 0 };
    }
    const envelope =
      'payload' in parsed && parsed.payload
        ? (parsed as StoredProgress)
        : migrateLegacyProgress(parsed as unknown as Record<string, unknown>, bundle);
    const progress = envelope.payload;
    if (progress.courseId !== bundle.courseId) {
      return { payload: emptyProgress(bundle), updatedAt: 0 };
    }

    const validLessons = new Set(
      bundle.units.flatMap((unit) =>
        unit.skills.flatMap((skill) => skill.lessons.map((lesson) => lesson.id)),
      ),
    );
    const lessons = Object.fromEntries(
      Object.entries(progress.lessons ?? {})
        .filter(([id]) => validLessons.has(id))
        .map(([id, lesson]) => [
          id,
          normalizeLessonProgress(lesson, bundle.config.passThreshold),
        ]),
    );
    return {
      updatedAt: envelope.updatedAt || 0,
      payload: {
        ...emptyProgress(bundle),
        ...progress,
        courseVersion: bundle.courseVersion,
        lessons,
      },
    };
  } catch {
    return { payload: emptyProgress(bundle), updatedAt: 0 };
  }
}

export function saveLessonProgress(
  bundle: CourseBundle,
  lessonId: string,
  score: number,
): CourseProgress {
  const progress = loadProgress(bundle);
  const previous = progress.lessons[lessonId];
  const passed = score >= bundle.config.passThreshold;
  const wasCompleted = isLessonDone(previous);
  const today = new Date().toISOString().slice(0, 10);
  const yesterday = new Date(Date.now() - 86_400_000).toISOString().slice(0, 10);

  let streak = progress.streak;
  if (progress.streak.lastStudyDate !== today) {
    const currentDays =
      progress.streak.lastStudyDate === yesterday
        ? Math.max(1, progress.streak.currentDays + 1)
        : 1;
    streak = {
      currentDays,
      longestDays: Math.max(progress.streak.longestDays, currentDays),
      lastStudyDate: today,
    };
  }

  const gainedXp = Math.max(5, Math.round(score * 20));
  const next: CourseProgress = {
    ...progress,
    xp: progress.xp + gainedXp,
    streak,
    lessons: {
      ...progress.lessons,
      [lessonId]: {
        lessonId,
        status: wasCompleted
          ? previous!.status
          : passed
            ? 'completed'
            : 'available',
        bestScore: Math.max(previous?.bestScore ?? 0, score),
        attemptsCount: (previous?.attemptsCount ?? 0) + 1,
        completedAt:
          previous?.completedAt ?? (passed ? new Date().toISOString() : null),
      },
    },
  };
  storeProgress(next, Date.now());
  window.dispatchEvent(new CustomEvent('citavuk-course-progress'));
  return next;
}

export function lessonUnlocked(
  lesson: CourseLesson,
  progress: CourseProgress,
): boolean {
  return lesson.prerequisites.every((id) => {
    const prerequisite = progress.lessons[id];
    return isLessonDone(prerequisite) && (prerequisite?.bestScore ?? 0) >= 0.6;
  });
}

function isLessonDone(
  progress: CourseProgress['lessons'][string] | undefined,
): boolean {
  return (
    progress?.status === 'completed' ||
    progress?.status === 'mastered' ||
    progress?.status === 'needsReview'
  );
}

function storeProgress(progress: CourseProgress, updatedAt: number): void {
  localStorage.setItem(
    PROGRESS_KEY,
    JSON.stringify({ payload: progress, updatedAt } satisfies StoredProgress),
  );
}

function migrateLegacyProgress(
  raw: Record<string, unknown>,
  bundle: CourseBundle,
): StoredProgress {
  const legacyLessons = (raw.lessons ?? {}) as Record<
    string,
    {
      completed?: boolean;
      bestScore?: number;
      attempts?: number;
      updatedAt?: number;
    }
  >;
  const lessons = Object.fromEntries(
    Object.entries(legacyLessons).map(([id, value]) => [
      id,
      {
        lessonId: id,
        status: value.completed ? 'completed' : 'available',
        bestScore: value.bestScore ?? 0,
        attemptsCount: value.attempts ?? 0,
        completedAt: value.updatedAt
          ? new Date(value.updatedAt).toISOString()
          : null,
      },
    ]),
  ) as CourseProgress['lessons'];
  const streakValue = typeof raw.streak === 'number' ? raw.streak : 0;
  const payload: CourseProgress = {
    ...emptyProgress(bundle),
    lessons,
    xp: typeof raw.xp === 'number' ? raw.xp : 0,
    streak: {
      currentDays: streakValue,
      longestDays: streakValue,
      lastStudyDate:
        typeof raw.lastStudyDay === 'string' && raw.lastStudyDay
          ? raw.lastStudyDay
          : null,
    },
  };
  const updatedAt = Math.max(
    0,
    ...Object.values(legacyLessons).map((lesson) => lesson.updatedAt ?? 0),
  );
  return { payload, updatedAt };
}

/** Забирает прогресс другого клиента, сливает по урокам и сохраняет общий. */
export async function syncCourseProgress(
  bundle: CourseBundle,
): Promise<CourseProgress> {
  const local = loadStoredProgress(bundle);
  const remote = await getRemoteCourseProgress(bundle.courseId);
  if (!remote) {
    if (Object.keys(local.payload.lessons).length > 0) {
      await putRemoteCourseProgress(
        bundle.courseId,
        local.payload,
        local.updatedAt || Date.now(),
      );
    }
    return local.payload;
  }

  const merged = mergeProgress(local.payload, remote.payload, bundle);
  const remoteAt = Date.parse(remote.updatedAt) || 0;
  const changed = JSON.stringify(merged) !== JSON.stringify(remote.payload);
  const updatedAt = changed ? Date.now() : Math.max(local.updatedAt, remoteAt);
  storeProgress(merged, updatedAt);
  if (changed) {
    await putRemoteCourseProgress(bundle.courseId, merged, updatedAt);
  }
  window.dispatchEvent(new CustomEvent('citavuk-course-progress'));
  return merged;
}

export async function uploadCourseProgress(
  bundle: CourseBundle,
  progress: CourseProgress,
): Promise<void> {
  const updatedAt = Date.now();
  storeProgress(progress, updatedAt);
  await putRemoteCourseProgress(bundle.courseId, progress, updatedAt);
}

function mergeProgress(
  local: CourseProgress,
  remote: CourseProgress,
  bundle: CourseBundle,
): CourseProgress {
  const lessons = { ...(remote.lessons ?? {}) };
  for (const [id, candidate] of Object.entries(local.lessons ?? {})) {
    const current = lessons[id];
    if (!current) {
      lessons[id] = candidate;
      continue;
    }
    const candidateAt = Date.parse(candidate.completedAt ?? '') || 0;
    const currentAt = Date.parse(current.completedAt ?? '') || 0;
    const newest = candidateAt >= currentAt ? candidate : current;
    const bestScore = Math.max(candidate.bestScore, current.bestScore);
    lessons[id] = {
      ...newest,
      bestScore,
      attemptsCount: Math.max(candidate.attemptsCount, current.attemptsCount),
      status: bestScore >= bundle.config.passThreshold
        ? newest.status === 'mastered' || current.status === 'mastered'
          ? 'mastered'
          : 'completed'
        : 'available',
    };
  }
  const normalizedLessons = Object.fromEntries(
    Object.entries(lessons).map(([id, lesson]) => [
      id,
      normalizeLessonProgress(lesson, bundle.config.passThreshold),
    ]),
  );
  const localStudy = local.streak?.lastStudyDate ?? '';
  const remoteStudy = remote.streak?.lastStudyDate ?? '';
  const streak = localStudy >= remoteStudy ? local.streak : remote.streak;
  return {
    ...emptyProgress(bundle),
    ...remote,
    courseVersion: bundle.courseVersion,
    lessons: normalizedLessons,
    mastery: { ...(remote.mastery ?? {}), ...(local.mastery ?? {}) },
    xp: Math.max(local.xp ?? 0, remote.xp ?? 0),
    streak: {
      ...streak,
      longestDays: Math.max(
        local.streak?.longestDays ?? 0,
        remote.streak?.longestDays ?? 0,
      ),
    },
    activeLesson: local.activeLesson ?? remote.activeLesson ?? null,
  };
}

function normalizeLessonProgress(
  lesson: CourseProgress['lessons'][string],
  threshold: number,
): CourseProgress['lessons'][string] {
  if (lesson.bestScore >= threshold) {
    return {
      ...lesson,
      status:
        lesson.status === 'mastered' || lesson.status === 'needsReview'
          ? lesson.status
          : 'completed',
    };
  }
  return {
    ...lesson,
    status: lesson.status === 'locked' ? 'locked' : 'available',
    completedAt: null,
  };
}

export function normalizeAnswer(
  input: string,
  caseSensitive = false,
): string {
  let value = input
    .normalize('NFC')
    .replace(/[‘’]/g, "'")
    .replace(/[“”«»]/g, '"')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/[.!?]+$/u, '')
    .trimEnd();
  if (!caseSensitive) value = value.toLocaleLowerCase('sr');
  return value;
}

export function splitLetters(input: string, digraphsAsUnits = false): string[] {
  const letters = Array.from(input.normalize('NFC'));
  if (!digraphsAsUnits) return letters;
  const result: string[] = [];
  for (let index = 0; index < letters.length; index++) {
    const pair = `${letters[index] ?? ''}${letters[index + 1] ?? ''}`.toLowerCase();
    if (pair === 'lj' || pair === 'nj' || pair === 'dž') {
      result.push(`${letters[index]}${letters[index + 1]}`);
      index++;
    } else {
      result.push(letters[index]!);
    }
  }
  return result;
}

function joinWords(words: string[]): string {
  return words.reduce(
    (out, word) =>
      out + (out && !/^[.,!?;:]$/u.test(word) ? ' ' : '') + word,
    '',
  );
}

export type ExerciseDraft =
  | { kind: 'choice'; ids: string[] }
  | { kind: 'order'; ids: string[] }
  | { kind: 'text'; value: string }
  | { kind: 'pairs'; values: Record<string, string> }
  | { kind: 'blanks'; values: Record<string, string> };

/** Проверка доступна только после заполнения всех обязательных частей ответа. */
export function canEvaluate(
  exercise: Exercise,
  draft: ExerciseDraft,
): boolean {
  switch (exercise.type) {
    case 'multiple_choice':
    case 'ending_picker':
      return draft.kind === 'choice' && draft.ids.length > 0;
    case 'sentence_builder':
      return draft.kind === 'order' && draft.ids.length > 0;
    case 'letter_unscramble':
      return draft.kind === 'text' && draft.value.trim().length > 0;
    case 'matching':
      return (
        draft.kind === 'pairs' &&
        exercise.pairs.length > 0 &&
        exercise.pairs.every(
          (pair) => (draft.values[pair.left] ?? '').trim().length > 0,
        )
      );
    case 'fill_blank':
      return (
        draft.kind === 'blanks' &&
        exercise.blanks.length > 0 &&
        exercise.blanks.every(
          (blank) => (draft.values[blank.id] ?? '').trim().length > 0,
        )
      );
    case 'image_description':
      return exercise.mode === 'choose'
        ? draft.kind === 'choice' && draft.ids.length > 0
        : draft.kind === 'text' && draft.value.trim().length > 0;
    case 'reading_qa':
      // Все вопросы, а не первый: иначе «Проверить» откроется на половине.
      return (
        draft.kind === 'pairs' &&
        exercise.questions.length > 0 &&
        exercise.questions.every((question) => draft.values[question.id])
      );
    case 'form_hunt':
      return draft.kind === 'choice' && draft.ids.length > 0;
  }
}

/**
 * Перемешивает упражнения для новой попытки, но не ставит сложный материал
 * раньше вводного: уровни difficulty идут по возрастанию, порядок внутри
 * каждого уровня меняется.
 */
export function randomizeExercises(
  exercises: Exercise[],
  random: () => number = Math.random,
): Exercise[] {
  const groups = new Map<number, Exercise[]>();
  for (const exercise of exercises) {
    const group = groups.get(exercise.difficulty) ?? [];
    group.push(exercise);
    groups.set(exercise.difficulty, group);
  }

  return [...groups.keys()]
    .sort((left, right) => left - right)
    .flatMap((difficulty) => shuffle(groups.get(difficulty) ?? [], random));
}

function shuffle<T>(items: T[], random: () => number): T[] {
  const result = [...items];
  for (let index = result.length - 1; index > 0; index--) {
    const target = Math.floor(random() * (index + 1));
    [result[index], result[target]] = [result[target]!, result[index]!];
  }
  return result;
}

export function evaluate(exercise: Exercise, draft: ExerciseDraft): Evaluation {
  const explanation = exercise.explanation;
  switch (exercise.type) {
    case 'multiple_choice':
    case 'ending_picker': {
      if (draft.kind !== 'choice') throw new Error('Неверный тип ответа.');
      const correct = exercise.options.filter((option) => option.correct);
      const correctIds = new Set(correct.map((option) => option.id));
      const isCorrect =
        draft.ids.length === correctIds.size &&
        draft.ids.every((id) => correctIds.has(id));
      const labels = (ids: string[]) =>
        exercise.options
          .filter((option) => ids.includes(option.id))
          .map((option) => option.text)
          .join(', ');
      return {
        correct: isCorrect,
        userDisplay:
          exercise.type === 'ending_picker'
            ? `${exercise.stem}${labels(draft.ids)}`
            : labels(draft.ids),
        correctDisplay:
          exercise.type === 'ending_picker'
            ? exercise.fullForm
            : correct.map((option) => option.text).join(', '),
        explanation,
      };
    }
    case 'sentence_builder': {
      if (draft.kind !== 'order') throw new Error('Неверный тип ответа.');
      const optional = new Set(exercise.optionalTokenIds);
      const correct = exercise.acceptedOrders.some((order) => {
        let given = 0;
        for (const expected of order) {
          if (draft.ids[given] === expected) given++;
          else if (!optional.has(expected)) return false;
        }
        return given === draft.ids.length;
      });
      const tiles = new Map(
        [...exercise.tokens, ...exercise.distractorTokens].map((tile) => [
          tile.id,
          tile.text,
        ]),
      );
      const render = (ids: string[]) =>
        joinWords(ids.map((id) => tiles.get(id) ?? '?'));
      return {
        correct,
        userDisplay: render(draft.ids),
        correctDisplay: render(exercise.acceptedOrders[0] ?? []),
        explanation,
      };
    }
    case 'letter_unscramble': {
      if (draft.kind !== 'text') throw new Error('Неверный тип ответа.');
      return {
        correct: normalizeAnswer(draft.value) === normalizeAnswer(exercise.answer),
        userDisplay: draft.value,
        correctDisplay: exercise.answer,
        explanation,
      };
    }
    case 'matching': {
      if (draft.kind !== 'pairs') throw new Error('Неверный тип ответа.');
      const correct = exercise.pairs.every(
        (pair) =>
          normalizeAnswer(draft.values[pair.left] ?? '') ===
          normalizeAnswer(pair.right),
      );
      const render = (right: (left: string, expected: string) => string) =>
        exercise.pairs
          .map((pair) => `${pair.left} → ${right(pair.left, pair.right)}`)
          .join('; ');
      return {
        correct,
        userDisplay: render((left) => draft.values[left] ?? '—'),
        correctDisplay: render((_, expected) => expected),
        explanation,
      };
    }
    case 'fill_blank': {
      if (draft.kind !== 'blanks') throw new Error('Неверный тип ответа.');
      const correct = exercise.blanks.every((blank) =>
        blank.acceptedAnswers.some(
          (accepted) =>
            normalizeAnswer(accepted, blank.caseSensitive) ===
            normalizeAnswer(draft.values[blank.id] ?? '', blank.caseSensitive),
        ),
      );
      return {
        correct,
        userDisplay: exercise.blanks
          .map((blank) => draft.values[blank.id] || '—')
          .join(' / '),
        correctDisplay: exercise.blanks
          .map((blank) => blank.acceptedAnswers[0] ?? '')
          .join(' / '),
        explanation,
      };
    }
    case 'image_description': {
      if (exercise.mode === 'choose') {
        if (draft.kind !== 'choice') throw new Error('Неверный тип ответа.');
        const options = exercise.options ?? [];
        const selected = options.find((option) => draft.ids.includes(option.id));
        const correct = options.find((option) => option.correct);
        return {
          correct: selected?.correct === true,
          userDisplay: selected?.text ?? '',
          correctDisplay: correct?.text ?? '',
          explanation,
        };
      }
      if (draft.kind !== 'text') throw new Error('Неверный тип ответа.');
      const accepted = exercise.acceptedAnswers ?? [];
      return {
        correct: accepted.some(
          (answer) => normalizeAnswer(answer) === normalizeAnswer(draft.value),
        ),
        userDisplay: draft.value,
        correctDisplay: accepted[0] ?? '',
        explanation,
      };
    }
    case 'reading_qa': {
      if (draft.kind !== 'pairs') throw new Error('Неверный тип ответа.');
      // Задание засчитывается целиком: половина верных ответов о тексте это
      // не половина понимания, а угаданное место.
      const given: string[] = [];
      const expected: string[] = [];
      let isCorrect = true;
      for (const question of exercise.questions) {
        const chosen = question.options.find(
          (option) => option.id === draft.values[question.id],
        );
        const right = question.options.find((option) => option.correct);
        if (!chosen?.correct) isCorrect = false;
        given.push(chosen?.text ?? '—');
        expected.push(right?.text ?? '');
      }
      return {
        correct: isCorrect,
        userDisplay: given.join('; '),
        correctDisplay: expected.join('; '),
        explanation,
      };
    }
    case 'form_hunt': {
      if (draft.kind !== 'choice') throw new Error('Неверный тип ответа.');
      const target = exercise.tokens.filter((token) => token.correct);
      const targetIds = new Set(target.map((token) => token.id));
      const label = (ids: string[]) =>
        exercise.tokens
          .filter((token) => ids.includes(token.id))
          .map((token) => token.text)
          .join(', ');
      return {
        correct:
          draft.ids.length === targetIds.size &&
          draft.ids.every((id) => targetIds.has(id)),
        userDisplay: draft.ids.length === 0 ? '—' : label(draft.ids),
        correctDisplay: target.map((token) => token.text).join(', '),
        explanation,
      };
    }
  }
}

export function allTiles(exercise: SentenceBuilderExerciseLike): WordTile[] {
  return [...exercise.tokens, ...exercise.distractorTokens];
}

type SentenceBuilderExerciseLike = {
  tokens: WordTile[];
  distractorTokens: WordTile[];
};
