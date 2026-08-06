import { request } from './client';

/**
 * Диалоги из опубликованных уроков преподавателей.
 *
 * Страница диалогов показывала ровно один зашитый сценарий, а всё, что пишут
 * преподаватели, лежало внутри уроков и до неё не доходило. Разделу с одной
 * карточкой трудно быть разделом.
 *
 * Отбор делает сервер и по тому же правилу, что и каталог уроков: только
 * публичные и не архивные. Урок «по ссылке» автор публичным не делал, и
 * выносить его в общий список значило бы решить за него.
 */
export interface PublicDialogue {
  slug: string;
  title: string;
  summary: string;
  authorName: string;
  coverUrl?: string;
  level: string;
  script: string;
  /** Сколько реплик в сценарии: короткая сценка или разговор на десять минут. */
  lines: number;
  updatedAt: string;
}

export async function listDialogues(signal?: AbortSignal): Promise<PublicDialogue[]> {
  const response = await request<{ items: PublicDialogue[] | null }>('/v1/dialogues', {
    signal,
  });
  return response.items ?? [];
}
