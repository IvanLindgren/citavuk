import { afterEach, describe, expect, it, vi } from 'vitest';

import { setToken } from './client';
import { transcribeAudioFile } from './audioFiles';

afterEach(() => {
  vi.unstubAllGlobals();
  setToken(null);
});

describe('transcribeAudioFile', () => {
  it('requires an account before sending paid transcription', async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);

    await expect(transcribeAudioFile(new File(['ID3data'], 'glas.mp3', {
      type: 'audio/mpeg',
    }))).rejects.toThrow('войди в аккаунт');
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('sends multipart and accepts only a Serbian timed transcript', async () => {
    setToken('session-token');
    const payload = {
      language_code: 'srp',
      language_probability: .96,
      duration: 1.2,
      speakers: ['speaker_0'],
      segments: [{
        speaker: 'speaker_0',
        start: 0,
        end: 1.2,
        text: 'Dobar dan.',
        words: [{ text: 'Dobar', start: 0, end: .5 }],
      }],
    };
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify(payload), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    }));
    vi.stubGlobal('fetch', fetchMock);

    const result = await transcribeAudioFile(new File(['ID3data'], 'glas.mp3', {
      type: 'audio/mpeg',
    }));

    expect(result.language_code).toBe('srp');
    const init = fetchMock.mock.calls[0]![1] as RequestInit;
    expect(init.body).toBeInstanceOf(FormData);
    expect((init.headers as Record<string, string>).Authorization)
      .toBe('Bearer session-token');
  });

  it('does not save a provider response without Serbian speech', async () => {
    setToken('session-token');
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(JSON.stringify({
      language_code: 'eng',
      segments: [],
    }), { status: 200 })));

    await expect(transcribeAudioFile(new File(['ID3data'], 'voice.mp3')))
      .rejects.toThrow('подтвердить сербскую речь');
  });
});
