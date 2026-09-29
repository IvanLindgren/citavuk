import { useEffect, useRef, useState } from 'react';
import {
  LuCaptions,
  LuClock3,
  LuFileAudio,
  LuTrash2,
  LuUpload,
  LuUsers,
} from 'react-icons/lu';

import { AUDIO_FILE_ACCEPT, transcribeAudioFile } from '../api/audioFiles';
import { ClipboardImportButton } from '../components/ClipboardImportButton';
import { Button, ErrorNote, Spinner } from '../components/ui';
import {
  deleteLocalAudioFile,
  listLocalAudioFiles,
  saveLocalAudioFile,
  type LocalAudioFile,
} from '../lib/audioFiles';
import { isAudioClipboardFile } from '../lib/clipboard';
import { activeStorageName } from '../lib/db';
import { Link } from '../lib/router';
import { useSeo } from '../lib/seo';
import { useAuth } from '../state/auth';
import './audio-files.css';
import { askConfirm } from '../components/AskDialog';

export function AudioFiles() {
  useSeo({
    title: 'Мои аудиофайлы — Читавук',
    description: 'Сербская речь из твоих аудиофайлов с говорящими, таймкодами и разбором каждого слова.',
  });
  const auth = useAuth();
  const input = useRef<HTMLInputElement>(null);
  const [files, setFiles] = useState<LocalAudioFile[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const reload = () => listLocalAudioFiles()
    .then(setFiles)
    .catch(() => setError('Не удалось открыть локальную медиатеку.'))
    .finally(() => setLoading(false));

  useEffect(() => { void reload(); }, []);

  const importFile = async (file: File) => {
    const storageName = activeStorageName();
    setBusy(true);
    setError('');
    try {
      const transcript = await transcribeAudioFile(file);
      const saved = await saveLocalAudioFile(file, transcript, storageName);
      setFiles(current => [saved, ...current]);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Не удалось обработать аудиофайл.');
    } finally {
      setBusy(false);
      if (input.current) input.current.value = '';
    }
  };

  return <main className="audio-files-page">
    <section className="audio-files-hero">
      <div>
        <p className="audio-files-eyebrow">Твоя локальная медиатека</p>
        <h1>Звуковые файлы</h1>
        <p>Читавук определит, есть ли в записи сербская речь, разделит говорящих и привяжет каждое слово к точному месту в дорожке.</p>
      </div>
      <div className="audio-files-import">
        <input
          ref={input}
          className="sr-only"
          type="file"
          accept={AUDIO_FILE_ACCEPT}
          onChange={event => {
            const file = event.target.files?.[0];
            if (file) void importFile(file);
          }}
        />
        <Button disabled={busy || auth.loading || !auth.account} onClick={() => input.current?.click()}>
          {busy ? <Spinner className="size-4" /> : <LuUpload />}
          {busy ? 'Проверяю речь и говорящих' : 'Добавить аудиофайл'}
        </Button>
        <ClipboardImportButton
          disabled={busy || auth.loading || !auth.account}
          onPayload={payload => {
            if (payload.kind !== 'file' || !isAudioClipboardFile(payload.file)) {
              setError('Вставь аудиофайл. Текст и книги добавляются в библиотеку.');
              return;
            }
            void importFile(payload.file);
          }}
          onError={caught => setError(caught instanceof Error ? caught.message : 'Не удалось прочитать буфер обмена.')}
          label="Вставить аудио"
        />
        <span>MP3, M4A, WAV, OGG, FLAC или WebM, до 48 МБ. Читавук проверит сербскую речь и качество расшифровки перед сохранением.</span>
      </div>
    </section>

    {!auth.loading && !auth.account && <section className="audio-files-login">
      <LuCaptions />
      <div><h2>Для расшифровки нужен аккаунт</h2><p>Так платной обработкой не смогут пользоваться случайные боты.</p></div>
      <Link to="/login">Войти</Link>
    </section>}

    {error && <ErrorNote>{error}</ErrorNote>}

    <section className="audio-files-library">
      <header><div><p>Отдельно от книг</p><h2>Мои записи</h2></div><span>Файлы и расшифровки хранятся только в этом браузере</span></header>
      {loading ? <div className="audio-files-empty"><Spinner className="size-6" /></div> : files.length === 0 ? <div className="audio-files-empty">
        <LuFileAudio />
        <h3>Здесь появятся твои записи</h3>
        <p>Добавь интервью, подкаст, голосовое сообщение или лекцию на сербском.</p>
      </div> : <div className="audio-files-grid">
        {files.map(file => <article className="audio-file-card" key={file.id}>
          <Link to={`/audio-files/${encodeURIComponent(file.id)}`}>
            <span className="audio-file-icon"><LuFileAudio /></span>
            <div><h3>{file.title}</h3><p>{file.filename}</p><div className="audio-file-facts">
              <span><LuClock3 />{formatDuration(file.duration)}</span>
              <span><LuUsers />{file.speakerCount}</span>
              <span><LuCaptions />{formatSize(file.size)}</span>
            </div></div>
          </Link>
          <button type="button" aria-label={`Удалить ${file.title}`} title="Удалить" onClick={async () => {
            const sure = await askConfirm(`Удалить «${file.title}»?`, { text: 'Запись удалится с этого устройства.', confirmLabel: 'Удалить', danger: true });
            if (!sure) return;
            await deleteLocalAudioFile(file.id);
            setFiles(current => current.filter(item => item.id !== file.id));
          }}><LuTrash2 /></button>
        </article>)}
      </div>}
    </section>
  </main>;
}

function formatDuration(seconds: number): string {
  const minutes = Math.max(0, Math.floor(seconds / 60));
  const rest = Math.max(0, Math.floor(seconds % 60));
  return `${minutes}:${String(rest).padStart(2, '0')}`;
}

function formatSize(bytes: number): string {
  return bytes >= 1024 * 1024
    ? `${(bytes / 1024 / 1024).toFixed(1)} МБ`
    : `${Math.max(1, Math.round(bytes / 1024))} КБ`;
}
