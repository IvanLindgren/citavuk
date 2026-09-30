import { afterEach, describe, expect, it, vi } from 'vitest';
import { readFeedLevel, saveFeedLevel } from './feedLevel';

afterEach(() => { vi.restoreAllMocks(); localStorage.clear(); });
describe('Vukotok level override', () => {
  it('is isolated by account and guest and can return to auto', () => {
    saveFeedLevel('guest', 'A1'); saveFeedLevel('account-a', 'B2');
    expect(readFeedLevel('guest')).toBe('A1');
    expect(readFeedLevel('account-a')).toBe('B2');
    expect(readFeedLevel('account-b')).toBeUndefined();
    saveFeedLevel('guest', undefined);
    expect(readFeedLevel('guest')).toBeUndefined();
  });
  it('ignores corrupt storage and survives unavailable storage', () => {
    localStorage.setItem('citavuk-vukotok-level:test', 'C2');
    expect(readFeedLevel('test')).toBeUndefined();
    vi.spyOn(Storage.prototype,'getItem').mockImplementation(() => { throw new Error('blocked'); });
    vi.spyOn(Storage.prototype,'setItem').mockImplementation(() => { throw new Error('blocked'); });
    saveFeedLevel('private','A2');expect(readFeedLevel('private')).toBe('A2');
  });
});
