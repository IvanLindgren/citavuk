import type { PDFPageProxy } from 'pdfjs-dist';

import { API_BASE } from '../api/client';
import { MAX_BOOK_IMAGES, uploadBookImage } from '../api/bookImages';
import { isBlock, plainParagraphs } from './blocks';
import { applyImageUrls, htmlToBlocks, PENDING_IMAGE } from './formats/htmlBlocks';
import { imageParagraph } from './blocks';
import { boxKey, imageMark, pageGraphics, renderRegions, splitImageMarks, type PageGraphics, type PdfBox } from './pdfImages';
import { cleanLatexLayout } from './latexText';
import { reflowDocumentWithLayout, type LayoutLine } from './reflow';
import { fixSerbianDocument, fixSerbianText } from './serbianEncodingFix';

export type ImportStage =
  | 'downloading'
  | 'reading'
  | 'docx'
  | 'pdf'
  | 'ebook'
  | 'ocr'
  | 'images'
  | 'saving';

export interface ImportedDocument {
  title: string;
  text: string;
  format: 'text' | 'docx' | 'pdf' | 'fb2' | 'epub' | 'djvu';
  pages?: number;
  ocrUsed?: boolean;
  /**
   * Готовые абзацы книги, включая картинки и таблицы.
   *
   * Заполняются для размеченных источников — DOCX и HTML — и для PDF, в
   * котором нашлись картинки. У остальных форматов разбиение на абзацы делает
   * splitParagraphs из текста, как и раньше: FB2 и EPUB
   * держат картинки отдельными файлами внутри архива, и разбирать их пришлось
   * бы вместе с путями и оглавлением.
   */
  paragraphs?: string[];
  /** Найденные картинки в порядке появления. Адреса им ещё не назначены. */
  images?: Blob[];
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
  images: 'Достаём картинки…',
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
  const document = await readDocument(file, onStage);
  // Испорченные шрифтом đ, č и ž чинятся на выходе, а не в каждом разборщике:
  // поломка приходит из PDF, DOCX и FB2 одинаково.
  //
  // Абзацы чинятся по одному, а не склейкой в общий текст: среди них есть
  // метки картинок, и адрес в такой метке чинить нечего — там нет сербских
  // букв, зато есть проценты и дефисы, которые починка могла бы задеть.
  return {
    ...document,
    text: fixSerbianText(document.text),
    paragraphs: document.paragraphs?.map((paragraph) =>
      isBlock(paragraph) ? paragraph : fixSerbianText(paragraph),
    ),
  };
}

