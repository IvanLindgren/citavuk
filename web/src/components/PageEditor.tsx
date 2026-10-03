import { useRef, useState, type ClipboardEvent, type KeyboardEvent, type MouseEvent } from 'react';
import { LuBold, LuHighlighter, LuImagePlus, LuItalic, LuPlus, LuRemoveFormatting, LuTrash2, LuUnderline } from 'react-icons/lu';

import { uploadBookImage } from '../api/bookImages';
import { imageParagraph, parseBlock, richParagraph, type TextSpan } from '../lib/blocks';

/**
 * Правка страницы книги: текст, оформление и картинки.
 *
 * Каждый абзац — отдельное поле. Поле не управляется React: содержимое
 * задаётся один раз при монтировании и читается обратно только при
 * сохранении. Перерисовка на каждый знак сбивала бы курсор и тормозила бы на
 * длинном абзаце — правка должна оставаться лёгкой.
 *
 * Оформление хранится не тегами в тексте, а отрезками рядом с ним (см.
 * lib/blocks.ts): разбор слова по нажатию, перевод и поиск видят чистый текст.
 */

type Item =
  | { id: number; kind: 'text'; html: string }
  | { id: number; kind: 'image'; url: string; alt: string }
  | { id: number; kind: 'raw'; paragraph: string };

const MARKER_COLOR = '#f6e27a';

