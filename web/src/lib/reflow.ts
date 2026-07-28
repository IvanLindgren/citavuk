/**
 * Восстановление абзацев из строк PDF.
 *
 * PDF не хранит абзацев — только строки на странице. Наивный разбор давал одну
 * из двух крайностей: либо каждая зрительная строка становилась абзацем, либо
 * целая страница склеивалась в один кирпич текста. Читать нельзя ни то, ни
 * другое, а в читалке абзац — ещё и единица перевода и закладки.
 *
 * Здесь строки собираются обратно в абзацы по признакам, которые в вёрстке
 * действительно есть: короткая последняя строка, конец предложения, маркер
 * списка, заголовок, перенос по слогам. Плюс убирается то, что повторяется на
 * каждой странице, — колонтитулы и номера страниц.
 *
 * Те же правила продублированы в приложении (frontend/lib/utils/reflow.dart) —
 * книга, открытая на телефоне и на сайте, обязана делиться на абзацы одинаково,
 * иначе разъедется позиция чтения.
 */

/** Строка-номер страницы: «12», «— 12 —», «стр. 12», «страна 12». */
const PAGE_NUMBER = /^(?:[-–—]\s*)?(?:стр\.?|страна|page)?\s*\d{1,4}\s*(?:[-–—]\s*)?$/iu;

/** Маркер списка или пункта: «•», «—», «1.», «2)», «а)». */
const LIST_ITEM = /^(?:[•·▪◦*]|[-–—]\s|\d{1,3}[.)]\s|[a-zа-яђјљњћџš][.)]\s)/iu;

