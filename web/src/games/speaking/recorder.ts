/**
 * Запись голоса с микрофона для игры «Говори!».
 *
 * Возвращает обычный файл (WebM/Opus в Chrome и Firefox, MP4 в Safari) — его
 * принимает та же расшифровка, что и загруженные записи.
 */

const MIME_CANDIDATES = ['audio/webm;codecs=opus', 'audio/webm', 'audio/mp4', 'audio/ogg;codecs=opus'];

export type RecordingErrorCode = 'denied' | 'no-mic' | 'unsupported' | 'failed';

export class RecordingError extends Error {
  constructor(
    readonly code: RecordingErrorCode,
    message: string,
  ) {
    super(message);
    this.name = 'RecordingError';
  }
}

export interface Recording {
  blob: Blob;
  mimeType: string;
  seconds: number;
}

export interface ActiveRecorder {
  /** Останавливает запись и отдаёт то, что записано. */
  stop(): Promise<Recording>;
  /** Останавливает и выбрасывает запись. */
  cancel(): void;
}

export function recordingSupported(): boolean {
  return (
    typeof navigator !== 'undefined' &&
    !!navigator.mediaDevices?.getUserMedia &&
    typeof MediaRecorder !== 'undefined'
  );
}

function pickMime(): string {
  return MIME_CANDIDATES.find((type) => MediaRecorder.isTypeSupported(type)) ?? '';
}

export function recordingFileName(mimeType: string): string {
  if (mimeType.includes('mp4')) return 'govori.m4a';
  if (mimeType.includes('ogg')) return 'govori.ogg';
  return 'govori.webm';
}

export async function startRecording(options: {
  maxSeconds: number;
  /** Громкость 0…1, около тридцати раз в секунду. */
  onLevel?: (level: number) => void;
  onTick?: (seconds: number) => void;
  /** Предел достигнут: запись остановлена сама, её можно забрать через stop(). */
  onLimit?: () => void;
}): Promise<ActiveRecorder> {
  if (!recordingSupported()) throw new RecordingError('unsupported', 'В этом браузере нельзя записать голос.');

  let stream: MediaStream;
  try {
    stream = await navigator.mediaDevices.getUserMedia({
      audio: { echoCancellation: true, noiseSuppression: true, channelCount: 1 },
    });
  } catch (error) {
    const name = error instanceof DOMException ? error.name : '';
    if (name === 'NotAllowedError' || name === 'SecurityError') {
      throw new RecordingError('denied', 'Нет доступа к микрофону. Разреши его в настройках браузера.');
    }
    if (name === 'NotFoundError' || name === 'OverconstrainedError') {
      throw new RecordingError('no-mic', 'Микрофон не найден.');
    }
    throw new RecordingError('failed', 'Не удалось включить микрофон.');
  }

  const mimeType = pickMime();
  let recorder: MediaRecorder;
  try {
    recorder = new MediaRecorder(stream, mimeType ? { mimeType } : undefined);
  } catch {
    stream.getTracks().forEach((track) => track.stop());
    throw new RecordingError('unsupported', 'В этом браузере нельзя записать голос.');
  }

  const chunks: Blob[] = [];
  recorder.ondataavailable = (event) => {
    if (event.data.size > 0) chunks.push(event.data);
  };

  // Индикатор громкости: человек видит, что микрофон его слышит.
  let audioContext: AudioContext | null = null;
  let frame = 0;
  try {
    audioContext = new AudioContext();
    const analyser = audioContext.createAnalyser();
    analyser.fftSize = 512;
    audioContext.createMediaStreamSource(stream).connect(analyser);
    const samples = new Uint8Array(analyser.fftSize);
    const loop = () => {
      analyser.getByteTimeDomainData(samples);
      let sum = 0;
      for (const value of samples) sum += ((value - 128) / 128) ** 2;
      options.onLevel?.(Math.min(1, Math.sqrt(sum / samples.length) * 3.2));
      frame = requestAnimationFrame(loop);
    };
    loop();
  } catch {
    // Без индикатора запись всё равно идёт.
  }

  const startedAt = performance.now();
  const elapsed = () => (performance.now() - startedAt) / 1000;
  let finished = false;
  let limitReached = false;
  const ticker = window.setInterval(() => {
    const seconds = elapsed();
    options.onTick?.(seconds);
    if (seconds >= options.maxSeconds && !limitReached) {
      limitReached = true;
      options.onLimit?.();
    }
  }, 250);

  const release = () => {
    finished = true;
    window.clearInterval(ticker);
    cancelAnimationFrame(frame);
    stream.getTracks().forEach((track) => track.stop());
    void audioContext?.close().catch(() => {});
    options.onLevel?.(0);
  };

  recorder.start(1000);

  return {
    stop: () =>
      new Promise<Recording>((resolve, reject) => {
        if (finished) {
          reject(new RecordingError('failed', 'Запись уже остановлена.'));
          return;
        }
        const seconds = Math.min(elapsed(), options.maxSeconds);
        recorder.onstop = () => {
          release();
          const type = recorder.mimeType || mimeType || 'audio/webm';
          const blob = new Blob(chunks, { type });
          if (blob.size === 0) reject(new RecordingError('failed', 'Запись получилась пустой.'));
          else resolve({ blob, mimeType: type, seconds });
        };
        if (recorder.state === 'inactive') recorder.onstop(new Event('stop'));
        else recorder.stop();
      }),
    cancel: () => {
      if (finished) return;
      recorder.onstop = null;
      if (recorder.state !== 'inactive') recorder.stop();
      release();
    },
  };
}
