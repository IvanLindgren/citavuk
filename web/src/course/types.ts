export interface CourseBundle {
  courseId: string;
  courseVersion: string;
  title: string;
  contentChecksum: string;
  config: {
    passThreshold: number;
    acceptBothScripts: boolean;
  };
  units: CourseUnit[];
}

export interface CourseUnit {
  id: string;
  title: string;
  description: string;
  skills: CourseSkill[];
}

export interface CourseSkill {
  id: string;
  title: string;
  objectives: Array<{ id: string; title: string }>;
  lessons: CourseLesson[];
}

export interface CourseLesson {
  id: string;
  title: string;
  prerequisites: string[];
  isCheckpoint: boolean;
  /** Урок по желанию: проходить необязательно. */
  optional?: boolean;
  intro?: LessonIntro;
  exercises: Exercise[];
}

export interface LessonIntro {
  text: string;
  blocks: IntroBlock[];
}

export type IntroBlock =
  | { kind: 'paragraph' | 'tip'; text: string }
  | {
      kind: 'terms';
      title: string;
      rows: Array<{ term: string; gloss: string; note?: string }>;
    }
  | {
      kind: 'example';
      serbian: string;
      russian: string;
      highlight?: string;
    };

export interface ChoiceOption {
  id: string;
  text: string;
  correct: boolean;
  misconceptionId?: string | null;
  feedbackKey?: string | null;
}

interface ExerciseBase {
  id: string;
  type: string;
  unitId: string;
  skillId: string;
  lessonId: string;
  learningObjectiveIds: string[];
  difficulty: number;
  prompt: string;
  explanation: string;
  hint?: string | null;
}

export interface MultipleChoiceExercise extends ExerciseBase {
  type: 'multiple_choice';
  multi: boolean;
  options: ChoiceOption[];
}

export interface EndingPickerExercise extends ExerciseBase {
  type: 'ending_picker';
  contextSentence: string;
  stem: string;
  fullForm: string;
  options: ChoiceOption[];
}

export interface SentenceBuilderExercise extends ExerciseBase {
  type: 'sentence_builder';
  tokens: WordTile[];
  distractorTokens: WordTile[];
  acceptedOrders: string[][];
  optionalTokenIds: string[];
}

export interface LetterUnscrambleExercise extends ExerciseBase {
  type: 'letter_unscramble';
  context: string;
  answer: string;
  extraLetters: string[];
  digraphsAsUnits: boolean;
}

export interface MatchingExercise extends ExerciseBase {
  type: 'matching';
  leftLabel: string;
  rightLabel: string;
  pairs: Array<{ left: string; right: string }>;
  distractorsRight: string[];
}

export interface FillBlankExercise extends ExerciseBase {
  type: 'fill_blank';
  segments: Array<
    | { kind: 'text'; text: string }
    | { kind: 'blank'; id: string }
  >;
  blanks: Array<{
    id: string;
    acceptedAnswers: string[];
    caseSensitive: boolean;
  }>;
}

export interface ImageDescriptionExercise extends ExerciseBase {
  type: 'image_description';
  mode: 'choose' | 'free';
  image: {
    path: string;
    altText: string;
    focalPoint?: { x: number; y: number };
  };
  options?: ChoiceOption[];
  acceptedAnswers?: string[];
}

/**
 * Текст и вопросы к нему.
 *
 * Варианты ответа принадлежат вопросу, а не заданию: общий список превратил
 * бы чтение в подбор пар.
 */
export interface ReadingQaExercise extends ExerciseBase {
  type: 'reading_qa';
  text: string;
  translation: string;
  questions: Array<{
    id: string;
    prompt: string;
    options: ChoiceOption[];
  }>;
}

/**
 * Найти в тексте все формы заданного признака.
 *
 * Текст приходит списком токенов, а не строкой: делить сербский текст на
 * слова пришлось бы одинаково в Go, Dart и здесь, и любое расхождение
 * разошлось бы с проверкой ответа.
 */
export interface FormHuntExercise extends ExerciseBase {
  type: 'form_hunt';
  targetLabel: string;
  translation: string;
  tokens: Array<{ id: string; text: string; tail: string; correct: boolean }>;
}

export type Exercise =
  | MultipleChoiceExercise
  | EndingPickerExercise
  | SentenceBuilderExercise
  | LetterUnscrambleExercise
  | MatchingExercise
  | FillBlankExercise
  | ImageDescriptionExercise
  | ReadingQaExercise
  | FormHuntExercise;

export interface WordTile {
  id: string;
  text: string;
}

export interface Evaluation {
  correct: boolean;
  userDisplay: string;
  correctDisplay: string;
  explanation: string;
}

export interface CourseProgress {
  courseId: string;
  courseVersion: string;
  lessons: Record<string, CourseLessonProgress>;
  mastery: Record<
    string,
    {
      objectiveId: string;
      score: number;
      evidenceCount: number;
      lastSeenAt: string | null;
      nextReviewAt: string | null;
    }
  >;
  xp: number;
  streak: {
    currentDays: number;
    longestDays: number;
    lastStudyDate: string | null;
  };
  activeLesson: Record<string, unknown> | null;
}

export interface CourseLessonProgress {
  lessonId: string;
  status:
    | 'locked'
    | 'available'
    | 'inProgress'
    | 'completed'
    | 'mastered'
    | 'needsReview';
  bestScore: number;
  attemptsCount: number;
  completedAt: string | null;
}
