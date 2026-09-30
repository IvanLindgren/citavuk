import { MICRO_FEED_LEVELS, type MicroFeedItem } from '../api/microFeed';

export type FeedLevel = MicroFeedItem['cefr'];
const memory = new Map<string, FeedLevel>();
const key = (scope: string) => `citavuk-vukotok-level:${scope}`;
export function validFeedLevel(value: unknown): value is FeedLevel {
  return typeof value === 'string' && MICRO_FEED_LEVELS.includes(value as FeedLevel);
}
export function readFeedLevel(scope: string): FeedLevel | undefined {
  try {
    const value = localStorage.getItem(key(scope));
    return validFeedLevel(value) ? value : undefined;
  } catch { return memory.get(scope); }
}
export function saveFeedLevel(scope: string, value: FeedLevel | undefined) {
  if (value) memory.set(scope, value); else memory.delete(scope);
  try {
    if (value) localStorage.setItem(key(scope), value); else localStorage.removeItem(key(scope));
  } catch { /* В приватном окне выбор остаётся в памяти. */ }
}
