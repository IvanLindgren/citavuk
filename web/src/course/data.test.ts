import { beforeEach, describe, expect, it } from 'vitest';

import {
  canEvaluate,
  evaluate,
  normalizeAnswer,
  randomizeExercises,
  saveDialogueProgress,
  saveLessonProgress,
  splitLetters,
} from './data';
import type {
  CourseBundle,
  ListeningQaExercise,
  MatchingExercise,
  MultipleChoiceExercise,
  SentenceBuilderExercise,
} from './types';

beforeEach(() => localStorage.clear());

describe('course answer rules', () => {
  it('keeps č and ć distinct while normalizing decomposed Serbian letters', () => {
    expect(normalizeAnswer(' C\u030Caj! ')).toBe('čaj');
    expect(normalizeAnswer('čaj')).not.toBe(normalizeAnswer('ćaj'));
  });

  // Понимание на слух проверяется как чтение — целиком, а не по вопросам:
  // половина верных ответов о записи это не половина понимания.
  it('listening_qa is scored as a whole and only when every question is answered', () => {
    const exercise = {
      type: 'listening_qa',
      id: 'l1',
      unitId: 'u',
      skillId: 's',
      lessonId: 'l',
      learningObjectiveIds: [],
      difficulty: 1,
      prompt: 'Послушайте и ответьте',
      explanation: 'Разбор.',
      transcript: 'Voz polazi u osam sati.',
      translation: 'Поезд отходит в восемь.',
      plays: 2,
      questions: [
        {
          id: 'q1',
          prompt: 'Когда отходит поезд?',
          options: [
            { id: 'a', text: 'В восемь', correct: true },
            { id: 'b', text: 'В девять', correct: false },
          ],
        },
        {
          id: 'q2',
          prompt: 'О чём речь?',
          options: [
            { id: 'c', text: 'О поезде', correct: true },
            { id: 'd', text: 'Об автобусе', correct: false },
          ],
        },
      ],
    } as ListeningQaExercise;

    expect(canEvaluate(exercise, { kind: 'pairs', values: { q1: 'a' } })).toBe(false);
    expect(
      canEvaluate(exercise, { kind: 'pairs', values: { q1: 'a', q2: 'c' } }),
    ).toBe(true);

    expect(evaluate(exercise, { kind: 'pairs', values: { q1: 'a', q2: 'c' } }).correct).toBe(true);
    expect(evaluate(exercise, { kind: 'pairs', values: { q1: 'a', q2: 'd' } }).correct).toBe(false);
  });

  it('treats lj as one tile only when the exercise asks for it', () => {
    expect(splitLetters('ljubav', true)[0]).toBe('lj');
    expect(splitLetters('ljubav', false).slice(0, 2)).toEqual(['l', 'j']);
  });

  it('checks sentence order rather than the set of selected words', () => {
    const exercise = {
      type: 'sentence_builder',
      id: 'x',
      unitId: 'u',
      skillId: 's',
      lessonId: 'l',
      learningObjectiveIds: [],
      difficulty: 1,
      prompt: '',
      explanation: '',
      hint: null,
      tokens: [
        { id: 'a', text: 'Ja' },
        { id: 'b', text: 'čitam' },
      ],
      distractorTokens: [],
      acceptedOrders: [['a', 'b']],
      optionalTokenIds: [],
    } satisfies SentenceBuilderExercise;

    expect(evaluate(exercise, { kind: 'order', ids: ['a', 'b'] }).correct).toBe(true);
    expect(evaluate(exercise, { kind: 'order', ids: ['b', 'a'] }).correct).toBe(false);
  });

  it('requires every matching row before enabling check', () => {
    const exercise = matchingExercise();
    expect(
      canEvaluate(exercise, {
        kind: 'pairs',
        values: { а: 'a', б: 'b' },
      }),
    ).toBe(false);
    expect(
      canEvaluate(exercise, {
        kind: 'pairs',
        values: { а: 'a', б: 'b', в: 'v' },
      }),
    ).toBe(true);
  });

  it('randomizes exercises inside each difficulty stage', () => {
    const exercises = [
      choiceExercise('easy-a', 1),
      choiceExercise('easy-b', 1),
      choiceExercise('hard-a', 2),
      choiceExercise('hard-b', 2),
    ];

    expect(randomizeExercises(exercises, () => 0).map((item) => item.id)).toEqual([
      'easy-b',
      'easy-a',
      'hard-b',
      'hard-a',
    ]);
    expect(
      randomizeExercises(exercises, () => 0.999).map((item) => item.id),
    ).toEqual(['easy-a', 'easy-b', 'hard-a', 'hard-b']);
  });

  it('does not mark a lesson completed below its pass threshold', () => {
    const bundle = courseBundle();
    const failed = saveLessonProgress(bundle, 'lesson', 0.5);
    expect(failed.lessons.lesson?.status).toBe('available');
    expect(failed.lessons.lesson?.completedAt).toBeNull();

    const passed = saveLessonProgress(bundle, 'lesson', 0.75);
    expect(passed.lessons.lesson?.status).toBe('completed');
    expect(passed.lessons.lesson?.completedAt).not.toBeNull();
  });

  it('stores dialogue state without changing lesson progress', () => {
    const bundle = courseBundle();
    const saved = saveDialogueProgress(bundle, {
      dialogueId: 'drinkit',
      status: 'inProgress',
      currentNodeId: 'bus',
      choices: ['invent-directions', 'point-left'],
      updatedAt: '2026-07-30T12:00:00.000Z',
    });

    expect(saved.dialogues.drinkit).toMatchObject({
      status: 'inProgress',
      currentNodeId: 'bus',
    });
    expect(saved.lessons).toEqual({});
  });
});

function matchingExercise(): MatchingExercise {
  return {
    id: 'matching',
    type: 'matching',
    unitId: 'u',
    skillId: 's',
    lessonId: 'lesson',
    learningObjectiveIds: [],
    difficulty: 1,
    prompt: '',
    explanation: '',
    leftLabel: '',
    rightLabel: '',
    pairs: [
      { left: 'а', right: 'a' },
      { left: 'б', right: 'b' },
      { left: 'в', right: 'v' },
    ],
    distractorsRight: [],
  };
}

function choiceExercise(id: string, difficulty: number): MultipleChoiceExercise {
  return {
    id,
    type: 'multiple_choice',
    unitId: 'u',
    skillId: 's',
    lessonId: 'lesson',
    learningObjectiveIds: [],
    difficulty,
    prompt: '',
    explanation: '',
    multi: false,
    options: [{ id: `${id}-answer`, text: 'Да', correct: true }],
  };
}

function courseBundle(): CourseBundle {
  return {
    courseId: 'course',
    courseVersion: '1',
    title: 'Курс',
    contentChecksum: 'test',
    config: { passThreshold: 0.6, acceptBothScripts: true },
    units: [
      {
        id: 'u',
        title: 'Раздел',
        description: '',
        skills: [
          {
            id: 's',
            title: 'Тема',
            objectives: [],
            lessons: [
              {
                id: 'lesson',
                title: 'Урок',
                prerequisites: [],
                isCheckpoint: false,
                exercises: [choiceExercise('exercise', 1)],
              },
            ],
          },
        ],
      },
    ],
  };
}
