/**
 * Картинки из PDF.
 *
 * Картинка не декодируется из потока PDF, а вырезается из отрисованной
 * страницы по своей рамке. Декодировать самим пришлось бы маски, цветовые
 * пространства CMYK и прозрачность — и на каждом втором учебнике выходило бы
 * чёрное пятно вместо схемы. Отрисованная страница уже всё это учла.
 *
 * Место картинки в тексте отмечается служебной строкой с символами из частной
 * области Unicode. Строки дальше собираются в абзацы (reflow), и метка может
 * оказаться внутри абзаца — поэтому абзацы режутся по ней уже после сборки.
 * Букв и цифр в метке нет: иначе её приняли бы за номер страницы или
 * колонтитул и выбросили.
 */
import type { PDFPageProxy } from 'pdfjs-dist';

type Matrix = [number, number, number, number, number, number];

/** Рамка картинки в координатах PDF: x, y — левый нижний угол. */
export interface PdfBox {
  x: number;
  y: number;
  w: number;
  h: number;
}

const MARK = '';
const MARK_BASE = 0xe100;
const MARK_PATTERN = /([-])/gu;

export function imageMark(index: number): string {
  return MARK + String.fromCharCode(MARK_BASE + index) + MARK;
}

/**
 * Режет абзацы по меткам картинок: «текст ⟨метка⟩ текст» становится тремя
 * абзацами, средний — картинка.
 */
export function splitImageMarks(paragraphs: string[], imageParagraph: (index: number) => string): string[] {
  const out: string[] = [];
  for (const paragraph of paragraphs) {
    if (!paragraph.includes(MARK)) {
      out.push(paragraph);
      continue;
    }
    let last = 0;
    for (const match of paragraph.matchAll(MARK_PATTERN)) {
      const before = paragraph.slice(last, match.index).trim();
      if (before) out.push(before);
      out.push(imageParagraph(match[1]!.charCodeAt(0) - MARK_BASE));
      last = match.index! + match[0].length;
    }
    const rest = paragraph.slice(last).replaceAll(MARK, '').trim();
    if (rest) out.push(rest);
  }
  return out;
}

function multiply(m1: Matrix, m2: Matrix): Matrix {
  return [
    m1[0] * m2[0] + m1[2] * m2[1],
    m1[1] * m2[0] + m1[3] * m2[1],
    m1[0] * m2[2] + m1[2] * m2[3],
    m1[1] * m2[2] + m1[3] * m2[3],
    m1[0] * m2[4] + m1[2] * m2[5] + m1[4],
    m1[1] * m2[4] + m1[3] * m2[5] + m1[5],
  ];
}

function unitSquare(m: Matrix): PdfBox {
  const xs = [m[4], m[0] + m[4], m[2] + m[4], m[0] + m[2] + m[4]];
  const ys = [m[5], m[1] + m[5], m[3] + m[5], m[1] + m[3] + m[5]];
  const x = Math.min(...xs);
  const y = Math.min(...ys);
  return { x, y, w: Math.max(...xs) - x, h: Math.max(...ys) - y };
}

export interface PageGraphics {
  images: PdfBox[];
  /** Сколько векторных фигур нарисовано: по нему видна страница-схема. */
  shapes: number;
}

/**
 * Где на странице нарисованы картинки. Матрица преобразования отслеживается
 * так же, как её ведёт сам pdf.js при отрисовке: save/restore, transform и
 * вложенные формы.
 */
export async function pageGraphics(
  page: PDFPageProxy,
  OPS: Record<string, number>,
): Promise<PageGraphics> {
  const list = await page.getOperatorList();
  let ctm: Matrix = [1, 0, 0, 1, 0, 0];
  const stack: Matrix[] = [];
  const images: PdfBox[] = [];
  let shapes = 0;

  for (let i = 0; i < list.fnArray.length; i++) {
    const fn = list.fnArray[i];
    const args = list.argsArray[i] as unknown[] | null;
    switch (fn) {
      case OPS.save:
        stack.push(ctm);
        break;
      case OPS.restore:
        ctm = stack.pop() ?? ctm;
        break;
      case OPS.transform:
        if (args && args.length >= 6) ctm = multiply(ctm, args.slice(0, 6) as Matrix);
        break;
      case OPS.paintFormXObjectBegin: {
        stack.push(ctm);
        const matrix = args?.[0];
        if (Array.isArray(matrix) && matrix.length === 6) ctm = multiply(ctm, matrix as Matrix);
        break;
      }
      case OPS.paintFormXObjectEnd:
        ctm = stack.pop() ?? ctm;
        break;
      case OPS.paintImageXObject:
      case OPS.paintInlineImageXObject:
        images.push(unitSquare(ctm));
        break;
      case OPS.constructPath:
        shapes++;
        break;
    }
  }
  return { images, shapes };
}

/** Ключ рамки для поиска повторов: логотип издательства стоит на каждой странице. */
export function boxKey(box: PdfBox): string {
  const r = (n: number) => Math.round(n / 6);
  return `${r(box.x)}:${r(box.y)}:${r(box.w)}:${r(box.h)}`;
}

/**
 * Отрисовывает страницу один раз и вырезает из неё нужные куски. null вместо
 * рамки — вся страница целиком.
 */
export async function renderRegions(page: PDFPageProxy, regions: Array<PdfBox | null>): Promise<Array<Blob | null>> {
  const base = page.getViewport({ scale: 1 });
  // Длинная сторона около 1800 точек: схему можно рассмотреть, а книга на
  // сотню иллюстраций не займёт сотню мегабайт.
  const scale = Math.min(2.2, 1800 / Math.max(base.width, base.height));
  const viewport = page.getViewport({ scale });
  const canvas = globalThis.document.createElement('canvas');
  canvas.width = Math.ceil(viewport.width);
  canvas.height = Math.ceil(viewport.height);
  const context = canvas.getContext('2d', { alpha: false });
  if (!context) return regions.map(() => null);
  context.fillStyle = '#fff';
  context.fillRect(0, 0, canvas.width, canvas.height);
  await page.render({ canvas, canvasContext: context, viewport }).promise;

  const out: Array<Blob | null> = [];
  for (const region of regions) {
    let sx = 0;
    let sy = 0;
    let sw = canvas.width;
    let sh = canvas.height;
    if (region) {
      // convertToViewportRectangle в pdf.js 6 убрали: переводим углы по одному.
      const [x1, y1] = viewport.convertToViewportPoint(region.x, region.y) as [number, number];
      const [x2, y2] = viewport.convertToViewportPoint(region.x + region.w, region.y + region.h) as [number, number];
      // Внутрь, а не наружу: иначе по краю картинки остаётся полоска фона.
      sx = Math.max(0, Math.ceil(Math.min(x1, x2)));
      sy = Math.max(0, Math.ceil(Math.min(y1, y2)));
      sw = Math.min(canvas.width, Math.floor(Math.max(x1, x2))) - sx;
      sh = Math.min(canvas.height, Math.floor(Math.max(y1, y2))) - sy;
    }
    if (sw < 8 || sh < 8) {
      out.push(null);
      continue;
    }
    const crop = globalThis.document.createElement('canvas');
    crop.width = sw;
    crop.height = sh;
    crop.getContext('2d', { alpha: false })?.drawImage(canvas, sx, sy, sw, sh, 0, 0, sw, sh);
    out.push(await new Promise<Blob | null>((resolve) => crop.toBlob(resolve, 'image/webp', 0.82)));
    crop.width = 1;
    crop.height = 1;
  }
  canvas.width = 1;
  canvas.height = 1;
  return out;
}
