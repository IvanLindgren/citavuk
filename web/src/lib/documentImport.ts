import { API_BASE } from '../api/client';
import { reflowDocument } from './reflow';

export type ImportStage =
  | 'downloading'
  | 'reading'
  | 'docx'
  | 'pdf'
  | 'ebook'
  | 'ocr'
  | 'saving';

export interface ImportedDocument {
  title: string;
  text: string;
  format: 'text' | 'docx' | 'pdf' | 'fb2' | 'epub' | 'djvu';
  pages?: number;
  ocrUsed?: boolean;
}

interface OcrResponse {
  text: string;
  pages: number;
  scannedPages: number;
  ocrUsed: boolean;
}

const MAX_FILE_BYTES = 32 * 1024 * 1024;
const MAX_BROWSER_OCR_PAGES = 12;
const PDF_MAGIC = '%PDF-';
const DJVU_MAGIC = 'AT&T';
const ZIP_MAGIC = 'PK';

export const IMPORT_STAGE_LABELS: Record<ImportStage, string> = {
  downloading: 'Скачиваем документ…',
  reading: 'Читаем файл…',
  docx: 'Извлекаем DOCX…',
  pdf: 'Извлекаем PDF…',
  ebook: 'Разбираем книгу…',
  ocr: 'Распознаём скан…',
  saving: 'Сохраняем…',
};

/**
 * Разбирает пользовательский документ. Тяжёлые библиотеки импортируются
 * динамически, поэтому посетитель библиотеки не загружает PDF.js и Mammoth,
 * пока действительно не выберет соответствующий файл.
 */
export async function extractDocument(
  file: File,
  onStage: (stage: ImportStage) => void = () => undefined,
): Promise<ImportedDocument> {
  if (file.size > MAX_FILE_BYTES) {
    throw new Error('Файл больше 32 МБ. Разделите его на несколько частей.');
  }

  onStage('reading');
  const header = new Uint8Array(await file.slice(0, 8).arrayBuffer());
  const signature = new TextDecoder('latin1').decode(header);
  const extension = file.name.split('.').pop()?.toLowerCase() ?? '';
  const title = file.name.replace(/\.(txt|md|pdf|docx|fb2|epub|djvu|djv|html?)$/i, '');

  if (
    extension === 'fb2' ||
    extension === 'epub' ||
    extension === 'djvu' ||
    extension === 'djv' ||
    extension === 'html' ||
    extension === 'htm' ||
    signature.startsWith(DJVU_MAGIC)
  ) {
    onStage('ebook');
    return { title, ...(await extractEbook(file, extension, signature)) };
  }

  if (extension === 'pdf' || signature.startsWith(PDF_MAGIC)) {
    onStage('pdf');
    const result = await extractPdf(file, onStage);
    return { title, format: 'pdf', ...result };
  }

  if (extension === 'docx' || signature.startsWith(ZIP_MAGIC)) {
    onStage('docx');
    const text = await extractDocx(file);
    return { title, text, format: 'docx' };
  }

  if (extension === 'doc') {
    throw new Error(
      'Старый формат .doc не поддерживается. Сохраните документ как .docx.',
    );
  }

  if (
    extension === 'txt' ||
    extension === 'md' ||
    file.type.startsWith('text/')
  ) {
    return { title, text: await file.text(), format: 'text' };
  }

  throw new Error(
    'Поддерживаются TXT, Markdown, PDF, DOCX, FB2, EPUB и DjVu.',
  );
}

/**
 * FB2, EPUB, DjVu и HTML.
 *
 * Разбор лежит в отдельных модулях и подгружается динамически: тот, кто открыл
 * PDF, не должен качать заодно распаковщик zip и декодер DjVu.
 */
async function extractEbook(
  file: File,
  extension: string,
  signature: string,
): Promise<{ text: string; format: ImportedDocument['format'] }> {
  const bytes = new Uint8Array(await file.arrayBuffer());

  if (
    extension === 'djvu' ||
    extension === 'djv' ||
    signature.startsWith(DJVU_MAGIC)
  ) {
    const { extractDjvuText } = await import('./formats/djvu');
    return { text: extractDjvuText(bytes), format: 'djvu' };
  }
  if (extension === 'epub') {
    const { extractEpub } = await import('./formats/ebook');
    return { text: extractEpub(bytes), format: 'epub' };
  }
  if (extension === 'fb2') {
    const { extractFb2 } = await import('./formats/ebook');
    return { text: extractFb2(bytes), format: 'fb2' };
  }
  const { extractHtml } = await import('./formats/ebook');
  return { text: extractHtml(await file.text()), format: 'text' };
}

