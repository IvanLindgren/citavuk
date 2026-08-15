import { describe, expect, it } from 'vitest';

import type { GardenEarning } from '../api/garden';
import { arrived, ledgerOf } from './earnings';

function lines(today: Record<string, number>): GardenEarning[] {
  return Object.entries(today).map(([source, value]) => ({
    source,
    title: source === 'reading' ? 'Чтение книг' : source,
    today: value,
    cap: 30,
  }));
}

describe('прилетевшие динары', () => {
  it('говорят, за что именно начислили', () => {
    const notes = arrived({ reading: 3 }, lines({ reading: 6 }));
    expect(notes).toEqual([{ source: 'reading', title: 'Чтение книг', coins: 3 }]);
  });

  it('замечают источник, которого в прошлом ответе не было вовсе', () => {
    const notes = arrived({ reading: 3 }, lines({ reading: 3, duel: 5 }));
    expect(notes).toEqual([{ source: 'duel', title: 'duel', coins: 5 }]);
  });

  it('молчат, когда ничего не изменилось', () => {
    expect(arrived({ reading: 3, duel: 5 }, lines({ reading: 3, duel: 5 }))).toEqual([]);
  });

  /*
    В полночь счётчики источников начинаются заново. Уменьшение — это новый
    день, а не отнятые динары, и говорить о нём нечего.
  */
  it('не считают убытком обнуление на новый день', () => {
    expect(arrived({ reading: 30, duel: 25 }, lines({ reading: 0, duel: 0 }))).toEqual([]);
  });

  it('складываются в счёт по источникам', () => {
    expect(ledgerOf(lines({ reading: 3, duel: 5 }))).toEqual({ reading: 3, duel: 5 });
  });
});
