import type { SpeakingMistake } from '../../api/speaking';

export interface TextPart {
  text: string;
  /** Индекс ошибки из ответа сервера, если фрагмент подсвечен. */
  mistake?: number;
}

/**
 * Режет текст на куски, помечая места ошибок. Сервер гарантирует, что
 * `original` встречается в тексте (без учёта регистра), но не где именно и
 * сколько раз: берём первое ещё не занятое вхождение, а ошибки, которым места
 * не нашлось, просто остаются в списке без подсветки. Тот же алгоритм во Flutter
 * (`frontend/lib/games/speaking/highlight.dart`).
 */
export function annotate(text: string, mistakes: SpeakingMistake[]): TextPart[] {
  const lower = text.toLowerCase();
  const spans: { start: number; end: number; mistake: number }[] = [];
  mistakes.forEach((mistake, index) => {
    const needle = mistake.original.toLowerCase();
    if (!needle) return;
    let from = 0;
    for (;;) {
      const start = lower.indexOf(needle, from);
      if (start < 0) return;
      const end = start + needle.length;
      if (!spans.some((span) => start < span.end && end > span.start)) {
        spans.push({ start, end, mistake: index });
        return;
      }
      from = start + 1;
    }
  });
  spans.sort((a, b) => a.start - b.start);

  const parts: TextPart[] = [];
  let cursor = 0;
  for (const span of spans) {
    if (span.start > cursor) parts.push({ text: text.slice(cursor, span.start) });
    parts.push({ text: text.slice(span.start, span.end), mistake: span.mistake });
    cursor = span.end;
  }
  if (cursor < text.length) parts.push({ text: text.slice(cursor) });
  return parts;
}

export function countWords(text: string): number {
  return text.trim().split(/\s+/).filter(Boolean).length;
}
