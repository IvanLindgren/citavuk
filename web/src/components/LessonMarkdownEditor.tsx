import { useRef, useState, type ChangeEvent, type KeyboardEvent } from 'react';
import {
  LuBold,
  LuCode,
  LuColumns2,
  LuEye,
  LuHeading1,
  LuHeading2,
  LuImagePlus,
  LuItalic,
  LuLink,
  LuList,
  LuListOrdered,
  LuMinus,
  LuPenLine,
  LuQuote,
  LuStrikethrough,
  LuTable2,
  LuVideo,
  LuX,
} from 'react-icons/lu';

import { uploadLessonImage, type LessonContent } from '../api/lessons';
import { plainMarkdownLength, tableMarkdown } from '../lib/lessonMarkdown';
import { MarkdownLesson } from './MarkdownLesson';
import { Spinner } from './ui';

type EditorMode = 'write' | 'split' | 'preview';
type DocumentStyle = NonNullable<LessonContent['documentStyle']>;

export function LessonMarkdownEditor({
  value,
  documentStyle,
  onChange,
  onStyleChange,
}: {
  value: string;
  documentStyle: DocumentStyle;
  onChange: (value: string) => void;
  onStyleChange: (value: DocumentStyle) => void;
}) {
  const textarea = useRef<HTMLTextAreaElement | null>(null);
  const imageInput = useRef<HTMLInputElement | null>(null);
  const [mode, setMode] = useState<EditorMode>('split');
  const [tableOpen, setTableOpen] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState('');
  const chars = plainMarkdownLength(value);

  const replaceSelection = (before: string, after = '', placeholder = '') => {
    const input = textarea.current;
    if (!input) return;
    const start = input.selectionStart;
    const end = input.selectionEnd;
    const selected = value.slice(start, end) || placeholder;
    const next = `${value.slice(0, start)}${before}${selected}${after}${value.slice(end)}`;
    onChange(next);
    requestAnimationFrame(() => {
      input.focus();
      input.setSelectionRange(start + before.length, start + before.length + selected.length);
    });
  };

  const prefixLines = (prefix: string) => {
    const input = textarea.current;
    if (!input) return;
    const start = value.lastIndexOf('\n', Math.max(0, input.selectionStart - 1)) + 1;
    const lineEnd = value.indexOf('\n', input.selectionEnd);
    const end = lineEnd < 0 ? value.length : lineEnd;
    const selected = value.slice(start, end) || 'Текст';
    const next = selected.split('\n').map((line, index) => prefix.replace('{n}', String(index + 1)) + line).join('\n');
    onChange(`${value.slice(0, start)}${next}${value.slice(end)}`);
    requestAnimationFrame(() => {
      input.focus();
      input.setSelectionRange(start, start + next.length);
    });
  };

  const insertBlock = (snippet: string) => {
    const input = textarea.current;
    if (!input) return;
    const start = input.selectionStart;
    const needsBefore = start > 0 && !value.slice(0, start).endsWith('\n\n');
    const needsAfter = start < value.length && !value.slice(start).startsWith('\n\n');
    const text = `${needsBefore ? '\n\n' : ''}${snippet}${needsAfter ? '\n\n' : ''}`;
    const next = `${value.slice(0, start)}${text}${value.slice(start)}`;
    onChange(next);
    requestAnimationFrame(() => {
      input.focus();
      input.setSelectionRange(start + text.length, start + text.length);
    });
  };

  const applyFont = (fontFamily: DocumentStyle['fontFamily']) => {
    const input = textarea.current;
    if (input && input.selectionStart !== input.selectionEnd) {
      replaceSelection(`{font=${fontFamily}}`, '{/font}');
    } else {
      onStyleChange({ ...documentStyle, fontFamily });
    }
  };

  const applySize = (fontSize: number) => {
    const input = textarea.current;
    if (input && input.selectionStart !== input.selectionEnd) {
      replaceSelection(`{size=${fontSize}}`, '{/size}');
    } else {
      onStyleChange({ ...documentStyle, fontSize });
    }
  };

  const onKeyDown = (event: KeyboardEvent<HTMLTextAreaElement>) => {
    if (!(event.ctrlKey || event.metaKey)) return;
    const key = event.key.toLowerCase();
    if (key === 'b') {
      event.preventDefault();
      replaceSelection('**', '**', 'жирный текст');
    } else if (key === 'i') {
      event.preventDefault();
      replaceSelection('*', '*', 'курсив');
    } else if (key === 'k') {
      event.preventDefault();
      replaceSelection('[', '](https://)', 'ссылка');
    }
  };

  const uploadImage = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;
    setUploading(true);
    setUploadError('');
    try {
      const url = await uploadLessonImage(file);
      insertBlock(`![${file.name.replace(/\.[^.]+$/, '')}](${url})`);
    } catch (caught) {
      setUploadError(caught instanceof Error ? caught.message : 'Не удалось загрузить изображение.');
    } finally {
      setUploading(false);
      event.target.value = '';
    }
  };

  return (
    <section className="mt-10">
      <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 className="text-2xl">Материал</h2>
          <p className={`mt-1 font-sans text-sm ${chars > 6000 ? 'text-red-600' : 'text-[var(--text-muted)]'}`}>{chars} / 6000 знаков</p>
        </div>
        <div className="flex rounded-md border border-[var(--line)] bg-[var(--bg-raised)] p-1" aria-label="Режим редактора">
          <ModeButton active={mode === 'write'} title="Редактор" onClick={() => setMode('write')}><LuPenLine /></ModeButton>
          <ModeButton active={mode === 'split'} title="Редактор и результат" onClick={() => setMode('split')}><LuColumns2 /></ModeButton>
          <ModeButton active={mode === 'preview'} title="Результат" onClick={() => setMode('preview')}><LuEye /></ModeButton>
        </div>
      </div>

      <div className="overflow-hidden rounded-md border border-[var(--line)] bg-[var(--bg-raised)] shadow-[var(--shadow-soft)]">
        {mode !== 'preview' && (
          <div className="flex flex-wrap items-center gap-1 border-b border-[var(--line)] bg-[var(--bg-sunken)]/45 px-2 py-2">
            <ToolButton title="Заголовок 1" onClick={() => prefixLines('# ')}><LuHeading1 /></ToolButton>
            <ToolButton title="Заголовок 2" onClick={() => prefixLines('## ')}><LuHeading2 /></ToolButton>
            <span className="mx-1 h-6 w-px bg-[var(--line)]" />
            <ToolButton title="Жирный" onClick={() => replaceSelection('**', '**', 'жирный текст')}><LuBold /></ToolButton>
            <ToolButton title="Курсив" onClick={() => replaceSelection('*', '*', 'курсив')}><LuItalic /></ToolButton>
            <ToolButton title="Зачёркнутый" onClick={() => replaceSelection('~~', '~~', 'текст')}><LuStrikethrough /></ToolButton>
            <ToolButton title="Код" onClick={() => replaceSelection('`', '`', 'код')}><LuCode /></ToolButton>
            <ToolButton title="Ссылка" onClick={() => replaceSelection('[', '](https://)', 'ссылка')}><LuLink /></ToolButton>
            <span className="mx-1 h-6 w-px bg-[var(--line)]" />
            <ToolButton title="Цитата" onClick={() => prefixLines('> ')}><LuQuote /></ToolButton>
            <ToolButton title="Маркированный список" onClick={() => prefixLines('- ')}><LuList /></ToolButton>
            <ToolButton title="Нумерованный список" onClick={() => prefixLines('{n}. ')}><LuListOrdered /></ToolButton>
            <ToolButton title="Таблица" onClick={() => setTableOpen(true)}><LuTable2 /></ToolButton>
            <ToolButton title="Разделитель" onClick={() => insertBlock('---')}><LuMinus /></ToolButton>
            <ToolButton title="Видео" onClick={() => insertBlock('@[video](https://)')}><LuVideo /></ToolButton>
            <ToolButton title="Изображение" onClick={() => imageInput.current?.click()} disabled={uploading}>{uploading ? <Spinner /> : <LuImagePlus />}</ToolButton>
            <input ref={imageInput} className="sr-only" type="file" accept="image/jpeg,image/png,image/webp,image/gif" onChange={(event) => void uploadImage(event)} />
            <span className="mx-1 h-6 w-px bg-[var(--line)]" />
            <select aria-label="Шрифт выделения или документа" title="Шрифт выделения или документа" value="" onChange={(event) => applyFont(event.target.value as DocumentStyle['fontFamily'])} className="h-9 rounded border border-transparent bg-transparent px-2 text-sm hover:bg-[var(--bg-raised)]">
              <option value="" disabled>Шрифт</option>
              <option value="serif">Lora</option>
              <option value="sans">Noto Sans</option>
            </select>
            <select aria-label="Размер выделения или документа" title="Размер выделения или документа" value="" onChange={(event) => applySize(Number(event.target.value))} className="h-9 rounded border border-transparent bg-transparent px-2 text-sm hover:bg-[var(--bg-raised)]">
              <option value="" disabled>Размер</option>
              {[16, 18, 20, 24, 28, 32].map((size) => <option key={size} value={size}>{size}</option>)}
            </select>
          </div>
        )}

        <div className={mode === 'split' ? 'grid grid-cols-[minmax(0,1fr)] lg:grid-cols-2' : ''}>
          {mode !== 'preview' && (
            <div className={mode === 'split' ? 'border-b border-[var(--line)] lg:border-b-0 lg:border-r' : ''}>
              <textarea
                ref={textarea}
                aria-label="Материал урока в Markdown"
                value={value}
                onChange={(event) => onChange(event.target.value)}
                onKeyDown={onKeyDown}
                placeholder="Начните писать материал урока…"
                spellCheck
                className="min-h-[36rem] w-full resize-y bg-transparent px-6 py-7 font-sans text-base leading-8 outline-none sm:px-8"
              />
            </div>
          )}
          {mode !== 'write' && (
            <div className="paper-grain relative min-h-[36rem] overflow-hidden bg-[var(--bg-raised)] px-6 py-7 sm:px-8">
              {/* Ограничение длины строки то же, что в опубликованном уроке
                  (LessonPlayer): предпросмотр, выглядящий иначе, хуже, чем
                  никакого — автор верстает под одну ширину, а ученик видит
                  другую. */}
              <MarkdownLesson
                content={{ theory: [], exercises: [], markdown: value, documentStyle }}
                className="mx-auto max-w-[62ch]"
              />
            </div>
          )}
        </div>
      </div>
      {uploadError && <p className="mt-2 text-sm text-red-600">{uploadError}</p>}
      {tableOpen && <TableBuilder onClose={() => setTableOpen(false)} onInsert={(rows) => { insertBlock(tableMarkdown(rows)); setTableOpen(false); }} />}
    </section>
  );
}

