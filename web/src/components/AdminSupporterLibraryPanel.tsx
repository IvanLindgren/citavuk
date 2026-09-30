import { useCallback, useEffect, useRef, useState, type FormEvent } from 'react';
import { LuBookOpen, LuHeadphones, LuPencil, LuTrash2, LuUpload } from 'react-icons/lu';

import { ApiError } from '../api/client';
import {
  createLibraryItem,
  deleteLibraryItem,
  getAdminLibrary,
  getLibraryItem,
  updateLibraryItem,
  uploadLibraryAudio,
  type LibraryItem,
  type LibraryItemInput,
} from '../api/supporterLibrary';
import { extractDocument } from '../lib/documentImport';
import { askConfirm } from './AskDialog';
import { Button, ErrorNote, Spinner } from './ui';

const input =
  'w-full min-w-0 rounded-xl border border-[var(--line)] bg-[var(--bg-raised)] px-4 py-3 text-sm outline-none transition-colors placeholder:text-[var(--text-muted)] focus:border-[var(--accent)]';
const EMPTY: LibraryItemInput = { kind: 'book', title: '', author: '', description: '', level: '', coverUrl: '', body: '', published: false };

function formatSize(bytes: number) {
  return bytes > 1024 * 1024 ? `${(bytes / 1024 / 1024).toFixed(1)} МБ` : `${Math.round(bytes / 1024)} КБ`;
}

