import { request } from './client';

/** Вопрос теста вместе с разбором. */
export interface QuizQuestion {
  question: string;
  options: string[];
  /** Номер верного варианта в options. */
  answer: number;
  explanation: string;
  wrongHint: string;
}

export interface Quiz {
  id: string;
  title: string;
  subject: string;
  excerpt: string;
  questions: QuizQuestion[];
  createdAt: string;
}

export interface QuizSummary {
  id: string;
  title: string;
  subject: string;
  excerpt: string;
  questions: number;
  createdAt: string;
  mine: boolean;
  attempts: number;
  bestScore: number;
  lastTried?: string;
}

export interface RepeatItem {
  quizId: string;
  title: string;
  score: number;
  due: string;
  overdue: boolean;
  attempts: number;
}

export interface AttemptRecord {
  quizId: string;
  title: string;
  correct: number;
  total: number;
  wrong: number[];
  createdAt: string;
}

export interface QuizStats {
  solved: number;
  attempts: number;
  accuracy: number;
  dueNow: number;
  repeat: RepeatItem[];
  recent: AttemptRecord[];
}

export interface AttemptResult {
  correct: number;
  total: number;
  wrong: number[];
}

export async function listQuizzes(signal?: AbortSignal): Promise<QuizSummary[]> {
  const response = await request<{ items?: QuizSummary[] }>('/v1/quizzes', { signal });
  return response.items ?? [];
}

export async function getQuiz(id: string, signal?: AbortSignal): Promise<Quiz> {
  const response = await request<{ quiz: Quiz }>(
    `/v1/quizzes/${encodeURIComponent(id)}`,
    { signal },
  );
  return response.quiz;
}

/**
 * Создаёт тест по материалу.
 *
 * `fresh` показывает, обращались ли к модели: если такой материал уже приносили,
 * сервер отдаёт готовый тест мгновенно и бесплатно.
 */
export async function generateQuiz(
  text: string,
  title: string,
  questions: number,
  signal?: AbortSignal,
): Promise<{ quiz: Quiz; fresh: boolean }> {
  return request<{ quiz: Quiz; fresh: boolean }>('/v1/quizzes', {
    method: 'POST',
    body: { text, title, questions },
    // Модель на длинном конспекте думает долго — обычные 20 секунд ей мало.
    timeoutMs: 4 * 60_000,
    signal,
  });
}

export async function saveAttempt(
  id: string,
  answers: number[],
  signal?: AbortSignal,
): Promise<AttemptResult> {
  return request<AttemptResult>(`/v1/quizzes/${encodeURIComponent(id)}/attempts`, {
    method: 'POST',
    body: { answers },
    signal,
  });
}

export async function getQuizStats(signal?: AbortSignal): Promise<QuizStats> {
  return request<QuizStats>('/v1/quizzes/stats', { signal });
}
