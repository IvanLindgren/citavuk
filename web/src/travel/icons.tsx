import type { TravelBundle } from './types';

/**
 * Значки типов мест.
 *
 * Рисованные, а не эмодзи: эмодзи в каждой системе свои, на карте они выглядят
 * чужеродно и не знают ни бурека, ни джезвы, ни ћевапа. Исходники лежат в
 * `frontend/assets/travel/icons/` — приложение прочитает те же файлы, а веб
 * получает их содержимое внутри общего бандла.
 */

const FRAME =
  'viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" ' +
  'stroke-linecap="round" stroke-linejoin="round"';

/** Разметка значка или пустая строка, если такого нет. */
export function iconBody(bundle: TravelBundle, icon: string): string {
  return bundle.icons[icon] ?? '';
}

/** Готовый `<svg>` строкой: метки на карте создаются мимо React. */
export function iconMarkup(body: string): string {
  return `<svg ${FRAME} aria-hidden="true">${body}</svg>`;
}

export function PlaceIcon({ body, className = '' }: { body: string; className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.7}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      aria-hidden
      // Своё же содержимое из ассетов проекта, стороннего здесь ничего нет.
      dangerouslySetInnerHTML={{ __html: body }}
    />
  );
}