/** Закрытая библиотека: книги и подкасты для друзей Читавука. */
export function AdminSupporterLibraryPanel() {
  const [items, setItems] = useState<LibraryItem[] | null>(null);
  const [editing, setEditing] = useState<{ id: string | null; value: LibraryItemInput } | null>(null);
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    try {
      setItems(await getAdminLibrary());
    } catch (caught) {
      setError(caught instanceof ApiError ? caught.message : 'Не удалось загрузить библиотеку.');
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const edit = async (item: LibraryItem) => {
    setError('');
    try {
      const full = await getLibraryItem(item.id);
      setEditing({
        id: item.id,
        value: {
          kind: full.kind, title: full.title, author: full.author, description: full.description,
          level: full.level, coverUrl: full.coverUrl, body: full.body ?? '', published: full.published,
        },
      });
    } catch (caught) {
      setError(caught instanceof ApiError ? caught.message : 'Не удалось открыть запись.');
    }
  };

  const remove = async (item: LibraryItem) => {
    const sure = await askConfirm(`Удалить «${item.title}»?`, {
      text: 'Запись и её аудио исчезнут из закрытой библиотеки.',
      confirmLabel: 'Удалить',
      danger: true,
    });
    if (!sure) return;
    try {
      await deleteLibraryItem(item.id);
      await load();
    } catch (caught) {
      setError(caught instanceof ApiError ? caught.message : 'Не удалось удалить.');
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 className="text-2xl">Закрытая библиотека</h2>
          <p className="mt-1 text-sm text-[var(--text-muted)]">
            Видна друзьям Читавука на странице /friends-library. Черновики видишь только ты.
          </p>
        </div>
        {!editing && <Button size="sm" onClick={() => setEditing({ id: null, value: EMPTY })}>Добавить</Button>}
      </div>
      {error && <ErrorNote>{error}</ErrorNote>}
      {editing && (
        <ItemForm
          key={editing.id ?? 'new'}
          id={editing.id}
          initial={editing.value}
          onDone={async () => {
            setEditing(null);
            await load();
          }}
          onCancel={() => setEditing(null)}
        />
      )}
      {!items && !error && <div className="flex justify-center py-10"><Spinner className="size-6" /></div>}
      {items && items.length === 0 && !editing && <p className="text-[var(--text-muted)]">Записей пока нет.</p>}
      {items && items.length > 0 && (
        <ul className="divide-y divide-[var(--line)] rounded-2xl border border-[var(--line)] bg-[var(--bg-raised)]">
          {items.map((item) => (
            <li key={item.id} className="flex flex-wrap items-center gap-3 px-4 py-3">
              {item.kind === 'book'
                ? <LuBookOpen className="size-5 text-[var(--accent)]" aria-label="Книга" />
                : <LuHeadphones className="size-5 text-[var(--accent)]" aria-label="Подкаст" />}
              <div className="min-w-0 flex-1">
                <p className="font-semibold">{item.title}</p>
                <p className="text-xs text-[var(--text-muted)]">
                  {[item.author, item.level, `${item.bodyChars.toLocaleString('ru-RU')} знаков`, item.audioSize ? `аудио ${formatSize(item.audioSize)}` : ''].filter(Boolean).join(', ')}
                </p>
              </div>
              <span className={['rounded-full px-2.5 py-1 text-xs font-bold', item.published ? 'bg-[var(--success-soft)] text-[var(--success)]' : 'bg-[var(--bg-sunken)] text-[var(--text-muted)]'].join(' ')}>
                {item.published ? 'опубликовано' : 'черновик'}
              </span>
              <button type="button" onClick={() => void edit(item)} className="grid size-9 place-items-center rounded-xl hover:bg-[var(--bg-sunken)]" aria-label={`Изменить «${item.title}»`}>
                <LuPencil className="size-4" aria-hidden="true" />
              </button>
              <button type="button" onClick={() => void remove(item)} className="grid size-9 place-items-center rounded-xl text-[var(--error)] hover:bg-[var(--error-soft)]" aria-label={`Удалить «${item.title}»`}>
                <LuTrash2 className="size-4" aria-hidden="true" />
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function ItemForm({
  id,
  initial,
  onDone,
  onCancel,
}: {
  id: string | null;
  initial: LibraryItemInput;
  onDone: () => Promise<void>;
  onCancel: () => void;
}) {
  const [value, setValue] = useState(initial);
  const [audio, setAudio] = useState<File | null>(null);
  const [progress, setProgress] = useState<number | null>(null);
  const [busy, setBusy] = useState('');
  const [error, setError] = useState('');
  const fileRef = useRef<HTMLInputElement>(null);
  const set = (patch: Partial<LibraryItemInput>) => setValue((current) => ({ ...current, ...patch }));

  const importFile = async (file: File) => {
    setBusy('Извлекаю текст…');
    setError('');
    try {
      const document = await extractDocument(file);
      const text = document.paragraphs?.length ? document.paragraphs.join('\n\n') : document.text;
      set({ body: text, title: value.title || document.title });
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Файл не прочитался.');
    } finally {
      setBusy('');
    }
  };

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setError('');
    setBusy('Сохраняю…');
    try {
      const saved = id ? await updateLibraryItem(id, value) : await createLibraryItem(value);
      if (audio) {
        setBusy('Загружаю аудио…');
        setProgress(0);
        await uploadLibraryAudio(saved.id, audio, setProgress);
      }
      await onDone();
    } catch (caught) {
      setError(caught instanceof ApiError ? caught.message : 'Не удалось сохранить.');
    } finally {
      setBusy('');
      setProgress(null);
    }
  };

  return (
    <form onSubmit={submit} className="space-y-3 rounded-2xl border border-[var(--accent)]/30 bg-[var(--bg-raised)] p-5">
      <div className="flex flex-wrap gap-2">
        {(['book', 'podcast'] as const).map((kind) => (
          <button
            key={kind}
            type="button"
            aria-pressed={value.kind === kind}
            onClick={() => set({ kind })}
            className={['rounded-xl border px-3.5 py-2 text-sm font-semibold', value.kind === kind ? 'border-[var(--accent)] bg-[var(--accent)] text-parchment' : 'border-[var(--line)]'].join(' ')}
          >
            {kind === 'book' ? 'Книга' : 'Подкаст'}
          </button>
        ))}
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        <input className={input} placeholder="Название" value={value.title} onChange={(e) => set({ title: e.target.value })} required maxLength={200} />
        <input className={input} placeholder="Автор" value={value.author} onChange={(e) => set({ author: e.target.value })} maxLength={200} />
        <select className={input} value={value.level} onChange={(e) => set({ level: e.target.value })} aria-label="Уровень">
          <option value="">Уровень не указан</option>
          {['A1', 'A2', 'B1', 'B2', 'C1', 'C2'].map((level) => <option key={level} value={level}>{level}</option>)}
        </select>
        <input className={input} placeholder="Обложка: ссылка https://…" value={value.coverUrl} onChange={(e) => set({ coverUrl: e.target.value })} />
      </div>
      <textarea className={input} rows={2} placeholder="Короткое описание" value={value.description} onChange={(e) => set({ description: e.target.value })} maxLength={2000} />
      <div>
        <div className="mb-1.5 flex flex-wrap items-center justify-between gap-2">
          <span className="text-sm font-semibold">{value.kind === 'book' ? 'Текст книги' : 'Расшифровка (необязательно)'}</span>
          <button type="button" className="inline-flex items-center gap-1.5 text-sm font-semibold text-[var(--accent)]" onClick={() => fileRef.current?.click()}>
            <LuUpload className="size-4" aria-hidden="true" /> Из файла: TXT, DOCX, PDF, EPUB, FB2
          </button>
          <input ref={fileRef} type="file" hidden accept=".txt,.docx,.pdf,.epub,.fb2,.djvu,text/plain" onChange={(e) => { const file = e.target.files?.[0]; if (file) void importFile(file); e.target.value = ''; }} />
        </div>
        <textarea className={`${input} font-mono`} rows={8} placeholder="Абзацы разделяются пустой строкой" value={value.body} onChange={(e) => set({ body: e.target.value })} />
        <p className="mt-1 text-xs text-[var(--text-muted)]">{value.body.length.toLocaleString('ru-RU')} знаков</p>
      </div>
      {value.kind === 'podcast' && (
        <label className="block text-sm">
          <span className="font-semibold">Аудио {id ? '(загрузить новое вместо прежнего)' : ''}</span>
          <input type="file" accept="audio/*" className="mt-1.5 block text-sm" onChange={(e) => setAudio(e.target.files?.[0] ?? null)} />
        </label>
      )}
      <label className="flex items-center gap-2 text-sm">
        <input type="checkbox" checked={value.published} onChange={(e) => set({ published: e.target.checked })} className="size-4 accent-[var(--accent)]" />
        Опубликовать для друзей Читавука
      </label>
      {progress !== null && (
        <div className="h-2 overflow-hidden rounded-full bg-[var(--bg-sunken)]">
          <div className="h-full bg-[var(--accent)] transition-[width]" style={{ width: `${Math.round(progress * 100)}%` }} />
        </div>
      )}
      {error && <ErrorNote>{error}</ErrorNote>}
      <div className="flex flex-wrap items-center gap-2">
        <Button type="submit" size="sm" disabled={Boolean(busy)}>{busy || (id ? 'Сохранить' : 'Добавить')}</Button>
        <Button type="button" size="sm" variant="ghost" onClick={onCancel} disabled={Boolean(busy)}>Отмена</Button>
      </div>
    </form>
  );
}