/**
 * Импортирует прямую ссылку на документ либо обычную страницу со статьёй.
 * Бинарные файлы скачиваются через Go-сервер: прямой fetch в браузере обычно
 * блокируется CORS, а сервер дополнительно ограничивает размер и закрывает SSRF.
 */
export async function extractDocumentFromUrl(
  input: string,
  onStage: (stage: ImportStage) => void = () => undefined,
): Promise<ImportedDocument> {
  const remoteUrl = normalizeRemoteUrl(input);
  const extension = new URL(remoteUrl).pathname.split('.').pop()?.toLowerCase();
  const isDirectDocument = [
    'txt',
    'md',
    'pdf',
    'docx',
    'fb2',
    'epub',
    'djvu',
    'djv',
  ].includes(extension ?? '');

  onStage('downloading');
  if (isDirectDocument) {
    return extractDownloadedDocument(remoteUrl, onStage);
  }

  let articleError: Error | null = null;
  try {
    return await extractArticle(remoteUrl);
  } catch (caught) {
    articleError =
      caught instanceof Error
        ? caught
        : new Error('Не удалось извлечь текст по этой ссылке.');
  }

  // Ссылка без расширения может отдавать PDF/DOCX через Content-Disposition.
  try {
    return await extractDownloadedDocument(remoteUrl, onStage);
  } catch {
    throw articleError;
  }
}

async function extractDownloadedDocument(
  remoteUrl: string,
  onStage: (stage: ImportStage) => void,
): Promise<ImportedDocument> {
  const controller = new AbortController();
  const timer = window.setTimeout(() => controller.abort(), 90_000);
  try {
    const response = await fetch(
      `${API_BASE}/v1/documents/fetch?url=${encodeURIComponent(remoteUrl)}`,
      { signal: controller.signal },
    );
    if (!response.ok) {
      throw new Error(await responseError(response, 'Не удалось скачать документ.'));
    }
    const fallbackName =
      decodeURIComponent(new URL(remoteUrl).pathname.split('/').pop() ?? '') ||
      'document.txt';
    const filename =
      response.headers.get('X-Citavuk-Filename')?.trim() || fallbackName;
    const blob = await response.blob();
    const file = new File([blob], filename, {
      type: response.headers.get('Content-Type') ?? blob.type,
    });
    return await extractDocument(file, onStage);
  } catch (caught) {
    if (caught instanceof DOMException && caught.name === 'AbortError') {
      throw new Error('Скачивание заняло слишком много времени.');
    }
    if (caught instanceof Error) throw caught;
    throw new Error('Не удалось скачать документ.');
  } finally {
    window.clearTimeout(timer);
  }
}

async function extractArticle(remoteUrl: string): Promise<ImportedDocument> {
  const controller = new AbortController();
  const timer = window.setTimeout(() => controller.abort(), 45_000);
  try {
    const response = await fetch(
      `${API_BASE}/article?url=${encodeURIComponent(remoteUrl)}`,
      { signal: controller.signal },
    );
    if (!response.ok) {
      throw new Error(await responseError(response, 'Не удалось открыть страницу.'));
    }
    const result = (await response.json()) as {
      title?: string;
      paragraphs?: unknown;
      error?: string;
    };
    const paragraphs = Array.isArray(result.paragraphs)
      ? result.paragraphs.filter(
          (paragraph): paragraph is string =>
            typeof paragraph === 'string' && paragraph.trim().length > 0,
        )
      : [];
    if (result.error || paragraphs.length === 0) {
      throw new Error('На странице не удалось найти связный текст.');
    }
    const parsed = new URL(remoteUrl);
    const fallbackTitle =
      decodeURIComponent(parsed.pathname.split('/').filter(Boolean).pop() ?? '') ||
      parsed.hostname;
    return {
      title: result.title?.trim() || fallbackTitle,
      text: paragraphs.join('\n\n'),
      format: 'text',
    };
  } catch (caught) {
    if (caught instanceof DOMException && caught.name === 'AbortError') {
      throw new Error('Сайт слишком долго не отвечает.');
    }
    if (caught instanceof Error) throw caught;
    throw new Error('Не удалось извлечь текст по этой ссылке.');
  } finally {
    window.clearTimeout(timer);
  }
}

