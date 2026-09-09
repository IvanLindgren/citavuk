import type { ReflexiveParticle, WordAnalysis } from '../api/analyze';
import { BIONIC_RATIO, type BionicLevel } from './readerSettings';
import { STRESS_MARK } from './stress';
import { tokenize, type Token } from './tokenize';

/**
 * Слово с выделенной основой.
 *
 * Приём тот же, что в приложении: жирным набирается начало слова, и глаз
 * цепляется за него, не вчитываясь в окончание. На чужом языке это заметно
 * помогает — сербские падежные окончания длинные и все разные.
 *
 * Длина выделения считается по кодовым точкам, а не по индексу в строке:
 * `split('')` разорвал бы суррогатную пару, а `Intl.Segmenter` здесь избыточен —
 * в сербском нет составных графем, из-за которых он был бы нужен.
 */
export function bionicSplit(text: string, level: BionicLevel): [string, string] {
  const ratio = BIONIC_RATIO[level];
  if (ratio <= 0) return [text, ''];
  const letters = [...text];
  // Хотя бы одна буква, но не всё слово целиком: сплошь жирный текст перестаёт
  // выделять что-либо и просто утомляет.
  const head = Math.min(
    Math.max(1, Math.round(letters.length * ratio)),
    Math.max(1, letters.length - 1),
  );
  return [letters.slice(0, head).join(''), letters.slice(head).join('')];
}

/**
 * Кусок слова с признаками оформления.
 *
 * Выделение основы и помета ударения делят одно и то же слово, и порядок
 * «сначала одно, потом другое» здесь не работает: ударная буква может попасть
 * в жирное начало. Поэтому слово режется по всем границам сразу.
 */
export interface WordPiece {
  text: string;
  /** Начало слова, набираемое жирным. */
  bold: boolean;
  /** Ударная буква. */
  stress: boolean;
}

export function wordPieces(text: string, head: number, at: number | null): WordPiece[] {
  const letters = [...text];
  const points = new Set([0, letters.length]);
  if (head > 0 && head < letters.length) points.add(head);
  if (at !== null && at >= 0 && at < letters.length) {
    points.add(at);
    points.add(at + 1);
  }

  const bounds = [...points].sort((a, b) => a - b);
  const pieces: WordPiece[] = [];
  for (let index = 0; index < bounds.length - 1; index += 1) {
    const start = bounds[index]!;
    const end = bounds[index + 1]!;
    pieces.push({
      text: letters.slice(start, end).join(''),
      bold: start < head,
      stress: at !== null && start === at,
    });
  }
  return pieces;
}


/**
 * Где в тексте лежит второе слово пары «глагол + se».
 *
 * Нажали глагол — ищется частица, нажали частицу — её глагол. Сервер называет
 * спутника написанием и стороной, а не смещением: пересылать байтовые смещения
 * Go в индексы JavaScript значит пересчитывать UTF-8 в UTF-16 в обе стороны и
 * ошибиться на кириллице.
 */
export function companionStart(
  text: string,
  token: Token,
  reflexive: ReflexiveParticle,
): number | null {
  const tokens = tokenize(text).filter((item) => item.isWord);
  const index = tokens.findIndex((item) => item.start === token.start);
  if (index < 0) return null;

  const wanted = reflexive.companion.toLocaleLowerCase('sr');
  const step = reflexive.before ? -1 : 1;
  for (let at = index + step; at >= 0 && at < tokens.length; at += step) {
    const candidate = tokens[at]!;
    if (candidate.text.toLocaleLowerCase('sr') === wanted) return candidate.start;
    // Дальше одного соседнего слова спутник ищется, только если сервер сказал,
    // что пара стоит не вплотную.
    if (reflexive.adjacent) return null;
  }
  return null;
}


/**
 * Одиночный клик открывает разбор, а протягивание мышью или долгое нажатие
 * остаётся нативным выделением текста. Проверяем не только `isCollapsed`:
 * Safari иногда сохраняет непустой текст в Selection ещё один тик после
 * отпускания пальца.
 */
export function shouldOpenWord(selection: Selection | null): boolean {
  return selection === null || selection.isCollapsed || selection.toString().trim() === '';
}

/**
 * Возвращает выделенную внутри читалки фразу. Диапазон, который начинается или
 * заканчивается за пределами текста книги, игнорируется, чтобы системное
 * выделение заголовков и кнопок не открывало переводчик.
 */
export function readerSelectionText(
  selection: Selection | null,
  root: HTMLElement | null,
): string | null {
  if (
    !selection ||
    !root ||
    selection.isCollapsed ||
    selection.rangeCount === 0
  ) {
    return null;
  }

  const range = selection.getRangeAt(0);
  if (
    !root.contains(range.startContainer) ||
    !root.contains(range.endContainer)
  ) {
    return null;
  }

  // Знак ударения добавлен только визуально читалкой. Переводчик и
  // грамматический анализ должны получить исходное написание фразы.
  const text = selection
    .toString()
    .replaceAll(STRESS_MARK, '')
    .replace(/\s+/gu, ' ')
    .trim();
  return text || null;
}


/**
 * Короткое описание формы: «мн. ч.», «3 л. ед., презент».
 * Пустая строка — слово и так начальная форма.
 */
export function formLabelOf(analysis: WordAnalysis | null): string {
  if (!analysis) return '';
  if (analysis.english) return analysis.english.formLabel ?? '';
  return analysis.facts.map((fact) => fact.value).join(', ');
}

/** Есть ли из чего выбирать: словоформа отличается от начальной формы. */
export function hasFormChoice(
  kind: 'word' | 'phrase',
  word: string,
  analysis: WordAnalysis | null,
): boolean {
  if (kind !== 'word' || !analysis?.lemma) return false;
  return analysis.lemma.toLocaleLowerCase('sr') !== word.toLocaleLowerCase('sr');
}