/** Конец предложения. Кавычки и скобки могут стоять после точки. */
const SENTENCE_END = /[.!?…](?:["»”’')\]]|\s)*$/u;

/**
 * Перенос по слогам: дефис в конце строки сразу после буквы.
 *
 * Только ASCII-дефис. Тире «—» в конце строки — это прямая речь, и склеивать
 * такую строку со следующей нельзя.
 */
const HYPHENATED = /(\p{L})-$/u;

/** Насколько строка должна быть короче обычной, чтобы считаться концом абзаца. */
const SHORT_LINE_RATIO = 0.78;

/** Доля страниц, на которых строка должна повторяться, чтобы счесть её колонтитулом. */
const RUNNING_HEAD_SHARE = 0.6;

/** Минимум страниц, при котором вообще имеет смысл искать колонтитулы. */
const MIN_PAGES_FOR_HEADS = 4;

/** Длиннее этого абзац принудительно делится по предложениям. */
const MAX_PARAGRAPH = 2400;

/** Целевой размер куска при делении длинного абзаца. */
const TARGET_CHUNK = 1200;

/**
 * Собирает абзацы из строк документа, разбитых по страницам.
 *
 * Разбиение по страницам нужно не для вывода, а чтобы найти колонтитулы:
 * строку, повторяющуюся на большинстве страниц, невозможно отличить от текста,
 * пока не видишь остальные страницы.
 */
export function reflowDocument(pages: string[][]): string[] {
  const cleanedPages = pages.map((page) =>
    page.map(normalizeLine).filter((line) => line !== '' && !PAGE_NUMBER.test(line)),
  );

  const running = runningHeads(cleanedPages);
  const lines: string[] = [];
  for (const page of cleanedPages) {
    const body = page.filter((line) => !running.has(line));
    if (body.length === 0) continue;
    // Между страницами вставляется пустая строка: абзац крайне редко
    // продолжается через разрыв, а склейка соседних страниц заметно хуже
    // читается, чем лишний разрыв.
    if (lines.length > 0) lines.push('');
    lines.push(...body);
  }

  return splitLongParagraphs(reflowLines(lines));
}

/** Строка страницы вместе с её границами по горизонтали. */
export interface LayoutLine {
  text: string;
  left: number;
  right: number;
}

/**
 * Насколько строка должна отступить вправо, чтобы счесть её красной строкой.
 *
 * Доля ширины колонки: в вёрстке абзацный отступ — это 1–2 кегля, то есть
 * проценты от ширины, а не фиксированные пункты.
 */
const INDENT_SHARE = 0.012;

/** Насколько строка должна не дойти до правого края, чтобы закрыть абзац. */
const SHORT_TAIL_SHARE = 0.06;

/**
 * Собирает абзацы, зная, где строки начинаются и заканчиваются.
 *
 * Разбор по одному тексту не видит красной строки, а в книгах именно она —
 * главный признак абзаца: строки выровнены по ширине и по длине не отличаются.
 */
export function reflowDocumentWithLayout(pages: LayoutLine[][]): string[] {
  const lines: string[] = [];

  for (const page of pages) {
    const visible = page.filter((line) => {
      const text = normalizeLine(line.text);
      return text !== '' && !PAGE_NUMBER.test(text);
    });
    if (visible.length === 0) continue;

    const lefts = visible.map((line) => line.left).sort((a, b) => a - b);
    const rights = visible.map((line) => line.right).sort((a, b) => a - b);
    const baseLeft = lefts[Math.floor(lefts.length / 2)]!;
    const maxRight = rights[rights.length - 1]!;
    const width = maxRight - baseLeft;
    if (width <= 0) {
      lines.push(...visible.map((line) => normalizeLine(line.text)));
      continue;
    }

    if (lines.length > 0) lines.push('');
    for (let i = 0; i < visible.length; i++) {
      const line = visible[i]!;
      const indented = line.left > baseLeft + width * INDENT_SHARE;
      const previousShort =
        i > 0 && visible[i - 1]!.right < maxRight - width * SHORT_TAIL_SHARE;

      // Пустая строка — это разрыв для reflowLines: дальше он сам решит, как
      // склеивать остальное.
      if (i > 0 && (indented || previousShort)) lines.push('');
      lines.push(normalizeLine(line.text));
    }
  }

  return splitLongParagraphs(reflowLines(withoutRunningHeads(lines)));
}

/** Убирает колонтитулы из плоского списка строк. */
function withoutRunningHeads(lines: string[]): string[] {
  const counts = new Map<string, number>();
  for (const line of lines) {
    if (line === '') continue;
    counts.set(line, (counts.get(line) ?? 0) + 1);
  }
  // Колонтитул повторяется столько же раз, сколько страниц; порог берём
  // консервативно, чтобы не выкинуть повторяющуюся реплику диалога.
  const repeated = new Set<string>();
  for (const [line, count] of counts) {
    if (count >= 4 && line.length < 90) repeated.add(line);
  }
  if (repeated.size === 0) return lines;
  return lines.filter((line) => !repeated.has(line));
}

/** Собирает абзацы из плоского списка строк. Пустая строка — явный разрыв. */
export function reflowLines(rawLines: string[]): string[] {
  const lines = rawLines.map(normalizeLine);
  const typical = typicalLength(lines);

  const paragraphs: string[] = [];
  let current = '';
  let previous = '';

  const flush = () => {
    const text = current.trim();
    if (text) paragraphs.push(text);
    current = '';
    previous = '';
  };

  for (const line of lines) {
    if (line === '') {
      flush();
      continue;
    }
    if (current === '') {
      current = line;
      previous = line;
      continue;
    }

    if (startsNewParagraph(previous, line, typical)) {
      flush();
      current = line;
      previous = line;
      continue;
    }

    const hyphen = HYPHENATED.exec(previous);
    if (hyphen && /^\p{Ll}/u.test(line)) {
      // Слово разорвано переносом: дефис принадлежит вёрстке, не слову.
      current = `${current.slice(0, -1)}${line}`;
    } else {
      current = `${current} ${line}`;
    }
    previous = line;
  }
  flush();

  return paragraphs;
}

function startsNewParagraph(previous: string, line: string, typical: number): boolean {
  if (LIST_ITEM.test(line)) return true;
  if (isHeading(previous) || isHeading(line)) return true;

  // Главный признак: предыдущая строка закончила предложение и при этом не
  // дотянула до правого края. Полная строка с точкой — обычная середина
  // абзаца, а недобранная означает, что дальше вёрстка начала новый.
  if (SENTENCE_END.test(previous)) {
    if (typical === 0) return true;
    return previous.length < typical * SHORT_LINE_RATIO;
  }
  return false;
}

/**
 * Заголовок: строка из прописных букв без конечной точки.
 *
 * Признак узкий намеренно. Более вольные правила (короткая строка с большой
 * буквы) уводят в отдельный абзац каждую строку диалога.
 */
function isHeading(line: string): boolean {
  if (line.length === 0 || line.length > 90) return false;
  if (SENTENCE_END.test(line)) return false;
  const letters = [...line].filter((ch) => /\p{L}/u.test(ch));
  if (letters.length < 3) return false;
  return letters.every((ch) => ch === ch.toUpperCase());
}

/**
 * Характерная длина строки — 70-й процентиль.
 *
 * Не среднее: последние строки абзацев и заголовки занижают его настолько, что
 * «короткая строка» перестаёт что-либо значить.
 */
function typicalLength(lines: string[]): number {
  const lengths = lines
    .filter((line) => line !== '')
    .map((line) => line.length)
    .sort((a, b) => a - b);
  // Двух строк для оценки мало: там 0 означает «сравнивать не с чем», и разрыв
  // ставится по одному лишь концу предложения.
  if (lengths.length < 3) return 0;
  return lengths[Math.floor(lengths.length * 0.7)] ?? 0;
}

/** Строки, повторяющиеся на большинстве страниц, — колонтитулы. */
function runningHeads(pages: string[][]): Set<string> {
  if (pages.length < MIN_PAGES_FOR_HEADS) return new Set();

  const counts = new Map<string, number>();
  for (const page of pages) {
    // На одной странице строка учитывается один раз: повтор внутри страницы
    // (например, в таблице) колонтитулом не делает.
    for (const line of new Set(page)) {
      counts.set(line, (counts.get(line) ?? 0) + 1);
    }
  }

  const threshold = Math.ceil(pages.length * RUNNING_HEAD_SHARE);
  const heads = new Set<string>();
  for (const [line, count] of counts) {
    if (count >= threshold) heads.add(line);
  }
  return heads;
}

function normalizeLine(line: string): string {
  return line.replace(/\s+/gu, ' ').trim();
}

/**
 * Делит абзацы, которые всё равно вышли огромными.
 *
 * Такое остаётся после документов совсем без вёрстки. Абзац на десять экранов
 * неудобно читать и нечем переводить целиком, поэтому режется по границам
 * предложений — но с большим запасом, чтобы обычный длинный абзац уцелел.
 */
function splitLongParagraphs(paragraphs: string[]): string[] {
  const out: string[] = [];
  for (const paragraph of paragraphs) {
    if (paragraph.length <= MAX_PARAGRAPH) {
      out.push(paragraph);
      continue;
    }
    let chunk = '';
    for (const sentence of paragraph.split(/(?<=[.!?…])\s+/u)) {
      chunk = chunk ? `${chunk} ${sentence}` : sentence;
      if (chunk.length >= TARGET_CHUNK) {
        out.push(chunk);
        chunk = '';
      }
    }
    if (chunk) out.push(chunk);
  }
  return out;
}
