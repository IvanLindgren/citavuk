import { imageParagraph, tableParagraph } from '../blocks';

/**
 * Размеченный документ → абзацы книги, включая картинки и таблицы.
 *
 * Один разборщик на все размеченные источники. DOCX превращается в HTML силами
 * mammoth, обычная веб-страница им и является — писать для них два обхода
 * значило бы однажды починить таблицу в одном месте и забыть про другое.
 *
 * Картинки на этом шаге ещё не имеют постоянного адреса: разбор идёт в браузере
 * и синхронно, а загрузка в хранилище — сетевая операция. Поэтому сюда они
 * попадают под временными метками, а адреса подставляются позже
 * (см. documentImport.ts).
 */

/** Временный адрес картинки: номер в списке найденных. */
export const PENDING_IMAGE = 'citavuk-pending:';

export interface HtmlDocument {
  paragraphs: string[];
  /** Порядковый номер картинки → её данные. */
  images: Blob[];
}

/** Теги, дающие отдельный абзац книги. */
const TEXT_TAGS = new Set([
  'P', 'H1', 'H2', 'H3', 'H4', 'H5', 'H6', 'LI', 'BLOCKQUOTE', 'PRE', 'DT', 'DD',
]);

/** Теги, из которых в книге не должно оказаться ничего. */
const DROP_TAGS = new Set(['SCRIPT', 'STYLE', 'NOSCRIPT', 'HEAD', 'NAV', 'FOOTER']);

/**
 * Разбирает HTML в абзацы книги.
 *
 * `resolveImage` получает элемент картинки и возвращает её данные. Разные
 * источники хранят картинку по-разному: mammoth отдаёт её содержимое сразу, а
 * веб-страница — только адрес, который качать при импорте нельзя.
 */
export function htmlToBlocks(
  html: string,
  resolveImage: (element: HTMLImageElement) => Blob | null = () => null,
): HtmlDocument {
  const parsed = new DOMParser().parseFromString(html, 'text/html');
  const out: HtmlDocument = { paragraphs: [], images: [] };
  walk(parsed.body, out, resolveImage);
  return out;
}

function walk(
  node: Element,
  out: HtmlDocument,
  resolveImage: (element: HTMLImageElement) => Blob | null,
): void {
  for (const child of Array.from(node.children)) {
    if (DROP_TAGS.has(child.tagName)) continue;

    if (child.tagName === 'TABLE') {
      pushTable(child as HTMLTableElement, out);
      continue;
    }

    if (child.tagName === 'IMG') {
      pushImage(child as HTMLImageElement, out, resolveImage);
      continue;
    }

    if (TEXT_TAGS.has(child.tagName)) {
      // Картинка внутри абзаца выносится отдельным блоком: в модели книги
      // абзац — это либо текст, либо картинка, третьего не дано. Порядок при
      // этом сохраняется, а он и важен.
      for (const image of Array.from(child.querySelectorAll('img'))) {
        pushImage(image, out, resolveImage);
      }
      const text = textOf(child);
      if (text) out.paragraphs.push(text);
      continue;
    }

    walk(child, out, resolveImage);
  }
}

function pushImage(
  element: HTMLImageElement,
  out: HtmlDocument,
  resolveImage: (element: HTMLImageElement) => Blob | null,
): void {
  const blob = resolveImage(element);
  if (!blob) return;
  const index = out.images.push(blob) - 1;
  out.paragraphs.push(
    imageParagraph(PENDING_IMAGE + index, element.getAttribute('alt') ?? ''),
  );
}

function pushTable(table: HTMLTableElement, out: HtmlDocument): void {
  const rows: string[][] = [];
  for (const row of Array.from(table.querySelectorAll('tr'))) {
    const cells = Array.from(row.querySelectorAll('th, td')).map((cell) =>
      textOf(cell),
    );
    if (cells.some((cell) => cell !== '')) rows.push(cells);
  }
  if (rows.length === 0) return;

  // Таблица из одной колонки — почти всегда вёрстка, а не данные: старые
  // документы раскладывают ими картинки и врезки. Показывать такую рамкой
  // значит рисовать сетку вокруг обычного текста.
  if (rows.every((row) => row.length <= 1)) {
    for (const [cell] of rows) {
      if (cell) out.paragraphs.push(cell);
    }
    return;
  }
  out.paragraphs.push(tableParagraph(rows));
}

function textOf(element: Element): string {
  return (element.textContent ?? '').replace(/\s+/g, ' ').trim();
}

/**
 * Подставляет постоянные адреса вместо временных меток.
 *
 * Картинка, для которой адреса не нашлось (не влезла в предел, не поддержан
 * формат, хранилище отказало), выбрасывается вместе со своим абзацем: пустая
 * рамка в тексте хуже её отсутствия.
 */
export function applyImageUrls(paragraphs: string[], urls: string[]): string[] {
  const out: string[] = [];
  for (const paragraph of paragraphs) {
    const at = paragraph.indexOf(PENDING_IMAGE);
    if (at < 0) {
      out.push(paragraph);
      continue;
    }
    const rest = paragraph.slice(at + PENDING_IMAGE.length);
    const index = Number.parseInt(rest, 10);
    const url = Number.isInteger(index) ? urls[index] : '';
    if (!url) continue;
    out.push(paragraph.slice(0, at) + url + rest.slice(String(index).length));
  }
  return out;
}
