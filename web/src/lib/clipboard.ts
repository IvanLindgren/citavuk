/** Единый разбор содержимого системного буфера для импорта.
 *
 * Файл имеет приоритет над текстовой репрезентацией: файловые менеджеры и
 * мессенджеры часто кладут в буфер одновременно имя/URL и сам бинарный файл.
 * Вызов `navigator.clipboard.read()` делается только из пользовательского
 * клика, а paste-событие используется как fallback для Safari и Firefox.
 */

export type ClipboardPayload =
  | { kind: 'file'; file: File }
  | { kind: 'text'; text: string };

const DOCUMENT_EXTENSIONS = new Set([
  'txt', 'md', 'pdf', 'docx', 'fb2', 'epub', 'djvu', 'djv', 'html', 'htm',
]);
const AUDIO_EXTENSIONS = new Set(['mp3', 'm4a', 'wav', 'ogg', 'oga', 'flac', 'webm', 'aac']);

export function isAudioClipboardFile(file: File): boolean {
  const extension = extensionOf(file.name);
  return file.type.startsWith('audio/') || AUDIO_EXTENSIONS.has(extension);
}

export function isDocumentClipboardFile(file: File): boolean {
  return DOCUMENT_EXTENSIONS.has(extensionOf(file.name)) ||
    file.type === 'text/plain' ||
    file.type === 'text/markdown' ||
    file.type === 'application/pdf';
}

/** Извлекает содержимое из настоящего browser paste event. */
export function payloadFromPasteEvent(event: ClipboardEvent): ClipboardPayload | null {
  const files = Array.from(event.clipboardData?.files ?? []);
  const file = files.find((candidate) => isAudioClipboardFile(candidate) || isDocumentClipboardFile(candidate));
  if (file) return { kind: 'file', file };
  const text = event.clipboardData?.getData('text/plain').trim() ?? '';
  return text ? { kind: 'text', text } : null;
}

/** Читает буфер по нажатию кнопки (работает, когда нет focused input). */
export async function readClipboardPayload(): Promise<ClipboardPayload | null> {
  const clipboard = navigator.clipboard as (Clipboard & {
    read?: () => Promise<ClipboardItems>;
  }) | undefined;
  if (typeof clipboard?.read === 'function') {
    try {
      const items = await clipboard.read();
      for (const item of items) {
        const type = item.types.find((value) =>
          value.startsWith('audio/') || isSupportedMime(value),
        );
        if (type) {
          const blob = await item.getType(type);
          const extension = extensionForMime(type);
          return {
            kind: 'file',
            file: new File([blob], `Вставка${extension}`, { type }),
          };
        }
      }
    } catch {
      // Safari может запретить async clipboard даже после клика. Ниже
      // пробуем обычный текст; paste event остаётся надёжным fallback.
    }
  }
  if (typeof clipboard?.readText === 'function') {
    const text = (await clipboard.readText()).trim();
    return text ? { kind: 'text', text } : null;
  }
  return null;
}

function extensionOf(name: string): string {
  return name.split('.').pop()?.toLowerCase() ?? '';
}

function extensionForMime(mime: string): string {
  const mapping: Record<string, string> = {
    'audio/mpeg': '.mp3',
    'audio/mp3': '.mp3',
    'audio/mp4': '.m4a',
    'audio/x-m4a': '.m4a',
    'audio/wav': '.wav',
    'audio/x-wav': '.wav',
    'audio/ogg': '.ogg',
    'audio/flac': '.flac',
    'audio/webm': '.webm',
    'application/pdf': '.pdf',
    'text/markdown': '.md',
    'text/html': '.html',
  };
  return mapping[mime] ?? (mime.startsWith('audio/') ? '.audio' : '.txt');
}

function isSupportedMime(mime: string): boolean {
  return mime.startsWith('text/') ||
    mime === 'application/pdf' ||
    mime === 'application/epub+zip' ||
    mime.includes('wordprocessingml');
}
