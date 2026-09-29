import { API_BASE, ApiError, getToken } from './client';
import type { AudioTranscript } from '../lib/audioFiles';

export const AUDIO_FILE_MAX_BYTES = 48 * 1024 * 1024;
export const AUDIO_FILE_ACCEPT = '.mp3,.m4a,.wav,.ogg,.oga,.flac,.webm,.aac,audio/*';

export async function transcribeAudioFile(file: File): Promise<AudioTranscript> {
  const token = getToken();
  if (!token) throw new ApiError('Чтобы расшифровать запись, войди в аккаунт.', 401);
  if (file.size <= 0) throw new ApiError('Аудиофайл пустой.');
  if (file.size > AUDIO_FILE_MAX_BYTES) {
    throw new ApiError('Аудиофайл должен быть не больше 48 МБ.');
  }

  const form = new FormData();
  form.append('file', file, file.name);
  const controller = new AbortController();
  // Groq отвечает быстро, но Aiesa в Polza может стоять в очереди. Таймаут
  // должен пережить полный резервный проход, иначе браузер оборвёт запрос
  // ровно в момент, когда сервер ещё готовит качественный ответ.
  const timer = window.setTimeout(() => controller.abort(), 25 * 60_000);

  let response: Response;
  try {
    response = await fetch(`${API_BASE}/v1/audio/transcribe`, {
      method: 'POST',
      headers: {
        Accept: 'application/json',
        'X-Citavuk-Client': 'web',
        ...(token !== 'cookie' ? { Authorization: `Bearer ${token}` } : {}),
      },
      credentials: token === 'cookie' ? 'include' : 'omit',
      body: form,
      signal: controller.signal,
    });
  } catch {
    throw new ApiError('Не удалось отправить аудио на расшифровку.');
  } finally {
    window.clearTimeout(timer);
  }

  const body = await response.text();
  if (!response.ok) {
    let message = `Расшифровка не выполнилась (${response.status}).`;
    let code = '';
    try {
      const parsed = JSON.parse(body) as { message?: string; detail?: string; code?: string };
      message = parsed.message || parsed.detail || message;
      code = parsed.code || '';
    } catch {
      // Оставляем понятный общий текст.
    }
    throw new ApiError(message, response.status, code);
  }

  let transcript: AudioTranscript;
  try {
    transcript = JSON.parse(body) as AudioTranscript;
  } catch {
    throw new ApiError('Сервис вернул повреждённую расшифровку.', response.status);
  }
  if (
    transcript.language_code !== 'srp' ||
    !Array.isArray(transcript.segments) ||
    transcript.segments.length === 0
  ) {
    throw new ApiError('В записи не удалось подтвердить сербскую речь.', 422);
  }
  return transcript;
}
