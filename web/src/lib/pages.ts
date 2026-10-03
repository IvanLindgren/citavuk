import { parseBlock, richParagraph } from './blocks';

/**
 * Разбиение книги на страницы.
 *
 * Раньше страница всегда кончалась на границе абзаца, а абзац никогда не
 * разрывался. Правило выглядело безобидно ровно до тех пор, пока не встретился
 * абзац больше самой страницы — а в книгах из публичной библиотеки такие абзацы
 * обычное дело, там целая глава нередко идёт одним куском. Тогда получалось
 * худшее из возможных: недобранная страница выталкивалась досрочно (вот откуда
 * «одна страница совсем маленькая»), а следом шла страница на десятки тысяч
 * знаков, на которой телефон заметно тормозил.
 *
 * Поэтому длинный абзац теперь режется — но только по границам предложений.
 * Исходное опасение («предложение окажется на двух страницах и перевод слова
 * потеряет контекст») остаётся в силе и именно поэтому соблюдается: разрыв
 * проходит между предложениями, а не внутри них.
 */

/** Сколько знаков помещается на страницу. */
export const PAGE_CHARS = 1500;

/** Страница книги. */
export interface Page {
  /**
   * Куски текста страницы. Целый абзац либо часть длинного абзаца — читалка
   * рисует каждый кусок как абзац, и внешне разрыв виден только как конец
   * страницы.
   */
  texts: string[];
  /**
   * Абзац, с которого страница начинается. Прогресс чтения хранится в абзацах,
   * а не в страницах: разбиение зависит от ширины экрана, а место, где человек
   * остановился, — нет.
   */
  start: number;
  /** UTF-16 смещение начала страницы внутри исходного абзаца. */
  offset?: number;
}

/** Собирает страницы примерно равной длины. */
export function paginate(paragraphs: string[], budget = PAGE_CHARS): Page[] {
  const pages: Page[] = [];
  let texts: string[] = [];
  let start = 0;
  let offset = 0;
  let filled = 0;

  const flush = () => {
    if (texts.length === 0) return;
    pages.push(offset ? { texts, start, offset } : { texts, start });
    texts = [];
    filled = 0;
  };

  for (let index = 0; index < paragraphs.length; index++) {
    let within = 0;
    for (const piece of splitParagraph(paragraphs[index] ?? '', budget)) {
      const weight = pageWeight(piece);
      if (filled > 0 && filled + weight > budget) flush();
      // Страница получает номер абзаца, с которого началась. При разрыве
      // длинного абзаца несколько страниц подряд ссылаются на один и тот же
      // абзац — это верно: прогресс в него и указывает.
      if (texts.length === 0) { start = index; offset = within; }
      texts.push(piece);
      filled += weight;
      // Смещение — по тексту, а не по строке: у абзаца с оформлением в
      // строке ещё и служебная разметка.
      within += pieceTextLength(piece);
    }
  }
  flush();

  return pages;
}

/** Старые закладки без offset открываются у начала абзаца, а не в конце главы. */
export function pageForPosition(pages: Page[], paragraph: number, offset = 0): number {
  const found=pages.findLastIndex(p=>p.start<paragraph || (p.start===paragraph && (p.offset??0)<=offset));
  return Math.max(0,found);
}

/**
 * Сколько места кусок занимает на странице, в единицах «знак текста».
 *
 * Картинку и таблицу считать по длине их разметки бессмысленно: адрес картинки
 * бывает длиннее абзаца, а занимает она полэкрана независимо от длины адреса.
 */
export function pageWeight(paragraph: string): number {
  const block = parseBlock(paragraph);
  switch (block.kind) {
    case 'text':
      return block.text.length;
    case 'image':
      // Картинка ограничена высотой в 70% экрана — это примерно страница
      // текста, но оставим запас, чтобы подпись и абзац рядом уместились.
      return Math.round(PAGE_CHARS * 0.6);
    case 'table':
      // Строка таблицы занимает заметно больше места, чем строка текста:
      // у неё поля, рамки и перенос внутри ячеек.
      return block.rows.reduce(
        (sum, row) => sum + 40 + row.reduce((cells, cell) => cells + cell.length, 0),
        0,
      );
  }
}

/**
 * Режет слишком длинный абзац на куски не больше страницы.
 *
 * Куски склеиваются обратно в исходный абзац знак в знак: читалка показывает
 * их подряд, и потеря хотя бы пробела была бы порчей книги.
 */
export function splitParagraph(paragraph: string, budget = PAGE_CHARS): string[] {
  const block = parseBlock(paragraph);
  // Картинку и таблицу резать нечем и незачем: это цельные объекты.
  if (block.kind !== 'text') return [paragraph];
  if (block.text.length <= budget) return [paragraph];
  if (!block.spans?.length) return balance(atoms(paragraph, budget), budget);

  // Абзац с оформлением режется по тексту, а каждый кусок получает свои
  // отрезки стилей: разрезанная строка с разметкой потеряла бы оформление
  // всех кусков, кроме первого.
  let at = 0;
  return balance(atoms(block.text, budget), budget).map((part) => {
    const from = at;
    at += part.length;
    return richParagraph(
      part,
      block.spans!
        .filter((span) => span.end > from && span.start < from + part.length)
        .map((span) => ({ start: span.start - from, end: span.end - from, style: span.style })),
    );
  });
}

