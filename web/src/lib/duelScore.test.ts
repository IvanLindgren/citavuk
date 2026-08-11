import { describe, expect, it } from 'vitest';

import {
  blowFor,
  comboStep,
  isComboMilestone,
  powerFactor,
  rankOf,
  roundOutcome,
  CRIT_POWER,
  ROUND_HP,
  WIN_DAMAGE,
  type DuelWinner,
} from './duelScore';

describe('удар за предложение', () => {
  it('выигранное предложение бьёт по машине и не задевает вас', () => {
    const blow = blowFor('user', 60);
    expect(blow.toFoe).toBe(WIN_DAMAGE);
    expect(blow.toHero).toBe(0);
  });

  it('проигранное бьёт по вам и не задевает машину', () => {
    const blow = blowFor('translator', 100);
    expect(blow.toHero).toBe(WIN_DAMAGE);
    expect(blow.toFoe).toBe(0);
  });

  it('ничья задевает обоих поровну', () => {
    const blow = blowFor('tie', 50);
    expect(blow.toFoe).toBe(blow.toHero);
    expect(blow.toFoe).toBeGreaterThan(0);
  });

  /*
    Самое важное свойство всей математики: разгон не имеет доступа к полоскам.
    Пока он их двигал, быстрый набор отдавал раунд человеку, проигравшему по
    счёту три предложения из пяти.
  */
  it('разгон не двигает полоски здоровья', () => {
    for (const winner of ['user', 'translator', 'tie'] as DuelWinner[]) {
      const slow = blowFor(winner, 0);
      const fast = blowFor(winner, 100);
      expect(fast.toFoe).toBe(slow.toFoe);
      expect(fast.toHero).toBe(slow.toHero);
    }
  });

  it('разгон поднимает очки стиля', () => {
    expect(blowFor('user', 100).style).toBeGreaterThan(blowFor('user', 0).style);
  });

  it('даже без разгона выигранное предложение даёт стиль', () => {
    // Перевод, обдуманный медленно, — всё равно выигранный перевод.
    expect(blowFor('user', 0).style).toBeGreaterThan(0);
  });

  it('проигранное предложение стиля не даёт', () => {
    expect(blowFor('translator', 100).style).toBe(0);
  });

  it('критом считается только удар с полным разгоном', () => {
    expect(blowFor('user', CRIT_POWER - 1).crit).toBe(false);
    expect(blowFor('user', CRIT_POWER).crit).toBe(true);
  });

  it('пропущенный удар не бывает критическим', () => {
    expect(blowFor('translator', 100).crit).toBe(false);
  });

  it('множитель разгона зажат между полом и потолком', () => {
    expect(powerFactor(-50)).toBe(powerFactor(0));
    expect(powerFactor(500)).toBe(powerFactor(100));
    expect(powerFactor(Number.NaN)).toBe(powerFactor(0));
  });
});

/*
  Полоски — это счёт. Ниже перебираются все расклады раунда из пяти фраз и
  проверяется, что итог по полоскам совпадает с итогом по числу побед. Ровно
  этого и не хватало: зрелище обязано повторять счёт, а не спорить с ним.
*/
describe('итог раунда повторяет счёт', () => {
  const play = (winners: DuelWinner[], power: number) => {
    let hero = ROUND_HP;
    let foe = ROUND_HP;
    for (const winner of winners) {
      const blow = blowFor(winner, power);
      hero = Math.max(0, hero - blow.toHero);
      foe = Math.max(0, foe - blow.toFoe);
    }
    return { outcome: roundOutcome(hero, foe), hero, foe };
  };

  const byCount = (winners: DuelWinner[]): DuelWinner => {
    const wins = winners.filter((winner) => winner === 'user').length;
    const losses = winners.filter((winner) => winner === 'translator').length;
    if (wins === losses) return 'tie';
    return wins > losses ? 'user' : 'translator';
  };

  const every: DuelWinner[][] = [];
  const build = (prefix: DuelWinner[]) => {
    if (prefix.length === 5) {
      every.push(prefix);
      return;
    }
    for (const winner of ['user', 'translator', 'tie'] as DuelWinner[]) build([...prefix, winner]);
  };
  build([]);

  it('во всех 243 раскладах и при любом разгоне', () => {
    for (const winners of every) {
      for (const power of [0, 50, 100]) {
        expect(play(winners, power).outcome, `${winners.join(',')} при разгоне ${power}`).toBe(
          byCount(winners),
        );
      }
    }
  });

  it('чистая победа кладёт машину в ноль', () => {
    expect(play(['user', 'user', 'user', 'user', 'user'], 0).foe).toBe(0);
  });

  it('чистое поражение кладёт вас в ноль', () => {
    expect(play(['translator', 'translator', 'translator', 'translator', 'translator'], 100).hero).toBe(0);
  });
});

describe('серия', () => {
  it('ступень растёт с серией и упирается в число файлов клика', () => {
    expect(comboStep(0)).toBe(0);
    expect(comboStep(1)).toBe(0);
    expect(comboStep(4)).toBe(2);
    expect(comboStep(64)).toBe(6);
    expect(comboStep(100000)).toBe(7);
  });

  it('кричит каждые восемь символов', () => {
    expect(isComboMilestone(8)).toBe(true);
    expect(isComboMilestone(16)).toBe(true);
    expect(isComboMilestone(9)).toBe(false);
    expect(isComboMilestone(0)).toBe(false);
  });
});

describe('ранг', () => {
  it('раздаётся по очкам стиля', () => {
    expect(rankOf(140)).toBe('S');
    expect(rankOf(110)).toBe('A');
    expect(rankOf(70)).toBe('B');
    expect(rankOf(20)).toBe('C');
  });

  it('пять выигранных фраз без пауз дают высший ранг, с раздумьями — нет', () => {
    const fast = 5 * blowFor('user', 100).style;
    const slow = 5 * blowFor('user', 0).style;
    expect(rankOf(fast)).toBe('S');
    expect(rankOf(slow)).toBe('B');
  });
});