async function readDocument(
  file: File,
  onStage: (stage: ImportStage) => void,
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
    return { title, format: 'docx', ...(await extractDocx(file)) };
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
 * Даёт картинкам постоянные адреса и подставляет их в абзацы.
 *
 * Без аккаунта картинки выбрасываются, и это не оплошность, а следствие
 * модели данных: адрес книги при синхронизации считается от её абзацев, а
 * адреса картинок лежат прямо в них. Временный адрес, заменённый после входа,
 * поменял бы адрес уже сохранённой книги — и та превратилась бы во вторую
 * копию себя самой.
 *
 * Неудача с отдельной картинкой не срывает импорт: текст важнее иллюстрации.
 */
export async function attachImages(
  document: ImportedDocument,
  signedIn: boolean,
): Promise<{ paragraphs: string[] | undefined; skipped: number }> {
  const { paragraphs, images } = document;
  if (!paragraphs) return { paragraphs: undefined, skipped: 0 };
  if (!images || images.length === 0) {
    return { paragraphs, skipped: 0 };
  }
  if (!signedIn) {
    return {
      paragraphs: applyImageUrls(paragraphs, []),
      skipped: images.length,
    };
  }

  const taken = images.slice(0, MAX_BOOK_IMAGES);
  const urls = await Promise.all(
    taken.map(async (blob) => {
      try {
        return await uploadBookImage(blob);
      } catch {
        return '';
      }
    }),
  );

  return {
    paragraphs: applyImageUrls(paragraphs, urls),
    skipped: images.length - urls.filter(Boolean).length,
  };
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

/**
 * DOCX разбирается через HTML, а не через голый текст.
 *
 * extractRawText отдаёт только слова, теряя ровно то, ради чего учебник и
 * открывают: таблицу склонений и картинку с картой. Промежуточный HTML эти
 * структуры сохраняет, а разбор его в абзацы книги — общий с веб-страницами
 * (formats/htmlBlocks.ts).
 *
 * Содержимое картинок mammoth отдаёт прямо в обработчике, но постоянный адрес
 * им назначается позже: это сетевая операция, а разбор идёт синхронно.
 */
async function extractDocx(
  file: File,
): Promise<{ text: string; paragraphs: string[]; images: Blob[] }> {
  const mammoth = await import('mammoth');

  // mammoth зовёт обработчик картинки асинхронно и ждёт его, поэтому данные
  // здесь уже готовы, а обход HTML ниже остаётся синхронным.
  const found = new Map<string, Blob>();
  const result = await mammoth.convertToHtml(
    { arrayBuffer: await file.arrayBuffer() },
    {
      convertImage: mammoth.images.imgElement(async (image) => {
        const key = `docx-image-${found.size}`;
        try {
          const buffer = await image.read();
          found.set(key, new Blob([buffer as BlobPart], { type: image.contentType }));
        } catch {
          // Битая картинка не повод отказываться от всего документа.
        }
        return { src: key };
      }),
    },
  );

  const parsed = htmlToBlocks(result.value, (element) =>
    found.get(element.getAttribute('src') ?? '') ?? null,
  );
  const paragraphs = parsed.paragraphs.filter((paragraph) => paragraph !== '');
  if (paragraphs.length === 0) throw new Error('В DOCX не нашлось текста.');

  return {
    // Текст остаётся для определения языка и подсчёта объёма — там разметка
    // только мешает.
    text: cleanExtractedText(plainParagraphs(paragraphs).join('\n\n')),
    paragraphs,
    images: parsed.images,
  };
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
  const pageLines: LayoutLine[][] = [];
  const pages: string[] = [];
  let pagesWithoutText = 0;
  // Высота каждой строки (y в координатах PDF, растёт вверх) и рисунки
  // страницы — по ним картинки потом встают между строками.
  const pageTops: number[][] = [];
  const pageArt: Array<{ graphics: PageGraphics; area: number }> = [];
  const { OPS } = pdfjs;
  const images: Blob[] = [];
  let paragraphs: string[] | undefined;

  try {
    for (let pageNumber = 1; pageNumber <= document.numPages; pageNumber++) {
      const page = await document.getPage(pageNumber);
      const content = await page.getTextContent();
      const lines: LayoutLine[] = [];
      const tops: number[] = [];
      let top = 0;
      let current = '';
      // Границы строки копятся вместе с текстом: по ним дальше видно красную
      // строку и недобранную последнюю строку абзаца.
      let left = Number.POSITIVE_INFINITY;
      let right = Number.NEGATIVE_INFINITY;

      const flush = () => {
        const text = current.trim();
        if (text) {
          lines.push({
            text,
            left: Number.isFinite(left) ? left : 0,
            right: Number.isFinite(right) ? right : 0,
          });
          tops.push(top);
        }
        current = '';
        left = Number.POSITIVE_INFINITY;
        right = Number.NEGATIVE_INFINITY;
      };

      for (const item of content.items) {
        if (!('str' in item)) continue;
        if (item.str) {
          const x = item.transform?.[4] ?? 0;
          if (!current.trim()) top = item.transform?.[5] ?? 0;
          left = Math.min(left, x);
          right = Math.max(right, x + (item.width ?? 0));
        }
        current += item.str;
        if (item.hasEOL) {
          flush();
        } else if (item.str && !/\s$/u.test(item.str)) {
          current += ' ';
        }
      }
      flush();

      const text = cleanExtractedText(lines.map((line) => line.text).join('\n'));
      pageLines.push(lines);
      pageTops.push(tops);
      pages.push(text);
      if (letterCount(text) < 30) pagesWithoutText++;
      const [x0, y0, x1, y1] = page.view;
      pageArt.push({
        graphics: await pageGraphics(page, OPS as unknown as Record<string, number>).catch(() => ({ images: [], shapes: 0 })),
        area: Math.abs((x1! - x0!) * (y1! - y0!)),
      });
      page.cleanup();
    }

    const plan = planPdfImages(pageLines, pageTops, pageArt, pages);
    if (plan.count > 0 && !looksScanned(pagesWithoutText, pages, pageLines)) {
      onStage('images');
      const blobs = await renderPlannedImages(document, plan);
      images.push(...blobs);
      paragraphs = splitImageMarks(
        assembleParagraphs(plan.lines),
        (index) => imageParagraph(`${PENDING_IMAGE}${index}`),
      );
    }
  } finally {
    await loadingTask.destroy();
  }

  // Абзацы восстанавливаются из строк, а не берутся как есть: PDF хранит
  // разбиение на строки страницы, а не на абзацы, и без сборки читалка
  // показывала целую страницу одним кирпичом текста.
  const nativeText = assembleParagraphs(pageLines).join('\n\n');

  if (!looksScanned(pagesWithoutText, pages, pageLines)) {
    if (!nativeText && !paragraphs) throw new Error('В PDF не нашлось текста.');
    return {
      text: nativeText,
      pages: pages.length,
      ocrUsed: false,
      ...(paragraphs ? { paragraphs, images } : {}),
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

/**
 * Строки страниц → абзацы книги.
 *
 * Порядок важен: сначала лигатуры и диакритика (иначе строка «cˇasova» не
 * совпадёт с колонтитулом на другой странице), потом сборка абзацев по
 * геометрии, и только в конце — буквы, испорченные шрифтом, потому что решение
 * принимается по всему тексту сразу.
 */
function assembleParagraphs(pages: LayoutLine[][]): string[] {
  return fixSerbianDocument(reflowDocumentWithLayout(cleanLatexLayout(pages)));
}

/**
 * Скан: страниц без текста много или текста в целом почти нет. Тогда текст
 * добывается распознаванием, а картинки из такого PDF не достаются вовсе —
 * каждая страница там сама картинка.
 */
function looksScanned(pagesWithoutText: number, pages: string[], pageLines: LayoutLine[][]): boolean {
  if (pagesWithoutText === 0) return false;
  const nativeText = assembleParagraphs(pageLines).join('\n\n');
  return (
    pagesWithoutText >= Math.ceil(pages.length / 2) ||
    letterCount(nativeText) < Math.max(80, pages.length * 35)
  );
}

interface ImagePlan {
  /** Строки страниц со вставленными метками картинок. */
  lines: LayoutLine[][];
  /** Что рисовать: номер страницы (с 1) и рамка; null — страница целиком. */
  regions: Array<{ page: number; box: PdfBox | null }>;
  count: number;
}

/**
 * Решает, какие картинки достать и куда их поставить.
 *
 * Отбрасывается то, что картинкой для читателя не является: мелочь (значки,
 * буквицы), подложка на всю страницу под текстом и рисунок, повторяющийся
 * на многих страницах в одном месте, — логотип или виньетка колонтитула.
 * Страница почти без текста, но с рисунком или схемой, берётся целиком.
 */
function planPdfImages(
  pageLines: LayoutLine[][],
  pageTops: number[][],
  pageArt: Array<{ graphics: PageGraphics; area: number }>,
  pages: string[],
): ImagePlan {
  const seen = new Map<string, number>();
  for (const { graphics } of pageArt) {
    for (const key of new Set(graphics.images.map(boxKey))) seen.set(key, (seen.get(key) ?? 0) + 1);
  }
  const repeated = (box: PdfBox) => {
    const count = seen.get(boxKey(box)) ?? 0;
    return count >= 3 && count >= pageArt.length * 0.25;
  };

  const regions: ImagePlan['regions'] = [];
  const lines = pageLines.map((page, index) => {
    const art = pageArt[index];
    if (!art || regions.length >= MAX_BOOK_IMAGES) return page;
    const tops = pageTops[index] ?? [];
    const lefts = page.map((line) => line.left).sort((a, b) => a - b);
    const left = lefts[Math.floor(lefts.length / 2)] ?? 0;
    const mark = (): LayoutLine => {
      const line = { text: imageMark(regions.length), left, right: left };
      return line;
    };

    if (letterCount(pages[index] ?? '') < 30 && (art.graphics.images.length > 0 || art.graphics.shapes > 30)) {
      const line = mark();
      regions.push({ page: index + 1, box: null });
      return [line, ...page];
    }

    const kept = art.graphics.images
      .filter((box) => {
        const area = box.w * box.h;
        return (
          Math.min(box.w, box.h) >= 36 &&
          area >= art.area * 0.015 &&
          area <= art.area * 0.9 &&
          !repeated(box)
        );
      })
      .sort((a, b) => b.y + b.h - (a.y + a.h));
    if (kept.length === 0) return page;

    const out: LayoutLine[] = [];
    let next = 0;
    for (let i = 0; i < page.length; i++) {
      // Картинка встаёт перед первой строкой, что ниже её середины.
      while (next < kept.length && regions.length < MAX_BOOK_IMAGES && (tops[i] ?? 0) < kept[next]!.y + kept[next]!.h / 2) {
        out.push(mark());
        regions.push({ page: index + 1, box: kept[next]! });
        next++;
      }
      out.push(page[i]!);
    }
    while (next < kept.length && regions.length < MAX_BOOK_IMAGES) {
      out.push(mark());
      regions.push({ page: index + 1, box: kept[next]! });
      next++;
    }
    return out;
  });
  return { lines, regions, count: regions.length };
}

/** Рисует только страницы с картинками, каждую один раз. */
async function renderPlannedImages(
  pdf: { getPage(n: number): Promise<PDFPageProxy> },
  plan: ImagePlan,
): Promise<Blob[]> {
  const blobs: Blob[] = plan.regions.map(() => new Blob([]));
  const byPage = new Map<number, number[]>();
  plan.regions.forEach((region, index) => {
    byPage.set(region.page, [...(byPage.get(region.page) ?? []), index]);
  });
  for (const [pageNumber, indexes] of byPage) {
    try {
      const page = await pdf.getPage(pageNumber);
      const rendered = await renderRegions(page, indexes.map((i) => plan.regions[i]!.box));
      rendered.forEach((blob, k) => {
        // Пустой файл не загрузится, и абзац картинки уйдёт: текст важнее.
        if (blob) blobs[indexes[k]!] = blob;
      });
      page.cleanup();
    } catch {
      // Неудача со страницей не срывает импорт: картинки этой страницы пропадут.
    }
  }
  return blobs;
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
