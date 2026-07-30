import type { AudioCue, AudioLesson } from '../listening/types';
import { API_BASE, request } from './client';

export async function getAudioLessons(signal?: AbortSignal): Promise<AudioLesson[]> {
  const response = await request<{ items?: AudioLesson[] }>('/audio/lessons', {
    anonymous: true,
    timeoutMs: 30_000,
    signal,
  });
  // Эпизод без реплик тоже нужен: расшифровки делаются постепенно, а слушать
  // запись можно и до неё. Прежнее условие требовало непустых cues, и раздел
  // прятал всё, для чего расшифровки ещё нет.
  return (response.items ?? []).filter(
    (lesson) => lesson.id && lesson.title && lesson.audio_url,
  );
}

/**
 * Расшифровка эпизода.
 *
 * Наши расшифровки лежат статикой на том же домене, поэтому забираются напрямую:
 * лишний заход на сервер тут не нужен, а раньше запрос шёл через прежний
 * Python-бэкенд на засыпающем Space и раздел отвечал 502.
 */
export async function getTranscript(
  lesson: AudioLesson,
  signal?: AbortSignal,
): Promise<AudioCue[]> {
  if (!lesson.transcript_url) return lesson.cues;

  const own = ownTranscriptPath(lesson.transcript_url);
  const response = own
    ? await fetchOwnTranscript(own, signal)
    : await request<{ cues?: AudioCue[] }>(
        `/audio/transcript?url=${encodeURIComponent(lesson.transcript_url)}`,
        { anonymous: true, timeoutMs: 45_000, signal },
      );

  const cues = (response.cues ?? []).filter((cue) => cue.text?.trim());
  // Настоящая расшифровка побеждает всегда. Прежде выбиралась та, где реплик
  // больше, и короткий выверенный текст проигрывал длинному выдуманному.
  return cues.length > 0 ? cues : lesson.cues;
}

/** Путь внутри сайта, если расшифровка наша. Иначе null. */
function ownTranscriptPath(url: string): string | null {
  try {
    const parsed = new URL(url, window.location.origin);
    const allowedOrigins = new Set([
      window.location.origin,
      'https://citavuk.ru',
      'https://www.citavuk.ru',
    ]);
    if (!allowedOrigins.has(parsed.origin)) return null;
    if (!parsed.pathname.startsWith('/transcripts/')) return null;
    if (!parsed.pathname.endsWith('.json')) return null;
    return parsed.pathname;
  } catch {
    return null;
  }
}

async function fetchOwnTranscript(
  path: string,
  signal?: AbortSignal,
): Promise<{ cues?: AudioCue[] }> {
  const response = await fetch(path, { signal });
  if (!response.ok) throw new Error('Расшифровка недоступна.');
  return (await response.json()) as { cues?: AudioCue[] };
}

export function playableAudioUrl(url: string): string {
  try {
    const audio = new URL(url);
    const api = new URL(API_BASE || window.location.origin, window.location.origin);
    if (audio.host === api.host) return url;
  } catch {
    return url;
  }
  return `${API_BASE}/audio/proxy?url=${encodeURIComponent(url)}`;
}

export function ttsAudioUrl(text: string): string {
  return `${API_BASE}/audio/tts?text=${encodeURIComponent(text)}`;
}
