import { LuMessageCircle } from 'react-icons/lu';

import type { SpeakingGenre } from '../../api/speaking';

/**
 * Рисованный значок жанра — тем же штрихом, что значки Путешествия. Разметку
 * отдаёт сервер вместе с каталогом тем и пропускает только простые фигуры
 * (`speaking.validArt`), поэтому её можно вставить как есть.
 */
export function GenreIcon({ genre, className = '' }: { genre?: SpeakingGenre; className?: string }) {
  if (!genre?.art) return <LuMessageCircle className={className} aria-hidden="true" />;
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
      dangerouslySetInnerHTML={{ __html: genre.art }}
    />
  );
}