function normalizeRemoteUrl(input: string): string {
  const value = input.trim();
  if (!value) throw new Error('Вставьте ссылку на документ или статью.');
  let parsed: URL;
  try {
    parsed = new URL(/^https?:\/\//i.test(value) ? value : `https://${value}`);
  } catch {
    throw new Error('Ссылка записана неверно.');
  }
  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
    throw new Error('Поддерживаются только HTTP(S)-ссылки.');
  }
  return parsed.toString();
}

async function responseError(response: Response, fallback: string): Promise<string> {
  try {
    const result = (await response.clone().json()) as {
      message?: string;
      detail?: string;
    };
    return result.message?.trim() || result.detail?.trim() || fallback;
  } catch {
    return fallback;
  }
}

async function extractDocx(file: File): Promise<string> {
  const mammoth = await import('mammoth');
  const result = await mammoth.extractRawText({
    arrayBuffer: await file.arrayBuffer(),
  });
  const text = cleanExtractedText(result.value);
  if (!text) throw new Error('В DOCX не нашлось текста.');
  return text;
}


/**
 * Путь к worker PDF.js.
 *
 * Файл лежит в public/ как обычный .js, а не собирается Vite в .mjs. Причина в
 * MIME: расширения .mjs нет в стандартной таблице типов nginx, файл уходит как
 * application/octet-stream, и браузер отказывается исполнять модуль. Настройка
 * сервера это чинит, но ответ с неверным типом успевает закешироваться на год
 * с `immutable`, а имя файла у сборки завязано на хеш содержимого и уже не
 * поменяется — сломанным worker остаётся навсегда. С .js такой ловушки нет ни
 * на одном сервере.
 *
 * Версия в запросе обновляет кеш при обновлении pdfjs-dist.
 */
const PDF_WORKER_SRC = '/pdf.worker.js?v=6';

function configureWorker(options: { workerSrc: string }): void {
  options.workerSrc = PDF_WORKER_SRC;
}

async function extractPdf(
  file: File,
  onStage: (stage: ImportStage) => void,
): Promise<Omit<ImportedDocument, 'title' | 'format'>> {
  const pdfjs = await import('pdfjs-dist');
  configureWorker(pdfjs.GlobalWorkerOptions);

  const bytes = new Uint8Array(await file.arrayBuffer());
  const loadingTask = pdfjs.getDocument({ data: bytes });
  const document = await loadingTask.promise;
  // Строки хранятся по страницам, а не одной кучей: только так видно
  // колонтитулы — строку, повторяющуюся на каждой странице, внутри одной
  // страницы от текста не отличить.
  const pageLines: string[][] = [];
  const pages: string[] = [];
  let pagesWithoutText = 0;

  try {
    for (let pageNumber = 1; pageNumber <= document.numPages; pageNumber++) {
      const page = await document.getPage(pageNumber);
      const content = await page.getTextContent();
      const lines: string[] = [];
      let current = '';

      for (const item of content.items) {
        if (!('str' in item)) continue;
        current += item.str;
        if (item.hasEOL) {
          if (current.trim()) lines.push(current.trim());
          current = '';
        } else if (item.str && !/\s$/u.test(item.str)) {
          current += ' ';
        }
      }
      if (current.trim()) lines.push(current.trim());

      const text = cleanExtractedText(lines.join('\n'));
      pageLines.push(lines);
      pages.push(text);
      if (letterCount(text) < 30) pagesWithoutText++;
      page.cleanup();
    }
  } finally {
    await loadingTask.destroy();
  }

  // Абзацы восстанавливаются из строк, а не берутся как есть: PDF хранит
  // разбиение на строки страницы, а не на абзацы, и без сборки читалка
  // показывала целую страницу одним кирпичом текста.
  const nativeText = reflowDocument(pageLines).join('\n\n');
  const mostlyScanned =
    pagesWithoutText > 0 &&
    (pagesWithoutText >= Math.ceil(pages.length / 2) ||
      letterCount(nativeText) < Math.max(80, pages.length * 35));

  if (!mostlyScanned) {
    if (!nativeText) throw new Error('В PDF не нашлось текста.');
    return {
      text: nativeText,
      pages: pages.length,
      ocrUsed: false,
    };
  }

  onStage('ocr');
  try {
    return await extractWithServerOcr(file);
  } catch (serverError) {
    if (pagesWithoutText > MAX_BROWSER_OCR_PAGES) throw serverError;
    try {
      return await extractWithBrowserOcr(file, pages);
    } catch {
      throw serverError;
    }
  }
}

