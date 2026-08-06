import { describe, expect, it } from 'vitest';

import { whenLabel } from './FeedComments';

/**
 * Свежие реплики показываются относительным сроком, старые — датой. Граница
 * между ними и есть всё, что здесь можно сломать.
 */

const NOW = Date.parse('2026-08-05T12:00:00Z');
const ago = (ms: number) => new Date(NOW - ms).toISOString();

const MINUTE = 60_000;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;

describe('когда написано', () => {
  it('только что — пока не прошло минуты', () => {
    expect(whenLabel(ago(0), NOW)).toBe('только что');
    expect(whenLabel(ago(59_000), NOW)).toBe('только что');
  });

  it('минуты, часы и дни', () => {
    expect(whenLabel(ago(5 * MINUTE), NOW)).toBe('5 мин');
    expect(whenLabel(ago(3 * HOUR), NOW)).toBe('3 ч');
    expect(whenLabel(ago(2 * DAY), NOW)).toBe('2 дн');
  });

  // «43 дня назад» никто не переводит в число, поэтому старое — датой.
  it('через неделю переходит на дату', () => {
    expect(whenLabel(ago(6 * DAY), NOW)).toBe('6 дн');
    expect(whenLabel(ago(43 * DAY), NOW)).not.toMatch(/дн$/);
    expect(whenLabel(ago(43 * DAY), NOW)).toMatch(/\d/);
  });

  it('битую дату не показывает вовсе', () => {
    expect(whenLabel('вчера', NOW)).toBe('');
    expect(whenLabel('', NOW)).toBe('');
  });

  // Часы сервера и браузера расходятся, и реплика может прийти «из будущего».
  // «-3 мин» в обсуждении выглядит поломкой.
  it('время из будущего не даёт отрицательных чисел', () => {
    expect(whenLabel(new Date(NOW + 30_000).toISOString(), NOW)).toBe('только что');
  });
});
