/**
 * Боевая математика игры «Ты против переводчика».
 *
 * Вынесена из сцены отдельно, потому что это её единственная проверяемая
 * часть. Тряску и искры проверяют глазами, а «полоски здоровья не могут
 * разойтись со счётом» — правило, которое молча перестанет работать, если его
 * не закрепить тестом. Оно и не работало: пока разгон усиливал урон, две
 * выигранные фразы из пяти при быстром наборе отдавали раунд человеку, хотя
 * по счёту он его проиграл.
 *
 * Отсюда главное разделение. Полоски здоровья — это счёт и ничего кроме:
 * выигранная фраза снимает с соперника фиксированные двадцать, проигранная
 * столько же с вас, ничья задевает обоих поровну. Пять фраз по двадцать — ровно
 * сто, то есть чистая победа кладёт соперника, а любой другой расклад
 * повторяет счёт один в один.
 *
 * Разгон, набранный быстрым набором, идёт в отдельную величину — «стиль». Он
 * решает ранг и то, будет ли удар критическим (звук, тряска, искры), но до
 * полосок не дотягивается. Так скоропечатание остаётся ставкой, а зрелище не
 * начинает спорить с итогом.
 */

/** Здоровье на раунд. Раунд — это пять предложений, потом полоски полны снова. */
export const ROUND_HP = 100;

/** Сколько секунд даётся на одно предложение. */
export const SENTENCE_SECONDS = 40;

/**
 * Что остаётся от разгона, когда время вышло.
 *
 * Здоровье часы не трогают: полоски принадлежат счёту. Цена просроченного
 * хода своя и вполне ощутимая — слабее стиль, ниже ранг, нет критов.
 */
export const CLOCK_DRAIN = 0.35;

/** Урон за фразу. Пять таких — ровно ROUND_HP, то есть чистый разгром. */
export const WIN_DAMAGE = 20;

/** Ничья: качнулись оба и поровну. */
export const TIE_DAMAGE = 8;

/** Сила, начиная с которой удар считается критическим. */
export const CRIT_POWER = 82;

/** Во сколько раз разгон усиливает стиль: от вялого набора до полного. */
const POWER_FLOOR = 0.6;
const POWER_CEILING = 1.5;

export type DuelWinner = 'user' | 'translator' | 'tie';

export interface Blow {
  /** Урон переводчику. */
  toFoe: number;
  /** Урон вам. */
  toHero: number;
  /** Очки стиля за этот удар: разгон уходит сюда, а не в полоски. */
  style: number;
  crit: boolean;
  /** Крупная надпись поверх удара. */
  label: string;
}

function clamp01(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.min(1, Math.max(0, value));
}

/**
 * Множитель разгона.
 *
 * Пол не нулевой намеренно. Перевод, обдуманный медленно и с паузами, — всё
 * равно выигранный перевод, и оставлять его совсем без счёта значило бы
 * наказывать за раздумье в игре, которая учит языку.
 */
export function powerFactor(power: number): number {
  return POWER_FLOOR + (POWER_CEILING - POWER_FLOOR) * clamp01(power / 100);
}

/** Удар по итогам одного предложения. */
export function blowFor(winner: DuelWinner, power: number): Blow {
  if (winner === 'user') {
    return {
      toFoe: WIN_DAMAGE,
      toHero: 0,
      style: Math.round(WIN_DAMAGE * powerFactor(power)),
      crit: power >= CRIT_POWER,
      label: 'ПОПАДАНИЕ',
    };
  }
  if (winner === 'translator') {
    return { toFoe: 0, toHero: WIN_DAMAGE, style: 0, crit: false, label: 'ПРОПУЩЕН' };
  }
  return {
    toFoe: TIE_DAMAGE,
    toHero: TIE_DAMAGE,
    style: Math.round(TIE_DAMAGE * powerFactor(power)),
    crit: false,
    label: 'РАЗМЕН',
  };
}

/** Кто взял раунд по остатку здоровья. */
export function roundOutcome(heroHp: number, foeHp: number): DuelWinner {
  if (heroHp === foeHp) return 'tie';
  return heroHp > foeHp ? 'user' : 'translator';
}

/**
 * Ранг за раунд — по очкам стиля.
 *
 * Счёт он не заменяет: кто выиграл предложения, уже решено. Ранг говорит
 * только о том, насколько уверенно: пять выигранных фраз без единой паузы
 * дают сто пятьдесят, те же пять с раздумьями — семьдесят пять.
 */
export function rankOf(style: number): string {
  if (style >= 130) return 'S';
  if (style >= 100) return 'A';
  if (style >= 60) return 'B';
  return 'C';
}

/**
 * Ступень серии, 0..7 — под восемь файлов клика (tools/build_duel_sounds.py).
 *
 * Логарифм, а не деление: первые удары серии должны быть слышны как рост, а
 * дальше разгон замедляется, иначе к сотому символу звук упирается в потолок
 * и перестаёт что-либо значить.
 */
export function comboStep(streak: number): number {
  if (streak <= 1) return 0;
  return Math.min(7, Math.floor(Math.log2(streak)));
}

/** Отметки серии, на которых стоит крикнуть. */
export function isComboMilestone(streak: number): boolean {
  return streak > 0 && streak % 8 === 0;
}
