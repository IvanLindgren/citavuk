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

/** Что известно о тесте по документу каталога материалов. */
export interface MaterialQuiz {
  materialKey: string;
  quizId: string;
  title: string;
  questions: number;
  /** Попытки и лучший результат — свои; у гостя нули. */
  attempts: number;
  bestScore: number;
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

/**
 * Тесты, уже составленные по документам каталога.
 *
 * Список приходит целиком, а не по запрошенным документам: тестов по каталогу
 * немного, зато страница материалов обходится одним запросом вместо адреса с
 * сотней идентификаторов.
 */
export async function listMaterialQuizzes(
  signal?: AbortSignal,
): Promise<Map<string, MaterialQuiz>> {
  // Токен подставляется, если человек вошёл: тогда в ответе будут ещё и его
  // попытки. Гостю сервер отдаёт тот же список без личной статистики.
  const response = await request<{ items?: MaterialQuiz[] }>('/v1/quizzes/materials', {
    signal,
  });
  return new Map((response.items ?? []).map((item) => [item.materialKey, item]));
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
  materialKey: string,
  signal?: AbortSignal,
): Promise<{ quiz: Quiz; fresh: boolean }> {
  return request<{ quiz: Quiz; fresh: boolean }>('/v1/quizzes', {
    method: 'POST',
    body: { text, title, questions, materialKey },
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
