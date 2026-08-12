/**
 * Адреса картинок сада.
 *
 * Спрайты лежат в public/ и приезжают под своими именами, а nginx кеширует /img
 * на месяц. Пока адрес не менялся, перерисованная утка так и оставалась старой
 * у всех, кто уже был в саду. Отпечаток содержимого подставляется в адрес и
 * меняется вместе с рисунком — vite.config.ts считает его при сборке.
 *
 * Фоновые тайлы из index.css сюда не попадают: у них адреса в CSS, и с ними
 * работает обычный хеш бандла.
 */

declare const __GARDEN_ART__: string | undefined;

const VERSION = typeof __GARDEN_ART__ === 'string' ? __GARDEN_ART__ : 'dev';

export function gardenArt(path: string): string {
  return `${path}?v=${VERSION}`;
}
