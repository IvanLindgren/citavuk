import { request } from './client';

/**
 * Уровень сербского и оценка сложности текста.
 *
 * Уровень живёт на аккаунте, а не в разделе: спросили один раз — знают везде.
 * До этого о нём знал только Вукоток и хранил его при устройстве, поэтому один
 * человек отвечал на один и тот же вопрос в каждом браузере заново.
 */

export const LEVELS = ['A1', 'A2', 'B1', 'B2', 'C1'] as const;
export type Level = (typeof LEVELS)[number];

/** Как называется ступень для человека — «B1» само по себе ничего не говорит. */
export const LEVEL_NAMES: Record<Level, string> = {
  A1: 'Первые слова',
  A2: 'Простые фразы',
  B1: 'Читаю с переводчиком',
  B2: 'Читаю почти свободно',
  C1: 'Свободно',
};

export interface LevelQuestion {
  id: string;
  level: Level;
  prompt: string;
  hint: string;
  options: string[];
}

export interface LevelTestResult {
  level: Level;
  correct: number;
  total: number;
  byLevel: Record<string, number>;
}

export function getLevelTest() {
  return request<{ questions: LevelQuestion[] }>('/v1/profile/level/test', {
    anonymous: true,
  }).then((response) => response.questions);
}

/**
 * Ответы проверяет сервер.
 *
 * Верных вариантов у клиента нет и быть не должно: лежи они в исходниках
 * страницы, тест перестал бы что-либо измерять.
 */
export function gradeLevelTest(answers: Record<string, number>, save: boolean) {
  return request<LevelTestResult>('/v1/profile/level/test', {
    method: 'POST',
    body: { answers, save },
  });
}

export interface TextLevel {
  /** Пусто, если слов не хватило для суждения. */
  level: string;
  words: number;
  coverage: number;
  hardWords: string[];
  source: string;
}

/**
 * Оценивает, на какой уровень рассчитан текст.
 *
 * Отправляется выборка, а не книга целиком: оценщик всё равно смотрит не больше
 * 1200 слов, и гнать роман через сеть ради этого незачем.
 */
export function estimateTextLevel(paragraphs: string[], signal?: AbortSignal) {
  return request<TextLevel>('/v1/analyze/text-level', {
    method: 'POST',
    body: { paragraphs: sampleParagraphs(paragraphs) },
    anonymous: true,
    signal,
  });
}

/** Сколько абзацев отправлять: с запасом на короткие. */
const SAMPLE_PARAGRAPHS = 120;

/**
 * Берёт абзацы равномерно по всей книге.
 *
 * Именно по всей: начало книги врёт чаще всего — у переводных изданий там
 * выходные данные, у учебников предисловие на другом языке. Шаг постоянный, а
 * первый и последний абзацы берутся всегда.
 */
export function sampleParagraphs(paragraphs: string[]): string[] {
  const meaningful = paragraphs.filter((item) => item.trim().length > 0);
  if (meaningful.length <= SAMPLE_PARAGRAPHS) return meaningful;
  const step = meaningful.length / SAMPLE_PARAGRAPHS;
  const out: string[] = [];
  for (let i = 0; i < SAMPLE_PARAGRAPHS; i += 1) {
    const paragraph = meaningful[Math.floor(i * step)];
    if (paragraph !== undefined) out.push(paragraph);
  }
  return out;
}

/**
 * Разрыв, при котором стоит предупредить о книге.
 *
 * Две ступени, а не одна: читать на ступень выше своего уровня как раз и
 * полезно, и отговаривать от этого значит мешать единственному способу вырасти.
 * Правило то же, что на сервере (level.TooHardFor) — здесь оно нужно, чтобы не
 * ходить на сервер второй раз за уже известным ответом.
 */
export function tooHardFor(textLevel: string, readerLevel: string): boolean {
  const text = LEVELS.indexOf(textLevel as Level);
  const reader = LEVELS.indexOf(readerLevel as Level);
  return text >= 0 && reader >= 0 && text - reader >= 2;
}
