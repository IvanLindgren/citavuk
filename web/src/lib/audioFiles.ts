import {
  STORE_AUDIO_BLOBS,
  STORE_AUDIO_FILES,
  STORE_AUDIO_TRANSCRIPTS,
  activeStorageName,
  get,
  getAll,
  put,
  remove,
  tx,
} from './db';

export interface AudioTranscriptWord {
  text: string;
  start: number;
  end: number;
}

export interface AudioTranscriptSegment {
  speaker: string;
  start: number;
  end: number;
  text: string;
  words: AudioTranscriptWord[];
}

export interface AudioTranscript {
  language_code: 'srp';
  language_probability: number;
  duration: number;
  speakers: string[];
  segments: AudioTranscriptSegment[];
}

export interface LocalAudioFile {
  id: string;
  title: string;
  filename: string;
  mimeType: string;
  size: number;
  duration: number;
  speakerCount: number;
  createdAt: number;
}

interface AudioBlobRow {
  id: string;
  blob: Blob;
}

interface AudioTranscriptRow {
  id: string;
  transcript: AudioTranscript;
}

export async function listLocalAudioFiles(): Promise<LocalAudioFile[]> {
  const files = await tx(STORE_AUDIO_FILES, 'readonly', transaction =>
    getAll<LocalAudioFile>(transaction, STORE_AUDIO_FILES),
  );
  return files.sort((a, b) => b.createdAt - a.createdAt);
}

export async function getLocalAudioFile(id: string): Promise<LocalAudioFile | null> {
  return (await tx(STORE_AUDIO_FILES, 'readonly', transaction =>
    get<LocalAudioFile>(transaction, STORE_AUDIO_FILES, id),
  )) ?? null;
}

export async function getLocalAudioBlob(id: string): Promise<Blob | null> {
  const row = await tx(STORE_AUDIO_BLOBS, 'readonly', transaction =>
    get<AudioBlobRow>(transaction, STORE_AUDIO_BLOBS, id),
  );
  return row?.blob ?? null;
}

export async function getLocalAudioTranscript(id: string): Promise<AudioTranscript | null> {
  const row = await tx(STORE_AUDIO_TRANSCRIPTS, 'readonly', transaction =>
    get<AudioTranscriptRow>(transaction, STORE_AUDIO_TRANSCRIPTS, id),
  );
  return row?.transcript ?? null;
}

export async function saveLocalAudioFile(
  file: File,
  transcript: AudioTranscript,
  expectedStorageName = activeStorageName(),
): Promise<LocalAudioFile> {
  if (activeStorageName() !== expectedStorageName) {
    throw new Error('Аккаунт сменился во время расшифровки. Добавь запись ещё раз.');
  }
  const now = Date.now();
  const meta: LocalAudioFile = {
    id: crypto.randomUUID(),
    title: file.name.replace(/\.[^.]+$/, '').trim() || 'Без названия',
    filename: file.name,
    mimeType: file.type || 'application/octet-stream',
    size: file.size,
    duration: transcript.duration,
    speakerCount: transcript.speakers.length,
    createdAt: now,
  };
  await tx(
    [STORE_AUDIO_FILES, STORE_AUDIO_BLOBS, STORE_AUDIO_TRANSCRIPTS],
    'readwrite',
    async transaction => {
      await put(transaction, STORE_AUDIO_FILES, meta);
      await put(transaction, STORE_AUDIO_BLOBS, { id: meta.id, blob: file });
      await put(transaction, STORE_AUDIO_TRANSCRIPTS, {
        id: meta.id,
        transcript,
      });
    },
  );
  if (activeStorageName() !== expectedStorageName) {
    // Запись уже завершилась в прежней базе и там остаётся корректной. Не
    // показываем её в только что открытой библиотеке другого аккаунта.
    throw new Error('Аккаунт сменился во время сохранения. Открой свою медиатеку заново.');
  }
  return meta;
}

export async function deleteLocalAudioFile(id: string): Promise<void> {
  await tx(
    [STORE_AUDIO_FILES, STORE_AUDIO_BLOBS, STORE_AUDIO_TRANSCRIPTS],
    'readwrite',
    async transaction => {
      await remove(transaction, STORE_AUDIO_FILES, id);
      await remove(transaction, STORE_AUDIO_BLOBS, id);
      await remove(transaction, STORE_AUDIO_TRANSCRIPTS, id);
    },
  );
}
