import { beforeEach, describe, expect, it, vi } from 'vitest';

import {
  completeOdysseyChapter,
  loadOdysseyProgress,
  odysseyAvailable,
  odysseyRewardUnlocked,
} from './odyssey';

describe('Odyssey event', () => {
  beforeEach(() => {
    localStorage.clear();
    vi.useRealTimers();
  });

  it('is available for August 2026 and closes at the September boundary', () => {
    expect(odysseyAvailable(new Date('2026-08-01T00:00:00+03:00'))).toBe(true);
    expect(odysseyAvailable(new Date('2026-08-31T23:59:59+03:00'))).toBe(true);
    expect(odysseyAvailable(new Date('2026-09-01T00:00:00+03:00'))).toBe(false);
  });

  it('requires songs to be completed in order', () => {
    expect(completeOdysseyChapter('denis', 2).completedChapters).toEqual([]);
    expect(completeOdysseyChapter('denis', 1).completedChapters).toEqual([1]);
    expect(completeOdysseyChapter('denis', 3).completedChapters).toEqual([1]);
    expect(completeOdysseyChapter('denis', 2).completedChapters).toEqual([1, 2]);
  });

  it('keeps progress and rewards isolated by account', () => {
    for (let chapter = 1; chapter <= 24; chapter++) {
      completeOdysseyChapter('first-user', chapter);
    }
    expect(odysseyRewardUnlocked('first-user')).toBe(true);
    expect(odysseyRewardUnlocked('second-user')).toBe(false);
    expect(loadOdysseyProgress('second-user').completedChapters).toEqual([]);
  });

  it('does not trust a reward flag without all sequential songs', () => {
    localStorage.setItem(
      'citavuk-event-odyssey-2026-denis',
      JSON.stringify({
        completedChapters: [1, 3, 24],
        lastChapter: 24,
        rewardUnlocked: true,
        updatedAt: Date.now(),
      }),
    );
    const progress = loadOdysseyProgress('denis');
    expect(progress.completedChapters).toEqual([1]);
    expect(progress.rewardUnlocked).toBe(false);
  });
});
