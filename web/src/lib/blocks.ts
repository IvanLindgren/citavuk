/**
 * Картинки и таблицы внутри книги.
 *
 * Книга хранится списком абзацев-строк, и трогать эту модель нельзя. Её адрес
 * при синхронизации считается от абзацев байт в байт тремя реализациями сразу
 * (см. lib/content.ts), а сам протокол синхронизации знает только `string[]`.
 * Замена списка строк на список типизированных блоков означала бы новую версию
 * протокола, новый расчёт адреса и разъезд трёх клиентов — ради двух видов
 * содержимого, которые прекрасно укладываются в строку.
 *
 * Поэтому картинка и таблица остаются абзацами, но с меткой в начале. Метка
 * начинается с U+0000: этого символа в тексте книги не бывает никогда — ни один
 * разборщик документов его не выдаёт, а если бы и выдал, читалка всё равно
 * показала бы пустое место.
 *
 * Побочная выгода: клиент, который про блоки не знает (уже установленное
 * приложение), не ломается. Таблица покажется ему текстом с табуляциями —
 * некрасиво, но читаемо.
 */

/** Начало любой метки блока. В обычном тексте не встречается. */
const MARKER = '\u0000citavuk:';

const IMAGE_MARKER = `${MARKER}image\n`;
const TABLE_MARKER = `${MARKER}table\n`;
const RICH_MARKER = `${MARKER}rich\n`;

/**
 * Оформление куска абзаца, который читатель поправил сам: b — жирный,
 * i — курсив, u — подчёркивание, m — маркер. Границы — индексы строки
 * JavaScript (UTF-16), в Dart те же.
 */
export interface TextSpan {
  start: number;
  end: number;
  style: string;
}

export type Block =
  | { kind: 'text'; text: string; spans?: TextSpan[] }
  | { kind: 'image'; url: string; alt: string }
  | { kind: 'table'; rows: string[][] };

/** Есть ли в абзаце метка блока. */
export function isBlock(paragraph: string): boolean {
  return paragraph.startsWith(MARKER);
}

/**
 * Разбирает абзац.
 *
 * Разбор обязан быть устойчивым: абзац приходит из хранилища и с другого
 * устройства, и книга должна открыться при любом его содержимом. Всё, что не
 * разобралось, показывается обычным текстом — так читатель хотя бы увидит, что
 * там было.
 */
export function parseBlock(paragraph: string): Block {
  if (paragraph.startsWith(IMAGE_MARKER)) {
    const [url = '', ...rest] = paragraph.slice(IMAGE_MARKER.length).split('\n');
    if (!url) return { kind: 'text', text: '' };
    return { kind: 'image', url, alt: rest.join(' ').trim() };
  }

  if (paragraph.startsWith(TABLE_MARKER)) {
    const rows = paragraph
      .slice(TABLE_MARKER.length)
      .split('\n')
      .map((row) => row.split('\t'));
    // Таблица без ячеек — не таблица. Пустой <table> в читалке выглядит как
    // сбой вёрстки, поэтому такой абзац лучше просто пропустить.
    if (rows.length === 0 || rows.every((row) => row.every((cell) => !cell.trim()))) {
      return { kind: 'text', text: '' };
    }
    return { kind: 'table', rows };
  }

  if (paragraph.startsWith(RICH_MARKER)) {
    // Абзац с оформлением — тот же текст: всё, что работает со словами
    // (разбор по нажатию, перевод, поиск, озвучка), видит только text.
    // Отрезки стилей лежат отдельно, поэтому смещения слов не сдвигаются.
    const body = paragraph.slice(RICH_MARKER.length);
    const newline = body.indexOf('\n');
    if (newline < 0) return { kind: 'text', text: body };
    const text = body.slice(newline + 1);
    return { kind: 'text', text, spans: normalizeSpans(parseSpans(body.slice(0, newline)), text.length) };
  }

  return { kind: 'text', text: paragraph };
}

function parseSpans(raw: string): TextSpan[] {
  try {
    const data: unknown = JSON.parse(raw);
    if (!Array.isArray(data)) return [];
    return data.flatMap((item) =>
      Array.isArray(item) && typeof item[0] === 'number' && typeof item[1] === 'number' && typeof item[2] === 'string'
        ? [{ start: item[0], end: item[1], style: item[2] }]
        : [],
    );
  } catch {
    // Битое оформление — не повод терять текст.
    return [];
  }
}