function pieceTextLength(piece: string): number {
  const block = parseBlock(piece);
  return block.kind === 'text' ? block.text.length : piece.length;
}

/**
 * Какие абзацы книги видны на странице: правка берёт их целиком, даже если
 * длинный абзац начался на прошлой странице или продолжится на следующей.
 */
export function pageParagraphRange(pages: Page[], pageIndex: number, total: number): [number, number] {
  const page = pages[pageIndex];
  if (!page) return [0, 0];
  const next = pages[pageIndex + 1];
  let end = next ? next.start : total;
  // Следующая страница продолжает тот же абзац — он и наш.
  if (next && next.offset) end = next.start + 1;
  return [page.start, Math.max(page.start + 1, end)];
}

/**
 * Складывает куски как можно ровнее, не увеличивая их числа.
 *
 * Набивать каждый кусок под завязку нельзя: в конце неизбежно остаётся
 * огрызок. Абзац на 15 800 знаков давал одиннадцать страниц по 1422 и
 * двенадцатую на 157 — она мелькает при листании и выглядит сбоем вёрстки.
 *
 * Поделить длину поровну тоже не выходит: куски набираются целыми
 * предложениями, в цель они не попадают, и накопленный недобор всё равно
 * выливается в лишнюю страницу.
 *
 * Поэтому число кусков определяется набивкой под завязку, а затем ищется
 * наименьший предел, при котором кусков остаётся столько же. При нём самый
 * большой кусок минимален — то есть куски настолько равны, насколько это
 * вообще возможно при данных предложениях.
 */
function balance(atomList: string[], budget: number): string[] {
  const packed = pack(atomList, budget);
  if (packed.length <= 1) return packed;

  let low = Math.max(...atomList.map((atom) => atom.length));
  let high = budget;
  while (low < high) {
    const middle = Math.floor((low + high) / 2);
    if (pack(atomList, middle).length <= packed.length) high = middle;
    else low = middle + 1;
  }
  return pack(atomList, low);
}

/** Жадно набивает куски до предела. */
function pack(atomList: string[], limit: number): string[] {
  const out: string[] = [];
  let current = '';
  for (const atom of atomList) {
    if (current !== '' && current.length + atom.length > limit) {
      out.push(current);
      current = '';
    }
    current += atom;
  }
  if (current !== '') out.push(current);
  return out;
}

/** Куски, каждый из которых заведомо помещается на страницу. */
function atoms(text: string, budget: number): string[] {
  const out: string[] = [];
  for (const sentence of sentences(text)) {
    if (sentence.length <= budget) {
      out.push(sentence);
      continue;
    }
    out.push(...byWords(sentence, budget));
  }
  return out;
}

/** Знаки конца предложения. */
const ENDERS = '.!?…';

/**
 * Делит текст на предложения, сохраняя всё до последнего пробела.
 *
 * Разбор нарочно грубый: сокращения вроде «т. н.» дадут лишнюю границу. Для
 * вёрстки это несущественно — страница просто кончится чуть раньше, — а точный
 * разбор сокращений сербского здесь не окупается.
 */
function sentences(text: string): string[] {
  const out: string[] = [];
  let from = 0;

  for (let i = 0; i < text.length; i++) {
    const char = text[i]!;
    if (!ENDERS.includes(char) && char !== '\n') continue;

    let end = i + 1;
    // Многоточие из точек и «?!» — это одна граница, а не три.
    while (end < text.length && ENDERS.includes(text[end]!)) end++;
    // Пробел после точки остаётся с левым куском: иначе следующая страница
    // начиналась бы с отступа.
    while (end < text.length && /\s/.test(text[end]!)) end++;

    out.push(text.slice(from, end));
    from = end;
    i = end - 1;
  }

  if (from < text.length) out.push(text.slice(from));
  return out;
}

/**
 * Режет по словам то, что не удалось разрезать по предложениям.
 *
 * Так выглядит текст вообще без знаков конца — например, распознанный из
 * скана. Место разрыва здесь уже не идеально, но страница на сорок тысяч
 * знаков хуже любого разрыва.
 */
function byWords(text: string, budget: number): string[] {
  const out: string[] = [];
  let from = 0;

  while (text.length - from > budget) {
    let cut = text.lastIndexOf(' ', from + budget);
    if (cut <= from) {
      // Одно слово длиннее страницы: режем по буквам, иначе цикл не сдвинется.
      cut = from + budget;
    } else {
      cut += 1;
    }
    out.push(text.slice(from, cut));
    from = cut;
  }

  if (from < text.length) out.push(text.slice(from));
  return out;
}