function escapeHtml(text: string): string {
  return text.replace(/[&<>"]/g, (ch) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[ch]!);
}

/** Текст с отрезками стилей — в HTML для поля правки. */
export function spansToHtml(text: string, spans: TextSpan[] = []): string {
  const cuts = new Set([0, text.length]);
  for (const span of spans) {
    cuts.add(span.start);
    cuts.add(span.end);
  }
  const points = [...cuts].sort((a, b) => a - b);
  let html = '';
  for (let i = 0; i < points.length - 1; i++) {
    const from = points[i]!;
    const to = points[i + 1]!;
    if (from >= to) continue;
    const style = spans.filter((span) => span.start <= from && span.end >= to).map((span) => span.style).join('');
    let piece = escapeHtml(text.slice(from, to));
    if (style.includes('u')) piece = `<u>${piece}</u>`;
    if (style.includes('i')) piece = `<i>${piece}</i>`;
    if (style.includes('b')) piece = `<b>${piece}</b>`;
    if (style.includes('m')) piece = `<mark>${piece}</mark>`;
    html += piece;
  }
  return html;
}

function hasBackground(value: string): boolean {
  return value !== '' && value !== 'transparent' && !/^rgba\(\s*0,\s*0,\s*0,\s*0\s*\)$/.test(value);
}

/** Поле правки — обратно в текст и отрезки стилей. */
export function htmlToSpans(root: HTMLElement): { text: string; spans: TextSpan[] } {
  let text = '';
  const spans: TextSpan[] = [];
  const styleOf = (node: Node): string => {
    let style = '';
    for (let el = node.parentElement; el && el !== root; el = el.parentElement) {
      const tag = el.tagName;
      if (tag === 'B' || tag === 'STRONG' || Number(el.style.fontWeight) >= 600 || el.style.fontWeight === 'bold') style += 'b';
      if (tag === 'I' || tag === 'EM' || el.style.fontStyle === 'italic') style += 'i';
      if (tag === 'U' || el.style.textDecorationLine.includes('underline') || el.style.textDecoration.includes('underline')) style += 'u';
      if (tag === 'MARK' || hasBackground(el.style.backgroundColor)) style += 'm';
    }
    return style;
  };
  const walk = (node: Node) => {
    if (node.nodeType === Node.TEXT_NODE) {
      const value = (node.textContent ?? '').replace(/\s+/g, ' ');
      if (!value) return;
      const style = styleOf(node);
      if (style) spans.push({ start: text.length, end: text.length + value.length, style });
      text += value;
      return;
    }
    if (node.nodeName === 'BR') {
      text += ' ';
      return;
    }
    node.childNodes.forEach(walk);
  };
  walk(root);
  // Пробелы по краям обрезаются, и отрезки сдвигаются вместе с текстом.
  const lead = text.length - text.trimStart().length;
  const trimmed = text.trim();
  return {
    text: trimmed,
    spans: spans.map((span) => ({ ...span, start: span.start - lead, end: span.end - lead })),
  };
}

let nextId = 1;

function toItems(paragraphs: string[]): Item[] {
  return paragraphs.map((paragraph) => {
    const block = parseBlock(paragraph);
    if (block.kind === 'text') return { id: nextId++, kind: 'text', html: spansToHtml(block.text, block.spans) };
    if (block.kind === 'image') return { id: nextId++, kind: 'image', url: block.url, alt: block.alt };
    // Таблицы правкой страницы не меняются: остаются как были.
    return { id: nextId++, kind: 'raw', paragraph };
  });
}

/** Кнопка панели: не забирает фокус у поля, иначе пропадёт выделение. */
function ToolButton({ label, onPress, children }: { label: string; onPress: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      title={label}
      aria-label={label}
      onMouseDown={(event: MouseEvent) => {
        event.preventDefault();
        onPress();
      }}
      className="flex size-10 items-center justify-center rounded-xl border border-[var(--line)] bg-[var(--bg-raised)] text-[var(--text)] transition-colors hover:border-[var(--accent)] hover:text-[var(--accent)]"
    >
      {children}
    </button>
  );
}

export function PageEditor({
  paragraphs,
  canUploadImages,
  onSave,
  onCancel,
}: {
  paragraphs: string[];
  canUploadImages: boolean;
  onSave: (next: string[]) => Promise<void>;
  onCancel: () => void;
}) {
  const [items, setItems] = useState<Item[]>(() => toItems(paragraphs));
  const fields = useRef(new Map<number, HTMLDivElement>());
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState('');
  const fileInput = useRef<HTMLInputElement>(null);
  const insertAt = useRef(0);

  const format = (command: 'bold' | 'italic' | 'underline' | 'marker' | 'clear') => {
    // Теги, а не стили: <b>, <i>, <u> надёжнее разбирать обратно.
    document.execCommand('styleWithCSS', false, 'false');
    if (command === 'marker') document.execCommand('hiliteColor', false, MARKER_COLOR);
    else if (command === 'clear') document.execCommand('removeFormat');
    else document.execCommand(command);
  };

  const keepPlain = (event: ClipboardEvent<HTMLDivElement>) => {
    event.preventDefault();
    document.execCommand('insertText', false, event.clipboardData.getData('text/plain').replace(/\s+/g, ' '));
  };

  // Enter внутри абзаца не разрывает его: абзацы добавляются кнопкой между
  // ними, а перенос строки внутри абзаца читалка всё равно не покажет.
  const noEnter = (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.key === 'Enter') event.preventDefault();
  };

  const insert = (index: number, item: Item) => setItems((list) => [...list.slice(0, index), item, ...list.slice(index)]);
  const remove = (id: number) => setItems((list) => list.filter((item) => item.id !== id));

  const pickImage = (index: number) => {
    insertAt.current = index;
    fileInput.current?.click();
  };

  const onFile = async (file: File | undefined) => {
    if (!file) return;
    setUploading(true);
    setError('');
    try {
      const url = await uploadBookImage(file);
      if (!url) {
        setError('Подойдёт картинка JPEG, PNG, WebP или GIF до 10 МБ.');
        return;
      }
      insert(insertAt.current, { id: nextId++, kind: 'image', url, alt: '' });
    } catch {
      setError('Не удалось загрузить картинку. Попробуй ещё раз.');
    } finally {
      setUploading(false);
      if (fileInput.current) fileInput.current.value = '';
    }
  };

  const save = async () => {
    const next: string[] = [];
    for (const item of items) {
      if (item.kind === 'image') next.push(imageParagraph(item.url, item.alt));
      else if (item.kind === 'raw') next.push(item.paragraph);
      else {
        const field = fields.current.get(item.id);
        if (!field) continue;
        const { text, spans } = htmlToSpans(field);
        if (text) next.push(richParagraph(text, spans));
      }
    }
    setSaving(true);
    setError('');
    try {
      await onSave(next);
    } catch {
      setError('Не удалось сохранить правку.');
      setSaving(false);
    }
  };

  const adder = (index: number) => (
    <div className="flex justify-center gap-2 py-1 opacity-60 transition-opacity focus-within:opacity-100 hover:opacity-100">
      <button
        type="button"
        onClick={() => insert(index, { id: nextId++, kind: 'text', html: '' })}
        className="flex items-center gap-1 rounded-full px-3 py-1 text-xs font-semibold text-[var(--text-muted)] hover:bg-[var(--bg-sunken)] hover:text-[var(--accent)]"
      >
        <LuPlus className="size-3.5" aria-hidden="true" /> Абзац
      </button>
      {canUploadImages && (
        <button
          type="button"
          disabled={uploading}
          onClick={() => pickImage(index)}
          className="flex items-center gap-1 rounded-full px-3 py-1 text-xs font-semibold text-[var(--text-muted)] hover:bg-[var(--bg-sunken)] hover:text-[var(--accent)] disabled:opacity-50"
        >
          <LuImagePlus className="size-3.5" aria-hidden="true" /> {uploading ? 'Загружаю…' : 'Картинка'}
        </button>
      )}
    </div>
  );

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-[var(--bg)]" role="dialog" aria-modal="true" aria-label="Правка страницы">
      <header className="flex flex-wrap items-center gap-2 border-b border-[var(--line)] px-4 py-3 sm:px-6">
        <h2 className="mr-auto font-display text-xl">Правка страницы</h2>
        <div className="flex gap-1.5" role="toolbar" aria-label="Оформление выделенного текста">
          <ToolButton label="Жирный" onPress={() => format('bold')}><LuBold className="size-4" aria-hidden="true" /></ToolButton>
          <ToolButton label="Курсив" onPress={() => format('italic')}><LuItalic className="size-4" aria-hidden="true" /></ToolButton>
          <ToolButton label="Подчёркнутый" onPress={() => format('underline')}><LuUnderline className="size-4" aria-hidden="true" /></ToolButton>
          <ToolButton label="Маркер" onPress={() => format('marker')}><LuHighlighter className="size-4" aria-hidden="true" /></ToolButton>
          <ToolButton label="Убрать оформление" onPress={() => format('clear')}><LuRemoveFormatting className="size-4" aria-hidden="true" /></ToolButton>
        </div>
        <div className="flex gap-2">
          <button type="button" onClick={onCancel} className="rounded-xl px-4 py-2 text-sm font-semibold text-[var(--text-muted)] hover:text-[var(--text)]">
            Отмена
          </button>
          <button
            type="button"
            disabled={saving || uploading}
            onClick={() => void save()}
            className="rounded-xl bg-[var(--accent)] px-4 py-2 text-sm font-semibold text-parchment disabled:opacity-60"
          >
            {saving ? 'Сохраняю…' : 'Готово'}
          </button>
        </div>
      </header>
      {error && <p className="px-6 pt-3 text-sm text-[var(--danger,#b3261e)]">{error}</p>}
      <input ref={fileInput} type="file" accept="image/jpeg,image/png,image/webp,image/gif" hidden onChange={(e) => void onFile(e.target.files?.[0])} />
      <div className="flex-1 overflow-y-auto px-4 py-6 sm:px-6">
        <div lang="sr" className="mx-auto max-w-2xl">
          {adder(0)}
          {items.map((item, index) => (
            <div key={item.id}>
              <div className="group relative">
                {item.kind === 'text' && (
                  <div
                    ref={(el) => {
                      if (el && !fields.current.has(item.id)) {
                        el.innerHTML = item.html;
                      }
                      if (el) fields.current.set(item.id, el);
                      else fields.current.delete(item.id);
                    }}
                    contentEditable
                    suppressContentEditableWarning
                    spellCheck={false}
                    onPaste={keepPlain}
                    onKeyDown={noEnter}
                    aria-label={`Абзац ${index + 1}`}
                    className="min-h-[2.2em] rounded-xl border border-transparent px-3 py-2 font-display text-lg leading-relaxed outline-none transition-colors hover:border-[var(--line)] focus:border-[var(--accent)] focus:bg-[var(--bg-raised)] [&_mark]:rounded-sm [&_mark]:bg-[#f6e27a]/70"
                  />
                )}
                {item.kind === 'image' && (
                  <figure className="rounded-xl border border-[var(--line)] p-2">
                    <img src={item.url} alt={item.alt} className="mx-auto max-h-72 rounded-lg object-contain" />
                  </figure>
                )}
                {item.kind === 'raw' && (
                  <p className="rounded-xl border border-dashed border-[var(--line)] px-3 py-2 text-sm text-[var(--text-muted)]">
                    Таблица остаётся как есть.
                  </p>
                )}
                {item.kind !== 'raw' && (
                  <button
                    type="button"
                    onClick={() => remove(item.id)}
                    aria-label={item.kind === 'image' ? 'Удалить картинку' : 'Удалить абзац'}
                    title={item.kind === 'image' ? 'Удалить картинку' : 'Удалить абзац'}
                    className="absolute -right-2 -top-2 rounded-full border border-[var(--line)] bg-[var(--bg-raised)] p-1.5 text-[var(--text-muted)] transition-opacity hover:text-[var(--danger,#b3261e)] focus:opacity-100 sm:opacity-0 sm:group-hover:opacity-100"
                  >
                    <LuTrash2 className="size-3.5" aria-hidden="true" />
                  </button>
                )}
              </div>
              {adder(index + 1)}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
