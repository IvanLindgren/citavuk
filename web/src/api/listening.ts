import type { AudioCue, AudioLesson } from '../listening/types';
import { API_BASE, request } from './client';

export async function getAudioLessons(signal?: AbortSignal): Promise<AudioLesson[]> {
  const response = await request<{ items?: AudioLesson[] }>('/audio/lessons', {
    anonymous: true,
    timeoutMs: 30_000,
    signal,
  });
  return (response.items ?? []).filter(
    (lesson) => lesson.id && lesson.title && lesson.cues?.length,
  );
}

export async function getTranscript(
  lesson: AudioLesson,
  signal?: AbortSignal,
): Promise<AudioCue[]> {
  if (!lesson.transcript_url) return lesson.cues;
  const query = new URLSearchParams({
    url: lesson.transcript_url,
    duration: String(lesson.duration ?? 0),
  });
  const response = await request<{ cues?: AudioCue[] }>(
    `/audio/transcript?${query}`,
    { anonymous: true, timeoutMs: 45_000, signal },
  );
  const cues = (response.cues ?? []).filter((cue) => cue.text?.trim());
  return cues.length > lesson.cues.length ? cues : lesson.cues;
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
