import type { Review } from './vocabulary';

/**
 * Расписание повторений.
 *
 * Это ровно тот же расчёт, что в приложении (`UserDb.gradeCard` в
 * frontend/lib/services/user_db.dart) — упрощённый SM-2. Совпадать он обязан:
 * карточки синхронизируются, и одно и то же слово, оценённое на телефоне и в
 * браузере, должно получить один и тот же следующий срок. Разные формулы дали
 * бы «прыгающие» интервалы, зависящие от того, с какого устройства человек
 * занимался в тот день.
 *
 * Оценки: 0 — «снова», 1 — «хорошо», 2 — «легко».
 */

export type Grade = 0 | 1 | 2;

export const DAY_MS = 86_400_000;

/** Через сколько показать карточку снова после «не помню». */
const RELEARN_MS = 10 * 60 * 1000;

const EASE_MIN = 1.3;
const EASE_MAX = 3.0;

function clampEase(value: number): number {
  return Math.min(EASE_MAX, Math.max(EASE_MIN, value));
}

export function gradeReview(review: Review, grade: Grade, now: number): Review {
  let ease = review.ease;
  let interval = review.intervalDays;
  let reps = review.reps;
  let dueAt: number;

  if (grade <= 0) {
    // Забытое слово возвращается в ту же сессию, а не завтра: смысл повторения
    // в том, чтобы закрыть пробел сейчас, пока он замечен.
    reps = 0;
    interval = 0;
    ease = clampEase(ease - 0.2);
    dueAt = now + RELEARN_MS;
  } else {
    reps += 1;
    if (reps === 1) {
      interval = 1;
    } else if (reps === 2) {
      interval = 3;
    } else {
      interval = Math.round(interval * ease);
    }
    if (grade >= 2) {
      ease = clampEase(ease + 0.15);
      interval = Math.round(interval * 1.3);
    }
    if (interval < 1) interval = 1;
    dueAt = now + interval * DAY_MS;
  }

  return {
    ...review,
    ease,
    intervalDays: interval,
    reps,
    dueAt,
    lastReviewed: now,
    updatedAt: now,
    dirty: 1,
  };
}

/** Карточки, которые пора показать. */
export function dueReviews(reviews: Review[], now: number): Review[] {
  return reviews
    .filter((review) => !review.deleted && review.dueAt <= now)
    .sort((a, b) => a.dueAt - b.dueAt);
}

/**
 * Насколько слово освоено — от 0 до 1.
 *
 * Считается по интервалу, а не по числу повторений: три показа подряд в один
 * день значат куда меньше, чем один успешный через месяц.
 */
export function mastery(review: Review): number {
  if (review.reps === 0) return 0;
  return Math.min(1, review.intervalDays / 30);
}

/** Подпись к сроку следующего показа. */
export function dueLabel(dueAt: number, now: number): string {
  const delta = dueAt - now;
  if (delta <= 0) return 'сейчас';
  if (delta < DAY_MS) {
    const hours = Math.round(delta / 3_600_000);
    return hours <= 1 ? 'меньше часа' : `через ${hours} ч`;
  }
  const days = Math.round(delta / DAY_MS);
  if (days === 1) return 'завтра';
  if (days < 5) return `через ${days} дня`;
  if (days < 30) return `через ${days} дней`;
  const months = Math.round(days / 30);
  return months === 1 ? 'через месяц' : `через ${months} мес.`;
}
