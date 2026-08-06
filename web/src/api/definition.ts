import { ApiError, request } from './client';

export interface DefinitionExample {
  text: string;
  source?: string;
}

export interface DefinitionSense {
  number?: string;
  domain?: string;
  register?: string;
  definition: string;
  examples?: DefinitionExample[];
}

/**
 * Толкование слова на сербском из «Речника српскохрватскога књижевног језика».
 *
 * Статья показывается как цитата, поэтому `sourceTitle` и `url` обязательны к
 * показу: без них выходит, что словарь наш.
 */
export interface Definition {
  headword: string;
  grammar?: string;
  etymology?: string;
  senses: DefinitionSense[];
  sourceTitle: string;
  volume?: number;
  page?: number;
  url: string;
}

/**
 * Ищет толкование начальной формы слова.
 *
 * Спрашивать надо именно начальную форму: словарь ведётся по заглавным словам,
 * и «нихилизму» в нём нет. Латиницу сервер сам переводит в кириллицу.
 *
 * Слова в словаре может не быть — это обычный исход, а не сбой, поэтому вместо
 * исключения возвращается null: карточка тогда просто не появляется.
 */
export async function fetchDefinition(
  word: string,
  signal?: AbortSignal,
): Promise<Definition | null> {
  const trimmed = word.trim();
  if (!trimmed) return null;
  try {
    const entry = await request<Definition>(
      `/v1/definition?word=${encodeURIComponent(trimmed)}`,
      { anonymous: true, signal },
    );
    // Статья без значений — то же самое, что её отсутствие: показывать нечего.
    // Заодно это защищает карточку от неполного ответа: упасть посреди чтения
    // из-за чужого словаря она не должна.
    return entry?.senses?.length ? entry : null;
  } catch (error) {
    if (error instanceof ApiError && error.status === 404) return null;
    throw error;
  }
}
