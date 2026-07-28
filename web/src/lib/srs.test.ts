import { describe, expect, it } from 'vitest';

import { DAY_MS, dueLabel, dueReviews, gradeReview, mastery } from './srs';
import type { Review } from './vocabulary';

/**
 * Расчёт обязан совпадать с приложением (UserDb.gradeCard). Примеры подобраны
 * так, чтобы расхождение в любой из трёх веток формулы было видно числом.
 */
const NOW = 1_800_000_000_000;

function fresh(overrides: Partial<Review> = {}): Review {
  return {
    vocabId: 'w1',
    ease: 2.5,
    intervalDays: 0,
    reps: 0,
    dueAt: NOW,
    lastReviewed: null,
    deleted: 0,
    updatedAt: NOW,
    dirty: 0,
    ...overrides,
  };
}

describe('оценка карточки', () => {
  it('«не помню» возвращает слово через десять минут', () => {
    const result = gradeReview(fresh({ reps: 4, intervalDays: 12 }), 0, NOW);
    expect(result.dueAt).toBe(NOW + 10 * 60 * 1000);
    expect(result.reps).toBe(0);
    expect(result.intervalDays).toBe(0);
  });

  it('«не помню» снижает лёгкость, но не ниже 1.3', () => {
    expect(gradeReview(fresh({ ease: 2.5 }), 0, NOW).ease).toBeCloseTo(2.3);
    expect(gradeReview(fresh({ ease: 1.35 }), 0, NOW).ease).toBe(1.3);
  });

  it('первое «помню» откладывает на сутки, второе — на три', () => {
    const first = gradeReview(fresh(), 1, NOW);
    expect(first.intervalDays).toBe(1);
    expect(first.dueAt).toBe(NOW + DAY_MS);

    const second = gradeReview(first, 1, NOW);
    expect(second.intervalDays).toBe(3);
  });

  it('дальше интервал умножается на лёгкость', () => {
    const result = gradeReview(
      fresh({ reps: 2, intervalDays: 3, ease: 2.5 }),
      1,
      NOW,
    );
    expect(result.reps).toBe(3);
    expect(result.intervalDays).toBe(8); // round(3 * 2.5)
  });

  it('«легко» поднимает лёгкость и растягивает интервал', () => {
    const result = gradeReview(
      fresh({ reps: 2, intervalDays: 3, ease: 2.5 }),
      2,
      NOW,
    );
    // round(3 * 2.5) = 8, затем round(8 * 1.3) = 10
    expect(result.intervalDays).toBe(10);
    expect(result.ease).toBeCloseTo(2.65);
  });

  it('лёгкость не превышает 3.0', () => {
    expect(gradeReview(fresh({ ease: 2.95, reps: 1 }), 2, NOW).ease).toBe(3);
  });

  it('интервал не опускается ниже суток', () => {
    const result = gradeReview(
      fresh({ reps: 5, intervalDays: 0, ease: 1.3 }),
      1,
      NOW,
    );
    expect(result.intervalDays).toBe(1);
  });

  it('оценка помечает запись к отправке', () => {
    const result = gradeReview(fresh(), 1, NOW);
    expect(result.dirty).toBe(1);
    expect(result.lastReviewed).toBe(NOW);
    expect(result.updatedAt).toBe(NOW);
  });
});

describe('очередь на сегодня', () => {
  it('берёт только наступившие и сортирует по сроку', () => {
    const queue = dueReviews(
      [
        fresh({ vocabId: 'b', dueAt: NOW - 100 }),
        fresh({ vocabId: 'a', dueAt: NOW - 500 }),
        fresh({ vocabId: 'c', dueAt: NOW + DAY_MS }),
      ],
      NOW,
    );
    expect(queue.map((review) => review.vocabId)).toEqual(['a', 'b']);
  });

  it('не показывает удалённые', () => {
    expect(
      dueReviews([fresh({ dueAt: NOW - 1, deleted: 1 })], NOW),
    ).toHaveLength(0);
  });
});

describe('освоенность', () => {
  it('у нового слова нулевая', () => {
    expect(mastery(fresh())).toBe(0);
  });

  it('месячный интервал считается полным', () => {
    expect(mastery(fresh({ reps: 5, intervalDays: 30 }))).toBe(1);
    expect(mastery(fresh({ reps: 9, intervalDays: 90 }))).toBe(1);
  });
});

describe('подпись срока', () => {
  it('наступивший срок называется «сейчас»', () => {
    expect(dueLabel(NOW - 1, NOW)).toBe('сейчас');
  });

  it('часы, сутки и месяцы согласованы с числительным', () => {
    expect(dueLabel(NOW + 3 * 3_600_000, NOW)).toBe('через 3 ч');
    expect(dueLabel(NOW + DAY_MS, NOW)).toBe('завтра');
    expect(dueLabel(NOW + 3 * DAY_MS, NOW)).toBe('через 3 дня');
    expect(dueLabel(NOW + 10 * DAY_MS, NOW)).toBe('через 10 дней');
    expect(dueLabel(NOW + 30 * DAY_MS, NOW)).toBe('через месяц');
    expect(dueLabel(NOW + 120 * DAY_MS, NOW)).toBe('через 4 мес.');
  });
});