function TableBuilder({ onClose, onInsert }: { onClose: () => void; onInsert: (rows: string[][]) => void }) {
  const [rows, setRows] = useState(3);
  const [columns, setColumns] = useState(2);
  const [cells, setCells] = useState<string[][]>(() => [['Сербский', 'Русский'], ['', ''], ['', '']]);

  const resize = (nextRows: number, nextColumns: number) => {
    setRows(nextRows);
    setColumns(nextColumns);
    setCells((current) => Array.from({ length: nextRows }, (_, row) => Array.from({ length: nextColumns }, (_, column) => current[row]?.[column] ?? '')));
  };

  const setCell = (row: number, column: number, value: string) => {
    setCells((current) => current.map((line, rowIndex) => rowIndex === row ? line.map((cell, columnIndex) => columnIndex === column ? value : cell) : line));
  };

  return (
    <div className="fixed inset-0 z-[80] grid place-items-center bg-black/45 p-4" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}>
      <div role="dialog" aria-modal="true" aria-labelledby="table-title" className="max-h-[90vh] w-full max-w-3xl overflow-auto rounded-md border border-[var(--line)] bg-[var(--bg-raised)] p-5 shadow-[var(--shadow-lift)]">
        <div className="flex items-center justify-between gap-4">
          <h3 id="table-title" className="text-xl">Таблица</h3>
          <ToolButton title="Закрыть" onClick={onClose}><LuX /></ToolButton>
        </div>
        <div className="mt-4 flex flex-wrap gap-3 font-sans text-sm">
          <label className="flex items-center gap-2">Строки<input type="number" min={2} max={12} value={rows} onChange={(event) => resize(Math.min(12, Math.max(2, Number(event.target.value))), columns)} className="w-16 rounded border border-[var(--line)] bg-[var(--bg)] px-2 py-1.5" /></label>
          <label className="flex items-center gap-2">Столбцы<input type="number" min={2} max={6} value={columns} onChange={(event) => resize(rows, Math.min(6, Math.max(2, Number(event.target.value))))} className="w-16 rounded border border-[var(--line)] bg-[var(--bg)] px-2 py-1.5" /></label>
        </div>
        <div className="mt-5 overflow-x-auto rounded border border-[var(--line)]">
          <div className="grid min-w-[30rem]" style={{ gridTemplateColumns: `repeat(${columns}, minmax(9rem, 1fr))` }}>
            {cells.flatMap((line, row) => line.map((cell, column) => (
              <input key={`${row}-${column}`} value={cell} onChange={(event) => setCell(row, column, event.target.value)} placeholder={row === 0 ? `Заголовок ${column + 1}` : `Ячейка ${row + 1}.${column + 1}`} className={`min-w-0 border-b border-r border-[var(--line)] bg-transparent px-3 py-3 outline-none focus:bg-[var(--bg)] ${row === 0 ? 'font-bold' : ''}`} />
            )))}
          </div>
        </div>
        <div className="mt-5 flex justify-end gap-2">
          <button type="button" onClick={onClose} className="rounded-md px-4 py-2 font-semibold text-[var(--text-muted)] hover:bg-[var(--bg-sunken)]">Отмена</button>
          <button type="button" onClick={() => onInsert(cells)} className="rounded-md bg-[var(--accent)] px-4 py-2 font-semibold text-white hover:bg-[var(--accent-hover)]">Вставить</button>
        </div>
      </div>
    </div>
  );
}

function ToolButton({ title, onClick, disabled, children }: { title: string; onClick: () => void; disabled?: boolean; children: React.ReactNode }) {
  return <button type="button" title={title} aria-label={title} disabled={disabled} onClick={onClick} className="grid size-9 place-items-center rounded text-lg text-[var(--text-muted)] hover:bg-[var(--bg-raised)] hover:text-[var(--text)] disabled:opacity-40">{children}</button>;
}

function ModeButton({ title, active, onClick, children }: { title: string; active: boolean; onClick: () => void; children: React.ReactNode }) {
  return <button type="button" title={title} aria-label={title} aria-pressed={active} onClick={onClick} className={`grid size-8 place-items-center rounded text-base ${active ? 'bg-[var(--accent)] text-white' : 'text-[var(--text-muted)] hover:bg-[var(--bg-sunken)]'}`}>{children}</button>;
}
