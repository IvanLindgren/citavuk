import { useEffect, useState } from 'react';

import { getRemoteOdysseyProgress, putRemoteOdysseyProgress } from '../api/events';

export const ODYSSEY_EVENT_ID = 'odyssey-2026';
export const ODYSSEY_CHAPTER_COUNT = 24;
export const ODYSSEY_STARTS_AT = new Date('2026-08-01T00:00:00+03:00');
export const ODYSSEY_ENDS_AT = new Date('2026-09-01T00:00:00+03:00');

export interface OdysseyProgress {
  completedChapters: number[];
  lastChapter: number;
  rewardUnlocked: boolean;
  updatedAt: number;
}

const EMPTY_PROGRESS: OdysseyProgress = {
  completedChapters: [],
  lastChapter: 1,
  rewardUnlocked: false,
  updatedAt: 0,
};

function storageKey(accountId: string): string {
  return `citavuk-event-${ODYSSEY_EVENT_ID}-${accountId}`;
}

export function odysseyAvailable(at = new Date()): boolean {
  return at >= ODYSSEY_STARTS_AT && at < ODYSSEY_ENDS_AT;
}

export function loadOdysseyProgress(accountId: string): OdysseyProgress {
  try {
    const raw = localStorage.getItem(storageKey(accountId));
    if (!raw) return EMPTY_PROGRESS;
    const parsed = JSON.parse(raw) as Partial<OdysseyProgress>;
    const candidates = Array.from(
      new Set(
        (Array.isArray(parsed.completedChapters) ? parsed.completedChapters : [])
          .filter((value): value is number =>
            Number.isInteger(value) && value >= 1 && value <= ODYSSEY_CHAPTER_COUNT,
          ),
      ),
    ).sort((a, b) => a - b);
    const completedChapters = candidates.filter((value, index) => value === index + 1);
    const rewardUnlocked = completedChapters.length === ODYSSEY_CHAPTER_COUNT;
    const storedChapter = Number.isInteger(parsed.lastChapter) ? Number(parsed.lastChapter) : 1;
    return {
      completedChapters,
      lastChapter: Math.min(ODYSSEY_CHAPTER_COUNT, Math.max(1, storedChapter)),
      rewardUnlocked,
      updatedAt: typeof parsed.updatedAt === 'number' ? parsed.updatedAt : 0,
    };
  } catch {
    return EMPTY_PROGRESS;
  }
}

function saveOdysseyProgress(accountId: string, progress: OdysseyProgress): void {
  try {
    localStorage.setItem(storageKey(accountId), JSON.stringify(progress));
    window.dispatchEvent(new CustomEvent('citavuk-odyssey-progress', { detail: accountId }));
  } catch {
    // Progress remains usable for the current render even in private mode.
  }
}

export async function syncOdysseyProgress(accountId: string): Promise<OdysseyProgress> {
  const local = loadOdysseyProgress(accountId);
  const remote = await getRemoteOdysseyProgress();
  if (!remote) {
    if (local.completedChapters.length > 0) await putRemoteOdysseyProgress(local);
    return local;
  }

  const remoteCompleted = Array.isArray(remote.payload?.completedChapters)
    ? remote.payload.completedChapters
    : [];
  const mergedCompleted = Array.from(
    new Set([...local.completedChapters, ...remoteCompleted]),
  )
    .filter((value): value is number => Number.isInteger(value) && value >= 1 && value <= ODYSSEY_CHAPTER_COUNT)
    .sort((a, b) => a - b)
    .filter((value, index) => value === index + 1);
  const merged: OdysseyProgress = {
    completedChapters: mergedCompleted,
    lastChapter: Math.min(
      ODYSSEY_CHAPTER_COUNT,
      Math.max(local.lastChapter, Number(remote.payload?.lastChapter) || 1),
    ),
    rewardUnlocked: mergedCompleted.length === ODYSSEY_CHAPTER_COUNT,
    updatedAt: Math.max(local.updatedAt, Date.parse(remote.updatedAt) || 0, Date.now()),
  };
  saveOdysseyProgress(accountId, merged);

  if (JSON.stringify(mergedCompleted) !== JSON.stringify(remoteCompleted)) {
    await putRemoteOdysseyProgress(merged);
  }
  return merged;
}

export async function uploadOdysseyProgress(progress: OdysseyProgress): Promise<void> {
  await putRemoteOdysseyProgress(progress);
}

export function completeOdysseyChapter(
  accountId: string,
  chapter: number,
): OdysseyProgress {
  const current = loadOdysseyProgress(accountId);
  // Songs are completed in order. This prevents opening the final song directly
  // from being treated as reading the whole poem.
  const firstIncomplete = current.completedChapters.length + 1;
  if (chapter !== firstIncomplete || chapter > ODYSSEY_CHAPTER_COUNT) return current;

  const completedChapters = [...current.completedChapters, chapter];
  const progress: OdysseyProgress = {
    completedChapters,
    lastChapter: Math.min(ODYSSEY_CHAPTER_COUNT, chapter + 1),
    rewardUnlocked: completedChapters.length === ODYSSEY_CHAPTER_COUNT,
    updatedAt: Date.now(),
  };
  saveOdysseyProgress(accountId, progress);
  return progress;
}

export function rememberOdysseyChapter(accountId: string, chapter: number): OdysseyProgress {
  const current = loadOdysseyProgress(accountId);
  const next = {
    ...current,
    lastChapter: Math.min(ODYSSEY_CHAPTER_COUNT, Math.max(1, chapter)),
    updatedAt: Date.now(),
  };
  saveOdysseyProgress(accountId, next);
  return next;
}

export function odysseyRewardUnlocked(accountId?: string | null): boolean {
  return accountId ? loadOdysseyProgress(accountId).rewardUnlocked : false;
}

export function useOdysseyProgress(accountId?: string | null): OdysseyProgress {
  const [progress, setProgress] = useState<OdysseyProgress>(() =>
    accountId ? loadOdysseyProgress(accountId) : EMPTY_PROGRESS,
  );

  useEffect(() => {
    const refresh = () => setProgress(accountId ? loadOdysseyProgress(accountId) : EMPTY_PROGRESS);
    refresh();
    window.addEventListener('citavuk-odyssey-progress', refresh);
    window.addEventListener('storage', refresh);
    return () => {
      window.removeEventListener('citavuk-odyssey-progress', refresh);
      window.removeEventListener('storage', refresh);
    };
  }, [accountId]);

  return progress;
}
