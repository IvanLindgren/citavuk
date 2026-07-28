import { API_BASE } from '../api/client';

/**
 * Отрисовка первых страниц PDF в картинки — для превью в каталоге материалов.
 *
 * Раздел показывает превью сразу, без нажатий, поэтому здесь важнее не скорость
 * одной страницы, а то, чтобы страница целиком не встала колом:
 *
 *   * рисуется не больше двух документов одновременно — pdf.js считает в том же
 *     потоке, и десяток параллельных отрисовок подвешивает вкладку;
 *   * готовое запоминается, поэтому прокрутка назад ничего не перезагружает;
 *   * запрашивается документ только тогда, когда карточка доехала до экрана
 *     (это делает вызывающий), иначе заход в раздел тянул бы сотни мегабайт
 *     чужого трафика и клал бы сайт источника.
 */

/** Сколько страниц показывать. Дальше начинается уже чтение, а не выбор. */
export const PREVIEW_PAGES = 5;

/** Ширина отрисовки в пикселях: достаточно, чтобы прочесть условие задачи. */
const RENDER_WIDTH = 700;

/** Сколько документов держать в памяти вкладки. */
const MAX_CACHED = 24;

/** Сколько документов рисовать одновременно. */
const CONCURRENCY = 2;

export interface PdfPreviewResult {
  /** blob: адреса отрисованных страниц. */
  pages: string[];
  /** Всего страниц в документе. */
  total: number;
}

const cache = new Map<string, PdfPreviewResult>();
const inflight = new Map<string, Promise<PdfPreviewResult>>();

let active = 0;
const waiting: Array<() => void> = [];

async function acquire(): Promise<void> {
  if (active < CONCURRENCY) {
    active += 1;
    return;
  }
  await new Promise<void>((resolve) => waiting.push(resolve));
  active += 1;
}

function release(): void {
  active -= 1;
  waiting.shift()?.();
}

/** Готовое превью, если оно уже посчитано. Нужен для первой отрисовки без мигания. */
export function cachedPreview(url: string): PdfPreviewResult | undefined {
  return cache.get(url);
}

/**
 * Возвращает превью документа, считая его при необходимости.
 *
 * Повторные вызовы для одного адреса разделяют один расчёт: в каталоге легко
 * получить два запроса подряд (карточка ушла с экрана и вернулась).
 */
export function loadPreview(url: string, signal?: AbortSignal): Promise<PdfPreviewResult> {
  const ready = cache.get(url);
  if (ready) return Promise.resolve(ready);

  const running = inflight.get(url);
  if (running) return running;

  const task = render(url, signal).then(
    (result) => {
      inflight.delete(url);
      remember(url, result);
      return result;
    },
    (error) => {
      inflight.delete(url);
      throw error;
    },
  );
  inflight.set(url, task);
  return task;
}

function remember(url: string, result: PdfPreviewResult): void {
  cache.set(url, result);
  // Map хранит ключи в порядке вставки, поэтому первый — самый старый.
  while (cache.size > MAX_CACHED) {
    const oldest = cache.keys().next().value;
    if (oldest === undefined) break;
    const evicted = cache.get(oldest);
    cache.delete(oldest);
    for (const page of evicted?.pages ?? []) URL.revokeObjectURL(page);
  }
}

async function render(url: string, signal?: AbortSignal): Promise<PdfPreviewResult> {
  await acquire();
  try {
    // Через сервер: прямой запрос к чужому сайту блокирует CORS, а сервер
    // заодно ограничивает размер и закрывает SSRF.
    const response = await fetch(
      `${API_BASE}/v1/documents/fetch?url=${encodeURIComponent(url)}`,
      { signal },
    );
    if (!response.ok) throw new Error('Не удалось загрузить документ.');
    const bytes = new Uint8Array(await response.arrayBuffer());

    const pdfjs = await import('pdfjs-dist');
    pdfjs.GlobalWorkerOptions.workerSrc = '/pdf.worker.js?v=6';

    const task = pdfjs.getDocument({ data: bytes });
    const document = await task.promise;
    const total = document.numPages;

    const pages: string[] = [];
    const count = Math.min(PREVIEW_PAGES, total);
    for (let number = 1; number <= count; number++) {
      const page = await document.getPage(number);
      const base = page.getViewport({ scale: 1 });
      const viewport = page.getViewport({ scale: RENDER_WIDTH / base.width });

      const canvas = window.document.createElement('canvas');
      canvas.width = Math.ceil(viewport.width);
      canvas.height = Math.ceil(viewport.height);
      const context = canvas.getContext('2d', { alpha: false });
      if (!context) throw new Error('Браузер не смог отрисовать страницу.');

      await page.render({ canvas, canvasContext: context, viewport }).promise;
      const blob = await new Promise<Blob | null>((resolve) =>
        canvas.toBlob(resolve, 'image/webp', 0.8),
      );
      if (blob) pages.push(URL.createObjectURL(blob));

      // Холст освобождается сразу: пять полноразмерных канвасов на документ
      // при сорока документах — это сотни мегабайт видеопамяти.
      canvas.width = 1;
      canvas.height = 1;
      page.cleanup();
    }
    await task.destroy();

    return { pages, total };
  } finally {
    release();
  }
}
