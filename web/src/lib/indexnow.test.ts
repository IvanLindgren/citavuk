import { describe, expect, it } from 'vitest';

// @ts-expect-error — скрипт сборки на чистом JS, типов у него нет и не нужно.
import { ownUrls } from '../../scripts/indexnow.mjs';

/**
 * Протокол отвечает 422 на ВЕСЬ запрос, если в списке есть хоть один чужой
 * адрес. Одна опечатка отменила бы отправку целиком, поэтому отбор чужого
 * стоит до запроса — и это единственное, что в отправке можно сломать молча.
 */

const SITE = 'https://citavuk.ru';

describe('отбор адресов для IndexNow', () => {
  it('относительный путь превращается в полный адрес', () => {
    expect(ownUrls(['/vukotok', '/books'])).toEqual([
      `${SITE}/vukotok`,
      `${SITE}/books`,
    ]);
  });

  it('полные адреса своего сайта проходят как есть', () => {
    expect(ownUrls([`${SITE}/`, `${SITE}/course`])).toEqual([
      `${SITE}/`,
      `${SITE}/course`,
    ]);
  });

  it('чужой домен отбрасывается, а не отменяет остальные', () => {
    expect(ownUrls(['/books', 'https://example.com/books', '/course'])).toEqual([
      `${SITE}/books`,
      `${SITE}/course`,
    ]);
  });

  // Поддомен — другой хост для протокола, и 422 на него был бы честным.
  it('поддомен считается чужим', () => {
    expect(ownUrls([`https://api.citavuk.ru/health`])).toEqual([]);
  });

  it('повторы схлопываются', () => {
    expect(ownUrls(['/books', `${SITE}/books`, '/books'])).toEqual([`${SITE}/books`]);
  });

  it('мусор не роняет разбор', () => {
    expect(ownUrls(['', '   ', null, undefined, 'не адрес', '/books'])).toEqual([
      `${SITE}/books`,
    ]);
  });
});
