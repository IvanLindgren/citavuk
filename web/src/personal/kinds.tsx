/**
 * Типы уроков колоды: подпись и эмблема.
 *
 * Эмблемы нарисованы тем же штрихом, что значки Путешествия и жанров «Говори!»
 * (24×24, линия 1,7). Цвет масти задаёт CSS-класс `kind-<тип>` в
 * `components/playing-card.css`, поэтому карта, легенда и страница урока берут
 * его из одного места.
 */

export const KIND_ORDER = ['reading', 'grammar', 'vocabulary', 'listening', 'writing'] as const;
export type LessonKind = (typeof KIND_ORDER)[number];

export const KIND_LABELS: Record<LessonKind, string> = {
  reading: 'Чтение',
  grammar: 'Грамматика',
  vocabulary: 'Лексика',
  listening: 'Понимание речи',
  writing: 'Письмо',
};

const ART: Record<LessonKind, string> = {
  reading:
    '<path d="M12 6.8C10 5.3 7 4.9 3.8 5.4v12.8c3.2-.5 6.2-.1 8.2 1.4 2-1.5 5-1.9 8.2-1.4V5.4C17 4.9 14 5.3 12 6.8z"/>' +
    '<path d="M12 6.8v12.8"/><path d="M6.4 9.2c1.3-.1 2.4.1 3.4.6M6.4 12.4c1.3-.1 2.4.1 3.4.6"/>',
  grammar:
    '<path d="M11.39 5.83 L12.81 3.74 L14.41 4.06 L14.92 6.53 L15.93 7.21 L18.42 6.73 L19.32 8.09 L17.93 10.20' +
    ' L18.17 11.39 L20.26 12.81 L19.94 14.41 L17.47 14.92 L16.79 15.93 L17.27 18.42 L15.91 19.32 L13.' +
    '80 17.93 L12.61 18.17 L11.19 20.26 L9.59 19.94 L9.08 17.47 L8.07 16.79 L5.58 17.27 L4.68 15.91 L' +
    '6.07 13.80 L5.83 12.61 L3.74 11.19 L4.06 9.59 L6.53 9.08 L7.21 8.07 L6.73 5.58 L8.09 4.68 L10.20' +
    ' 6.07 Z"/>' +
    '<circle cx="12" cy="12" r="2.6"/>',
  vocabulary:
    '<path d="M5.4 7.8v10.7a1.6 1.6 0 0 0 1.6 1.6h9.4"/><rect x="8.2" y="3.9" width="11" height="13.3" rx="1.6"/>' +
    '<path d="M11.2 8.2h5M11.2 11h5M11.2 13.8h3.2"/>',
  listening:
    '<path d="M4.8 14.6v-2.4a7.2 7.2 0 0 1 14.4 0v2.4"/><rect x="3.6" y="13.6" width="4.2" height="6.6" rx="1.6"/>' +
    '<rect x="16.2" y="13.6" width="4.2" height="6.6" rx="1.6"/>',
  writing:
    '<path d="M19.8 4.2c-6.4.3-11 4.9-12 11.2l-.9 3.6 3.6-.9c6.3-1 10.9-5.6 9.3-13.9z"/>' +
    '<path d="M6.9 19 14.7 11.2"/><path d="M3.6 20.6h6"/>',
};

export function lessonKind(kind?: string): LessonKind {
  return (KIND_ORDER as readonly string[]).includes(kind ?? '') ? (kind as LessonKind) : 'vocabulary';
}

export function KindIcon({ kind, className = '' }: { kind?: string; className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.7}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      aria-hidden="true"
      // Разметка — константы этого файла.
      dangerouslySetInnerHTML={{ __html: ART[lessonKind(kind)] }}
    />
  );
}