const STYLES = 'bimu';

/** Чистые отрезки: в пределах текста, без пустых, стили в постоянном порядке. */
export function normalizeSpans(spans: TextSpan[], length: number): TextSpan[] {
  const out: TextSpan[] = [];
  for (const span of [...spans].sort((a, b) => a.start - b.start || a.end - b.end)) {
    const start = Math.max(0, Math.min(length, Math.floor(span.start)));
    const end = Math.max(start, Math.min(length, Math.floor(span.end)));
    const style = [...STYLES].filter((ch) => span.style.includes(ch)).join('');
    if (end > start && style) out.push({ start, end, style });
  }
  return out;
}

/**
 * Собирает абзац с оформлением. Без оформления — обычная строка: так абзац
 * читают и старые версии приложения.
 */
export function richParagraph(text: string, spans: TextSpan[]): string {
  const clean = normalizeSpans(spans, text.length);
  if (clean.length === 0) return text;
  return RICH_MARKER + JSON.stringify(clean.map((span) => [span.start, span.end, span.style])) + '\n' + text;
}

/** Разбирает всю книгу. */
export function parseBlocks(paragraphs: string[]): Block[] {
  return paragraphs.map(parseBlock);
}

/**
 * Приводит ячейку к виду, пригодному для хранения.
 *
 * Табуляция и перевод строки разделяют ячейки и ряды, поэтому внутри ячейки их
 * быть не может. Экранирование здесь было бы лишней сложностью: в ячейке
 * книжной таблицы перенос строки — это вёрстка, а не смысл.
 */
function cleanCell(value: string): string {
  return value.replace(/[\t\n\r]+/g, ' ').replace(/\s{2,}/g, ' ').trim();
}

/** Собирает абзац-картинку. */
export function imageParagraph(url: string, alt = ''): string {
  return IMAGE_MARKER + cleanCell(url) + '\n' + cleanCell(alt);
}

/** Собирает абзац-таблицу. */
export function tableParagraph(rows: string[][]): string {
  return (
    TABLE_MARKER +
    rows.map((row) => row.map(cleanCell).join('\t')).join('\n')
  );
}

/**
 * Строки блока, которые имеет смысл переводить.
 *
 * Адрес картинки переводить нельзя — получилась бы битая ссылка. Ячейки таблицы
 * переводить нужно: таблица в учебнике обычно и есть самое ценное.
 */
export function translatableText(block: Block): string[] {
  switch (block.kind) {
    case 'text':
      return [block.text];
    case 'image':
      return [block.alt];
    case 'table':
      return block.rows.flat();
  }
}

/**
 * Собирает абзац обратно, подставив перевод.
 *
 * Количество строк обязано совпасть с тем, что вернул translatableText: иначе
 * ячейки таблицы разъедутся по своим местам. Несовпадение — это ошибка в коде
 * выше по течению, и подставлять «что-нибудь» в такой ситуации значит спрятать
 * её до момента, когда читатель увидит перепутанную таблицу.
 */
export function withTranslation(block: Block, texts: string[]): string {
  switch (block.kind) {
    case 'text':
      return texts[0] ?? block.text;
    case 'image':
      return imageParagraph(block.url, texts[0] ?? block.alt);
    case 'table': {
      let cursor = 0;
      const rows = block.rows.map((row) =>
        row.map((cell) => texts[cursor++] ?? cell),
      );
      return tableParagraph(rows);
    }
  }
}

/**
 * Текст книги без разметки блоков.
 *
 * Нужен определению языка и подсчёту объёма: метка и адрес картинки — это не
 * слова документа, и считать их за текст значит занизить долю сербского и
 * завысить объём перевода.
 */
export function plainParagraphs(paragraphs: string[]): string[] {
  const out: string[] = [];
  for (const block of parseBlocks(paragraphs)) {
    for (const text of translatableText(block)) {
      if (text.trim()) out.push(text);
    }
  }
  return out;
}

/** Сколько знаков в книге без учёта служебной разметки. */
export function countChars(paragraphs: string[]): number {
  return plainParagraphs(paragraphs).reduce((sum, text) => sum + text.length, 0);
}