async function extractWithServerOcr(file: File): Promise<OcrResponse> {
  const controller = new AbortController();
  const timer = window.setTimeout(() => controller.abort(), 6 * 60_000);
  const form = new FormData();
  form.append('file', file, file.name);

  try {
    const response = await fetch(`${API_BASE}/documents/extract`, {
      method: 'POST',
      body: form,
      signal: controller.signal,
    });
    const body = await response.text();
    if (!response.ok) {
      try {
        const parsed = JSON.parse(body) as { detail?: string; message?: string };
        throw new Error(
          parsed.detail ||
            parsed.message ||
            `OCR не выполнился (${response.status}).`,
        );
      } catch (error) {
        if (error instanceof Error && !error.message.startsWith('Unexpected')) {
          throw error;
        }
        throw new Error(`OCR не выполнился (${response.status}).`);
      }
    }
    const result = JSON.parse(body) as OcrResponse;
    if (!result.text?.trim()) throw new Error('OCR не распознал текст в PDF.');
    return result;
  } catch (error) {
    if (error instanceof DOMException && error.name === 'AbortError') {
      throw new Error('OCR занял слишком много времени. Попробуйте файл поменьше.');
    }
    if (error instanceof Error) throw error;
    throw new Error('Не удалось связаться с сервисом OCR.');
  } finally {
    window.clearTimeout(timer);
  }
}

/**
 * Аварийный OCR для небольших файлов. Он нужен, когда бесплатный Space спит
 * или ещё не обновлён. Страницы распознаются последовательно одним worker,
 * поэтому память не растёт вместе с длиной PDF.
 */
async function extractWithBrowserOcr(
  file: File,
  nativePages: string[],
): Promise<OcrResponse> {
  const pdfjs = await import('pdfjs-dist');
  configureWorker(pdfjs.GlobalWorkerOptions);
  const { createWorker, PSM } = await import('tesseract.js');
  const loadingTask = pdfjs.getDocument({
    data: new Uint8Array(await file.arrayBuffer()),
  });
  const documentProxy = await loadingTask.promise;
  const output = [...nativePages];
  const scannedIndexes = output
    .map((text, index) => (letterCount(text) < 30 ? index : -1))
    .filter((index) => index >= 0);
  const worker = await createWorker(['srp', 'srp_latn']);

  try {
    await worker.setParameters({
      tessedit_pageseg_mode: PSM.SINGLE_BLOCK,
      preserve_interword_spaces: '1',
    });
    for (const index of scannedIndexes) {
      const page = await documentProxy.getPage(index + 1);
      const viewport = page.getViewport({ scale: 2.2 });
      const canvas = document.createElement('canvas');
      canvas.width = Math.ceil(viewport.width);
      canvas.height = Math.ceil(viewport.height);
      const context = canvas.getContext('2d', { alpha: false });
      if (!context) throw new Error('Браузер не создал поверхность для OCR.');
      await page.render({
        canvas,
        canvasContext: context,
        viewport,
      }).promise;
      const result = await worker.recognize(canvas);
      output[index] = cleanExtractedText(result.data.text);
      canvas.width = 1;
      canvas.height = 1;
      page.cleanup();
    }
  } finally {
    await worker.terminate();
    await loadingTask.destroy();
  }

  const text = cleanExtractedText(output.filter(Boolean).join('\n\n'));
  if (!text) throw new Error('OCR не распознал текст в PDF.');
  return {
    text,
    pages: output.length,
    scannedPages: scannedIndexes.length,
    ocrUsed: true,
  };
}

function letterCount(text: string): number {
  return (text.match(/\p{L}/gu) ?? []).length;
}

function cleanExtractedText(text: string): string {
  return text
    .replace(/\r\n?/g, '\n')
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n[ \t]+/g, '\n')
    .replace(/[ \t]{2,}/g, ' ')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}
