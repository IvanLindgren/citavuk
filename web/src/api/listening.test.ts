import { afterEach, describe, expect, it, vi } from 'vitest';

import { getTranscript, getTtsVoice, setTtsVoice, ttsAudioUrl } from './listening';
import type { AudioLesson } from '../listening/types';

const lesson = (overrides: Partial<AudioLesson> = {}): AudioLesson => ({
  id: 'episode',
  title: 'Epizoda',
  subtitle: 'Podcast',
  audio_url: 'https://cdn.example/episode.mp3',
  cues: [
    { start: 0, end: 2, text: 'Старый выдуманный текст' },
    { start: 2, end: 4, text: 'Ещё одна строка' },
  ],
  ...overrides,
});

afterEach(() => {
  vi.unstubAllGlobals();
  localStorage.clear();
});

describe('TTS voice', () => {
  it('persists the selected Serbian speaker and includes it in the URL', () => {
    setTtsVoice('nicholas');

    expect(getTtsVoice()).toBe('nicholas');
    expect(ttsAudioUrl('Dobar dan')).toContain('voice=nicholas');
  });

  it('uses Sophie for existing users without a saved preference', () => {
    expect(getTtsVoice()).toBe('sophie');
    expect(ttsAudioUrl('Добар дан')).toContain('voice=sophie');
  });
});

describe('getTranscript', () => {
  it('prefers a real Whisper transcript even when it has fewer cues', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          cues: [{ start: 1.25, end: 2.4, text: 'Prava rečenica.' }],
        }),
        { status: 200, headers: { 'Content-Type': 'application/json' } },
      ),
    );
    vi.stubGlobal('fetch', fetchMock);

    const cues = await getTranscript(
      lesson({
        transcript_url: 'https://citavuk.ru/transcripts/real.json',
      }),
    );

    expect(cues).toEqual([
      { start: 1.25, end: 2.4, text: 'Prava rečenica.' },
    ]);
    expect(fetchMock).toHaveBeenCalledWith('/transcripts/real.json', {
      signal: undefined,
    });
  });

  it('does not request a made-up transcript when no URL is published', async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    const current = lesson({ transcript_url: null, cues: [] });

    await expect(getTranscript(current)).resolves.toEqual([]);
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
